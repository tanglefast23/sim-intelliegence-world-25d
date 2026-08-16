import type { ViewportSize } from '../camera';
import { GROUND_Z_SCALE } from './projection';
import { WALL_HEIGHT_TILES } from './recipes';

const TILE_SIZE = 32;

/**
 * `world-frame.ts` culls to an axis-aligned tile rectangle from the 2D affine. At yaw 0 the tilted
 * view reaches `1 / GROUND_Z_SCALE` further down the depth axis, and wall tops project further
 * still, so `WorldScene.tsx` asks for a taller viewport and the returned window covers what is
 * actually drawn.
 *
 * Over-fetching is cheap; void inside the view is a bug. This deliberately asks for more than the
 * exact footprint: the depth stretch, plus `WALL_HEIGHT_TILES + 2` tiles of headroom, plus the
 * one-tile margin `visibleTileBounds` already applies. 3.45 tiles clears the tallest box any recipe
 * builds — the cargo crane mast, which tops out at 2.3 tiles.
 *
 * The headroom is multiplied by zoom because `world-frame.ts` divides the requested viewport by
 * zoom. That multiply is what keeps the pad a constant number of WORLD pixels; without it the pad
 * shrinks as the player zooms in.
 *
 * ponytail: a flat conservative margin, not an exact projected bound. Tighten it only if Task 20's
 * frame report shows the extra placements actually cost frames.
 */
export function inflatedViewport(viewport: ViewportSize, zoom: number): ViewportSize {
  const headroomWorldPixels = (WALL_HEIGHT_TILES + 2) * TILE_SIZE;
  return {
    width: viewport.width,
    height: Math.ceil(viewport.height / GROUND_Z_SCALE + headroomWorldPixels * zoom),
  };
}
