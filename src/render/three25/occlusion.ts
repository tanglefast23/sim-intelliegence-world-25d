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
