import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  NoToneMapping,
  OrthographicCamera,
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
import { SceneCache } from './mesh-cache';
import { GROUND_TILT_DEGREES, GROUND_Z_SCALE } from './projection';
import { buildScene, type BoxDescriptor, type QuadDescriptor, type SceneDescriptor } from './scene-builder';

const TILE_SIZE = 32;

/** How far back the camera sits, in tiles. Orthographic, so this only sets clipping, never scale. */
const CAMERA_DISTANCE_TILES = 256;

export type WorldRenderer25Evidence = Readonly<{
  rendererKind: 'threejs-2-5d';
  drawCalls: number;
  meshCount: number;
  yawDegrees: number;
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
export function cameraForYaw(yawDegrees: number, distance: number): OrthographicCamera {
  const camera = new OrthographicCamera(-distance, distance, distance, -distance, 0.1, distance * 8);
  const elevation = (GROUND_TILT_DEGREES * Math.PI) / 180;
  const yaw = (yawDegrees * Math.PI) / 180;
  const horizontal = Math.cos(elevation) * distance;
  camera.position.set(Math.sin(yaw) * horizontal, Math.sin(elevation) * distance, Math.cos(yaw) * horizontal);
  camera.lookAt(0, 0, 0);
  return camera;
}

/**
 * Frames the camera over the region the 2D camera would show, at the same pixels-per-tile.
 *
 * The horizontal half-extent is `surface.width / (2 * zoom * TILE_SIZE)` tiles, which is exactly
 * the 2D scale. The vertical half-extent uses the same expression because a ground span `D`
 * projects to `D * GROUND_Z_SCALE` in camera space — the two `GROUND_Z_SCALE` factors cancel, and
 * the result agrees with `worldToScreenTilted` by construction.
 *
 * The target is the world point that lands at screen centre under `screenToWorldTilted`, so
 * `camera.x`/`camera.y` keep the same top-left meaning they have in the 2D path.
 */
export function frameCamera(
  camera: OrthographicCamera,
  frame: WorldFrameState,
  surface: ViewportSize,
  yawDegrees: number,
): void {
  const zoom = frame.camera.zoom;
  const halfWidthTiles = surface.width / (2 * zoom * TILE_SIZE);
  const halfHeightTiles = surface.height / (2 * zoom * TILE_SIZE);

  const targetX = (frame.camera.x + surface.width / (2 * zoom)) / TILE_SIZE;
  const targetZ = (frame.camera.y + surface.height / (2 * zoom * GROUND_Z_SCALE)) / TILE_SIZE;

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

type AtlasCell = Readonly<{ u0: number; u1: number; v0: number; v1: number }>;

/**
 * The atlas cell as UVs, inset by half a texel.
 *
 * Without the inset a sample exactly on the cell boundary can land on the neighbouring sprite even
 * under `NearestFilter`, which shows up as a one-pixel fringe on every tile edge.
 */
function atlasCell(source: AtlasRectangle, width: number, height: number): AtlasCell {
  const insetX = 0.5 / width;
  const insetY = 0.5 / height;
  return {
    u0: source.x / width + insetX,
    u1: (source.x + source.width) / width - insetX,
    v0: 1 - (source.y + source.height) / height + insetY,
    v1: 1 - source.y / height - insetY,
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
    const cell = atlasCell(box.source, atlasWidth, atlasHeight);
    const tint = linearTint(box.tint);
    for (const face of BOX_FACES) {
      const first = vertex;
      face.corners.forEach((corner, cornerIndex) => {
        const uv = FACE_UVS[cornerIndex]!;
        pushCorner(
          box.x + corner[0] * box.width,
          box.y + corner[1] * box.height,
          box.z + corner[2] * box.depth,
          face.normal,
          cell.u0 + uv[0] * (cell.u1 - cell.u0),
          cell.v0 + uv[1] * (cell.v1 - cell.v0),
          tint,
        );
      });
      pushFace(first);
    }
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

/** Exposed for tests: the baked geometry is the one thing a Jest run can check without WebGL. */
export function bakeSceneGeometry(
  scene: SceneDescriptor,
  atlasWidth: number,
  atlasHeight: number,
): Readonly<{ floors: BufferGeometry; boxes: BufferGeometry }> {
  return {
    floors: bakeGeometry(scene.floors, [], atlasWidth, atlasHeight),
    boxes: bakeGeometry([], scene.boxes, atlasWidth, atlasHeight),
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
  onReady: () => void,
  onContextStateChange: (state: 'lost' | 'restored' | 'timed-out') => void,
  toneMapping: ToneMappingKind = 'aces',
  options: Readonly<{ yawDegrees?: number }> = {},
): Promise<WorldRenderer25> {
  const yawDegrees = options.yawDegrees ?? 0;

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
  // Same clear colour as the 2D path, so anything outside the map reads as ground rather than a
  // black hole. Task 15's skirt covers the rest.
  renderer.setClearColor('#b77945', 1);

  const texture = await loadAtlasTexture(atlasUrl);
  const atlasWidth = (texture.image as { width: number }).width;
  const atlasHeight = (texture.image as { height: number }).height;

  const scene = new Scene();
  const camera = cameraForYaw(yawDegrees, CAMERA_DISTANCE_TILES);

  // Stage 1 ships lights. MeshStandardMaterial with no light source renders pure black, so without
  // this the villa is an empty frame and every capture is worthless.
  const hemisphere = new HemisphereLight('#f5dcb0', '#202824', 1.7);
  scene.add(hemisphere);

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

  const cache = new SceneCache();
  const floorMesh = new Mesh(new BufferGeometry(), material);
  const boxMesh = new Mesh(new BufferGeometry(), material);
  // Characters are their own batch because they move every frame while the world does not.
  const billboardMesh = new Mesh(new BufferGeometry(), material);
  // The baked geometry is already in world space, so three's own bounding sphere would sit at the
  // origin and cull the whole batch.
  floorMesh.frustumCulled = false;
  boxMesh.frustumCulled = false;
  billboardMesh.frustumCulled = false;
  scene.add(floorMesh, boxMesh, billboardMesh);

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

    // The drawing buffer follows the REAL surface, not `frame.viewport`: on the 2.5D path the
    // frame request is deliberately inflated so the cull window covers the tilted footprint, and
    // sizing the canvas to it would squash the picture.
    const buffer = threeDrawingBufferSize(surface, next.devicePixelRatio);
    renderer.setSize(buffer.width, buffer.height, false);

    frameCamera(camera, next, surface, yawDegrees);

    // Cover the whole visible footprint plus a wide margin, centred on what the camera looks at.
    // Cheaper and steadier than fitting it to the map: one quad, no rebuild, no seam at the edge.
    const visibleTiles = Math.max(
      surface.width / next.camera.zoom,
      surface.height / (next.camera.zoom * GROUND_Z_SCALE),
    ) / TILE_SIZE;
    skirt.scale.set(visibleTiles * 4, 1, visibleTiles * 4);
    skirt.position.x = next.camera.x / TILE_SIZE + surface.width / (2 * next.camera.zoom) / TILE_SIZE;
    skirt.position.z = next.camera.y / TILE_SIZE
      + surface.height / (2 * next.camera.zoom * GROUND_Z_SCALE) / TILE_SIZE;
    // Tinted from the district accent and darkened well below it: the skirt should read as land
    // continuing past the edge, not as a lit surface competing with the map.
    skirtMaterial.color.setStyle(next.lighting.accent.slice(0, 7));
    skirtMaterial.color.convertSRGBToLinear();
    skirtMaterial.color.multiplyScalar(0.16);

    const built = buildScene(next);
    const delta = cache.sync(built, next.mapHash);
    const nextSignature = sceneSignature(built);
    // Merged geometry, so any change at all is a full rebake. The cache stops that happening on a
    // frame where the tile window did not move, and the signature catches the changes the cache
    // cannot see — a door swapping sprite and height under the same id, or a tint shift.
    if (delta.added.length > 0 || delta.removed.length > 0 || nextSignature !== signature) {
      floorMesh.geometry.dispose();
      boxMesh.geometry.dispose();
      const baked = bakeSceneGeometry(built, atlasWidth, atlasHeight);
      floorMesh.geometry = baked.floors;
      boxMesh.geometry = baked.boxes;
      descriptorCount = built.floors.length + built.boxes.length;
      signature = nextSignature;
    }

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
    }),
    dispose: () => {
      running = false;
      renderer.setAnimationLoop(null);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      floorMesh.geometry.dispose();
      boxMesh.geometry.dispose();
      billboardMesh.geometry.dispose();
      skirt.geometry.dispose();
      skirtMaterial.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      cache.clear();
    },
  };
}
