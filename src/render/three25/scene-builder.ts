import { ATLAS_INDEX, atlasRectangle, type AtlasRectangle } from '../atlas';
import type { WorldFloorPlacement, WorldFrameState } from '../world-frame';
import { hiddenWallTiles, tileKey } from './occlusion';
import { mixHex } from '../atmosphere';
import { isStandingDecal, readableTint } from './billboards';
import {
  DECAL_RECIPES,
  PROP_CORES,
  PROP_FLAT_COLORS,
  WALL_HEIGHT_TILES,
  recipeFor,
} from './recipes';

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
  /**
   * Linear albedo multiplier, applied on top of `tint`. Above 1 brightens the SPRITE.
   *
   * `tint` cannot do this. It is a hex colour, so it parses to at most 1.0 per channel, and it
   * multiplies the atlas sample — `#ffffff` is the identity, not "bright". A sprite whose art is
   * too dark to read can only be lifted by a multiplier that is allowed to exceed 1.
   */
  gain?: number;
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
   * brick art at 95.9% opaque — better, but NOT solid, and the remaining 4% is what this cell
   * has to crop. See `wallSideSource`.
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
  /**
   * This box IS a light source, so it must not be lit by one.
   *
   * Every other flat-shaded box is lit, which is what stops furniture reading as plastic pasted
   * over a lit scene. A lamp head cannot be: the point light sits inside it, so every face normal
   * points away from the light and a lit lamp head renders black — the one thing in a dark room
   * that must glow. Glow boxes draw through the unlit material with their authored tint intact.
   */
  glow?: boolean;
  /** Linear albedo multiplier applied on top of `tint`. Above 1 brightens. See `QuadDescriptor`. */
  gain?: number;
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
 * How many texel columns to crop off each side of an `-f` cell before it becomes a side texture.
 *
 * The `-f` variant is NOT solid. Measured against `assets/generated/world-atlas.png`, all four
 * families — civic, commercial, downtown, villa — carry exactly 42 texels below the `alphaTest`
 * cutoff, and every one sits in columns 0-3 or 28-31: the rounded corners of the top-down stamp.
 * Columns 4-27 are alpha 255 on all 32 rows.
 *
 * That margin is why walls kept a notch at their base. `atlasCell` maps image row 31 to the BOTTOM
 * of a vertical face, so the 12 cut texels in rows 28-31 landed exactly on the wall/ground line,
 * once per tile. Cropping the columns removes them and leaves vertical sampling untouched — a
 * square crop would have thrown away 8 rows of brick and stretched the rest for nothing.
 */
const WALL_SIDE_INSET_TEXELS = 4;

/**
 * The opaque side texture for a wall sprite: the `-f` variant of its own family, cropped.
 *
 * `tile.wall-villa-5` becomes the middle 24 columns of `tile.wall-villa-f`. Same brick, same
 * palette, and now actually solid, so the vertical faces stop being cut to lace by `alphaTest`.
 *
 * A wall that IS already `-f` gets the cropped version of its own cell rather than `undefined`.
 * Returning `undefined` there is what left mask-15 walls holed: the bake falls back to `source`,
 * which is the uncropped cell. `undefined` now means only "this family has no `-f` at all", where
 * falling back to `source` is the safe answer instead of an invalid rect.
 */
export function wallSideSource(sprite: string): AtlasRectangle | undefined {
  const solid = `${sprite.replace(/-[0-9a-f]$/u, '')}-f`;
  if (!(solid in ATLAS_INDEX.sprites)) return undefined;
  const cell = atlasRectangle(solid);
  return {
    ...cell,
    x: cell.x + WALL_SIDE_INSET_TEXELS,
    width: cell.width - 2 * WALL_SIDE_INSET_TEXELS,
  };
}

/**
 * How wide and deep a box must be before its faces are worth texturing, in tiles.
 *
 * A sprite core stretched across a 0.07-tile lamp post is mud, not grain — that is the objection
 * that made every prop flat-shaded in the first place, and it is correct for small geometry. It is
 * not correct for a crate body or a stall counter, which are near a full tile across.
 */
const TEXTURED_BOX_MINIMUM_TILES = 0.45;

/** sRGB to linear, the same transfer three.js uses, so the gain cancels what the shader applies. */
function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * The albedo gain that cancels a sprite core's own brightness.
 *
 * The mapped material multiplies texture by vertex colour. Without this a crate whose core sits at
 * luminance 97 would render at a third of its intended paint, because the paint and the sprite
 * would multiply into each other. Dividing the core's linear luminance back out makes the tint mean
 * exactly what it says while the sprite's variation around that mean survives as grain.
 */
function coreGain(luminance: number): number {
  return 1 / Math.max(0.02, toLinear(luminance / 255));
}

/**
 * Whether this box should be drawn with its sprite's opaque core rather than one flat colour.
 *
 * Authored tints are excluded on purpose. A sofa cushion, a crate lid rim and a lamp head are
 * colours somebody chose, and multiplying a sprite into them would be a different colour than the
 * one authored. Only boxes taking the sprite's own measured paint can carry the sprite's own grain.
 */
function texturedCore(
  sprite: string,
  box: Readonly<{ width: number; depth: number; tint?: string; glow?: boolean }>,
): Readonly<{ x: number; y: number; width: number; height: number; luminance: number }> | undefined {
  if (box.glow === true || box.tint !== undefined) return undefined;
  if (box.width < TEXTURED_BOX_MINIMUM_TILES || box.depth < TEXTURED_BOX_MINIMUM_TILES) return undefined;
  return PROP_CORES[sprite];
}

/**
 * A small, repeatable brightness shift per prop, so identical neighbours stop reading as one lump.
 *
 * Four cargo crates from the same sprite carry the same measured colour, so a stack of them renders
 * as one moulded mass with seams rather than as four crates. Real stacked goods vary. Shifting each
 * prop a few percent from a hash of its own id costs nothing, is stable across frames — so nothing
 * shimmers as the camera pans — and is stable across runs, so a capture stays comparable.
 *
 * Deliberately small. Enough to separate neighbours, not enough to read as a different material.
 */
function propVariation(id: string): number {
  let hash = 0x81_1c_9d_c5;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 0x01_00_01_93);
  }
  // >>> 0 first: the multiply leaves a signed 32-bit value, and a negative would bias the result.
  return 1 + (((hash >>> 0) % 1000) / 1000 - 0.5) * 0.16;
}

function scaleHex(hex: string, factor: number): string {
  const channel = (at: number): string => {
    const value = Math.round(Math.min(255, Number.parseInt(hex.slice(at, at + 2), 16) * factor));
    return value.toString(16).padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}${hex.length > 7 ? hex.slice(7) : ''}`;
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
  strength = 1,
): string {
  if (frame.shelterCells.length === 0 || insideShelter(tile, frame)) return tint;
  const night = 1 - frame.lighting.sun.elevation;
  return mixHex(tint.slice(0, 7), VOID_TINT, strength * (0.35 + 0.6 * night))
    + (tint.length > 7 ? tint.slice(7) : '');
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

/**
 * Measured mean luminance of the opaque texels of every ground sprite the four maps place.
 *
 * Taken from `assets/generated/world-atlas.png`. Only sprites under the readable target are listed;
 * everything above it needs no help. Re-measure if the atlas is regenerated.
 */
const FLOOR_LUMINANCE: Readonly<Record<string, number>> = Object.freeze({
  'tile.dark-asphalt': 41.7,
  'tile.neon-floor': 47.7,
  'tile.dock-floor': 57.2,
  'tile.city-lot': 59.5,
  'tile.sunset-floor': 62.3,
  'tile.villa-floor': 67.1,
  'tile.boardwalk': 75.8,
});

/** What a ground sprite should read at. Chosen so a dark street stays a dark street. */
const FLOOR_TARGET_LUMINANCE = 80;

/**
 * Only art DARKER than this is lifted at all.
 *
 * The gain exists for ground too dark to read — asphalt at 41.7, neon floor at 47.7. Applying it to
 * a merely middling floor lifts a scene that had no problem: the bazaar's `tile.sunset-floor` at
 * 62.3 was being pushed to 80, then lamps, additive pools and the night key stacked on top, and the
 * courtyard measured mean luminance 94 at midnight — brighter than the villa at noon, with no
 * pocket anywhere in it. The whole look is a dark world with bright objects; the floor is the world.
 */
const FLOOR_LIFT_CEILING = 52;

/** Never more than double. Past that the lift stops reading as light and starts reading as paint. */
const MAX_FLOOR_GAIN = 2;

/**
 * Ground that should STAY dark, whatever it measures.
 *
 * Water at night is meant to be a black surface with highlights on it. Lifting it to the same
 * readable target as a paving stone turns a harbour into a wet car park.
 */
const NEVER_LIFTED: ReadonlySet<string> = new Set(['tile.harbor-water']);

/**
 * Albedo gain for ground whose art is too dark to read under night lighting.
 *
 * This is the one lever that can brighten a dark SPRITE. A tint cannot: it is a hex colour, so it
 * parses to at most 1.0 per channel and multiplies the atlas sample, which makes `#ffffff` the
 * identity rather than "bright". Forcing every floor tint to white changed a capture by zero pixels
 * and that is why.
 *
 * Derived from the measured table rather than hand-picked per sprite, so adding a map or an atlas
 * rebuild needs one number changed rather than a judgement call. `tile.dark-asphalt` and
 * `tile.neon-floor` between them pave 2,068 tiles of the downtown map, which is why a third of that
 * district's night frame sat within a few levels of the void clear colour.
 */
function floorGain(sprite: string): number | undefined {
  // Key on the sprite actually DRAWN. `FLOOR_SOURCE_OVERRIDES` swaps the villa's floor for the
  // boardwalk, so keying the authored id lifted 67.1's worth of art that renders at 75.8.
  const drawn = FLOOR_SOURCE_OVERRIDES[sprite] ?? sprite;
  if (NEVER_LIFTED.has(drawn)) return undefined;
  const luminance = FLOOR_LUMINANCE[drawn];
  if (luminance === undefined || luminance >= FLOOR_LIFT_CEILING) return undefined;
  // In LINEAR, because the shader applies the gain after the sRGB decode. An 0-255 sRGB ratio
  // applied to linear values is a different, smaller number than the one it looks like: prop cores
  // already convert, and floors were the one place still comparing the two spaces directly.
  return Math.min(MAX_FLOOR_GAIN, toLinear(FLOOR_TARGET_LUMINANCE / 255) / toLinear(luminance / 255));
}

function floorSource(placement: WorldFloorPlacement): AtlasRectangle {
  const override = FLOOR_SOURCE_OVERRIDES[placement.sprite];
  return override === undefined ? placement.source : atlasRectangle(override);
}

/**
 * How far from a light a floor tile keeps its full brightness, and where it reaches full crush.
 *
 * Indoors, `shelteredTint` supplies the dark surround: everything outside the room falls toward the
 * void and the room reads as a lit stage. Outdoors there is no room, so `shelterCells` is empty,
 * `shelteredTint` no-ops, and the whole map renders at one even brightness. The bazaar measured
 * mean luminance 88 at midnight — brighter than the villa at noon — and its lamp pools were
 * invisible against the flood, which fails the premise the entire look is built on: a dark world
 * with bright objects and one warm pocket.
 *
 * This is the outdoor analogue. Ground far from every light falls toward the void, ground near one
 * keeps its paint. The falloff is measured in tiles from the nearest emitter, so the shape follows
 * where the lamps actually are rather than a vignette on the screen.
 */
/**
 * The sprites that actually put light on the floor.
 *
 * Mirrors `LAMP_SPRITE_IDS_25D` UNION `CEILING_SPRITE_IDS_25D` in `lighting.ts`, which together
 * drive the point lights and the pools. It is duplicated rather than imported because `lighting.ts`
 * imports this module's types, and a value import back would close the cycle; a test pins the lamp
 * half of this list to the frozen 2D set and the whole of it to the union.
 *
 * The ceiling troffer is here so that if this sprite is ever placed outdoors — under a canopy, on a
 * covered platform — it carves the same outdoor crush every other light source does. Indoors the
 * crush already no-ops, so including it costs the office nothing.
 */
export const GROUND_LIGHTING_SPRITES: ReadonlySet<string> = new Set([
  'tile.fixture-lamp',
  'tile.fixture-dock-lamp-amber',
  'tile.fixture-dock-lamp-cold',
  'tile.fixture-festival-lantern',
  'tile.fixture-neon-lamp-cyan',
  'tile.fixture-neon-lamp-magenta',
  'tile.fixture-ceiling-panel',
]);

const LIGHT_FALLOFF_INNER_TILES = 3.2;
const LIGHT_FALLOFF_OUTER_TILES = 15;

/**
 * How dark the far ground gets at midnight. Capped well short of 1: unlit is not invisible.
 *
 * Tuned down from 0.55 over a 9-tile span, which shaped the scene correctly and overshot — the
 * harbour's far yard turned into a black plate, adding 12 points of flat-dead blocks. A wider,
 * shallower falloff keeps the shaping and leaves texture in the dark.
 */
const OUTDOOR_NIGHT_CRUSH = 0.46;

/**
 * Distance in tiles from a tile to the nearest thing that emits light, or Infinity if nothing does.
 *
 * Lamps only — see `GROUND_LIGHTING_SPRITES`. A sign glows without lighting the ground, and
 * counting one here made the crush disagree with the lighting about what a light is. Squared
 * distance while searching, so the loop does no square roots it does not need.
 */
function tilesToNearestLight(
  tile: Readonly<{ x: number; y: number }>,
  lights: readonly Readonly<{ x: number; y: number }>[],
): number {
  let best = Number.POSITIVE_INFINITY;
  for (const light of lights) {
    const dx = light.x - tile.x;
    const dy = light.y - tile.y;
    const squared = dx * dx + dy * dy;
    if (squared < best) best = squared;
  }
  return Math.sqrt(best);
}

/**
 * The outdoor night crush for one ground tile.
 *
 * Returns the tint unchanged indoors — `shelteredTint` owns that case and applying both would crush
 * the same tile twice — and unchanged by day, when there is no dark world to carve.
 */
function litGroundTint(
  tint: string,
  tile: Readonly<{ x: number; y: number }>,
  frame: WorldFrameState,
  lights: readonly Readonly<{ x: number; y: number }>[],
): string {
  if (frame.shelterCells.length > 0 || lights.length === 0) return tint;
  const night = frame.lighting.sun.lampMix;
  if (night <= 0.01) return tint;
  const distance = tilesToNearestLight(tile, lights);
  const span = LIGHT_FALLOFF_OUTER_TILES - LIGHT_FALLOFF_INNER_TILES;
  const away = Math.min(1, Math.max(0, (distance - LIGHT_FALLOFF_INNER_TILES) / span));
  return mixHex(tint.slice(0, 7), VOID_TINT, away * OUTDOOR_NIGHT_CRUSH * night)
    + (tint.length > 7 ? tint.slice(7) : '');
}

/**
 * Tiles of every prop that lights the GROUND.
 *
 * Lamps only — not every prop with a glow box. A neon sign glows, but it has no point light and no
 * floor pool: it lights itself, by design. Counting signs here made the crush model and the light
 * model disagree about what a light is, and ground next to a sign kept its full paint while
 * receiving none of its light.
 *
 * That inconsistency is what floods the bazaar. Its market signs and lamps together put almost
 * every courtyard tile inside the inner radius, so the crush never engaged and the district
 * measured mean luminance 94 at midnight — brighter than the villa at noon, with no pocket in it.
 */
function emitterTiles(frame: WorldFrameState): readonly Readonly<{ x: number; y: number }>[] {
  return frame.props
    .filter((prop) => GROUND_LIGHTING_SPRITES.has(prop.sprite))
    .map((prop) => ({ x: prop.tile.x + 0.5, y: prop.tile.y + 0.5 }));
}

function floorQuad(
  placement: WorldFloorPlacement,
  frame: WorldFrameState,
  lights: readonly Readonly<{ x: number; y: number }>[],
): QuadDescriptor {
  return {
    id: placement.id,
    sprite: placement.sprite,
    source: floorSource(placement),
    x: placement.tile.x + 0.5,
    z: placement.tile.y + 0.5,
    width: 1,
    depth: 1,
    tint: litGroundTint(
      shelteredTint(placement.color, placement.tile, frame),
      placement.tile,
      frame,
      lights,
    ),
    gain: floorGain(placement.sprite),
    opacity: placement.opacity,
  };
}

export function buildFloorQuads(frame: WorldFrameState): readonly QuadDescriptor[] {
  const lights = emitterTiles(frame);
  // Vegetation details are drawn STANDING by `buildBillboards`, and the ones in `DECAL_RECIPES`
  // are drawn as BOXES by `buildDecalBoxes`. Leaving either here as well would draw them twice:
  // a tree upright and again as its own shadow on the grass, a pebble as a stone and a stain.
  return [...frame.floors, ...frame.groundDetails.filter(
    (detail) => !isStandingDecal(detail.sprite) && DECAL_RECIPES[detail.sprite] === undefined,
  )]
    .map((placement) => floorQuad(placement, frame, lights));
}

/**
 * Low boxes for the ground decals that are objects rather than marks — see `DECAL_RECIPES`.
 *
 * Mirrors `buildPropBoxes` minus the parts a decal cannot use. There is no `consumes` pass because
 * a decal never spans tiles, and no `texturedCore` pass because every box here is far smaller than
 * the window that lookup needs; both would be dead code the reader has to rule out.
 *
 * `shelteredTint` at the FLOOR strength, not the prop strength. A pebble is ground, so it must
 * fall away with the ground it sits on when the player is inside a room; at the prop's half
 * strength the stones on the lawn stayed bright while the lawn went dark under them.
 */
export function buildDecalBoxes(frame: WorldFrameState): readonly BoxDescriptor[] {
  const boxes: BoxDescriptor[] = [];
  for (const detail of frame.groundDetails) {
    const recipe = DECAL_RECIPES[detail.sprite];
    if (recipe === undefined) continue;
    recipe.boxes.forEach((box, index) => {
      boxes.push({
        id: `${detail.id}#${index}`,
        sprite: detail.sprite,
        source: detail.source,
        flatShade: true,
        x: detail.tile.x + 0.5 + box.x,
        y: box.y,
        z: detail.tile.y + 0.5 + box.z,
        width: box.width,
        height: box.height,
        depth: box.depth,
        tint: shelteredTint(
          scaleHex(readableTint(box.tint ?? detail.color), propVariation(detail.id)),
          detail.tile,
          frame,
        ),
      });
    });
  }
  return boxes;
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
      const core = texturedCore(prop.sprite, box);
      // Spread the real rect so the atlas metadata rides along; only the window moves.
      const coreRectangle = core === undefined ? undefined : {
        ...prop.source,
        x: prop.source.x + core.x,
        y: prop.source.y + core.y,
        width: core.width,
        height: core.height,
      };
      boxes.push({
        id: `${prop.id}#${index}`,
        sprite: prop.sprite,
        source: coreRectangle ?? prop.source,
        // A recipe's own gain wins: it is the author saying this box reads too dark, which a
        // measured core luminance cannot know.
        gain: box.gain ?? (core === undefined ? undefined : coreGain(core.luminance)),
        // Furniture reads as flat-shaded volumes UNLESS the box is big enough to carry the
        // sprite's own grain, in which case the opaque core is mapped across it instead.
        flatShade: core === undefined,
        x: prop.tile.x + 0.5 + box.x,
        y: box.y,
        z: prop.tile.y + 0.5 + box.z,
        width: box.width,
        height: box.height,
        depth: box.depth,
        glow: box.glow,
        // An authored per-box tint wins, so a sofa's arms can differ from its seat. Otherwise the
        // sprite's measured dominant colour - never the frame colour, which is plain white here.
        //
        // The tint is the box's PAINT, not its lit appearance. Non-glow boxes draw through a lit
        // material, so the scene's own sun, sky and lamps decide how dark that paint reads; mixing
        // the day cycle in here as well darkened them twice and was what made furniture read as
        // plastic pasted over a lit scene. Glow boxes are unlit, so their tint IS the pixel.
        // Half strength for props. The full crush is what makes the ground and the buildings
        // outside the room fall away into the void, and that read is worth keeping. Applied to a
        // prop it deleted the object instead of pushing it back: at night the factor reaches 0.95,
        // so every lamp post on the terrace became a floating head over a black stick.
        tint: shelteredTint(
          // The glow boxes keep their authored tint exactly: a lamp head is a light source, and
          // varying its brightness per instance would read as lamps of differing wattage.
          box.glow === true
            ? (box.tint ?? readableTint(PROP_FLAT_COLORS[prop.sprite] ?? prop.color))
            : scaleHex(
              box.tint ?? readableTint(PROP_FLAT_COLORS[prop.sprite] ?? prop.color),
              propVariation(prop.id),
            ),
          prop.tile,
          frame,
          0.5,
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
      ...buildDecalBoxes(frame),
      ...buildDoorBoxes(frame),
      ...buildRoofBoxes(frame),
    ],
  };
}
