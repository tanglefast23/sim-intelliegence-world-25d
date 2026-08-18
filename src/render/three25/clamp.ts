import { assertWorldZoom } from '../../domain/presentation/world-zoom';
import { type CameraState, type ClampFn, type ViewportSize } from '../camera';
import { groundFootprintBounds, screenToWorldTilted } from './projection';

/**
 * How far past a map edge the tilted camera may travel, as a fraction of the visible footprint.
 *
 * This is the calibration knob for how much void a pan may show. At 0 the map always covers the
 * screen and pan range collapses to `|map − footprint|`, which is what made middle-drag read as
 * broken: measured on a 2048x1536 map, 1280x720 at the default 1x zoom allowed 125 x 387 world
 * pixels of travel, and 1920x1080 at 2x allowed 94 on the vertical axis. A few pixels of movement
 * before a hard stop feels like a dead button.
 *
 * At 0.5 the travel range is exactly the map size on both axes at every zoom, and the worst case a
 * player can drag to is half the screen showing void. The renderer's skirt follows the camera, so
 * that void is painted ground, not black.
 */
export const TILTED_PAN_OVERSCAN = 0.5;

/**
 * Where the north-west corner of the visible ground may sit, on one axis.
 *
 * `clampCamera` keeps that corner on the map, and centres-and-pins any axis whose extent exceeds
 * it. That is fine for the 2D view, which only exceeds a map by being zoomed out past it, but the
 * tilted view sees the map's ROTATED bounding box — at 1x a 1250x738 viewport spans about 1928
 * world pixels on each axis, taller than a 1536px map — so the whole vertical axis froze at the
 * default zoom. Here the corner may instead travel `TILTED_PAN_OVERSCAN` of a footprint past each
 * edge, which is what gives pan a usable range at every zoom.
 */
function tiltedAxisBounds(
  footprintPixels: number,
  mapPixels: number,
): Readonly<{ minimum: number; maximum: number }> {
  const slack = footprintPixels * TILTED_PAN_OVERSCAN;
  // Non-empty for any footprint: the gap `footprint − map` never exceeds `2 · slack` while the
  // overscan is at least 0.5, and below that the wider footprint simply pins the axis at its centre.
  const minimum = -slack;
  return { minimum, maximum: Math.max(minimum, mapPixels - footprintPixels + slack) };
}

/**
 * Clamps the camera for the tilted, rotated view.
 *
 * The tilted view reaches further along the depth axis than the 2D view, and the yaw turns that
 * stretched rectangle into a rotated one — so the axis-aligned ground the player can see is bigger
 * on both axes. A camera clamped against the 2D extent would let them pan a map edge into the
 * middle of the screen with void beside it.
 *
 * Clamping against the rotated footprint is the whole fix. The screen-pixel snap and the zoom
 * validation are `clampCamera`'s, kept identical; only the oversized-axis rule differs, and
 * `tiltedAxisBounds` carries why.
 */
export function clampCameraTilted(
  camera: CameraState,
  viewport: ViewportSize,
  mapPixels: ViewportSize,
): CameraState {
  const zoom = assertWorldZoom(camera.zoom);
  const bounds = groundFootprintBounds(viewport, zoom);
  const horizontal = tiltedAxisBounds(bounds.width, mapPixels.width);
  const vertical = tiltedAxisBounds(bounds.height, mapPixels.height);
  // The camera anchor is the ground point at screen (0, 0). Under rotation that is not the corner
  // of the footprint, so the corner is what gets clamped and snapped; the anchor is recovered from
  // it afterwards, exactly as it was when `clampCamera` did the clamping.
  const cornerX = Math.min(horizontal.maximum, Math.max(horizontal.minimum, camera.x + bounds.minimumX));
  const cornerY = Math.min(vertical.maximum, Math.max(vertical.minimum, camera.y + bounds.minimumY));
  return {
    zoom,
    x: Math.round(cornerX * zoom) / zoom - bounds.minimumX,
    y: Math.round(cornerY * zoom) / zoom - bounds.minimumY,
  };
}

/**
 * Pans the tilted camera by a screen delta.
 *
 * `panCamera` subtracts `delta / zoom` from each world axis, which is only the inverse projection
 * at yaw 0. Under the 45 degree yaw a screen delta maps onto BOTH world axes, so the flat rule
 * slides the ground diagonally away from the cursor instead of under it. Reusing
 * `screenToWorldTilted` from the origin gives exactly the linear part of the real inverse, so the
 * grabbed ground point stays under the pointer.
 */
export function panCameraTilted(
  camera: CameraState,
  screenDelta: Readonly<{ x: number; y: number }>,
  viewport: ViewportSize,
  mapPixels: ViewportSize,
  clamp: ClampFn = clampCameraTilted,
): CameraState {
  const worldDelta = screenToWorldTilted({ ...camera, x: 0, y: 0 }, screenDelta);
  return clamp({
    ...camera,
    x: camera.x - worldDelta.x,
    y: camera.y - worldDelta.y,
  }, viewport, mapPixels);
}
