import type { ViewportSize } from '../camera';
import { groundFootprint, groundFootprintBounds } from './projection';
import { WALL_HEIGHT_TILES } from './recipes';

const TILE_SIZE = 32;

/**
 * How much taller and wider a frame request has to be to cover the tilted, rotated footprint.
 *
 * `world-frame.ts` culls to an axis-aligned tile rectangle derived from `viewport / zoom`. Under
 * the tilt the view reaches `1 / GROUND_Z_SCALE` further along the depth axis, and under the yaw
 * that stretched rectangle is ROTATED — so its axis-aligned bounding box is bigger on BOTH axes.
 * Inflating height alone, which is all yaw 0 needed, leaves wedges of empty ground east and west.
 *
 * Over-fetching is cheap; void inside the view is a bug. This deliberately asks for more than the
 * exact bound: the rotated footprint, plus `WALL_HEIGHT_TILES + 2` tiles of headroom so wall tops
 * and tall props entering from outside the band still arrive, plus the one-tile margin
 * `visibleTileBounds` already applies.
 *
 * ponytail: a flat conservative margin, not an exact projected bound. Tighten it only if a frame
 * report shows the extra placements actually cost frames.
 */
export function inflatedViewport(viewport: ViewportSize, zoom: number): ViewportSize {
  const footprint = groundFootprint(viewport, zoom);
  const headroomWorldPixels = (WALL_HEIGHT_TILES + 2) * TILE_SIZE;
  return {
    width: Math.ceil((footprint.width + headroomWorldPixels) * zoom),
    height: Math.ceil((footprint.height + headroomWorldPixels) * zoom),
  };
}

/**
 * Where the frame request's north-west corner has to sit.
 *
 * `camera.x`/`camera.y` is the world point at screen `(0, 0)`, which under rotation is NOT the
 * north-west corner of the visible ground. `world-frame.ts` only ever extends forward from the
 * camera it is given, so without this shift every tile north and west of the anchor is culled and
 * the top-left of the screen is empty.
 */
export function inflatedFrameOrigin(
  camera: Readonly<{ x: number; y: number; zoom: number }>,
  viewport: ViewportSize,
): Readonly<{ x: number; y: number }> {
  const bounds = groundFootprintBounds(viewport, camera.zoom);
  const headroomWorldPixels = (WALL_HEIGHT_TILES + 2) * TILE_SIZE;
  return {
    x: camera.x + bounds.minimumX - headroomWorldPixels / 2,
    y: camera.y + bounds.minimumY - headroomWorldPixels / 2,
  };
}
