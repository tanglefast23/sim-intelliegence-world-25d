import { inflatedViewport } from '../inflation';
import { GROUND_Z_SCALE } from '../projection';
import { WALL_HEIGHT_TILES } from '../recipes';

const VIEWPORT = { width: 1280, height: 720 } as const;
const TILE_SIZE = 32;

/** The tallest box any recipe builds: the cargo crane mast, centre 1.3 with height 2.0. */
const TALLEST_RECIPE_TILES = 2.3;

describe('frame inflation for the tilted view', () => {
  test('leaves the horizontal axis alone at yaw 0', () => {
    expect(inflatedViewport(VIEWPORT, 1).width).toBe(VIEWPORT.width);
  });

  test('covers the depth stretch AND clears the tallest prop above it', () => {
    const stretch = VIEWPORT.height / GROUND_Z_SCALE;
    const headroom = inflatedViewport(VIEWPORT, 1).height - stretch;
    expect(headroom).toBeGreaterThanOrEqual(TALLEST_RECIPE_TILES * TILE_SIZE);
    expect(headroom).toBeGreaterThanOrEqual(WALL_HEIGHT_TILES * TILE_SIZE);
  });

  /**
   * `world-frame.ts` divides the requested viewport by zoom to get world pixels, so the headroom
   * term is multiplied by zoom here to survive that divide. Delete the multiply and the pad shrinks
   * as the player zooms in, which is exactly when tall geometry is most likely to be cut.
   */
  test('keeps the headroom pad constant in world pixels across zoom', () => {
    const worldHeadroom = (zoom: number) =>
      inflatedViewport(VIEWPORT, zoom).height / zoom - VIEWPORT.height / zoom / GROUND_Z_SCALE;
    expect(worldHeadroom(3)).toBeCloseTo(worldHeadroom(1), 0);
  });

  test('adds more world rows at higher zoom, never fewer', () => {
    const low = inflatedViewport(VIEWPORT, 1);
    const high = inflatedViewport(VIEWPORT, 3);
    expect(high.height / 3).toBeGreaterThanOrEqual(VIEWPORT.height / 3 / GROUND_Z_SCALE);
    expect(low.height).toBeGreaterThan(high.height / 3);
  });

  test('returns whole pixels', () => {
    const inflated = inflatedViewport({ width: 1279, height: 719 }, 1.5);
    expect(Number.isInteger(inflated.width)).toBe(true);
    expect(Number.isInteger(inflated.height)).toBe(true);
  });
});
