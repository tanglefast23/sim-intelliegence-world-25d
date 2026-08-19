import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BasicShadowMap,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  DirectionalLight,
  DoubleSide,
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
import {
  blitPencilFrame,
  pencilBillboards,
} from '../pencil/billboard';
import { PENCIL_HEIGHT, PENCIL_WIDTH } from '../pencil/vampire';
import { vfxGlowPools, vfxQuads, type VfxQuad } from './vfx-25';
import {
  DEFAULT_SHADOW_PATH,
  blobShadows,
  lampLights,
  lampPools,
  indoorOverheadKeyOrigin,
  nightKeyOrigin,
  propContactShadows,
  skyglowMix,
  type ShadowPath,
} from './lighting';
import { SceneCache } from './mesh-cache';
import {
  CAMERA_YAW_DEGREES,
  GROUND_TILT_DEGREES,
  GROUND_Z_SCALE,
  groundFootprint,
  screenToWorldTilted,
} from './projection';
import { buildScene, type BoxDescriptor, type QuadDescriptor, type SceneDescriptor } from './scene-builder';

const TILE_SIZE = 32;

/** How far back the camera sits, in tiles. Orthographic, so this only sets clipping, never scale. */
const CAMERA_DISTANCE_TILES = 256;

/** The colour everything outside the lit pocket falls away into. */
const VOID_COLOR = '#07070b';

/**
 * The median and worst frame INTERVAL over the rolling window, in milliseconds.
 *
 * The 95th percentile, not the mean: a renderer that averages 8ms and stalls to 40 once a second
 * reads as smooth in a mean and as a stutter to a player. `sampled` says how many frames the window
 * actually holds, so a reader can tell "fast" from "barely started".
 *
 * Read it as a DROPPED-FRAME check. While the renderer keeps up, this is the display's refresh
 * period and nothing else; it cannot tell an expensive frame from a cheap one.
 */
function frameTimings(
  samples: Float32Array,
  cursor: number,
): Readonly<{ frameMedianMs: number; frameP95Ms: number; frameSamples: number }> {
  const filled = Math.min(cursor, samples.length);
  if (filled === 0) return { frameMedianMs: 0, frameP95Ms: 0, frameSamples: 0 };
  const sorted = [...samples.subarray(0, filled)].sort((left, right) => left - right);
  const at = (share: number): number =>
    Math.round((sorted[Math.min(filled - 1, Math.floor(filled * share))] ?? 0) * 100) / 100;
  return { frameMedianMs: at(0.5), frameP95Ms: at(0.95), frameSamples: filled };
}

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
  /**
   * VFX primitives built for the last frame, split by batch.
   *
   * Reported because a screenshot cannot tell "the effect was never built" from "the effect was
   * built and is invisible against a bright floor", and those need opposite fixes. The 2.5D path
   * shipped with no VFX at all under a check that only counted draw calls.
   */
  vfxAdditiveQuads: number;
  vfxAlphaQuads: number;
  /**
   * Milliseconds between rendered frames, over a rolling window.
   *
   * A dropped-frame check, NOT a cost measure: while the renderer keeps up this is the display's
   * refresh period. A p95 far above the median means frames are being missed.
   */
  frameMedianMs: number;
  frameP95Ms: number;
  frameSamples: number;
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
 * The 2.5D path ships `CAMERA_YAW_DEGREES`, which is 45 — `yawForEnvironment` in
 * `renderer-selection.ts` returns it everywhere except a localhost `?testYaw=` capture, and
 * `projection.test.ts` locks that. The yaw argument exists for those captures.
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

/**
 * The same table for boxes that are drawn LIT.
 *
 * `FACE_SHADE` is a stand-in for lighting: it darkens the sides of a box so the box reads as a box
 * with no light in the scene. Multiplying it into a surface a real light already shades is the
 * same darkening applied twice, and it is what drove lit furniture to black — a lamp post's side
 * face took 0.66 from this table on top of a dim night sky and landed under the ACES knee.
 *
 * So the top and the hidden faces are left at 1 and the real lights do all the work there. The one
 * thing lighting CANNOT do here is separate the two visible sides: a hemisphere light is symmetric
 * about Y, so `+X` and `+Z` take the same sky-and-ground mix, and after dusk the sun is down to
 * 0.15 and cannot split them either. Without a difference between those two faces a box at yaw 45
 * loses its vertical edge and reads flat — the exact thing the corner camera exists to avoid.
 *
 * This table therefore darkens `±Z` alone. The first version kept every face within 3% of 1, which
 * is below notice: it was a weak second lighting model that separated nothing.
 */
const LIT_FACE_SHADE: readonly number[] = [1, 1, 1, 1, 0.82, 0.82];

/**
 * No face shade at all. For boxes that ARE the light.
 *
 * A glow box's authored tint has to reach the pixels unchanged — that is the entire reason the
 * unlit batch exists. It was baking with the default `FACE_SHADE`, so at yaw 45 the camera saw
 * every lamp head's two visible faces at 82% and 66% of the authored glow: the one thing in the
 * frame that must read as an emitter was drawn as a shaded box, in all four districts, while three
 * separate comments claimed otherwise.
 */
const NO_FACE_SHADE: readonly number[] = [1, 1, 1, 1, 1, 1];

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
  faceShade: readonly number[] = FACE_SHADE,
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
    // The gain is applied AFTER the sRGB-to-linear conversion and can exceed 1. That is the whole
    // point of it: a hex tint parses to at most 1.0 per channel and multiplies the atlas sample, so
    // `#ffffff` is the identity and no tint can ever brighten dark art. The vertex colour attribute
    // is a Float32Array and `MeshStandardMaterial` multiplies it into albedo, so a value above 1
    // scales the sprite up — the only lever this renderer has for a sprite that is simply too dark.
    const base = linearTint(quad.tint);
    const gain = quad.gain ?? 1;
    const tint: readonly [number, number, number] = gain === 1
      ? base
      : [base[0] * gain, base[1] * gain, base[2] * gain];
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
    // Same gain as a floor quad, and for the same reason: a hex tint cannot exceed 1.0, so it can
    // only ever darken the sprite it multiplies. A textured prop needs the opposite — the tint is
    // the colour the prop should AVERAGE, and the gain is what cancels the sprite's own brightness
    // so that average comes out right instead of the two multiplying into mud.
    const baseTint = linearTint(box.tint);
    const boxGain = box.gain ?? 1;
    const tint: readonly [number, number, number] = boxGain === 1
      ? baseTint
      : [baseTint[0] * boxGain, baseTint[1] * boxGain, baseTint[2] * boxGain];
    BOX_FACES.forEach((face, faceIndex) => {
      const first = vertex;
      const horizontal = face.normal[1] !== 0;
      const cell = horizontal ? topCell : sideCell;
      const shade = faceShade[faceIndex]!;
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
    // `lift` raises a quad off the contact point. Body quads stand on it at 0; the blink band
    // is three rows tall and would otherwise be a stamp on the character's shoes.
    const lift = billboard.lift;
    const corners: readonly (readonly [number, number])[] = [
      [-billboard.width / 2, lift],
      [billboard.width / 2, lift],
      [billboard.width / 2, lift + billboard.height],
      [-billboard.width / 2, lift + billboard.height],
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
export function bakeLampPools(
  pools: readonly QuadDescriptor[],
  vfx: readonly VfxQuad[] = [],
  cameraRight: Readonly<{ x: number; z: number }> = { x: 1, z: 0 },
): BufferGeometry {
  const SEGMENTS = 16;
  const perPool = SEGMENTS + 2;
  // VFX rides in the SAME geometry as the pools. Both want additive blending with no depth write,
  // and the draw-call ceiling has no room for a ninth colour mesh — so the effects the 2.5D path
  // never drew at all arrive for zero extra draw calls.
  const vertexCount = pools.length * perPool + vfx.length * 4;
  const indexCount = pools.length * SEGMENTS * 3 + vfx.length * 6;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(indexCount);

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

  const vfxFirstVertex = pools.length * perPool;
  const vfxFirstIndex = pools.length * SEGMENTS * 3;
  vfx.forEach((quad, quadIndex) => {
    const first = vfxFirstVertex + quadIndex * 4;
    // Alpha is premultiplied into the colour. Additive blending has no alpha channel to honour, so
    // this is how a 40%-opaque wisp of steam stays a wisp instead of a solid white bar.
    const tint = linearTint(quad.tint);
    const scale = quad.opacity;
    const halfWidth = quad.width / 2;
    const halfHeight = quad.height / 2;
    // Upright quads turn to the camera on the ground plane, exactly like a character billboard.
    // Flat quads lie on the floor, because a ripple really is on the floor.
    const rightX = quad.upright ? cameraRight.x * halfWidth : halfWidth;
    const rightZ = quad.upright ? cameraRight.z * halfWidth : 0;
    const upY = quad.upright ? halfHeight : 0;
    const upZ = quad.upright ? 0 : halfHeight;
    const corners: readonly (readonly [number, number])[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    corners.forEach((corner, cornerIndex) => {
      const vertex = first + cornerIndex;
      positions[vertex * 3] = quad.x + rightX * corner[0];
      positions[vertex * 3 + 1] = quad.y + upY * corner[1] + 0.03;
      positions[vertex * 3 + 2] = quad.z + rightZ * corner[0] + upZ * corner[1];
      normals[vertex * 3 + 1] = 1;
      colors[vertex * 3] = tint[0] * scale;
      colors[vertex * 3 + 1] = tint[1] * scale;
      colors[vertex * 3 + 2] = tint[2] * scale;
    });
    const index = vfxFirstIndex + quadIndex * 6;
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
 * A stroked ellipse lying on the ground: the selection ring under the chosen character.
 *
 * `x`/`z` is the centre and `radius` the semi-axis on the ground plane, both in tile units. The
 * ring is a CIRCLE in world space — the camera's 30-degree tilt compresses the depth axis to
 * `GROUND_Z_SCALE`, which is what makes it read as an ellipse on screen, so authoring an ellipse
 * here would compress it twice.
 *
 * `width` is the stroke, also in tile units. A caller that wants a constant stroke on screen
 * divides its pixel width by the camera zoom before converting.
 */
export type GroundRing = Readonly<{
  x: number;
  z: number;
  radius: number;
  width: number;
  tint: string;
  opacity: number;
}>;

/** A ring is a stroke, not a soft blob, so a 12-gon reads as a dodecagon. */
const RING_SEGMENTS = 32;

/**
 * Flat ground marks that fade at the rim: character blobs and prop contact stains.
 *
 * These used to bake through the floor-quad path, which makes a SQUARE with one uniform colour. On
 * the ground under a character that reads as a dark tile someone forgot to remove — it ends
 * abruptly with a hard straight edge, and nothing in the scene has an edge like that. A shadow has
 * to fall off.
 *
 * A radial fan does it with no texture and no shader: one vertex at the centre at full alpha, a rim
 * of vertices at zero. The colour attribute carries FOUR components here rather than three, which
 * is what lets the rim be transparent while the centre is not — with an RGB attribute the only
 * alpha available is a single material-wide scalar, and every mark in the frame has to share it.
 *
 * `width` and `depth` are diameters, so a mark is an ellipse: the depth axis is already compressed
 * by the camera, and these are authored to sit under a sprite.
 */
export function bakeGroundStains(
  stains: readonly QuadDescriptor[],
  marks: readonly VfxQuad[] = [],
  cameraRight: Readonly<{ x: number; z: number }> = { x: 1, z: 0 },
  rings: readonly GroundRing[] = [],
): BufferGeometry {
  const SEGMENTS = 12;
  const perStain = SEGMENTS + 2;
  const perRing = (RING_SEGMENTS + 1) * 2;
  // VFX that are MATTER rather than light ride here: steam, leaves, fronds, a dust smear, a blood
  // stain. They need real alpha blending, which the additive pool batch cannot give them — a dark
  // mark added to a lit floor contributes nothing at all — and this batch already blends normally
  // with per-vertex alpha. Zero extra draw calls, and the ceiling has no room for a ninth mesh.
  //
  // Hard-edged, unlike the stains: a mark is pixel art with an outline, not a soft contact shadow.
  const vertexCount = stains.length * perStain + marks.length * 4 + rings.length * perRing;
  const indexCount = stains.length * SEGMENTS * 3 + marks.length * 6 + rings.length * RING_SEGMENTS * 6;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 4);
  const indices = new Uint32Array(indexCount);

  stains.forEach((stain, stainIndex) => {
    const first = stainIndex * perStain;
    const tint = linearTint(stain.tint);
    const alpha = stain.tint.length === 9
      ? (Number.parseInt(stain.tint.slice(7), 16) / 255) * stain.opacity
      : stain.opacity;
    const radiusX = stain.width / 2;
    const radiusZ = stain.depth / 2;
    const set = (vertex: number, x: number, z: number, edgeAlpha: number): void => {
      positions[vertex * 3] = x;
      // Just above the floor so it never z-fights the tile it darkens, and below the lamp pools.
      positions[vertex * 3 + 1] = 0.012;
      positions[vertex * 3 + 2] = z;
      normals[vertex * 3 + 1] = 1;
      colors[vertex * 4] = tint[0];
      colors[vertex * 4 + 1] = tint[1];
      colors[vertex * 4 + 2] = tint[2];
      colors[vertex * 4 + 3] = edgeAlpha;
    };
    set(first, stain.x, stain.z, alpha);
    for (let step = 0; step <= SEGMENTS; step += 1) {
      const angle = (step / SEGMENTS) * Math.PI * 2;
      set(first + 1 + step, stain.x + Math.cos(angle) * radiusX, stain.z + Math.sin(angle) * radiusZ, 0);
    }
    for (let step = 0; step < SEGMENTS; step += 1) {
      const index = (stainIndex * SEGMENTS + step) * 3;
      indices[index] = first;
      indices[index + 1] = first + 1 + step;
      indices[index + 2] = first + 2 + step;
    }
  });

  const markFirstVertex = stains.length * perStain;
  const markFirstIndex = stains.length * SEGMENTS * 3;
  marks.forEach((mark, markIndex) => {
    const first = markFirstVertex + markIndex * 4;
    const tint = linearTint(mark.tint);
    const halfWidth = mark.width / 2;
    const halfHeight = mark.height / 2;
    const rightX = mark.upright ? cameraRight.x * halfWidth : halfWidth;
    const rightZ = mark.upright ? cameraRight.z * halfWidth : 0;
    const upY = mark.upright ? halfHeight : 0;
    const upZ = mark.upright ? 0 : halfHeight;
    const corners: readonly (readonly [number, number])[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    corners.forEach((corner, cornerIndex) => {
      const vertex = first + cornerIndex;
      positions[vertex * 3] = mark.x + rightX * corner[0];
      positions[vertex * 3 + 1] = mark.y + upY * corner[1];
      positions[vertex * 3 + 2] = mark.z + rightZ * corner[0] + upZ * corner[1];
      normals[vertex * 3 + 1] = 1;
      colors[vertex * 4] = tint[0];
      colors[vertex * 4 + 1] = tint[1];
      colors[vertex * 4 + 2] = tint[2];
      colors[vertex * 4 + 3] = mark.opacity;
    });
    const index = markFirstIndex + markIndex * 6;
    indices[index] = first;
    indices[index + 1] = first + 1;
    indices[index + 2] = first + 2;
    indices[index + 3] = first;
    indices[index + 4] = first + 2;
    indices[index + 5] = first + 3;
  });

  // Baked LAST so it paints over the blob shadow it sits on: nothing here writes depth, so within
  // one batch the later triangle wins.
  const ringFirstVertex = stains.length * perStain + marks.length * 4;
  const ringFirstIndex = stains.length * SEGMENTS * 3 + marks.length * 6;
  rings.forEach((ring, ringIndex) => {
    const first = ringFirstVertex + ringIndex * perRing;
    const tint = linearTint(ring.tint);
    const alpha = ring.tint.length === 9
      ? (Number.parseInt(ring.tint.slice(7), 16) / 255) * ring.opacity
      : ring.opacity;
    const inner = Math.max(0, ring.radius - ring.width / 2);
    const outer = ring.radius + ring.width / 2;
    for (let step = 0; step <= RING_SEGMENTS; step += 1) {
      const angle = (step / RING_SEGMENTS) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      [inner, outer].forEach((radius, side) => {
        const vertex = first + step * 2 + side;
        positions[vertex * 3] = ring.x + cos * radius;
        // Above the stains, so a character's own blob shadow cannot swallow their ring.
        positions[vertex * 3 + 1] = 0.014;
        positions[vertex * 3 + 2] = ring.z + sin * radius;
        normals[vertex * 3 + 1] = 1;
        colors[vertex * 4] = tint[0];
        colors[vertex * 4 + 1] = tint[1];
        colors[vertex * 4 + 2] = tint[2];
        colors[vertex * 4 + 3] = alpha;
      });
    }
    for (let step = 0; step < RING_SEGMENTS; step += 1) {
      const index = ringFirstIndex + (ringIndex * RING_SEGMENTS + step) * 6;
      const near = first + step * 2;
      indices[index] = near;
      indices[index + 1] = near + 1;
      indices[index + 2] = near + 3;
      indices[index + 3] = near;
      indices[index + 4] = near + 3;
      indices[index + 5] = near + 2;
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new BufferAttribute(colors, 4));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

export function bakeSceneGeometry(
  scene: SceneDescriptor,
  atlasWidth: number,
  atlasHeight: number,
): Readonly<{
  floors: BufferGeometry;
  boxes: BufferGeometry;
  flatBoxes: BufferGeometry;
  glowBoxes: BufferGeometry;
}> {
  const flat = scene.boxes.filter((box) => box.flatShade === true && box.glow !== true);
  const glow = scene.boxes.filter((box) => box.flatShade === true && box.glow === true);
  const textured = scene.boxes.filter((box) => box.flatShade !== true);
  return {
    floors: bakeGeometry(scene.floors, [], atlasWidth, atlasHeight),
    // Walls, doors and roofs are LIT too, so they take the lit table. They were baking with
    // `FACE_SHADE` and then drawing through `MeshStandardMaterial`, which is the double-darkening
    // this renderer bans for furniture — left in place on every wall in the game because the fix
    // was applied to the flat batch alone. A north wall was losing 40% of its albedo to a stand-in
    // for the very light that was already shading it.
    boxes: bakeGeometry([], textured, atlasWidth, atlasHeight, LIT_FACE_SHADE),
    flatBoxes: bakeGeometry([], flat, atlasWidth, atlasHeight, LIT_FACE_SHADE),
    glowBoxes: bakeGeometry([], glow, atlasWidth, atlasHeight, NO_FACE_SHADE),
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
  // `gain` is hashed too. It is static today, so this is a guard rather than a fix: the next
  // lift that varies with time would otherwise never trigger a rebake.
  for (const quad of scene.floors) {
    mix(quad.source.x);
    mix(quad.source.y);
    // `gain` too. It is static today, so this is a guard rather than a fix: the next lift that
    // varies with time would otherwise never trigger a rebake and would silently freeze.
    mix((quad.gain ?? 1) * 1024);
    mixText(quad.tint);
  }
  for (const box of scene.boxes) {
    mix(box.source.x);
    mix(box.source.y);
    mix((box.gain ?? 1) * 1024);
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
  //
  // The GROUND colour is what lights a vertical face: a hemisphere light blends sky and ground by
  // the face normal, so a lamp post, a crate side and a sofa arm all sit near the midpoint. At
  // '#202824' those verticals were crushed to black once furniture became lit, which turned every
  // lamp post into a floating head. '#4a4a44' keeps them readable without lifting the floor, whose
  // normal points straight at the sky term.
  const hemisphere = new HemisphereLight('#f5dcb0', '#4a4a44', shadowPath === 'lit' ? 1.1 : 1.7);
  const dayHemisphereIntensity = hemisphere.intensity;
  /** The daytime sky colour, kept so the night skyglow below can mix away from it and back. */
  const daySkyColor = hemisphere.color.clone();
  const nightSkyColor = new Color();
  const lampSkySample = new Color();
  /** The lamp colour currently tinting the sky. Kept so a pan cannot snap it - see the mix below. */
  let skyglowHue: string | undefined;
  scene.add(hemisphere);

  /**
   * The lit path adds a directional sun and a hard shadow map. `BasicShadowMap` is deliberate:
   * soft PCF shadows read as smooth 3D and break the pixel rules in spec section 9.
   *
   * The fallback path ships neither, which is why it is deterministic and holds 60 FPS everywhere.
   * Blob shadows draw in BOTH paths - see `blobShadows`.
   */
  const sun = shadowPath === 'lit' ? new DirectionalLight('#ffefdb', 3.2) : undefined;
  /** Kept so the key can return to daylight after borrowing a lamp's colour for the night. */
  const daySunColor = sun ? sun.color.clone() : undefined;
  if (sun) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = BasicShadowMap;
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    // The shadow camera has to cover the visible footprint, not three's tiny default box.
    // Extents are set per frame from the visible footprint - see `applyFrame`. A hand-picked box is
    // what broke this: ±22 covers a zoom-3 district capture and clips a zoom-1 frame, which is the
    // zoom players actually use, so shadows vanished at the top and bottom of the screen in the one
    // case no capture looked at.
    // `normalBias` pushes the depth lookup along the surface normal, so thin geometry cannot land
    // entirely inside its own depth sample and self-shadow to black - a 0.07-tile lamp post did
    // exactly that. It is measured in WORLD units, so it has to be sized against the texel, and the
    // texel now depends on the zoom: 0.06 is about one texel at zoom 3 and stays under two at
    // zoom 1. The old 0.35 was sized for a 0.31-tile texel and was wide enough to erase a raking
    // shadow before it landed.
    sun.shadow.normalBias = 0.06;
    sun.shadow.bias = -0.000_5;
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
  //
  // `DoubleSide` is not decoration. Every shape `bakeGroundStains` emits — the radial stain fans,
  // the VFX mark quads and the selection ring's annulus — is wound so its face normal points at
  // -Y, while the camera looks DOWN at the ground plane. Under the default `FrontSide` the whole
  // batch is back-face culled, which is why the 2.5D path drew no blob shadows, no contact stains
  // and no selection ring at all: eight draw calls went out and this one painted nothing. The
  // floors escape it only because they reuse the box's already-correct +Y face winding.
  //
  // Culling is the wrong lever here anyway. These are unlit, alpha-blended ground decals a few
  // hundred triangles wide, so there is no shading to get wrong and nothing to save.
  const blobMaterial = new MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    side: DoubleSide,
  });
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
   * Flat-shaded furniture: unmapped, and LIT.
   *
   * Unmapped because the atlas holds no white texel, so every colour drawn through `material`
   * carries a sprite with it, and an authored colour could never render true.
   *
   * Lit because unlit was measurably worse. Drawn unlit, a sofa was the same green whether it sat
   * in a lamp pool or ten tiles away in the dark, so every prop read as plastic pasted over a lit
   * scene while the walls and floor around it took real light. Lighting them is what puts the
   * reference room's warm falloff across a stack of crates.
   *
   * The first attempt at this DID turn a dark room's furniture near-black, and the fix then was to
   * unlight it. That treated the symptom: the real cause is the night floor on `hemisphere`, which
   * is raised below so an unlit-by-any-lamp surface still reads as its own colour after dusk.
   *
   * `flatShading` keeps each face one value, so a box still reads as a box rather than a smoothly
   * shaded blob. `FACE_SHADE` in the baked colours rides on top of the light.
   */
  const flatMaterial = new MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.9,
    metalness: 0,
  });

  /**
   * Lamp heads, lanterns, neon: unmapped and unlit, so the authored glow tint IS the pixel.
   *
   * These cannot share `flatMaterial`. The point light for a lamp sits INSIDE its head box, so
   * every face normal points away from the light and a lit lamp head renders black — the one
   * thing in a dark room that has to glow.
   */
  const glowMaterial = new MeshBasicMaterial({ vertexColors: true });

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
  const glowBoxMesh = new Mesh(new BufferGeometry(), glowMaterial);
  // Characters are their own batch because they move every frame while the world does not.
  const billboardMesh = new Mesh(new BufferGeometry(), billboardMaterial);
  const pencilCanvas = typeof document === 'undefined' ? undefined : document.createElement('canvas');
  if (pencilCanvas) {
    pencilCanvas.width = PENCIL_WIDTH;
    pencilCanvas.height = PENCIL_HEIGHT;
  }
  const pencilContext = pencilCanvas?.getContext('2d') ?? undefined;
  const pencilPixels = pencilContext?.createImageData(PENCIL_WIDTH, PENCIL_HEIGHT);
  const pencilTexture = pencilCanvas
    ? new CanvasTexture(pencilCanvas)
    : undefined;
  if (pencilTexture) {
    pencilTexture.magFilter = NearestFilter;
    pencilTexture.minFilter = NearestFilter;
    pencilTexture.colorSpace = SRGBColorSpace;
  }
  const pencilMaterial = new MeshBasicMaterial({
    map: pencilTexture ?? null,
    vertexColors: true,
    alphaTest: 0.08,
    transparent: true,
  });
  const pencilMesh = new Mesh(new BufferGeometry(), pencilMaterial);
  pencilMesh.frustumCulled = false;
  pencilMesh.visible = false;
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
  glowBoxMesh.frustumCulled = false;
  // A lamp head casting a shadow of itself onto its own post is the one shadow nobody wants.
  glowBoxMesh.castShadow = false;
  floorMesh.receiveShadow = shadowPath === 'lit';
  scene.add(floorMesh, boxMesh, flatBoxMesh, glowBoxMesh, billboardMesh, pencilMesh);

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

  /** A rolling window of CPU frame times, in milliseconds. See the render loop in `start`. */
  const FRAME_SAMPLE_COUNT = 120;
  const frameMilliseconds = new Float32Array(FRAME_SAMPLE_COUNT);
  let frameCursor = 0;
  let previousFrameAt = 0;

  let lastVfxCounts = { additive: 0, alpha: 0 };
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
    // Follows the day cycle like everything else. Held at a flat 0.5 the map edge glowed
    // half-accent-bright at night against a crushed dark map — invisible at zoom 3, where floors
    // cover the frame, and the first thing anyone would see at zoom 1 after dusk.
    skirtMaterial.color.multiplyScalar(0.5 * (0.3 + 0.7 * next.lighting.sun.elevation));

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
      glowBoxMesh.geometry.dispose();
      const baked = bakeSceneGeometry(built, atlasWidth, atlasHeight);
      floorMesh.geometry = baked.floors;
      boxMesh.geometry = baked.boxes;
      flatBoxMesh.geometry = baked.flatBoxes;
      glowBoxMesh.geometry = baked.glowBoxes;
      descriptorCount = built.floors.length + built.boxes.length;
      signature = nextSignature;
    }

    // The reference is a dark world with bright objects and one warm pocket. A flat ambient fill
    // at night washes that out, so the sky light follows the sun down rather than holding station,
    // and fog thickens after dusk to swallow the open remainder of the map into the void.
    //
    // The night floor is 0.62, not 0.09. Furniture is lit now, so this term is the only thing
    // standing between a prop ten tiles from the nearest lamp and pure black. At 0.09 the whole
    // world outside a lamp pool disappeared, which is what made unlit furniture look necessary in
    // the first place. 0.62 keeps a sofa plainly green in the dark without flattening the pool.
    const daylight = next.lighting.sun.elevation;
    /**
     * The night floor under the sky light, per map.
     *
     * 0.78 is the outdoor number: a district at night is meant to fall toward the void so its lamps
     * can be the brightest thing in frame. An interior lit only by ceiling troffers has no such
     * void to fall into — a desk at the edge of a panel crushes to black — so the office sits at
     * 0.84.
     *
     * This is a FLOOR, not a flood, and it is the knob to move if a night capture measures wrong.
     * Pooling below 1.45 means lower it. Raising a hemisphere to fix pooling is how the bazaar
     * courtyard flooded, so this never goes up to answer a high reading.
     *
     * There is no upper pooling ceiling here any more. The old rule said "above 1.9, add a panel or
     * lift panel intensity", and the first office round obeyed it by authoring six troffers over
     * the aisles — which moved the number and left the cause, a ten-tile reach that let every panel
     * light the whole farm equally. The troffers are tight now and `cubicles-night` reads 2.056 by
     * design: that is falloff between fixtures, which is the thing the ratio is a proxy for. Read
     * it beside the dead fraction, and treat "add hardware to move a metric" as the smell it is.
     */
    const nightSkyFloor = next.mapId === 'west_office' ? 0.84 : 0.78;
    /**
     * The fallback path loses BOTH the point lights and the directional key. Outdoors that is the
     * intended dark world — the sky still reads and the ground is meant to fall away. Indoors at
     * night it leaves literally no light source but this one, and a windowless room measured 53%
     * of the frame under the dead cut: not "flatter", a black plate with furniture floating in it.
     *
     * So the fallback's existing 1.1 -> 1.7 stand-in gets a second, narrower step for the case
     * where it is standing in for everything. Scoped to the fallback path, at night, inside a
     * shelter that actually has ceiling fixtures in it — the same test the overhead key uses — so
     * the lit path, every outdoor frame, and the villa are all untouched.
     */
    const fallbackInteriorFill = shadowPath === 'fallback' && indoorOverheadKeyOrigin(next) ? 1.9 : 1;
    hemisphere.intensity = dayHemisphereIntensity * fallbackInteriorFill
      * (nightSkyFloor + (1 - nightSkyFloor) * daylight);
    // Tried and rejected: falling the SKY term further at night than the ground term, so floors
    // darken while props keep what the night floor gave them. The idea is sound — one hemisphere
    // light has two knobs and they light different things, sky for the floors and ground for every
    // vertical — but measured at 0.62 it cost every district 2-7 mean luminance, 1-4 points of dead
    // pixels and 0.3-0.5 of detail, to buy about 0.02 of saturation, and the two captures are hard
    // to tell apart by eye. The emitters below raise exposure with LIGHT SOURCES instead, which is
    // the same target look arrived at from the right end.
    // Every lamp in frame, whichever path is running. The skyglow and the floor pools both read
    // this: a lamp still glows and still pools on the fallback path, it just does not light.
    const wanted = new Map(lampLights(next).map((light) => [light.id, light]));

    /**
     * Point lights are the LIT path only.
     *
     * Spec section 8.7 defines the fallback as the no-dynamic-lights path — that is the whole reason
     * it exists, and it is what lets it be deterministic and hold frame rate on hardware the lit
     * path cannot. It was building a point light per lamp regardless, so the two paths differed by
     * the shadow map alone and the fallback was not the thing it is documented to be. The lamps
     * still read there: their heads glow, their pools draw, and the hemisphere runs at 1.7 rather
     * than 1.1 precisely to stand in for the lights that are missing.
     */
    const wantedLights = shadowPath === 'lit' ? wanted : new Map<string, never>();

    /**
     * Skyglow: after dusk the sky light takes the district's own accent colour.
     *
     * A neon street lights its own sky. Without this the downtown asphalt away from a sign was a
     * featureless near-black plate over a third of the frame — measurably the worst dead fraction
     * of the four districts, and its lowest saturation — because the only coloured light there is
     * a handful of short-range neon posts.
     *
     * The glow colour is the average of the LAMPS IN FRAME, not the district accent. The accent was
     * the obvious source and it was wrong: measured, tinting by accent gained saturation in three
     * districts and lost more than it gained in the harbour, whose accent is teal while its lamps
     * are amber. Tinting a scene's sky with the complement of the light in it cancels exactly the
     * warm-object-on-cool-ground contrast that makes it read. A sky glows the colour of whatever
     * lights it, so averaging the lamps is both the truer model and the one that measures better.
     *
     * Mixed by `lampMix`, the same term that turns the lamps on, so dusk brings both together.
     */
    //
    // The MOST SATURATED lamp in frame, not the average of them. Averaging was the previous rule and
    // it fails on exactly the district it was written for: downtown's lamps are cyan `#8ff2ea` and
    // magenta `#ff9de0` in roughly equal numbers, and the mean of two complementary colours is grey.
    // The neon street was tinting its own sky with no colour at all, which is why it measured the
    // lowest saturation of the four while being the most colourful scene in the game.
    nightSkyColor.set(0, 0, 0);
    let lampCount = 0;
    let bestChroma = -1;
    let nextSkyglowHue = skyglowHue;
    for (const lamp of wanted.values()) {
      lampSkySample.setStyle(lamp.color.slice(0, 7));
      lampSkySample.convertSRGBToLinear();
      const high = Math.max(lampSkySample.r, lampSkySample.g, lampSkySample.b);
      const low = Math.min(lampSkySample.r, lampSkySample.g, lampSkySample.b);
      const chroma = high <= 0 ? 0 : (high - low) / high;
      // Sticky: the reigning hue has to be beaten by a clear margin, not merely edged out. Downtown
      // runs cyan and magenta lamps in equal numbers, so a bare `>` hands the whole sky to whichever
      // one the cull window happens to hold - and snaps it the moment that lamp pans out of view. A
      // still capture cannot show that; a player would see the street change colour for no reason.
      if (chroma > bestChroma * (lamp.color === skyglowHue ? 0.8 : 1.15)) {
        bestChroma = chroma;
        nightSkyColor.copy(lampSkySample);
        nextSkyglowHue = lamp.color;
      }
      lampCount += 1;
    }
    if (lampCount === 0) {
      nightSkyColor.setStyle(next.lighting.accent.slice(0, 7));
      nightSkyColor.convertSRGBToLinear();
    }
    skyglowHue = nextSkyglowHue;
    // Normalise to the day sky's own brightness. A lamp tint is chosen to be saturated, not bright,
    // so mixing it in raw changes the EXPOSURE as well as the hue: measured, a straight mix cost
    // every district 2-5 luminance and RAISED the dead fraction it was meant to cut, while the
    // saturation gain it was after showed up either way. Rescaled, the mix moves colour alone.
    const glowLuminance = nightSkyColor.r + nightSkyColor.g + nightSkyColor.b;
    if (glowLuminance > 0.001) {
      nightSkyColor.multiplyScalar((daySkyColor.r + daySkyColor.g + daySkyColor.b) / glowLuminance);
    }
    // And none of it indoors: a room has no sky. See `skyglowMix`.
    hemisphere.color.copy(daySkyColor).lerp(nightSkyColor, skyglowMix(next));

    for (const [id, light] of lamps) {
      if (wantedLights.has(id)) continue;
      scene.remove(light);
      light.dispose();
      lamps.delete(id);
    }
    for (const [id, descriptor] of wantedLights) {
      let light = lamps.get(id);
      if (!light) {
        // Range and decay come from the descriptor, not from a constant here. A lamp post makes a
        // tight warm pocket; a ceiling troffer washes a room from higher up with a softer falloff,
        // and fourteen of them on a post's numbers would blow the office white.
        // `castShadow` stays off on all of them: one shadow light is the budget, and the sun holds it.
        light = new PointLight('#ffffff', 1, descriptor.distance, descriptor.decay);
        lamps.set(id, light);
        scene.add(light);
      }
      light.color.setStyle(descriptor.color.slice(0, 7));
      light.color.convertSRGBToLinear();
      light.intensity = descriptor.intensity;
      light.distance = descriptor.distance;
      light.decay = descriptor.decay;
      // A post's head sits at about a tile; a troffer hangs just under the roof lid. Lighting a
      // room from a metre off the floor is what made the first indoor test read as a campfire.
      light.position.set(descriptor.x, descriptor.kind === 'ceiling' ? descriptor.y : 1.1, descriptor.z);
    }

    if (sun) {
      sun.target.position.set(lookAt.x, 0, lookAt.z);
      sun.target.updateMatrixWorld(true);
      /**
       * The shadow box covers what is ON SCREEN, at whatever zoom the player is using.
       *
       * A constant cannot do this. The visible ground is a rotated rectangle whose size scales with
       * zoom, and ±22 tiles - picked while looking at zoom-3 district captures - clips a zoom-1
       * frame badly, which is the zoom the game actually opens at. Shadows simply stopped existing
       * at the top and bottom of the screen, in the one case no capture in this repository looks at.
       *
       * `groundFootprint` is the same function the camera clamp and the frame inflation use, so the
       * three cannot disagree about how much ground is visible.
       */
      const footprint = groundFootprint(surface, renderCamera.zoom);
      const halfExtent = Math.max(footprint.width, footprint.height) / (2 * TILE_SIZE) + 4;
      sun.shadow.camera.left = -halfExtent;
      sun.shadow.camera.right = halfExtent;
      sun.shadow.camera.top = halfExtent;
      sun.shadow.camera.bottom = -halfExtent;
      sun.shadow.camera.far = halfExtent * 4 + 40;
      // Without this three keeps the projection it last built and every extent above is dead.
      sun.shadow.camera.updateProjectionMatrix();
      /**
       * After dusk the ONE shadow-casting light moves to the lamps.
       *
       * The comment below this used to say "the lamps own the night" while the code kept the only
       * shadow caster on a sun at 0.15 intensity, aimed along the day cycle's vector. So every
       * object at night sat in a warm pool with a hard shadow pointing away from a light that was
       * not lighting it, and most had no visible shadow at all — while hard aliased pixel shadows
       * are a stated pillar of the look. The code now does what the comment claimed.
       *
       * Still ONE directional and one shadow pass. A point light per lamp would be a second shadow
       * map, and a lamp head sitting inside its own light self-shadows; both were refused already.
       * The key comes from the centroid of the lamps in frame, which cannot honestly serve three
       * lamps at once but moves smoothly on a pan, where a nearest-lamp pick would jump every
       * shadow in the scene the moment the ranking changed.
       */
      /**
       * Indoors under troffers the key comes STRAIGHT DOWN, not from nine tiles out.
       *
       * The raking key below is right for a street of lamp posts and wrong for a ceiling-lit room:
       * at 20 degrees it turns a fluorescent office into a sunset and throws a desk's shadow the
       * length of the aisle. Checked before the lamp key, and only fires when ceiling fixtures are
       * actually in frame, so the villa at night keeps the behaviour it already has.
       */
      const overhead = indoorOverheadKeyOrigin(next);
      const key = overhead ? undefined : nightKeyOrigin(next);
      if (overhead) {
        // 8 up over a half-tile offset is about 86 degrees: enough of a lean that a partition still
        // marks the floor, nowhere near enough to rake. Shadows read as puddles under the furniture.
        sun.position.set(overhead.x + 0.5, 8, overhead.z + 0.5);
        if (daySunColor) sun.color.copy(daySunColor);
        // Lower than the 1.3 raking key. A light from directly above hits floors square, so the
        // same intensity that carves a shadow at 20 degrees would flood the room from 86.
        sun.intensity = 0.7;
      } else if (key) {
        const toLookX = lookAt.x - key.x;
        const toLookZ = lookAt.z - key.z;
        const span = Math.hypot(toLookX, toLookZ);
        // A key directly overhead casts nothing, so a lamp cluster the camera is centred on still
        // gets a rake. Six tiles out along the same bearing, at lamp-head height plus a little.
        const bearingX = span < 0.01 ? 0.7 : toLookX / span;
        const bearingZ = span < 0.01 ? 0.7 : toLookZ / span;
        // Low and far, so the rake is LONG. At height 5.5 over 6 tiles the key sat at 42 degrees and
        // cast a shadow about as long as the object was tall, which is a shadow you have to look
        // for. 3.2 over 9 tiles is 20 degrees, and a crate throws a shadow nearly three times its
        // own height - which is what a lamp at head height actually does, and what the reference's
        // hard raking shadows are.
        sun.position.set(lookAt.x - bearingX * 9, 3.2, lookAt.z - bearingZ * 9);
        // The key MOVES to the lamps; it does not take their colour. Tinting it amber to match the
        // harbour's lamps washed that district's teal cargo toward the ground it stood on and cost
        // 0.18 of saturation, because a key strong enough to carve a shadow is also strong enough
        // to repaint everything it touches. Colour belongs to the point lights and the pools, which
        // are per-lamp and local; the key's whole job is the shadow.
        if (daySunColor) sun.color.copy(daySunColor);
        // 1.3, not 0.65. A shadow is only visible when its light beats the ambient that fills it
        // in: at noon the sun runs 3.35 against a 1.1 sky and every canopy throws a hard edge,
        // while a 0.65 night key sat UNDER the 0.86 night sky and cast nothing anyone could see.
        // Raising it is affordable precisely because the key now grazes: a light 20 degrees above
        // the ground barely touches a floor, whose normal points away from it, so the extra
        // intensity goes into the shadow it carves rather than into flooding the scene.
        //
        // Swept 0.65 / 1.0 / 1.3 / 1.6 against every metric before choosing. 1.6 gives the cleanest
        // shadows and pushes the bazaar to 96 mean luminance; 1.0 keeps it at 91 and gives back
        // half the shadow. 1.3 keeps most of the shadow for 2.5 luminance. The sweep also settles
        // an open question: the bazaar's pooling ratio is 1.41 to 1.45 at EVERY value, so the key
        // is not what floods that district - its evenly spread courtyard lamps are.
        sun.intensity = 1.3;
      } else {
        sun.position.set(
          lookAt.x - (next.lighting.sun.shadowX / TILE_SIZE) * 6,
          14 + next.lighting.sun.elevation * 12,
          lookAt.z - (next.lighting.sun.shadowY / TILE_SIZE) * 6,
        );
        if (daySunColor) sun.color.copy(daySunColor);
        // 0.15, not 0.8. A 0.8 floor at dusk is a moon bright enough to light the whole room, which
        // is exactly the moonlit-terrace read the reference does not have.
        sun.intensity = 0.15 + next.lighting.sun.elevation * 3.2;
      }
    }

    // Blob shadows are flat ground quads, so they bake with the same helper the floors use.
    // Characters get a blob, props get a contact stain, and both are flat ground quads, so they
    // bake together into the batch that already exists. Zero draw calls for the thing that stops
    // every prop in the scene from floating a hair above its own tile.
    // The camera basis has to be current BEFORE either transparent batch bakes: upright VFX quads
    // turn to face the camera the same way character billboards do.
    camera.matrixWorld.extractBasis(cameraRight, cameraUp, cameraBack);
    billboardRight.set(cameraRight.x, 0, cameraRight.z);
    if (billboardRight.lengthSq() === 0) billboardRight.set(1, 0, 0);
    billboardRight.normalize();
    const basis = { x: billboardRight.x, z: billboardRight.z };

    const effects = vfxQuads(next);
    lastVfxCounts = { additive: effects.additive.length, alpha: effects.alpha.length };
    const blobs = [...blobShadows(next), ...propContactShadows(next)];
    // The selection ring rides here too, rather than in the DOM overlay it used to come from. An
    // overlay is above the canvas by construction, so the ring drew ACROSS the character it names;
    // baked flat on the ground it is depth-tested against the billboard, and the half of it behind
    // the character is hidden by the character. `radiusX` is the ground radius — `radiusY` is the
    // 2D renderer's hand-compressed version of it, and the tilt does that compression here.
    const ring = next.selectionRing;
    const rings: readonly GroundRing[] = [{
      x: ring.worldX / TILE_SIZE,
      z: ring.worldY / TILE_SIZE,
      radius: ring.radiusX / TILE_SIZE,
      // Authored in SCREEN pixels, so the zoom comes off to keep the stroke one width at every zoom.
      width: ring.strokeWidth / next.camera.zoom / TILE_SIZE,
      tint: ring.color,
      opacity: 1,
    }];
    blobMesh.geometry.dispose();
    blobMesh.geometry = bakeGroundStains(blobs, effects.alpha, basis, rings);
    blobMesh.visible = true;
    // Alpha now rides per vertex in the bake, so there is no material-wide opacity to set.

    // Transient glows are stepped additive lights on the floor, which is what a lamp pool is.
    const pools = [...lampPools(next), ...vfxGlowPools(next)];
    poolMesh.geometry.dispose();
    poolMesh.geometry = bakeLampPools(pools, effects.additive, basis);
    poolMesh.visible = pools.length > 0 || effects.additive.length > 0;

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
    const pencils = pencilBillboards(next);
    pencilMesh.geometry.dispose();
    pencilMesh.geometry = bakeBillboardGeometry(
      pencils,
      billboardRight,
      BILLBOARD_UP,
      PENCIL_WIDTH,
      PENCIL_HEIGHT,
    );
    pencilMesh.visible = pencils.length > 0 && pencilPixels !== undefined && pencilContext !== undefined;
    if (pencilMesh.visible && pencilPixels && pencilContext && pencilTexture) {
      const vampire = next.characters.find((character) => character.visualId === 'vampire-01');
      if (vampire) {
        blitPencilFrame(pencilPixels.data, vampire, next.animationTimestampMilliseconds);
        pencilContext.putImageData(pencilPixels, 0, 0);
        pencilTexture.needsUpdate = true;
      }
    }
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
        // Frame time, measured on the renderer's own loop. The lit path ships by default and its
        // shadow map is the most expensive thing in it; a cost nobody measures is a cost nobody
        // notices until a player does. A rolling window rather than a running mean, so a stall
        // shows up instead of being averaged away by the frames around it.
        //
        // **This is a missed-vsync detector, not a cost measure.** The interval between callbacks is
        // the display's refresh period whenever the renderer is keeping up, so a healthy reading
        // says "no frame was dropped" and says NOTHING about how much headroom is left. Timing
        // `render` instead is no better: it returns as soon as it has queued its commands, so it
        // reports 0.2ms whatever the GPU is doing. Neither number can price a shadow map, and this
        // one must never be used to bless one — a 120Hz host reads 8.3ms on any settings that keep
        // up, and a 60Hz host reads 16.7ms on the same settings.
        const now = typeof performance === 'undefined' ? 0 : performance.now();
        if (now > 0 && previousFrameAt > 0) {
          frameMilliseconds[frameCursor % FRAME_SAMPLE_COUNT] = now - previousFrameAt;
          frameCursor += 1;
        }
        previousFrameAt = now;
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
      vfxAdditiveQuads: lastVfxCounts.additive,
      vfxAlphaQuads: lastVfxCounts.alpha,
      ...frameTimings(frameMilliseconds, frameCursor),
    }),
    dispose: () => {
      running = false;
      renderer.setAnimationLoop(null);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      scene.remove(hemisphere);
      hemisphere.dispose();
      floorMesh.geometry.dispose();
      boxMesh.geometry.dispose();
      flatBoxMesh.geometry.dispose();
      glowBoxMesh.geometry.dispose();
      flatMaterial.dispose();
      glowMaterial.dispose();
      billboardMesh.geometry.dispose();
      billboardMaterial.dispose();
      pencilMesh.geometry.dispose();
      pencilMaterial.dispose();
      pencilTexture?.dispose();
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
