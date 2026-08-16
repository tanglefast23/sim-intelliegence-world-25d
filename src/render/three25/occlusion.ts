import type { TileRect } from '../../world/maps/schema';
import type { WorldFrameState } from '../world-frame';

/** The key format every occlusion map and set in this module uses. */
export function tileKey(tile: Readonly<{ x: number; y: number }>): string {
  return `${tile.x},${tile.y}`;
}

/**
 * Whether a tile is on or just outside the ring of a rectangle.
 *
 * Walls sit one tile outside the interior rectangle, so the test expands the rect by one on every
 * side rather than asking for containment.
 */
function bordersRect(tile: Readonly<{ x: number; y: number }>, rect: TileRect): boolean {
  return tile.x >= rect.x - 1 && tile.x <= rect.x + rect.width &&
    tile.y >= rect.y - 1 && tile.y <= rect.y + rect.height;
}

function rectContains(tile: Readonly<{ x: number; y: number }>, rect: TileRect): boolean {
  return tile.x >= rect.x && tile.x < rect.x + rect.width &&
    tile.y >= rect.y && tile.y < rect.y + rect.height;
}

/**
 * Maps each wall tile to the roof group it belongs to, keyed `"x,y"`.
 *
 * `WorldWallPlacement` carries only `tile` and `adjacencyMask`. Roof group ids ride on `roofs`, and
 * the occupied group's roofs are filtered out of the frame entirely — so membership has to be
 * derived from `shelterCells` and `roofedCells`, which the frame does carry.
 *
 * **The ids are derived, not read.** Neither `shelterCells` nor `roofedCells` carries a group id;
 * both are bare rectangles. The rules are:
 *
 * - A wall bordering a `shelterCells` rectangle takes `frame.hiddenRoofGroupId`. There is only ever
 *   one occupied group, and `shelterCells` describes exactly it.
 * - A wall bordering a `roofedCells` rectangle takes the id of the `frame.roofs` entry whose tile
 *   falls inside that rectangle.
 * - A wall bordering neither is unassigned and never culled.
 *
 * Deriving the occupied group from `shelterCells` rather than from `roofs` is what makes this work
 * indoors at all: the moment the player steps inside, their group's roofs vanish from the frame.
 */
export function wallRoofGroups(frame: WorldFrameState): ReadonlyMap<string, string> {
  const groups = new Map<string, string>();

  const roofedGroupFor = (rect: TileRect): string | undefined =>
    frame.roofs.find((roof) => rectContains(roof.tile, rect))?.roofGroupId;

  for (const wall of frame.walls) {
    if (frame.hiddenRoofGroupId !== undefined &&
      frame.shelterCells.some((cell) => bordersRect(wall.tile, cell))) {
      groups.set(tileKey(wall.tile), frame.hiddenRoofGroupId);
      continue;
    }
    for (const cell of frame.roofedCells) {
      if (!bordersRect(wall.tile, cell)) continue;
      const group = roofedGroupFor(cell);
      if (group !== undefined) {
        groups.set(tileKey(wall.tile), group);
        break;
      }
    }
  }

  return groups;
}

/**
 * The wall tiles between the camera and the interior the player is standing in.
 *
 * At yaw 0 the camera looks from the map-south, so the near wall of a room is its SOUTH PERIMETER:
 * the wall row one tile below the shelter rectangle, at `rect.y + rect.height`.
 *
 * **Not "the wall with the greatest tile.y in its column".** Those two rules agree only on a solid
 * ring. `compileWalls` removes opening tiles, so a column containing a door has no south wall at
 * all — and the per-column maximum then falls through to an interior partition further north. On
 * the villa that culled tile (17,14), a partition in the middle of the building, because the front
 * door sits at (17,24).
 *
 * Only the OCCUPIED group is culled. Walls of a building the player is not inside stay up: hiding
 * them would open a hole into a room that is still roofed.
 *
 * ponytail: culls the single perimeter row. A double-thick south wall would keep its inner course,
 * which no current map has. Widen the row test if one appears.
 */
export function hiddenWallTiles(frame: WorldFrameState): ReadonlySet<string> {
  const occupied = frame.hiddenRoofGroupId;
  if (occupied === undefined) return new Set();

  const groups = wallRoofGroups(frame);
  const hidden = new Set<string>();
  for (const wall of frame.walls) {
    if (groups.get(tileKey(wall.tile)) !== occupied) continue;
    const onSouthPerimeter = frame.shelterCells.some((cell) =>
      bordersRect(wall.tile, cell) && wall.tile.y === cell.y + cell.height);
    if (onSouthPerimeter) hidden.add(tileKey(wall.tile));
  }
  return hidden;
}
