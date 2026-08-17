import type { TileRect } from '../../world/maps/schema';
import type { WorldFrameState } from '../world-frame';
import { CAMERA_TOWARD_VIEWER } from './projection';

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

/** A perimeter side of a shelter rectangle, with the direction it faces away from the room. */
const SHELTER_SIDES = [
  { key: 'south', normal: { x: 0, y: 1 } },
  { key: 'north', normal: { x: 0, y: -1 } },
  { key: 'east', normal: { x: 1, y: 0 } },
  { key: 'west', normal: { x: -1, y: 0 } },
] as const;

/** Whether a wall tile lies on the named perimeter side of a shelter rectangle. */
function onSide(
  tile: Readonly<{ x: number; y: number }>,
  rect: TileRect,
  normal: Readonly<{ x: number; y: number }>,
): boolean {
  if (normal.y === 1) return tile.y === rect.y + rect.height;
  if (normal.y === -1) return tile.y === rect.y - 1;
  if (normal.x === 1) return tile.x === rect.x + rect.width;
  return tile.x === rect.x - 1;
}

/**
 * The wall tiles between the camera and the interior the player is standing in.
 *
 * A shelter side is "near" when its outward normal points toward the viewer — that is, when it has
 * a positive dot product with `CAMERA_TOWARD_VIEWER`. At yaw 0 that selects the south row alone.
 * At yaw 45 it selects the south row AND the east column, which is what an isometric view needs:
 * both of those sides stand between the camera and the room.
 *
 * **Derived from the yaw, never hardcoded.** The previous rule was "the southmost wall in each
 * column", which is wrong twice over: it assumes yaw 0, and even at yaw 0 it falls through to an
 * interior partition in a column whose south wall is a doorway — `compileWalls` removes opening
 * tiles, so that column has no perimeter wall to find. On the villa that culled tile (17,14), a
 * partition in the middle of the building.
 *
 * Only the OCCUPIED group is culled. Walls of a building the player is not inside stay up: hiding
 * them would open a hole into a room that is still roofed.
 *
 * ponytail: culls the perimeter row or column. A double-thick wall would keep its inner course,
 * which no current map has. Widen the side test if one appears.
 */
export function hiddenWallTiles(frame: WorldFrameState): ReadonlySet<string> {
  const occupied = frame.hiddenRoofGroupId;
  if (occupied === undefined) return new Set();

  const near = SHELTER_SIDES.filter(
    (side) => side.normal.x * CAMERA_TOWARD_VIEWER.x + side.normal.y * CAMERA_TOWARD_VIEWER.y > 1e-6,
  );

  const groups = wallRoofGroups(frame);
  const hidden = new Set<string>();
  for (const wall of frame.walls) {
    if (groups.get(tileKey(wall.tile)) !== occupied) continue;
    const isNear = frame.shelterCells.some((cell) =>
      bordersRect(wall.tile, cell) && near.some((side) => onSide(wall.tile, cell, side.normal)));
    if (isNear) hidden.add(tileKey(wall.tile));
  }
  return hidden;
}
