import { assertWorldZoom } from '../../domain/presentation/world-zoom';
import { type CameraState, type ClampFn, type ViewportSize } from '../camera';
import { groundFootprintBounds, screenToWorldTilted } from './projection';

/**
 * Where the north-west corner of the visible ground may sit, on one axis.
 *
 * While the footprint fits, this is `clampCamera`'s rule exactly: the corner stays on the map.
 *
 * Once it does not fit, `clampCamera` centres the axis and pins it — no pan at all. That is fine
 * for the 2D view, which only exceeds a map by being zoomed out past it, but the tilted view sees
 * the map's ROTATED bounding box: at 1x a 1250x738 viewport spans about 1928 world pixels on each
 * axis, taller than a 1536px map, so the whole vertical axis froze at the default zoom. Instead the
 * camera travels until the map edge meets the screen edge. The map stays fully covered either way,
 * so the void the renderer's skirt paints is bounded to one edge at a time.
 */
function tiltedAxisBounds(
  footprintPixels: number,
  mapPixels: number,
): Readonly<{ minimum: number; maximum: number }> {
  if (footprintPixels >= mapPixels) return { minimum: mapPixels - footprintPixels, maximum: 0 };
  return { minimum: 0, maximum: mapPixels - footprintPixels };
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
