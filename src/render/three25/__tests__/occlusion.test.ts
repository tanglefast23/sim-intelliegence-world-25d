import { tileKey, wallRoofGroups } from '../occlusion';
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
