import type { AtlasRectangle } from '../atlas';
import type { WorldFloorPlacement, WorldFrameState } from '../world-frame';
import { WALL_HEIGHT_TILES } from './recipes';

/**
 * A flat one-tile lid on the ground plane.
 *
 * `x` and `z` are the mesh CENTRE in tile units, the same convention boxes use. The frame gives
 * tile corners, so the builder adds half a tile.
 */
export type QuadDescriptor = Readonly<{
  id: string;
  sprite: string;
  source: AtlasRectangle;
  x: number;
  z: number;
  width: number;
  depth: number;
  tint: string;
  opacity: number;
}>;

/** An extruded box. `x`/`z` are the centre in tile units; `y` is the centre height above the floor. */
export type BoxDescriptor = Readonly<{
  id: string;
  sprite: string;
  source: AtlasRectangle;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  tint: string;
}>;

export type SceneDescriptor = Readonly<{
  floors: readonly QuadDescriptor[];
  boxes: readonly BoxDescriptor[];
}>;

function floorQuad(placement: WorldFloorPlacement): QuadDescriptor {
  return {
    id: placement.id,
    sprite: placement.sprite,
    source: placement.source,
    x: placement.tile.x + 0.5,
    z: placement.tile.y + 0.5,
    width: 1,
    depth: 1,
    tint: placement.color,
    opacity: placement.opacity,
  };
}

export function buildFloorQuads(frame: WorldFrameState): readonly QuadDescriptor[] {
  return [...frame.floors, ...frame.groundDetails].map(floorQuad);
}

/**
 * One box per wall tile, standing on the floor at `WALL_HEIGHT_TILES`.
 *
 * The door filter is a regression guard, not a discovery: `compileWalls`
 * (src/world/maps/compiler.ts:154-157) already skips opening tiles, so door tiles never reach
 * `frame.walls` today. It costs one Set lookup and it stops a future frame change from putting
 * walls back into doorways.
 *
 * ponytail: per-tile boxes, O(walls) meshes. Merge runs by `adjacencyMask` if Task 20 shows a
 * draw-call problem — the mask is already on the placement when that time comes.
 */
export function buildWallBoxes(frame: WorldFrameState): readonly BoxDescriptor[] {
  const doorTiles = new Set(frame.doors.map((door) => `${door.tile.x},${door.tile.y}`));
  return frame.walls
    .filter((wall) => !doorTiles.has(`${wall.tile.x},${wall.tile.y}`))
    .map((wall) => ({
      id: wall.id,
      sprite: wall.sprite,
      source: wall.source,
      x: wall.tile.x + 0.5,
      y: WALL_HEIGHT_TILES / 2,
      z: wall.tile.y + 0.5,
      width: 1,
      height: WALL_HEIGHT_TILES,
      depth: 1,
      tint: wall.color,
    }));
}
