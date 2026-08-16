import { clampCamera, type CameraState, type ViewportSize } from '../camera';
import { GROUND_Z_SCALE } from './projection';

/**
 * Clamps the camera for the tilted view.
 *
 * The tilted view reaches `1 / GROUND_Z_SCALE` further down the depth axis than the 2D view does,
 * so a camera clamped against the 2D extent would let the player pan the map's south edge up into
 * the middle of the screen with void below it. Handing `clampCamera` the tilted depth extent is
 * the whole fix — every other rule it applies, including the screen-pixel snap and the zoom
 * validation, is unchanged.
 *
 * When that taller extent exceeds the map, `clampCamera` already centres the oversized axis rather
 * than picking an edge, and the renderer paints a skirt outside the map bounds. Void at the edges
 * of a small map is expected, not a bug to clamp away.
 */
export function clampCameraTilted(
  camera: CameraState,
  viewport: ViewportSize,
  mapPixels: ViewportSize,
): CameraState {
  return clampCamera(
    camera,
    { width: viewport.width, height: viewport.height / GROUND_Z_SCALE },
    mapPixels,
  );
}
