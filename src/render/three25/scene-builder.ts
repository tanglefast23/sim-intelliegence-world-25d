import { ATLAS_INDEX, atlasRectangle, type AtlasRectangle } from '../atlas';
import type { WorldFloorPlacement, WorldFrameState } from '../world-frame';
import { hiddenWallTiles, tileKey } from './occlusion';
import { mixHex } from '../atmosphere';
import { UNLIT_NIGHT_STRENGTH, readableTint, tintForLighting } from './billboards';
import { PROP_FLAT_COLORS, WALL_HEIGHT_TILES, recipeFor } from './recipes';

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
  /**
   * Atlas cell for the four VERTICAL faces, when they should not reuse `source`.
   *
   * Wall sprites are top-down stamps whose margins are transparent — `tile.wall-villa-5` is only
   * 81% opaque. Mapped onto a vertical face and cut by `alphaTest`, those margins punch holes
   * straight through the wall. The fully-connected `-f` variant of the same family is the same
   * brick art at 96% opaque, so it reads as a side rather than a sieve.
   */
  sideSource?: AtlasRectangle;
  /**
   * Draw every face as ONE flat colour, sampled from the middle of the cell.
   *
   * A recipe box is a piece of furniture, not a tile: wallpapering a whole top-down sprite onto a
   * 0.16-tile sofa arm squashes an outline into mud. Collapsing the UV to a single texel under
   * `NearestFilter` gives the flat-shaded look the spike has, with no new art.
   */
  flatShade?: boolean;
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

/**
 * The opaque side texture for a wall sprite: the fully-connected `-f` variant of its own family.
 *
 * `tile.wall-villa-5` becomes `tile.wall-villa-f`. Same brick, same palette, 96% opaque instead of
 * 81%, so the vertical faces stop being cut to lace by `alphaTest`. Falls back to the sprite itself
 * if the family has no `-f` variant, which no current family does.
 */
function wallSideSource(sprite: string): AtlasRectangle | undefined {
  const solid = `${sprite.replace(/-[0-9a-f]$/u, '')}-f`;
  if (solid === sprite || !(solid in ATLAS_INDEX.sprites)) return undefined;
  return atlasRectangle(solid);
}

/**
 * How dark everything OUTSIDE the room the player occupies gets.
 *
 * This is what makes an open map read as an enclosed stage without inventing a single wall. The
 * capture already IS the villa interior — the protagonist spawns inside `shelterCells` — but the
 * grass and paving beyond the east wall render at the same brightness as the sofa, so the eye
 * reads one continuous terrace instead of a room.
 *
 * Crushing the outside toward the void colour at night, and only lightly by day, gives the
 * reference's dark-surround-and-warm-pocket read. Zero new draw calls: it rides the tint that is
 * already on every descriptor, and `sceneSignature` already hashes tint so rebakes still trigger.
 */
const VOID_TINT = '#07070b';

function insideShelter(
  tile: Readonly<{ x: number; y: number }>,
  frame: WorldFrameState,
): boolean {
  // The wall ring counts as inside, or the room's own walls would be crushed with the outdoors.
  return frame.shelterCells.some((cell) =>
    tile.x >= cell.x - 1 && tile.x <= cell.x + cell.width &&
    tile.y >= cell.y - 1 && tile.y <= cell.y + cell.height);
}

/**
 * The tint a placement should carry once the outside-the-room crush is applied.
 *
 * A frame with no `shelterCells` is an outdoor scene, so nothing is crushed and the tint passes
 * through untouched.
 */
export function shelteredTint(
  tint: string,
  tile: Readonly<{ x: number; y: number }>,
  frame: WorldFrameState,
): string {
  if (frame.shelterCells.length === 0 || insideShelter(tile, frame)) return tint;
  const night = 1 - frame.lighting.sun.elevation;
  return mixHex(tint.slice(0, 7), VOID_TINT, 0.35 + 0.6 * night) + (tint.length > 7 ? tint.slice(7) : '');
}

/**
 * Floor sprites the 2.5D path reinterprets.
 *
 * `tile.villa-floor` is a grey-brown square tile, authored to read from directly overhead. Under a
 * corner camera the reference material is warm planks with dark seams, and `tile.boardwalk` is
 * already exactly that in the atlas — so the villa floor borrows it rather than anyone drawing new
 * art. Same "reinterpret the sprite for 2.5D" move the recipe table makes wholesale.
 *
 * Render-side only: `world-frame.ts` and the 2D renderer never see it.
 */
const FLOOR_SOURCE_OVERRIDES: Readonly<Record<string, string>> = {
  'tile.villa-floor': 'tile.boardwalk',
};

function floorSource(placement: WorldFloorPlacement): AtlasRectangle {
  const override = FLOOR_SOURCE_OVERRIDES[placement.sprite];
  return override === undefined ? placement.source : atlasRectangle(override);
}

function floorQuad(placement: WorldFloorPlacement, frame: WorldFrameState): QuadDescriptor {
  return {
    id: placement.id,
    sprite: placement.sprite,
    source: floorSource(placement),
    x: placement.tile.x + 0.5,
    z: placement.tile.y + 0.5,
    width: 1,
    depth: 1,
    tint: shelteredTint(placement.color, placement.tile, frame),
    opacity: placement.opacity,
  };
}

export function buildFloorQuads(frame: WorldFrameState): readonly QuadDescriptor[] {
  return [...frame.floors, ...frame.groundDetails].map((placement) => floorQuad(placement, frame));
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
      sideSource: wallSideSource(wall.sprite),
      x: wall.tile.x + 0.5,
      y: WALL_HEIGHT_TILES / 2,
      z: wall.tile.y + 0.5,
      width: 1,
      height: WALL_HEIGHT_TILES,
      depth: 1,
      tint: shelteredTint(wall.color, wall.tile, frame),
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
        // Furniture reads as flat-shaded volumes, not as a sprite squashed onto every face.
        flatShade: true,
        x: prop.tile.x + 0.5 + box.x,
        y: box.y,
        z: prop.tile.y + 0.5 + box.z,
        width: box.width,
        height: box.height,
        depth: box.depth,
        // An authored per-box tint wins, so a sofa's arms can differ from its seat. Otherwise the
        // sprite's measured dominant colour - never the frame colour, which is plain white here.
        // Unlit material, so day and night have to reach the colour here. Same curve the
        // billboards use, so furniture and characters darken together.
        // An authored box tint is a light source or a deliberate accent, so it does NOT darken -
        // a lamp that dims at night is not a lamp. Only the sprite's own paint follows the sun.
        tint: shelteredTint(
          box.tint ?? tintForLighting(
            readableTint(PROP_FLAT_COLORS[prop.sprite] ?? prop.color),
            frame.lighting,
            UNLIT_NIGHT_STRENGTH,
          ),
          prop.tile,
          frame,
        ),
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
  // Door sprites are 80% opaque, the same trap walls had. A door stands in a wall GAP, so the
  // transparent margins show straight through the building rather than onto a wall behind it.
  // The neighbouring wall names the family, and its solid variant fills the margins.
  const wallByTile = new Map(frame.walls.map((wall) => [tileKey(wall.tile), wall.sprite]));
  const neighbourWallSide = (tile: Readonly<{ x: number; y: number }>): AtlasRectangle | undefined => {
    for (const step of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
      const sprite = wallByTile.get(tileKey({ x: tile.x + step.x, y: tile.y + step.y }));
      if (sprite === undefined) continue;
      const side = wallSideSource(sprite);
      if (side !== undefined) return side;
      if (sprite in ATLAS_INDEX.sprites) return atlasRectangle(sprite);
    }
    return undefined;
  };

  return frame.doors.map((door) => {
    const height = WALL_HEIGHT_TILES * (doorIsPassable(door.sprite) ? 0.25 : 0.7);
    const footprint = doorFootprint(door.sprite);
    return {
      id: door.id,
      sprite: door.sprite,
      source: door.source,
      sideSource: neighbourWallSide(door.tile),
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
    tint: shelteredTint(roof.color, roof.tile, frame),
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
