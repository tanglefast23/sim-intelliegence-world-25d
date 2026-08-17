import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BasicShadowMap,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  NoToneMapping,
  OrthographicCamera,
  PointLight,
  SRGBColorSpace,
  Scene,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';

import type { AtlasRectangle } from '../atlas';
import type { ToneMappingKind } from '../renderer-selection';
import { threeDrawingBufferSize } from '../three/coordinate-contract';
import { ACES_EXPOSURE } from '../three/world-renderer';
import type { ViewportSize } from '../camera';
import type { WorldFrameState } from '../world-frame';
import { buildBillboards, type BillboardDescriptor } from './billboards';
import { DEFAULT_SHADOW_PATH, blobShadows, lampLights, lampPools, type ShadowPath } from './lighting';
import { SceneCache } from './mesh-cache';
import {
  CAMERA_YAW_DEGREES,
  GROUND_TILT_DEGREES,
  GROUND_Z_SCALE,
  screenToWorldTilted,
} from './projection';
import { buildScene, type BoxDescriptor, type QuadDescriptor, type SceneDescriptor } from './scene-builder';

const TILE_SIZE = 32;

/** How far back the camera sits, in tiles. Orthographic, so this only sets clipping, never scale. */
const CAMERA_DISTANCE_TILES = 256;

/** The colour everything outside the lit pocket falls away into. */
const VOID_COLOR = '#07070b';

export type WorldRenderer25Evidence = Readonly<{
  rendererKind: 'threejs-2-5d';
  drawCalls: number;
  meshCount: number;
  yawDegrees: number;
  /**
   * The path the renderer actually built, not the one that was asked for.
   *
   * Without this a per-path smoke can only report the query string it sent. If the override were
   * ever ignored, both smokes would run the fallback, both would pass, and the lit path could rot
   * unnoticed — which is the exact failure having two smokes exists to prevent.
   */
  shadowPath: ShadowPath;
  /** Whether the lit path's shadow map is live. Derived from the renderer, not from the flag. */
  shadowMapEnabled: boolean;
  /**
   * Draw calls spent on ATLAS-textured batches alone: floors, boxes and character billboards.
   * The skirt and the blob shadows are untextured, and the shadow pass is not a colour pass, so
   * `drawCalls` alone cannot be compared against an atlas budget.
   */
  atlasDrawCalls: number;
}>;

export type WorldRenderer25 = Readonly<{
  setFrame(frame: WorldFrameState): void;
  start(): void;
  evidence(): WorldRenderer25Evidence;
  dispose(): void;
}>;

/**
 * Places the orthographic camera at a fixed elevation and the given yaw, looking at the origin.
 *
 * Production ships yaw 0 — see section 1 of the plan. The yaw argument exists so the comparison
 * capture can render the spike angle from the same scene, and so a later decision to switch is a
 * constant change rather than a rewrite.
 */
export function cameraForYaw(yawDegrees: number = CAMERA_YAW_DEGREES, distance: number): OrthographicCamera {
  const camera = new OrthographicCamera(-distance, distance, distance, -distance, 0.1, distance * 8);
  const elevation = (GROUND_TILT_DEGREES * Math.PI) / 180;
  const yaw = (yawDegrees * Math.PI) / 180;
  const horizontal = Math.cos(elevation) * distance;
  camera.position.set(Math.sin(yaw) * horizontal, Math.sin(elevation) * distance, Math.cos(yaw) * horizontal);
  camera.lookAt(0, 0, 0);
  return camera;
}

/**
 * Frames the camera over the region the projection describes, at the same pixels-per-tile as 2D.
 *
 * The half-extents are `surface / (2 · zoom · TILE_SIZE)` on both axes. The vertical one needs no
 * `GROUND_Z_SCALE`: a ground span `D` projects to `D · GROUND_Z_SCALE` in camera space, so the two
 * factors cancel — the same cancellation that held at yaw 0.
 *
 * The target is the ground point at screen CENTRE, derived by inverting `worldToScreenTilted` at
 * `(surface.width / 2, surface.height / 2)`. `camera.x`/`camera.y` stays the point at screen
 * `(0, 0)`, so the projection and the camera describe one mapping. Tests pin them to each other.
 */
export function frameCamera(
  camera: OrthographicCamera,
  cameraState: Readonly<{ x: number; y: number; zoom: number }>,
  surface: ViewportSize,
  yawDegrees: number,
): Readonly<{ x: number; z: number }> {
  const zoom = cameraState.zoom;
  const halfWidthTiles = surface.width / (2 * zoom * TILE_SIZE);
  const halfHeightTiles = surface.height / (2 * zoom * TILE_SIZE);

  // The ground point that lands at screen centre, straight out of the projection's inverse.
  const centre = screenToWorldTilted(cameraState, { x: surface.width / 2, y: surface.height / 2 });
  const targetX = centre.x / TILE_SIZE;
  const targetZ = centre.y / TILE_SIZE;

  const elevation = (GROUND_TILT_DEGREES * Math.PI) / 180;
  const yaw = (yawDegrees * Math.PI) / 180;
  const horizontal = Math.cos(elevation) * CAMERA_DISTANCE_TILES;

  camera.left = -halfWidthTiles;
  camera.right = halfWidthTiles;
  camera.top = halfHeightTiles;
  camera.bottom = -halfHeightTiles;
  camera.near = 0.1;
  camera.far = CAMERA_DISTANCE_TILES * 4;
  camera.position.set(
    targetX + Math.sin(yaw) * horizontal,
    Math.sin(elevation) * CAMERA_DISTANCE_TILES,
    targetZ + Math.cos(yaw) * horizontal,
  );
  camera.lookAt(targetX, 0, targetZ);
  camera.updateProjectionMatrix();
  // Returned because the sun and its shadow camera must aim at what is ON SCREEN. The camera's own
  // position sits CAMERA_DISTANCE_TILES back along the view axis, far behind the visible footprint.
  return { x: targetX, z: targetZ };
}

async function loadAtlasTexture(atlasUrl: string): Promise<Texture> {
  const texture = await new TextureLoader().loadAsync(atlasUrl);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.anisotropy = 1;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  return texture;
}

/**
 * The six faces of a unit cube, each as four corners wound counter-clockwise seen from outside,
 * with the matching outward normal. Every face samples the same atlas cell, which is what a
 * top-textured pixel-art box wants.
 */
const BOX_FACES: readonly Readonly<{
  normal: readonly [number, number, number];
  corners: readonly (readonly [number, number, number])[];
}>[] = [
  { normal: [1, 0, 0], corners: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
  { normal: [-1, 0, 0], corners: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] },
  { normal: [0, 1, 0], corners: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
  { normal: [0, -1, 0], corners: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
  { normal: [0, 0, 1], corners: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
  { normal: [0, 0, -1], corners: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
];

/** Corner UVs, in the same order as every face's corner list. */
const FACE_UVS: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [1, 1], [0, 1]];

/**
 * How much light each face of a box keeps, by its index in `BOX_FACES`.
 *
 * Flat shading alone cannot separate a box's faces here: every face samples the same atlas art, so
 * without this a cube is one silhouette of uniform colour and reads as a flat stamp. Giving the
 * two visible vertical directions different values is what makes an isometric box read as a box.
 *
 * Order is +X, -X, +Y, -Y, +Z, -Z. At yaw 45 the camera sees +X, +Y and +Z, so those three carry
 * the contrast; the hidden faces mirror their opposites.
 */
const FACE_SHADE: readonly number[] = [0.82, 0.82, 1, 0.6, 0.66, 0.66];

type AtlasCell = Readonly<{ u0: number; u1: number; v0: number; v1: number; flatU: number; flatV: number }>;

/**
 * The atlas cell as UVs, inset by half a texel.
 *
 * Without the inset a sample exactly on the cell boundary can land on the neighbouring sprite even
 * under `NearestFilter`, which shows up as a one-pixel fringe on every tile edge.
 */
function atlasCell(source: AtlasRectangle, width: number, height: number): AtlasCell {
  const insetX = 0.5 / width;
  const insetY = 0.5 / height;
  // The flat-shade sample. Snapped to the CENTRE OF A TEXEL, not the midpoint of the cell:
  // `(u0 + u1) / 2` on an even-width cell lands exactly on a texel boundary, where NearestFilter
  // is free to pick either neighbour. That is a coin flip per face, and it is why several props
  // came out the colour of their outline rather than their paint.
  const flatColumn = source.x + Math.floor(source.width / 2) + 0.5;
  const flatRow = source.y + Math.floor(source.height / 2) + 0.5;
  return {
    u0: source.x / width + insetX,
    u1: (source.x + source.width) / width - insetX,
    v0: 1 - (source.y + source.height) / height + insetY,
    v1: 1 - source.y / height - insetY,
    flatU: flatColumn / width,
    flatV: 1 - flatRow / height,
  };
}

const scratchColor = new Color();

/** `#rrggbb` or `#rrggbbaa` to linear RGB. Vertex colours are consumed in linear space. */
function linearTint(tint: string): readonly [number, number, number] {
  scratchColor.setStyle(tint.slice(0, 7));
  scratchColor.convertSRGBToLinear();
  return [scratchColor.r, scratchColor.g, scratchColor.b];
}

/**
 * Bakes a whole descriptor list into ONE geometry.
 *
 * One `Mesh` per descriptor is one draw call per descriptor, and a villa interior at zoom 1 emits
 * about 2,300 descriptors — roughly sixty times the draw-call ceiling in section 1 of the plan.
 * Merging is what makes the ceiling reachable: the world costs two draw calls, not two thousand.
 * Per-descriptor tint rides in a vertex colour attribute so a single shared material still covers
 * every sprite.
 */
function bakeGeometry(
  quads: readonly QuadDescriptor[],
  boxes: readonly BoxDescriptor[],
  atlasWidth: number,
  atlasHeight: number,
): BufferGeometry {
  const vertexCount = quads.length * 4 + boxes.length * 24;
  const indexCount = quads.length * 6 + boxes.length * 36;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 3);
  const indices = vertexCount > 65_535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);

  let vertex = 0;
  let index = 0;

  const pushCorner = (
    x: number, y: number, z: number,
    normal: readonly [number, number, number],
    u: number, v: number,
    tint: readonly [number, number, number],
  ): void => {
    positions[vertex * 3] = x;
    positions[vertex * 3 + 1] = y;
    positions[vertex * 3 + 2] = z;
    normals[vertex * 3] = normal[0];
    normals[vertex * 3 + 1] = normal[1];
    normals[vertex * 3 + 2] = normal[2];
    uvs[vertex * 2] = u;
    uvs[vertex * 2 + 1] = v;
    colors[vertex * 3] = tint[0];
    colors[vertex * 3 + 1] = tint[1];
    colors[vertex * 3 + 2] = tint[2];
    vertex += 1;
  };

  const pushFace = (first: number): void => {
    indices[index] = first;
    indices[index + 1] = first + 1;
    indices[index + 2] = first + 2;
    indices[index + 3] = first;
    indices[index + 4] = first + 2;
    indices[index + 5] = first + 3;
    index += 6;
  };

  for (const quad of quads) {
    const cell = atlasCell(quad.source, atlasWidth, atlasHeight);
    const tint = linearTint(quad.tint);
    const first = vertex;
    // Same winding as the box's +Y face, so a floor reads right side up from above.
    const corners = BOX_FACES[2]!.corners;
    corners.forEach((corner, corentIndex) => {
      const uv = FACE_UVS[corentIndex]!;
      pushCorner(
        quad.x + corner[0] * quad.width,
        0,
        quad.z + corner[2] * quad.depth,
        [0, 1, 0],
        cell.u0 + uv[0] * (cell.u1 - cell.u0),
        cell.v0 + uv[1] * (cell.v1 - cell.v0),
        tint,
      );
    });
    pushFace(first);
  }

  for (const box of boxes) {
    const topCell = atlasCell(box.source, atlasWidth, atlasHeight);
    // Vertical faces may use a different, opaque cell. See `BoxDescriptor.sideSource`.
    const sideCell = box.sideSource === undefined
      ? topCell
      : atlasCell(box.sideSource, atlasWidth, atlasHeight);
    const tint = linearTint(box.tint);
    BOX_FACES.forEach((face, faceIndex) => {
      const first = vertex;
      const horizontal = face.normal[1] !== 0;
      const cell = horizontal ? topCell : sideCell;
      const shade = FACE_SHADE[faceIndex]!;
      const shaded: readonly [number, number, number] = [
        tint[0] * shade,
        tint[1] * shade,
        tint[2] * shade,
      ];
      face.corners.forEach((corner, cornerIndex) => {
        const uv = FACE_UVS[cornerIndex]!;
        // A flat-shaded box samples ONE texel from the middle of the cell, so the face is a single
        // colour instead of a whole sprite squashed onto it.
        const u = box.flatShade === true ? cell.flatU : cell.u0 + uv[0] * (cell.u1 - cell.u0);
        const v = box.flatShade === true ? cell.flatV : cell.v0 + uv[1] * (cell.v1 - cell.v0);
        pushCorner(
          box.x + corner[0] * box.width,
          box.y + corner[1] * box.height,
          box.z + corner[2] * box.depth,
          face.normal,
          u,
          v,
          shaded,
        );
      });
      pushFace(first);
    });
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

/**
 * Bakes upright character quads into one geometry.
 *
 * **World-vertical, yaw-facing — not view-plane facing.** `right` is the camera's right vector
 * flattened onto the ground plane; up is world `+Y`. A quad tilted into the view plane would lean
 * 40 degrees toward the camera and stop being parallel to the vertical wall and door faces beside
 * it, so a character standing in a doorway reads as falling at the viewer. That is the failure
 * mode "upright billboard" exists to prevent.
 *
 * The 24% vertical foreshortening that comes with staying vertical is not corrected. Every
 * vertical surface in the scene — walls, doors, prop sides — foreshortens by exactly the same
 * factor, so characters keep their proportion against the world. Compensating only the characters
 * would make them the one thing in the frame drawn to a different rule.
 *
 * The quad stands ON its anchor: the contact point is the bottom edge, not the centre.
 *
 * Rebaked every frame, unlike floors and boxes — characters move every frame, and a handful of
 * quads is nothing next to the thousands in the world batch.
 */
export function bakeBillboardGeometry(
  billboards: readonly BillboardDescriptor[],
  right: Readonly<{ x: number; y: number; z: number }>,
  up: Readonly<{ x: number; y: number; z: number }>,
  atlasWidth: number,
  atlasHeight: number,
): BufferGeometry {
  const positions = new Float32Array(billboards.length * 4 * 3);
  const normals = new Float32Array(billboards.length * 4 * 3);
  const uvs = new Float32Array(billboards.length * 4 * 2);
  const colors = new Float32Array(billboards.length * 4 * 3);
  const indices = new Uint32Array(billboards.length * 6);

  // right x up points back out of the quad toward the camera, so the sprite is lit from the front
  // rather than edge-on and the counter-clockwise winding below is the visible face.
  const normal: readonly [number, number, number] = [
    right.y * up.z - right.z * up.y,
    right.z * up.x - right.x * up.z,
    right.x * up.y - right.y * up.x,
  ];

  billboards.forEach((billboard, billboardIndex) => {
    const cell = atlasCell(billboard.source, atlasWidth, atlasHeight);
    const tint = linearTint(billboard.tint);
    // Bottom-left, bottom-right, top-right, top-left — matching FACE_UVS.
    const corners: readonly (readonly [number, number])[] = [
      [-billboard.width / 2, 0],
      [billboard.width / 2, 0],
      [billboard.width / 2, billboard.height],
      [-billboard.width / 2, billboard.height],
    ];
    corners.forEach((corner, cornerIndex) => {
      const vertex = billboardIndex * 4 + cornerIndex;
      const uv = FACE_UVS[cornerIndex]!;
      positions[vertex * 3] = billboard.x + right.x * corner[0] + up.x * corner[1];
      positions[vertex * 3 + 1] = right.y * corner[0] + up.y * corner[1];
      positions[vertex * 3 + 2] = billboard.z + right.z * corner[0] + up.z * corner[1];
      normals[vertex * 3] = normal[0];
      normals[vertex * 3 + 1] = normal[1];
      normals[vertex * 3 + 2] = normal[2];
      uvs[vertex * 2] = cell.u0 + uv[0] * (cell.u1 - cell.u0);
      uvs[vertex * 2 + 1] = cell.v0 + uv[1] * (cell.v1 - cell.v0);
      colors[vertex * 3] = tint[0];
      colors[vertex * 3 + 1] = tint[1];
      colors[vertex * 3 + 2] = tint[2];
    });
    const first = billboardIndex * 4;
    const index = billboardIndex * 6;
    indices[index] = first;
    indices[index + 1] = first + 1;
    indices[index + 2] = first + 2;
    indices[index + 3] = first;
    indices[index + 4] = first + 2;
    indices[index + 5] = first + 3;
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

/**
 * Exposed for tests: the baked geometry is the one thing a Jest run can check without WebGL.
 *
 * Boxes split into two batches. Textured boxes keep the atlas; flat-shaded boxes go to their own
 * geometry drawn with an UNMAPPED material, because there is no white texel anywhere in the atlas
 * — so a colour sampled through the shared material always has the sprite multiplied into it, and
 * an authored tint could never render true.
 */
/**
 * Bakes each lamp pool as a radial FAN: one bright centre vertex ringed by dark rim vertices.
 *
 * A quad would give a square of light, which is not what a lamp does. Additive blending across a
 * fan whose rim colour is black produces a soft round falloff with no texture and no shader.
 *
 * Sits just above the floor so it never z-fights the tiles it brightens.
 */
export function bakeLampPools(pools: readonly QuadDescriptor[]): BufferGeometry {
  const SEGMENTS = 16;
  const perPool = SEGMENTS + 2;
  const positions = new Float32Array(pools.length * perPool * 3);
  const normals = new Float32Array(pools.length * perPool * 3);
  const uvs = new Float32Array(pools.length * perPool * 2);
  const colors = new Float32Array(pools.length * perPool * 3);
  const indices = new Uint32Array(pools.length * SEGMENTS * 3);

  pools.forEach((pool, poolIndex) => {
    const first = poolIndex * perPool;
    const radius = pool.width / 2;
    const tint = linearTint(pool.tint);
    const set = (vertex: number, x: number, z: number, scale: number): void => {
      positions[vertex * 3] = x;
      positions[vertex * 3 + 1] = 0.02;
      positions[vertex * 3 + 2] = z;
      normals[vertex * 3 + 1] = 1;
      colors[vertex * 3] = tint[0] * scale;
      colors[vertex * 3 + 1] = tint[1] * scale;
      colors[vertex * 3 + 2] = tint[2] * scale;
    };
    set(first, pool.x, pool.z, pool.opacity);
    for (let step = 0; step <= SEGMENTS; step += 1) {
      const angle = (step / SEGMENTS) * Math.PI * 2;
      set(first + 1 + step, pool.x + Math.cos(angle) * radius, pool.z + Math.sin(angle) * radius, 0);
    }
    for (let step = 0; step < SEGMENTS; step += 1) {
      const index = (poolIndex * SEGMENTS + step) * 3;
      indices[index] = first;
      indices[index + 1] = first + 1 + step;
      indices[index + 2] = first + 2 + step;
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

export function bakeSceneGeometry(
  scene: SceneDescriptor,
  atlasWidth: number,
  atlasHeight: number,
): Readonly<{ floors: BufferGeometry; boxes: BufferGeometry; flatBoxes: BufferGeometry }> {
  const flat = scene.boxes.filter((box) => box.flatShade === true);
  const textured = scene.boxes.filter((box) => box.flatShade !== true);
  return {
    floors: bakeGeometry(scene.floors, [], atlasWidth, atlasHeight),
    boxes: bakeGeometry([], textured, atlasWidth, atlasHeight),
    flatBoxes: bakeGeometry([], flat, atlasWidth, atlasHeight),
  };
}

/**
 * A cheap hash of everything a rebake depends on that is NOT the descriptor id.
 *
 * The cache diffs ids, so it cannot see a descriptor whose id stays put while its content changes.
 * A door is exactly that: it keeps `door.id` and swaps sprite and height as it opens, so an
 * id-only dirty check would leave every door frozen in its first state. Tint moves the same way
 * under the day cycle.
 */
function sceneSignature(scene: SceneDescriptor): number {
  let hash = 0x81_1c_9d_c5;
  const mix = (value: number): void => {
    hash = Math.imul(hash ^ (value | 0), 0x01_00_01_93);
  };
  const mixText = (value: string): void => {
    for (let index = 0; index < value.length; index += 1) mix(value.charCodeAt(index));
  };
  for (const quad of scene.floors) {
    mix(quad.source.x);
    mix(quad.source.y);
    mixText(quad.tint);
  }
  for (const box of scene.boxes) {
    mix(box.source.x);
    mix(box.source.y);
    mix(box.width * 64);
    mix(box.height * 64);
    mix(box.depth * 64);
    mixText(box.tint);
  }
  return hash >>> 0;
}

export async function createWorldRenderer25(
  canvas: HTMLCanvasElement,
  atlasUrl: string,
  /**
   * The live real surface in CSS pixels, read fresh on every frame.
   *
   * A getter rather than a value: the mount effect runs once, so a captured `ViewportSize` would
   * pin the drawing buffer and the frustum to whatever the surface measured at construction. A
   * window resize would then keep drawing at the old size while the frame camera recentred for the
   * new one, and a first measurement of 0x0 would stick forever.
   */
  liveSurface: () => ViewportSize,
  /**
   * The real render camera, read fresh every frame.
   *
   * NOT `frame.camera`: on the 2.5D path that is the inflated frame REQUEST camera, shifted to the
   * north-west corner of the rotated footprint so `world-frame.ts` culls the right tiles. Framing
   * from it would put the view a screen-and-a-half away from the player.
   */
  liveCamera: () => Readonly<{ x: number; y: number; zoom: number }>,
  onReady: () => void,
  onContextStateChange: (state: 'lost' | 'restored' | 'timed-out') => void,
  toneMapping: ToneMappingKind = 'aces',
  options: Readonly<{ yawDegrees?: number; shadowPath?: ShadowPath }> = {},
): Promise<WorldRenderer25> {
  const yawDegrees = options.yawDegrees ?? CAMERA_YAW_DEGREES;
  const shadowPath = options.shadowPath ?? DEFAULT_SHADOW_PATH;

  // Request WebGL 2 explicitly, the way the 2D path does. `new WebGLRenderer({ canvas })` may hand
  // back WebGL 1, and GameSurfaceShell reports webgl2Ready from canvas.getContext('webgl2') — a
  // WebGL 1 context makes that null and every packaged 2.5D run fails readiness.
  const context = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    powerPreference: 'high-performance',
  });
  if (!context) throw new Error('The 2.5D renderer requires WebGL 2.');

  const renderer = new WebGLRenderer({ canvas, context, alpha: false, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = toneMapping === 'aces' ? ACESFilmicToneMapping : NoToneMapping;
  renderer.toneMappingExposure = ACES_EXPOSURE;
  renderer.sortObjects = false;
  // Near-black, not the 2D path's sunny brown. The reference reads as an enclosed stage because
  // everything outside the lit pocket falls away into void; a mid-brown surround says "sunny
  // field" and destroys the night contrast the whole look depends on.
  renderer.setClearColor(VOID_COLOR, 1);

  const texture = await loadAtlasTexture(atlasUrl);
  const atlasWidth = (texture.image as { width: number }).width;
  const atlasHeight = (texture.image as { height: number }).height;

  const scene = new Scene();
  // No fog. It looks like the obvious way to swallow an open map into the void, and it is a trap
  // here: the camera is ORTHOGRAPHIC and sits 256 tiles back, so distance-based fog blackens the
  // entire scene at any useful density. The skirt going near-black after dusk does the same job.
  const camera = cameraForYaw(yawDegrees, CAMERA_DISTANCE_TILES);

  // Stage 1 ships lights. MeshStandardMaterial with no light source renders pure black, so without
  // this the villa is an empty frame and every capture is worthless.
  const hemisphere = new HemisphereLight('#f5dcb0', '#202824', shadowPath === 'lit' ? 1.1 : 1.7);
  const dayHemisphereIntensity = hemisphere.intensity;
  scene.add(hemisphere);

  /**
   * The lit path adds a directional sun and a hard shadow map. `BasicShadowMap` at 256 is
   * deliberate: soft PCF shadows read as smooth 3D and break the pixel rules in spec section 9.
   *
   * The fallback path ships neither, which is why it is deterministic and holds 60 FPS everywhere.
   * Blob shadows draw in BOTH paths - see `blobShadows`.
   */
  const sun = shadowPath === 'lit' ? new DirectionalLight('#ffefdb', 3.2) : undefined;
  if (sun) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = BasicShadowMap;
    sun.castShadow = true;
    sun.shadow.mapSize.set(256, 256);
    // The shadow camera has to cover the visible footprint, not three's tiny default box.
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 120;
    // Without this three keeps its default -5..5 box and every frustum value above is dead, so
    // only props near the centre of the view cast at all.
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun, sun.target);
  }

  /** Point lights at lamp props. Rebuilt only when the lamp set changes, not every frame. */
  const lamps = new Map<string, PointLight>();

  /**
   * Character blob shadows: one flat quad each, in both paths. Billboards cannot cast into a
   * shadow map, so this is the only shadow a character ever gets.
   */
  // `vertexColors` is what lets the baked colour attribute reach the pixels; without it every blob
  // ignores the frame's shadow tint and draws white.
  const blobMaterial = new MeshBasicMaterial({ transparent: true, depthWrite: false, vertexColors: true });
  const blobMesh = new Mesh(new BufferGeometry(), blobMaterial);
  blobMesh.frustumCulled = false;
  blobMesh.renderOrder = 1;
  scene.add(blobMesh);

  /**
   * Warm light pools under the lamps. Additive, so they brighten the floor instead of painting a
   * flat disc over it, and they never write depth so nothing standing in one gets clipped.
   */
  const poolMaterial = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const poolMesh = new Mesh(new BufferGeometry(), poolMaterial);
  poolMesh.frustumCulled = false;
  poolMesh.renderOrder = 2;
  scene.add(poolMesh);

  /**
   * One material for every sprite. `alphaTest` rather than `transparent` keeps the atlas cutout
   * working without any depth sorting, which is what lets `sortObjects` stay off.
   */
  const material = new MeshStandardMaterial({
    map: texture,
    flatShading: true,
    roughness: 0.88,
    metalness: 0,
    vertexColors: true,
    alphaTest: 0.5,
  });

  /**
   * Flat-shaded furniture: unmapped AND unlit.
   *
   * Unmapped because the atlas holds no white texel, so every colour drawn through `material`
   * carries a sprite with it, and an authored colour could never render true.
   *
   * Unlit because these sprites are drawn unlit in the 2D game — their authored paint IS their
   * colour. Lighting them made a dark room turn every piece of furniture near-black, which is the
   * opposite of the target: the reference room is dim, but its sofa is still plainly green. Day and
   * night reach the colour through the descriptor tint instead, so the scene still darkens without
   * the furniture disappearing into it.
   *
   * The per-face shade in `FACE_SHADE` is what keeps a box reading as a box without a light.
   */
  const flatMaterial = new MeshBasicMaterial({ vertexColors: true });

  /**
   * Characters, unlit and textured.
   *
   * The 2D game draws characters unlit — the sprite's own pixels are the character. Lighting them
   * here made the protagonist a black silhouette in a dark room, which is the one thing a player
   * must always be able to see. Day and night reach them through the descriptor tint instead.
   */
  const billboardMaterial = new MeshBasicMaterial({
    map: texture,
    vertexColors: true,
    alphaTest: 0.5,
    transparent: false,
  });

  const cache = new SceneCache();
  const floorMesh = new Mesh(new BufferGeometry(), material);
  const boxMesh = new Mesh(new BufferGeometry(), material);
  const flatBoxMesh = new Mesh(new BufferGeometry(), flatMaterial);
  // Characters are their own batch because they move every frame while the world does not.
  const billboardMesh = new Mesh(new BufferGeometry(), billboardMaterial);
  // The baked geometry is already in world space, so three's own bounding sphere would sit at the
  // origin and cull the whole batch.
  floorMesh.frustumCulled = false;
  boxMesh.frustumCulled = false;
  billboardMesh.frustumCulled = false;
  // Enabling the shadow map is not enough: without these the sun has nothing to cast from and
  // nothing to cast onto, and the lit path renders identically to the fallback minus the ambient.
  // Boxes cast and receive; floors only receive; billboards do neither - a camera-facing card has
  // no meaningful silhouette from the sun, which is why characters get blobs in both paths.
  boxMesh.castShadow = shadowPath === 'lit';
  boxMesh.receiveShadow = shadowPath === 'lit';
  flatBoxMesh.frustumCulled = false;
  flatBoxMesh.castShadow = shadowPath === 'lit';
  flatBoxMesh.receiveShadow = shadowPath === 'lit';
  floorMesh.receiveShadow = shadowPath === 'lit';
  scene.add(floorMesh, boxMesh, flatBoxMesh, billboardMesh);

  // Hoisted: extractBasis writes into these every frame, and allocating three vectors per frame
  // for a value that never escapes is pure garbage.
  /**
   * One large flat quad under the floor tiles, filling everything outside the map bounds.
   *
   * At zoom 1 the tilted footprint is taller than the map, so no clamp can avoid seeing past the
   * edge — `clampCameraTilted` centres the oversized axis rather than pretending otherwise. The
   * skirt is what the player sees there instead of the clear colour.
   *
   * Untextured and unlit-flat: it is ground that continues past the map, not a surface anything
   * stands on. It sits fractionally below y = 0 so it never z-fights the real floor quads.
   */
  const skirtMaterial = new MeshBasicMaterial({ color: '#b77945' });
  const skirt = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), skirtMaterial);
  skirt.position.y = -0.02;
  skirt.frustumCulled = false;
  skirt.renderOrder = -1;
  scene.add(skirt);

  const cameraRight = new Vector3();
  const cameraUp = new Vector3();
  const cameraBack = new Vector3();
  const billboardRight = new Vector3();
  const BILLBOARD_UP = new Vector3(0, 1, 0);

  let frame: WorldFrameState | undefined;
  let descriptorCount = 0;
  let signature: number | undefined;
  let running = false;

  const applyFrame = (next: WorldFrameState): void => {
    frame = next;
    const surface = liveSurface();
    const renderCamera = liveCamera();

    // The drawing buffer follows the REAL surface, not `frame.viewport`: on the 2.5D path the
    // frame request is deliberately inflated so the cull window covers the tilted footprint, and
    // sizing the canvas to it would squash the picture.
    const buffer = threeDrawingBufferSize(surface, next.devicePixelRatio);
    renderer.setSize(buffer.width, buffer.height, false);

    const lookAt = frameCamera(camera, renderCamera, surface, yawDegrees);

    // Cover the whole visible footprint plus a wide margin, centred on what the camera looks at.
    // Cheaper and steadier than fitting it to the map: one quad, no rebuild, no seam at the edge.
    const visibleTiles = Math.max(
      surface.width / renderCamera.zoom,
      surface.height / (renderCamera.zoom * GROUND_Z_SCALE),
    ) / TILE_SIZE;
    skirt.scale.set(visibleTiles * 4, 1, visibleTiles * 4);
    skirt.position.x = lookAt.x;
    skirt.position.z = lookAt.z;
    // Tinted from the district accent and darkened well below it: the skirt should read as land
    // continuing past the edge, not as a lit surface competing with the map.
    skirtMaterial.color.setStyle(next.lighting.accent.slice(0, 7));
    skirtMaterial.color.convertSRGBToLinear();
    // 0.5, not 0.16. The skirt IS covering the off-map ground - measured - but at 0.16 the accent
    // lands near black and reads as void, which is what made it look like a clamp bug.
    skirtMaterial.color.multiplyScalar(0.5);

    const built = buildScene(next);
    const delta = cache.sync(built, next.mapHash);
    const nextSignature = sceneSignature(built);
    // Merged geometry, so any change at all is a full rebake. The cache stops that happening on a
    // frame where the tile window did not move, and the signature catches the changes the cache
    // cannot see — a door swapping sprite and height under the same id, or a tint shift.
    if (delta.added.length > 0 || delta.removed.length > 0 || nextSignature !== signature) {
      floorMesh.geometry.dispose();
      boxMesh.geometry.dispose();
      flatBoxMesh.geometry.dispose();
      const baked = bakeSceneGeometry(built, atlasWidth, atlasHeight);
      floorMesh.geometry = baked.floors;
      boxMesh.geometry = baked.boxes;
      flatBoxMesh.geometry = baked.flatBoxes;
      descriptorCount = built.floors.length + built.boxes.length;
      signature = nextSignature;
    }

    // The reference is a dark world with bright objects and one warm pocket. A flat ambient fill
    // at night washes that out, so the sky light follows the sun down rather than holding station,
    // and fog thickens after dusk to swallow the open remainder of the map into the void.
    const daylight = next.lighting.sun.elevation;
    hemisphere.intensity = dayHemisphereIntensity * (0.09 + 0.91 * daylight);

    // Lamp lights: add and remove by id so a pan does not churn the light list.
    const wanted = new Map(lampLights(next).map((light) => [light.id, light]));
    for (const [id, light] of lamps) {
      if (wanted.has(id)) continue;
      scene.remove(light);
      light.dispose();
      lamps.delete(id);
    }
    for (const [id, descriptor] of wanted) {
      let light = lamps.get(id);
      if (!light) {
        // Short range and quadratic decay, so a lamp makes a tight warm pocket rather than a
        // wash. `castShadow` stays off: one shadow light is the budget, and the sun holds it.
        light = new PointLight('#ffffff', 1, 7, 2);
        lamps.set(id, light);
        scene.add(light);
      }
      light.color.setStyle(descriptor.color.slice(0, 7));
      light.color.convertSRGBToLinear();
      light.intensity = descriptor.intensity;
      light.position.set(descriptor.x, 1.1, descriptor.z);
    }

    if (sun) {
      // Aim the sun along the frame's own shadow vector, so the lit path agrees with the 2D
      // renderer about where the light comes from.
      sun.target.position.set(lookAt.x, 0, lookAt.z);
      sun.target.updateMatrixWorld(true);
      sun.position.set(
        lookAt.x - (next.lighting.sun.shadowX / TILE_SIZE) * 6,
        14 + next.lighting.sun.elevation * 12,
        lookAt.z - (next.lighting.sun.shadowY / TILE_SIZE) * 6,
      );
      sun.intensity = 0.8 + next.lighting.sun.elevation * 2.6;
    }

    // Blob shadows are flat ground quads, so they bake with the same helper the floors use.
    const blobs = blobShadows(next);
    blobMesh.geometry.dispose();
    blobMesh.geometry = bakeSceneGeometry({ floors: blobs, boxes: [] }, atlasWidth, atlasHeight).floors;
    blobMesh.visible = blobs.length > 0;
    // The bake carries RGB only, so the shadow colour's alpha has to reach the material directly.
    // Dropping it would stamp a solid dark oval under every character instead of a soft contact
    // shadow.
    const blobAlpha = blobs[0]?.tint.length === 9 ? Number.parseInt(blobs[0].tint.slice(7), 16) / 255 : 0.45;
    blobMaterial.opacity = blobAlpha;

    const pools = lampPools(next);
    poolMesh.geometry.dispose();
    poolMesh.geometry = bakeLampPools(pools);
    poolMesh.visible = pools.length > 0;

    // Characters turn to face the camera's bearing, so their quads are rebuilt from the camera
    // basis every frame rather than kept in the world batch. Only the horizontal component of the
    // camera's right vector is used — the quads stay world-vertical.
    camera.updateMatrixWorld(true);
    camera.matrixWorld.extractBasis(cameraRight, cameraUp, cameraBack);
    billboardRight.set(cameraRight.x, 0, cameraRight.z);
    if (billboardRight.lengthSq() === 0) billboardRight.set(1, 0, 0);
    billboardRight.normalize();
    billboardMesh.geometry.dispose();
    billboardMesh.geometry = bakeBillboardGeometry(
      buildBillboards(next),
      billboardRight,
      BILLBOARD_UP,
      atlasWidth,
      atlasHeight,
    );
  };

  const onLost = (event: Event): void => { event.preventDefault(); onContextStateChange('lost'); };
  const onRestored = (): void => {
    onContextStateChange('restored');
    // The GPU dropped every buffer, so the delta cache no longer describes what exists, and the
    // atlas has to be re-uploaded. Without needsUpdate the villa comes back black.
    texture.needsUpdate = true;
    cache.clear();
    signature = undefined;
    if (frame) applyFrame(frame);
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  return {
    setFrame: applyFrame,
    start: () => {
      if (running) return;
      running = true;
      let presented = false;
      renderer.setAnimationLoop(() => {
        renderer.render(scene, camera);
        // onReady means "a frame is on screen", and readiness reports worldFramePresented from it.
        // Calling it inside start() would let a smoke screenshot an empty canvas.
        if (!presented) {
          presented = true;
          onReady();
        }
      });
    },
    evidence: () => ({
      rendererKind: 'threejs-2-5d',
      drawCalls: renderer.info.render.calls,
      meshCount: descriptorCount,
      yawDegrees,
      shadowPath,
      shadowMapEnabled: renderer.shadowMap.enabled,
      atlasDrawCalls: [floorMesh, boxMesh, billboardMesh]
        .filter((mesh) => mesh.visible && mesh.geometry.getIndex() !== null && mesh.geometry.getIndex()!.count > 0)
        .length,
    }),
    dispose: () => {
      running = false;
      renderer.setAnimationLoop(null);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      floorMesh.geometry.dispose();
      boxMesh.geometry.dispose();
      flatBoxMesh.geometry.dispose();
      flatMaterial.dispose();
      billboardMesh.geometry.dispose();
      billboardMaterial.dispose();
      poolMesh.geometry.dispose();
      poolMaterial.dispose();
      blobMesh.geometry.dispose();
      blobMaterial.dispose();
      for (const light of lamps.values()) {
        scene.remove(light);
        light.dispose();
      }
      lamps.clear();
      if (sun) {
        scene.remove(sun, sun.target);
        sun.dispose();
      }
      skirt.geometry.dispose();
      skirtMaterial.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      cache.clear();
    },
  };
}
