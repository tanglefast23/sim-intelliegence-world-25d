import { WALL_HEIGHT_TILES } from '../recipes';
import { buildFloorQuads, buildWallBoxes } from '../scene-builder';
import { indoorFrame } from './fixtures';

describe('floor quads', () => {
  const frame = indoorFrame();

  test('emits one quad per floor placement', () => {
    expect(buildFloorQuads(frame)).toHaveLength(frame.floors.length + frame.groundDetails.length);
  });

  test('places quads on tile CENTRES, not tile corners', () => {
    // Props offset from the tile centre, so a floor on the corner would sit half a tile north-west
    // of the furniture standing on it.
    const first = buildFloorQuads(frame)[0]!;
    const source = frame.floors[0]!;
    expect(first.x).toBeCloseTo(source.tile.x + 0.5, 6);
    expect(first.z).toBeCloseTo(source.tile.y + 0.5, 6);
  });

  test('every quad is exactly one tile', () => {
    for (const quad of buildFloorQuads(frame)) {
      expect(quad.width).toBeCloseTo(1, 6);
      expect(quad.depth).toBeCloseTo(1, 6);
    }
  });

  test('carries the atlas source rect through unchanged', () => {
    expect(buildFloorQuads(frame)[0]!.source).toEqual(frame.floors[0]!.source);
  });

  test('ids stay unique so the mesh cache can diff them', () => {
    const quads = buildFloorQuads(frame);
    expect(new Set(quads.map((quad) => quad.id)).size).toBe(quads.length);
  });
});

describe('wall boxes', () => {
  const frame = indoorFrame();

  // Task 17 adds near-wall culling inside buildWallBoxes. When it does, it MUST update the
  // assertion below to subtract hiddenWallTiles(frame).size, or this test goes red at Task 17's
  // commit. The default fixture spawns the protagonist indoors, so culling is active.
  test('emits one box per wall placement', () => {
    expect(buildWallBoxes(frame)).toHaveLength(frame.walls.length);
  });

  test('stands every wall at the same height, centred on its half', () => {
    for (const box of buildWallBoxes(frame)) {
      expect(box.height).toBeCloseTo(WALL_HEIGHT_TILES, 6);
      expect(box.y).toBeCloseTo(WALL_HEIGHT_TILES / 2, 6);
    }
  });

  test('keeps walls inside a one-tile footprint, centred like the floors', () => {
    for (const box of buildWallBoxes(frame)) {
      expect(box.width).toBeLessThanOrEqual(1);
      expect(box.depth).toBeLessThanOrEqual(1);
      // Centred on the tile, so the fractional part is exactly a half. Subtracting the floor
      // rather than taking `% 1` keeps this right for a negative tile index.
      expect(box.x - Math.floor(box.x)).toBeCloseTo(0.5, 6);
      expect(box.z - Math.floor(box.z)).toBeCloseTo(0.5, 6);
    }
  });

  test('carries each wall own atlas rect and tint, not a shared default', () => {
    const byId = new Map(frame.walls.map((wall) => [wall.id, wall]));
    for (const box of buildWallBoxes(frame)) {
      const wall = byId.get(box.id)!;
      expect(box.source).toEqual(wall.source);
      expect(box.tint).toBe(wall.color);
      expect(box.sprite).toBe(wall.sprite);
    }
  });

  // This test is vacuous today and that is fine — it is a regression guard, not a discovery.
  // `compileWalls` already skips opening tiles, so door tiles never reach frame.walls.
  test('does not emit a box for a door tile', () => {
    const doorTiles = new Set(frame.doors.map((door) => `${door.tile.x},${door.tile.y}`));
    expect(doorTiles.size).toBeGreaterThan(0);
    for (const box of buildWallBoxes(frame)) {
      expect(doorTiles.has(`${box.x - 0.5},${box.z - 0.5}`)).toBe(false);
    }
  });
});
