import { clampCamera } from '../../camera';
import { clampCameraTilted } from '../clamp';
import { GROUND_Z_SCALE } from '../projection';

const VIEWPORT = { width: 1280, height: 720 } as const;
const MAP_PIXELS = { width: 2048, height: 1536 } as const;

describe('tilted camera clamp', () => {
  test('leaves the horizontal axis exactly where the 2D clamp puts it', () => {
    const far = { x: 9999, y: 0, zoom: 1 } as const;
    expect(clampCameraTilted(far, VIEWPORT, MAP_PIXELS).x)
      .toBeCloseTo(clampCamera(far, VIEWPORT, MAP_PIXELS).x, 6);
  });

  /**
   * The point of the whole module. The tilted view sees further down the map, so the camera has to
   * stop sooner — otherwise the player pans the south edge into mid-screen with void beneath it.
   */
  test('stops the camera sooner on the depth axis than the 2D clamp', () => {
    const far = { x: 0, y: 9999, zoom: 1 } as const;
    const tilted = clampCameraTilted(far, VIEWPORT, MAP_PIXELS).y;
    const flat = clampCamera(far, VIEWPORT, MAP_PIXELS).y;
    expect(tilted).toBeLessThan(flat);
    expect(tilted).toBeCloseTo(MAP_PIXELS.height - VIEWPORT.height / GROUND_Z_SCALE, 0);
  });

  test('centres the depth axis when the tilted footprint exceeds the map', () => {
    // A map short enough that the tilted view sees past both edges at once.
    const shortMap = { width: 2048, height: 900 } as const;
    expect(VIEWPORT.height / GROUND_Z_SCALE).toBeGreaterThan(shortMap.height);
    const low = clampCameraTilted({ x: 0, y: -9999, zoom: 1 }, VIEWPORT, shortMap);
    const high = clampCameraTilted({ x: 0, y: 9999, zoom: 1 }, VIEWPORT, shortMap);
    expect(low.y).toBeCloseTo(high.y, 6);
    // Centred means negative: the view overhangs the map equally on both sides.
    expect(low.y).toBeLessThan(0);
  });

  test('clamps normally at zoom 3 where the footprint fits', () => {
    const clamped = clampCameraTilted({ x: -9999, y: 0, zoom: 3 }, VIEWPORT, MAP_PIXELS);
    expect(clamped.x).toBeGreaterThanOrEqual(0);
    expect(clamped.y).toBeGreaterThanOrEqual(0);
  });

  test('never returns a zoom outside the world range', () => {
    expect(() => clampCameraTilted({ x: 0, y: 0, zoom: 4 }, VIEWPORT, MAP_PIXELS)).toThrow(RangeError);
    expect(() => clampCameraTilted({ x: 0, y: 0, zoom: 0 }, VIEWPORT, MAP_PIXELS)).toThrow(RangeError);
  });

  test('keeps the camera on the screen-pixel lattice, like the 2D clamp', () => {
    const clamped = clampCameraTilted({ x: 101.37, y: 202.61, zoom: 2 }, VIEWPORT, MAP_PIXELS);
    expect(Number.isInteger(clamped.x * 2)).toBe(true);
    expect(Number.isInteger(clamped.y * 2)).toBe(true);
  });

  test('is idempotent', () => {
    const once = clampCameraTilted({ x: 5000, y: 5000, zoom: 1 }, VIEWPORT, MAP_PIXELS);
    expect(clampCameraTilted(once, VIEWPORT, MAP_PIXELS)).toEqual(once);
  });
});
