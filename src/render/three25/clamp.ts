import { clampCamera, type CameraState, type ViewportSize } from '../camera';
import { groundFootprintBounds } from './projection';

/**
 * Clamps the camera for the tilted, rotated view.
 *
 * The tilted view reaches further along the depth axis than the 2D view, and the yaw turns that
 * stretched rectangle into a rotated one — so the axis-aligned ground the player can see is bigger
 * on both axes. A camera clamped against the 2D extent would let them pan a map edge into the
 * middle of the screen with void beside it.
 *
 * Handing `clampCamera` the rotated footprint is the whole fix. Every other rule it applies —
 * the screen-pixel snap, the zoom validation, and centring an axis whose extent exceeds the map —
 * is unchanged.
 *
 * When that footprint exceeds the map, `clampCamera` centres the oversized axis and the renderer
 * paints a skirt outside the bounds. Void at the edge of a small map is expected, not a bug to
 * clamp away.
 */
export function clampCameraTilted(
  camera: CameraState,
  viewport: ViewportSize,
  mapPixels: ViewportSize,
): CameraState {
  const bounds = groundFootprintBounds(viewport, camera.zoom);
  // `clampCamera` assumes the camera IS the north-west corner of what is visible. Under rotation
  // the anchor sits inside the footprint instead, so the corner is clamped and the anchor is
  // recovered from it. `clampCamera` divides by zoom to get world pixels, so multiply back through.
  const corner = clampCamera(
    { ...camera, x: camera.x + bounds.minimumX, y: camera.y + bounds.minimumY },
    { width: bounds.width * camera.zoom, height: bounds.height * camera.zoom },
    mapPixels,
  );
  return { ...corner, x: corner.x - bounds.minimumX, y: corner.y - bounds.minimumY };
}
