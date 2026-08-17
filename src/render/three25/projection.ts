import type { TilePoint } from '../../world/maps/schema';
import type { CameraState, ViewportSize } from '../camera';

/**
 * Elevation of the 2.5D camera above the ground plane, in degrees.
 *
 * 30 degrees, lowered from the spike's 40.65. The spike camera looked down steeply enough that a
 * box showed mostly its top face; at 30 the vertical faces are 87% as tall on screen as they are
 * in world space, which is what makes a wall read as a wall.
 *
 * This is the calibration knob for the whole 2.5D look. Lowering it deepens the view and raises
 * the frame inflation cost in `inflation.ts`.
 */
export const GROUND_TILT_DEGREES = 30;

/**
 * Rotation of the camera around the world's vertical axis, in degrees.
 *
 * 45 degrees — isometric. At yaw 0 the camera looks straight down a world axis, so every box shows
 * exactly one face and the picture reads as top-down with chunky edges. At 45 every box shows two
 * faces, which is what makes the geometry legible as geometry.
 *
 * Changing this is safe: every function in this module, plus `inflation.ts`, `clamp.ts` and the
 * near-wall rule in `occlusion.ts`, derives from it rather than assuming a value.
 */
export const CAMERA_YAW_DEGREES = 45;

/** How much the depth axis compresses on screen. */
export const GROUND_Z_SCALE = Math.sin((GROUND_TILT_DEGREES * Math.PI) / 180);

/** How much a VERTICAL edge compresses on screen. Walls and billboards foreshorten by this. */
export const GROUND_HEIGHT_SCALE = Math.cos((GROUND_TILT_DEGREES * Math.PI) / 180);

const YAW_RADIANS = (CAMERA_YAW_DEGREES * Math.PI) / 180;
const YAW_COS = Math.cos(YAW_RADIANS);
const YAW_SIN = Math.sin(YAW_RADIANS);

/**
 * The camera's right direction on the ground plane, in world axes.
 *
 * At yaw 0 this is `(1, 0)` — screen right is world east — which is why the yaw-0 projection was a
 * pure vertical scale.
 */
export const CAMERA_RIGHT_ON_GROUND: Readonly<{ x: number; y: number }> = { x: YAW_COS, y: -YAW_SIN };

/**
 * The direction from the camera's target toward the camera, on the ground plane.
 *
 * This is the "near" direction: geometry further along it is closer to the viewer and lower on
 * screen. `occlusion.ts` culls the shelter sides whose outward normal points along it.
 */
export const CAMERA_TOWARD_VIEWER: Readonly<{ x: number; y: number }> = { x: YAW_SIN, y: YAW_COS };

/**
 * Projects a ground point to screen pixels, relative to `camera`.
 *
 * `camera.x`/`camera.y` is the world point that lands at screen `(0, 0)`. Under rotation that is
 * still one well-defined point, so the meaning survives the yaw switch — but it is no longer the
 * north-west corner of the visible region. `inflation.ts` is what accounts for that.
 *
 * The two lines are a rotation by the camera yaw followed by a compression of the depth axis:
 *
 *   screen.x = ( dx·cos ψ − dy·sin ψ ) · zoom
 *   screen.y = ( dx·sin ψ + dy·cos ψ ) · sin θ · zoom
 *
 * At yaw 0 they collapse to the original `dx·zoom` and `dy·sinθ·zoom`.
 *
 * Deliberately does not round, unlike `worldToScreen`. Rounding mid-chain would break the inverse;
 * callers round at the pixel.
 */
export function worldToScreenTilted(
  camera: CameraState,
  world: Readonly<{ x: number; y: number }>,
): Readonly<{ x: number; y: number }> {
  const dx = world.x - camera.x;
  const dy = world.y - camera.y;
  return {
    x: (dx * YAW_COS - dy * YAW_SIN) * camera.zoom,
    y: (dx * YAW_SIN + dy * YAW_COS) * GROUND_Z_SCALE * camera.zoom,
  };
}

/** The exact inverse of `worldToScreenTilted`: un-compress the depth axis, then un-rotate. */
export function screenToWorldTilted(
  camera: CameraState,
  screen: Readonly<{ x: number; y: number }>,
): Readonly<{ x: number; y: number }> {
  const u = screen.x / camera.zoom;
  const v = screen.y / (GROUND_Z_SCALE * camera.zoom);
  return {
    x: camera.x + u * YAW_COS + v * YAW_SIN,
    y: camera.y - u * YAW_SIN + v * YAW_COS,
  };
}

export function screenToTileTilted(
  camera: CameraState,
  screen: Readonly<{ x: number; y: number }>,
  tileSize = 32,
): TilePoint {
  const world = screenToWorldTilted(camera, screen);
  return { x: Math.floor(world.x / tileSize), y: Math.floor(world.y / tileSize) };
}

/**
 * Mirrors `isScreenPointInsideMap` for the tilted view.
 *
 * Unprojects with `screenToWorldTilted` and bounds-checks against the map, so a click past a
 * rotated edge is rejected the same way the 2D path rejects one past the map edge.
 */
export function isScreenPointInsideMapTilted(
  camera: CameraState,
  screen: Readonly<{ x: number; y: number }>,
  mapPixels: ViewportSize,
): boolean {
  const world = screenToWorldTilted(camera, screen);
  return world.x >= 0 && world.y >= 0 && world.x < mapPixels.width && world.y < mapPixels.height;
}

/**
 * The axis-aligned world-pixel footprint a screen rectangle covers, at this yaw.
 *
 * Under rotation the visible ground region is a rotated rectangle, so its bounding box is wider
 * AND deeper than the screen. `inflation.ts` and `clamp.ts` both need that box, and deriving it in
 * one place keeps them from disagreeing.
 */
export function groundFootprint(
  viewport: ViewportSize,
  zoom: number,
): Readonly<{ width: number; height: number }> {
  const bounds = groundFootprintBounds(viewport, zoom);
  return { width: bounds.width, height: bounds.height };
}

/**
 * The same footprint, but positioned: where its corners sit RELATIVE to the camera anchor.
 *
 * The anchor is the world point at screen `(0, 0)` — the top-left corner of the screen. Under
 * rotation that corner is not a corner of the footprint's bounding box, so the box is offset from
 * the anchor rather than centred on it.
 *
 * Unprojecting the four screen corners at yaw 45 makes it concrete: the screen's top-left maps to
 * the anchor itself, its top-right maps north-east, and its bottom-left maps south-west. So the box
 * starts at the anchor on the x axis and reaches almost a screen-width NORTH of it on the y axis.
 * Assuming it is centred — which is what a first pass at this naturally does — shifts the cull
 * window a thousand world pixels west and clips the map to a diagonal wedge.
 */
export function groundFootprintBounds(
  viewport: ViewportSize,
  zoom: number,
): Readonly<{ minimumX: number; minimumY: number; width: number; height: number }> {
  // Extents along the camera's own axes: right, then away-from-camera on the ground.
  const alongRight = viewport.width / zoom;
  const alongDepth = viewport.height / (zoom * GROUND_Z_SCALE);
  // The four screen corners unproject to (0,0), (R·cos, −R·sin), (D·sin, D·cos) and their sum.
  // With yaw in [0, 90) both YAW_COS and YAW_SIN are non-negative, so the extremes are these.
  return {
    minimumX: 0,
    minimumY: -alongRight * YAW_SIN,
    width: alongRight * YAW_COS + alongDepth * YAW_SIN,
    height: alongRight * YAW_SIN + alongDepth * YAW_COS,
  };
}

/**
 * Tile CENTRE, not corner. A corner is the shared boundary of four tiles, so flooring a projected
 * corner is float-flaky. Every round-trip assertion uses this.
 */
export function tileCenterWorld(
  tile: TilePoint,
  tileSize = 32,
): Readonly<{ x: number; y: number }> {
  return { x: tile.x * tileSize + tileSize / 2, y: tile.y * tileSize + tileSize / 2 };
}
