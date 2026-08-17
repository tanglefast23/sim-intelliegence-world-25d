import { inflatedFrameOrigin, inflatedViewport } from '../inflation';
import { GROUND_Z_SCALE, groundFootprint } from '../projection';
import { WALL_HEIGHT_TILES } from '../recipes';

const VIEWPORT = { width: 1280, height: 720 } as const;
const TILE_SIZE = 32;

/** The tallest box any recipe builds: the cargo crane mast, centre 1.3 with height 2.0. */
const TALLEST_RECIPE_TILES = 2.3;

describe('frame inflation for the tilted view', () => {
  /**
   * At yaw 0 the horizontal axis needed no inflation. Under rotation the visible ground is a
   * rotated rectangle, so its bounding box is wider than the screen as well as deeper — inflating
   * height alone would leave wedges of empty ground east and west.
   */
  test('inflates BOTH axes under rotation', () => {
    const inflated = inflatedViewport(VIEWPORT, 1);
    expect(inflated.width).toBeGreaterThan(VIEWPORT.width);
    expect(inflated.height).toBeGreaterThan(VIEWPORT.height);
  });

  test('covers the rotated footprint on both axes', () => {
    const footprint = groundFootprint(VIEWPORT, 1);
    const inflated = inflatedViewport(VIEWPORT, 1);
    expect(inflated.width).toBeGreaterThanOrEqual(footprint.width);
    expect(inflated.height).toBeGreaterThanOrEqual(footprint.height);
  });

  test('shifts the frame origin back to the corner of that footprint', () => {
    // world-frame only extends FORWARD from the camera it is given, and the camera anchor is the
    // world point at screen (0,0) - not the north-west corner of the rotated footprint.
    const origin = inflatedFrameOrigin({ x: 1000, y: 1000, zoom: 1 }, VIEWPORT);
    expect(origin.x).toBeLessThan(1000);
    expect(origin.y).toBeLessThan(1000);
  });

  test('clears the tallest prop above the footprint', () => {
    const headroom = inflatedViewport(VIEWPORT, 1).height - groundFootprint(VIEWPORT, 1).height;
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
      inflatedViewport(VIEWPORT, zoom).height / zoom - groundFootprint(VIEWPORT, zoom).height;
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
