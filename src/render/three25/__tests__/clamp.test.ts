import { clampCameraTilted, panCameraTilted, TILTED_PAN_OVERSCAN } from '../clamp';
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
   * about the FOOTPRINT's overhang, not about the anchor's own coordinates.
   *
   * The overhang is measured against the ROTATED footprint, which is what stops anyone reaching for
   * `clampCamera` here: at 3x that footprint is 641px on each axis where the flat viewport is only
   * 427 wide, so a flat rule would let the camera travel a third of a screen further east.
   */
  test('lets the footprint overhang the map by one overscan and no further', () => {
    for (const zoom of [1, 2, 3] as const) {
      const bounds = groundFootprintBounds(VIEWPORT, zoom);
      expect(bounds.width).toBeGreaterThan(VIEWPORT.width / zoom);
      const slack = { x: bounds.width * TILTED_PAN_OVERSCAN, y: bounds.height * TILTED_PAN_OVERSCAN };
      for (const wild of [{ x: -9999, y: -9999 }, { x: 9999, y: 9999 }, { x: -9999, y: 9999 }]) {
        const box = visibleBox(clampCameraTilted({ ...wild, zoom }, VIEWPORT, MAP_PIXELS));
        expect(box.left).toBeGreaterThanOrEqual(-slack.x - 1);
        expect(box.top).toBeGreaterThanOrEqual(-slack.y - 1);
        expect(box.right).toBeLessThanOrEqual(MAP_PIXELS.width + slack.x + 1);
        expect(box.bottom).toBeLessThanOrEqual(MAP_PIXELS.height + slack.y + 1);
      }
    }
  });

  /**
   * The regression middle-drag actually felt. Clamping the map to full coverage left a travel range
   * of `|map − footprint|`, which at the default 1x zoom on this viewport was 125 x 387 world
   * pixels — a drag that stops almost before it starts. The overscan makes the range the map size
   * at every zoom, so a pan can always cross the whole map.
   */
  test('pans a full map on both axes at every zoom', () => {
    for (const zoom of [1, 2, 3] as const) {
      const low = clampCameraTilted({ x: -9999, y: -9999, zoom }, VIEWPORT, MAP_PIXELS);
      const high = clampCameraTilted({ x: 9999, y: 9999, zoom }, VIEWPORT, MAP_PIXELS);
      expect(high.x - low.x).toBeCloseTo(MAP_PIXELS.width, 0);
      expect(high.y - low.y).toBeCloseTo(MAP_PIXELS.height, 0);
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
