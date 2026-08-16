import { hiddenWallTiles, tileKey, wallRoofGroups } from '../occlusion';
import { indoorFrame, outdoorFrame } from './fixtures';

describe('wall to roof-group derivation', () => {
  const frame = indoorFrame();

  test('the indoor fixture is the occupied case it claims to be', () => {
    // hiddenRoofGroupId is set, visibleRoofGroupIds is EMPTY, and roofs are filtered out. Never
    // index visibleRoofGroupIds on this fixture; it is undefined.
    expect(frame.hiddenRoofGroupId).toBe('protagonist-villa-roof');
    expect(frame.visibleRoofGroupIds).toEqual([]);
    expect(frame.roofs).toHaveLength(0);
    expect(frame.shelterCells.length).toBeGreaterThan(0);
  });

  test('assigns every wall bordering a shelter cell to a group', () => {
    const groups = wallRoofGroups(frame);
    const bordering = frame.walls.filter((wall) => frame.shelterCells.some((cell) =>
      wall.tile.x >= cell.x - 1 && wall.tile.x <= cell.x + cell.width &&
      wall.tile.y >= cell.y - 1 && wall.tile.y <= cell.y + cell.height));
    expect(bordering.length).toBeGreaterThan(0);
    for (const wall of bordering) {
      expect(groups.get(tileKey(wall.tile))).toBe(frame.hiddenRoofGroupId);
    }
  });

  test('leaves free-standing outdoor walls unassigned', () => {
    expect(wallRoofGroups(frame).size).toBeLessThan(frame.walls.length);
  });

  /**
   * The important one. The occupied group's roofs are removed from the frame the moment the player
   * steps inside, so a derivation that read `roofs` would assign nothing exactly when culling is
   * needed. Emptying roofs entirely must not change shelter-derived membership.
   */
  test('is stable when the occupied group has no roofs in the frame', () => {
    const noRoofs = { ...frame, roofs: [] };
    const shelterDerived = (source: typeof frame) =>
      [...wallRoofGroups(source).values()].filter((id) => id === source.hiddenRoofGroupId).length;
    expect(shelterDerived(noRoofs)).toBe(shelterDerived(frame));
    expect(shelterDerived(frame)).toBeGreaterThan(0);
  });

  test('assigns walls from roofed cells when the player is outdoors', () => {
    const outdoors = outdoorFrame();
    expect(outdoors.hiddenRoofGroupId).toBeUndefined();
    expect(outdoors.roofedCells.length).toBeGreaterThan(0);
    const groups = wallRoofGroups(outdoors);
    expect(groups.size).toBeGreaterThan(0);
    for (const id of groups.values()) {
      expect(outdoors.visibleRoofGroupIds).toContain(id);
    }
  });

  test('assigns the same wall tiles indoors and outdoors, only the id source differs', () => {
    const outdoors = outdoorFrame();
    expect([...wallRoofGroups(frame).keys()].sort())
      .toEqual([...wallRoofGroups(outdoors).keys()].sort());
  });

  test('is a pure function of the frame', () => {
    expect([...wallRoofGroups(frame)]).toEqual([...wallRoofGroups(frame)]);
  });
});

describe('near-wall culling', () => {
  test('hides nothing when the player is outdoors', () => {
    const outdoors = outdoorFrame();
    expect(outdoors.hiddenRoofGroupId).toBeUndefined();
    expect(hiddenWallTiles(outdoors).size).toBe(0);
  });

  test('hides at least one wall when indoors', () => {
    expect(hiddenWallTiles(indoorFrame()).size).toBeGreaterThan(0);
  });

  test('hides only walls of the occupied group', () => {
    const inside = indoorFrame();
    expect(inside.hiddenRoofGroupId).toBeDefined();
    const groups = wallRoofGroups(inside);
    for (const key of hiddenWallTiles(inside)) {
      expect(groups.get(key)).toBe(inside.hiddenRoofGroupId);
    }
  });

  test('hides exactly the south perimeter row of the occupied shelter', () => {
    const inside = indoorFrame();
    const southRow = inside.shelterCells[0]!.y + inside.shelterCells[0]!.height;
    const hidden = [...hiddenWallTiles(inside)].map((key) => key.split(',').map(Number));
    expect(hidden.length).toBeGreaterThan(0);
    for (const [, y] of hidden) expect(y).toBe(southRow);
  });

  /**
   * The rule this replaced was "the wall with the greatest tile.y in its column". The two agree
   * only on a solid ring. `compileWalls` removes opening tiles, so the villa's front-door column
   * has no south wall and the per-column maximum fell through to the interior partition at
   * (17,14) — a hole punched in the middle of the building.
   */
  test('never hides an interior partition, even in a column whose south wall is a doorway', () => {
    const inside = indoorFrame();
    const doorColumns = new Set(inside.doors.map((door) => door.tile.x));
    expect(doorColumns.size).toBeGreaterThan(0);
    const southRow = inside.shelterCells[0]!.y + inside.shelterCells[0]!.height;
    for (const key of hiddenWallTiles(inside)) {
      expect({ key, onPerimeter: Number(key.split(',')[1]) === southRow })
        .toEqual({ key, onPerimeter: true });
    }
    expect(hiddenWallTiles(inside).has('17,14')).toBe(false);
  });

  test('never hides the far wall of the occupied shelter', () => {
    const inside = indoorFrame();
    const groups = wallRoofGroups(inside);
    const occupied = inside.walls.filter(
      (wall) => groups.get(tileKey(wall.tile)) === inside.hiddenRoofGroupId,
    );
    const farRow = Math.min(...occupied.map((wall) => wall.tile.y));
    const hidden = hiddenWallTiles(inside);
    for (const wall of occupied.filter((candidate) => candidate.tile.y === farRow)) {
      expect(hidden.has(tileKey(wall.tile))).toBe(false);
    }
  });

  test('culls one row, not the building', () => {
    const inside = indoorFrame();
    const groups = wallRoofGroups(inside);
    const occupied = inside.walls.filter(
      (wall) => groups.get(tileKey(wall.tile)) === inside.hiddenRoofGroupId,
    ).length;
    // One row out of a ring: well under a third of the group's own walls, not of every wall on
    // the map.
    expect(hiddenWallTiles(inside).size).toBeLessThan(occupied / 3);
  });

  test('is idempotent across repeated frames', () => {
    const inside = indoorFrame();
    expect([...hiddenWallTiles(inside)]).toEqual([...hiddenWallTiles(inside)]);
  });
});
