import type { AtlasRectangle } from '../atlas';
import type { WorldFloorPlacement, WorldFrameState } from '../world-frame';
import { hiddenWallTiles, tileKey } from './occlusion';
import { WALL_HEIGHT_TILES, recipeFor } from './recipes';

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
 * The near walls of the occupied roof group are culled, so the player can see into the room they
 * are standing in instead of looking at the back of its south wall.
 *
 * ponytail: per-tile boxes, O(walls) meshes. Merge runs by `adjacencyMask` if Task 20 shows a
 * draw-call problem — the mask is already on the placement when that time comes.
 */
export function buildWallBoxes(frame: WorldFrameState): readonly BoxDescriptor[] {
  const doorTiles = new Set(frame.doors.map((door) => `${door.tile.x},${door.tile.y}`));
  const hidden = hiddenWallTiles(frame);
  return frame.walls
    .filter((wall) => !doorTiles.has(`${wall.tile.x},${wall.tile.y}`) && !hidden.has(tileKey(wall.tile)))
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

/**
 * One box per recipe box, offset to the prop's tile.
 *
 * A prop whose sprite is consumed by a sibling recipe draws nothing — the owner already drew the
 * whole group. A prop with no recipe at all draws nothing either: `recipes.ts` proves every
 * landmark sprite is a recipe, a consumed sibling, or a deliberate flat decal, so a miss here is a
 * sprite that is meant to stay on the floor, never a guess.
 */
export function buildPropBoxes(frame: WorldFrameState): readonly BoxDescriptor[] {
  const consumed = new Set<string>();
  for (const prop of frame.props) {
    for (const sibling of recipeFor(prop.sprite)?.consumes ?? []) consumed.add(sibling);
  }
  const boxes: BoxDescriptor[] = [];
  for (const prop of frame.props) {
    if (consumed.has(prop.sprite)) continue;
    const recipe = recipeFor(prop.sprite);
    if (recipe === undefined) continue;
    recipe.boxes.forEach((box, index) => {
      boxes.push({
        id: `${prop.id}#${index}`,
        sprite: prop.sprite,
        source: prop.source,
        x: prop.tile.x + 0.5 + box.x,
        y: box.y,
        z: prop.tile.y + 0.5 + box.z,
        width: box.width,
        height: box.height,
        depth: box.depth,
        tint: box.tint ?? prop.color,
      });
    });
  }
  return boxes;
}

/** How thick a door slab is across the wall it sits in, in tiles. */
const DOOR_THICKNESS_TILES = 0.36;

/**
 * A door slab must lie IN its wall, so it spans the wall's axis and stays thin across it.
 *
 * The frame resolves that axis into the sprite id — `tile.closed-door-vertical` for a door in a
 * north-south wall, `-horizontal` for an east-west one — even though the content authors the
 * unsuffixed `tile.closed-door`. Without this, every door on one of the two axes is a slab turned
 * broadside to its doorway, leaving the gap open on one side and a wall stub sticking out the
 * other.
 *
 * An id with no suffix falls back to the east-west slab; the frame always resolves one today.
 */
function doorFootprint(sprite: string): Readonly<{ width: number; depth: number }> {
  return sprite.endsWith('-vertical')
    ? { width: DOOR_THICKNESS_TILES, depth: 1 }
    : { width: 1, depth: DOOR_THICKNESS_TILES };
}

/**
 * Whether the doorway is clear enough to read as passable.
 *
 * Matched on the leading state token, not `includes('open')`: `tile.opening-door` contains the
 * letters "open" while being a different state, and a substring test silently couples this to
 * spelling. The four authored states are `closed-`, `closed-locked-`, `open-` and `opening-`;
 * the last two both leave the gap clear.
 */
function doorIsPassable(sprite: string): boolean {
  return sprite.startsWith('tile.open-') || sprite.startsWith('tile.opening-');
}

/**
 * Doors are a separate frame list from props (`world-frame.ts`), so nothing else draws them.
 * Without this, every villa doorway is an open hole in the wall.
 *
 * A door is a low box filling the wall gap: one tile along its wall, thin across it, and roughly
 * two-thirds wall height. A passable door draws much shorter so the gap reads as walkable.
 */
export function buildDoorBoxes(frame: WorldFrameState): readonly BoxDescriptor[] {
  return frame.doors.map((door) => {
    const height = WALL_HEIGHT_TILES * (doorIsPassable(door.sprite) ? 0.25 : 0.7);
    const footprint = doorFootprint(door.sprite);
    return {
      id: door.id,
      sprite: door.sprite,
      source: door.source,
      x: door.tile.x + 0.5,
      y: height / 2,
      z: door.tile.y + 0.5,
      width: footprint.width,
      height,
      depth: footprint.depth,
      tint: door.color,
    };
  });
}

/**
 * A roof group draws as one flat lid just above wall height, so a roof reads as capping its walls.
 * The frame already removes the occupied group's roofs, so anything still in `frame.roofs` should
 * be drawn.
 */
export function buildRoofBoxes(frame: WorldFrameState): readonly BoxDescriptor[] {
  return frame.roofs.map((roof) => ({
    id: roof.id,
    sprite: roof.sprite,
    source: roof.source,
    x: roof.tile.x + 0.5,
    y: WALL_HEIGHT_TILES + 0.06,
    z: roof.tile.y + 0.5,
    width: 1,
    height: 0.12,
    depth: 1,
    tint: roof.color,
  }));
}

export function buildScene(frame: WorldFrameState): SceneDescriptor {
  return {
    floors: buildFloorQuads(frame),
    boxes: [
      ...buildWallBoxes(frame),
      ...buildPropBoxes(frame),
      ...buildDoorBoxes(frame),
      ...buildRoofBoxes(frame),
    ],
  };
}
