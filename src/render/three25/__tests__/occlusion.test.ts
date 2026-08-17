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

  /**
   * At yaw 45 the camera looks from the south-EAST, so both the south row and the east column
   * stand between it and the room. At yaw 0 only the south row did. The rule derives that from
   * `CAMERA_TOWARD_VIEWER` rather than naming a side.
   */
  test('hides exactly the shelter sides that face the camera', () => {
    const inside = indoorFrame();
    const cell = inside.shelterCells[0]!;
    const southRow = cell.y + cell.height;
    const eastColumn = cell.x + cell.width;
    const hidden = [...hiddenWallTiles(inside)].map((key) => key.split(',').map(Number));
    expect(hidden.length).toBeGreaterThan(0);
    for (const [x, y] of hidden) {
      expect({ x, y, onNearSide: y === southRow || x === eastColumn })
        .toEqual({ x, y, onNearSide: true });
    }
    // Both sides really are represented, not just one.
    expect(hidden.some(([, y]) => y === southRow)).toBe(true);
    expect(hidden.some(([x]) => x === eastColumn)).toBe(true);
  });

  /**
   * The rule this replaced was "the wall with the greatest tile.y in its column". The two agree
   * only on a solid ring. `compileWalls` removes opening tiles, so the villa's front-door column
   * has no south wall and the per-column maximum fell through to the interior partition at
   * (17,14) — a hole punched in the middle of the building.
   */
  test('never hides an interior partition, even in a column whose south wall is a doorway', () => {
    const inside = indoorFrame();
    expect(new Set(inside.doors.map((door) => door.tile.x)).size).toBeGreaterThan(0);
    // The old "greatest tile.y in the column" rule culled this tile: the front-door column has no
    // south wall, so the maximum fell through to a partition in the middle of the building.
    expect(hiddenWallTiles(inside).has('17,14')).toBe(false);
  });

  test('never hides the far wall of the occupied shelter', () => {
    const inside = indoorFrame();
    const groups = wallRoofGroups(inside);
    const occupied = inside.walls.filter(
      (wall) => groups.get(tileKey(wall.tile)) === inside.hiddenRoofGroupId,
    );
    const cell = inside.shelterCells[0]!;
    const hidden = hiddenWallTiles(inside);
    // The north row and the west column face away from the camera and must stay standing. Their
    // shared tiles with a NEAR side - the north-east and south-west corners - are legitimately
    // culled, so they are excluded rather than counted as failures.
    const far = occupied.filter((wall) =>
      (wall.tile.y === cell.y - 1 && wall.tile.x !== cell.x + cell.width)
      || (wall.tile.x === cell.x - 1 && wall.tile.y !== cell.y + cell.height));
    expect(far.length).toBeGreaterThan(0);
    for (const wall of far) {
      expect({ tile: tileKey(wall.tile), hidden: hidden.has(tileKey(wall.tile)) })
        .toEqual({ tile: tileKey(wall.tile), hidden: false });
    }
  });

  test('culls the near sides, not the building', () => {
    const inside = indoorFrame();
    const groups = wallRoofGroups(inside);
    const occupied = inside.walls.filter(
      (wall) => groups.get(tileKey(wall.tile)) === inside.hiddenRoofGroupId,
    ).length;
    // Two sides of a four-sided ring: under two thirds of the group's own walls, not of every
    // wall on the map.
    expect(hiddenWallTiles(inside).size).toBeLessThan((occupied * 2) / 3);
  });

  test('is idempotent across repeated frames', () => {
    const inside = indoorFrame();
    expect([...hiddenWallTiles(inside)]).toEqual([...hiddenWallTiles(inside)]);
  });
});
