import { clampCamera } from '../../camera';
import { clampCameraTilted, panCameraTilted } from '../clamp';
import { groundFootprintBounds, screenToWorldTilted } from '../projection';

const VIEWPORT = { width: 1280, height: 720 } as const;
const MAP_PIXELS = { width: 2048, height: 1536 } as const;

/** Where the visible ground actually sits, given a clamped camera anchor. */
function visibleBox(camera: { x: number; y: number; zoom: number }) {
  const bounds = groundFootprintBounds(VIEWPORT, camera.zoom);
  return {
    left: camera.x + bounds.minimumX,
    top: camera.y + bounds.minimumY,
    right: camera.x + bounds.minimumX + bounds.width,
    bottom: camera.y + bounds.minimumY + bounds.height,
  };
}

describe('tilted camera clamp', () => {
  /**
   * The invariant that matters. `clampCamera` assumes the camera IS the north-west corner of what
   * is visible; under rotation the anchor sits inside the footprint instead. So the assertion is
   * about the FOOTPRINT staying on the map, not about the anchor's own coordinates.
   */
  test('keeps the visible footprint on the map when it fits', () => {
    const zoom = 3;
    const bounds = groundFootprintBounds(VIEWPORT, zoom);
    expect(bounds.width).toBeLessThan(MAP_PIXELS.width);
    expect(bounds.height).toBeLessThan(MAP_PIXELS.height);
    for (const wild of [{ x: -9999, y: -9999 }, { x: 9999, y: 9999 }, { x: -9999, y: 9999 }]) {
      const box = visibleBox(clampCameraTilted({ ...wild, zoom }, VIEWPORT, MAP_PIXELS));
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.top).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeLessThanOrEqual(MAP_PIXELS.width + 1);
      expect(box.bottom).toBeLessThanOrEqual(MAP_PIXELS.height + 1);
    }
  });

  /**
   * At yaw 0 the horizontal axis matched the 2D clamp exactly. Under rotation the player sees
   * further east and west as well as further south, so the camera has to stop sooner on both axes.
   */
  test('allows less travel than the 2D clamp on both axes', () => {
    const zoom = 3;
    const far = { x: 9999, y: 9999, zoom } as const;
    const tilted = clampCameraTilted(far, VIEWPORT, MAP_PIXELS);
    const flat = clampCamera(far, VIEWPORT, MAP_PIXELS);
    expect(tilted.x).toBeLessThan(flat.x);
    expect(tilted.y).toBeLessThan(flat.y);
  });

  /**
   * The 1x default. Centring this axis pinned it, which is what left the tilted view unable to pan
   * at all — see `tiltedAxisBounds`.
   */
  test('still pans an axis whose rotated footprint exceeds the map', () => {
    // At zoom 1 the footprint is about 1923px square, already larger than this 1536px-tall map.
    const bounds = groundFootprintBounds(VIEWPORT, 1);
    expect(bounds.height).toBeGreaterThan(MAP_PIXELS.height);
    const low = clampCameraTilted({ x: 0, y: -9999, zoom: 1 }, VIEWPORT, MAP_PIXELS);
    const high = clampCameraTilted({ x: 0, y: 9999, zoom: 1 }, VIEWPORT, MAP_PIXELS);
    expect(high.y - low.y).toBeCloseTo(bounds.height - MAP_PIXELS.height, 0);
    // The map stays fully covered at both stops, so void is bounded to one edge at a time.
    for (const box of [visibleBox(low), visibleBox(high)]) {
      expect(box.top).toBeLessThanOrEqual(1);
      expect(box.bottom).toBeGreaterThanOrEqual(MAP_PIXELS.height - 1);
    }
  });

  test('never returns a zoom outside the world range', () => {
    expect(() => clampCameraTilted({ x: 0, y: 0, zoom: 4 }, VIEWPORT, MAP_PIXELS)).toThrow(RangeError);
    expect(() => clampCameraTilted({ x: 0, y: 0, zoom: 0 }, VIEWPORT, MAP_PIXELS)).toThrow(RangeError);
  });

  test('is idempotent', () => {
    const once = clampCameraTilted({ x: 5000, y: 5000, zoom: 1 }, VIEWPORT, MAP_PIXELS);
    expect(clampCameraTilted(once, VIEWPORT, MAP_PIXELS)).toEqual(once);
  });
});

describe('tilted camera pan', () => {
  /**
   * The ground point under the cursor must stay under it. The flat `panCamera` rule moved only
   * world x for a horizontal drag, which slides the ground diagonally once the camera is yawed.
   */
  it('keeps the grabbed ground point under the pointer', () => {
    const camera = { x: 600, y: 600, zoom: 2 } as const;
    const grabbed = { x: 300, y: 200 } as const;
    const delta = { x: 96, y: 48 } as const;
    const world = screenToWorldTilted(camera, grabbed);
    const panned = panCameraTilted(camera, delta, VIEWPORT, MAP_PIXELS);
    const after = screenToWorldTilted(panned, { x: grabbed.x + delta.x, y: grabbed.y + delta.y });
    // `clampCamera` snaps the anchor to a whole screen pixel, so the match is to that lattice.
    expect(Math.abs(after.x - world.x)).toBeLessThanOrEqual(1 / camera.zoom);
    expect(Math.abs(after.y - world.y)).toBeLessThanOrEqual(1 / camera.zoom);
  });

  it('moves both world axes for a purely horizontal drag', () => {
    const camera = { x: 600, y: 600, zoom: 2 } as const;
    const panned = panCameraTilted(camera, { x: 100, y: 0 }, VIEWPORT, MAP_PIXELS);
    expect(panned.x).toBeLessThan(camera.x);
    expect(panned.y).toBeGreaterThan(camera.y);
  });
});
