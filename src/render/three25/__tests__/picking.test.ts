import { isScreenPointInsideMap } from '../../camera';
import { isScreenPointInsideMapTilted, screenToTileTilted, worldToScreenTilted } from '../projection';

const MAP_PIXELS = { width: 2048, height: 1536 } as const;
const ORIGIN = { x: 0, y: 0, zoom: 1 } as const;

describe('tilted hit testing', () => {
  test('accepts a point over the map', () => {
    expect(isScreenPointInsideMapTilted(ORIGIN, { x: 100, y: 100 }, MAP_PIXELS)).toBe(true);
  });

  test('rejects a point past the far edge', () => {
    expect(isScreenPointInsideMapTilted(ORIGIN, { x: 100, y: 1_000_000 }, MAP_PIXELS)).toBe(false);
  });

  test('rejects negative screen coordinates outside the map', () => {
    expect(isScreenPointInsideMapTilted(ORIGIN, { x: -50, y: -50 }, MAP_PIXELS)).toBe(false);
  });

  /**
   * The depth axis is compressed, so the same screen row unprojects to a LARGER world y than it
   * would in 2D — the whole map fits in fewer screen rows. A point the 2D test still accepts can
   * therefore already be past the map's south edge under the tilt. That is why picking needs its
   * own branch instead of reusing the 2D helper.
   */
  test('unprojects the same screen row to a deeper world row than the 2D test', () => {
    const deep = { x: 100, y: 1400 };
    expect(isScreenPointInsideMap(ORIGIN, deep, MAP_PIXELS)).toBe(true);
    expect(isScreenPointInsideMapTilted(ORIGIN, deep, MAP_PIXELS)).toBe(false);
  });

  test('agrees with the tile projection at the boundary', () => {
    // The last tile of the map projects to a point the hit test still accepts.
    const lastTile = { x: 63, y: 47 };
    const screen = worldToScreenTilted(ORIGIN, { x: lastTile.x * 32 + 16, y: lastTile.y * 32 + 16 });
    expect(isScreenPointInsideMapTilted(ORIGIN, screen, MAP_PIXELS)).toBe(true);
    expect(screenToTileTilted(ORIGIN, screen)).toEqual(lastTile);
  });

  test('respects the camera offset and zoom', () => {
    const panned = { x: 1900, y: 1400, zoom: 1 } as const;
    // Screen origin sits at the camera's world position, which is still inside the map.
    expect(isScreenPointInsideMapTilted(panned, { x: 0, y: 0 }, MAP_PIXELS)).toBe(true);
    // Far to the right of a camera already near the east edge is off the map.
    expect(isScreenPointInsideMapTilted(panned, { x: 400, y: 0 }, MAP_PIXELS)).toBe(false);
  });
});
