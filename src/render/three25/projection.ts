import type { TilePoint } from '../../world/maps/schema';
import type { CameraState, ViewportSize } from '../camera';

/**
 * Elevation of the 2.5D camera above the ground plane, in degrees.
 *
 * Derived from the spike camera in spikes/001-threejs-pixel-villa/scene.js, which is Y-up: position
 * (8.2, 12.5, 11.5) looking at (0, 0.2, -0.25) gives a rise of 12.3 and a horizontal run of
 * hypot(8.2, 11.75) = 14.328, so the elevation is atan(12.3 / 14.328) = 40.644 degrees. 40.65 is
 * that value rounded to two decimals.
 *
 * This is the calibration knob for the whole 2.5D look — lowering it deepens the view and raises
 * the frame inflation cost in `inflation.ts`.
 */
export const GROUND_TILT_DEGREES = 40.65;

/** How much the depth axis compresses on screen. Horizontal is unscaled at yaw 0. */
export const GROUND_Z_SCALE = Math.sin((GROUND_TILT_DEGREES * Math.PI) / 180);

/**
 * At yaw 0 the ground projection is a vertical scale and nothing else: world `x` maps straight to
 * screen `x`, and world `y` (the 2D screen-down axis) compresses by `sin(elevation)`.
 *
 * Unlike `worldToScreen` in `camera.ts` this does NOT round. Rounding to whole pixels would break
 * the inverse, and every caller that wants a pixel rounds at the end instead of mid-chain.
 */
export function worldToScreenTilted(
  camera: CameraState,
  world: Readonly<{ x: number; y: number }>,
): Readonly<{ x: number; y: number }> {
  return {
    x: (world.x - camera.x) * camera.zoom,
    y: (world.y - camera.y) * GROUND_Z_SCALE * camera.zoom,
  };
}

export function screenToWorldTilted(
  camera: CameraState,
  screen: Readonly<{ x: number; y: number }>,
): Readonly<{ x: number; y: number }> {
  return {
    x: camera.x + screen.x / camera.zoom,
    y: camera.y + screen.y / (GROUND_Z_SCALE * camera.zoom),
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
 * Unprojects with `screenToWorldTilted` and bounds-checks against the map, so a click below the
 * horizon of a short map is rejected the same way the 2D path rejects one past the map edge.
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
 * Tile CENTRE, not corner. A corner is the shared boundary of four tiles, so flooring a projected
 * corner is float-flaky. Every round-trip assertion uses this.
 */
export function tileCenterWorld(
  tile: TilePoint,
  tileSize = 32,
): Readonly<{ x: number; y: number }> {
  return { x: tile.x * tileSize + tileSize / 2, y: tile.y * tileSize + tileSize / 2 };
}
