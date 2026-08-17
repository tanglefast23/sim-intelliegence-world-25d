/**
 * One box, in tiles. A 1x1x1 box fills one tile footprint and stands one tile tall.
 *
 * `x`, `y` and `z` are the box CENTRE, not a corner: `x`/`z` are offsets from the centre of the
 * tile the recipe is placed on, and `y` is the centre height above the floor. A box that sits on
 * the floor therefore has `y = height / 2`.
 */
export type BoxRecipe = Readonly<{
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  tint?: string;
  /** Draw unlit, keeping `tint` exactly. Only for boxes that ARE the light — see `BoxDescriptor`. */
  glow?: boolean;
}>;

export type PropRecipe = Readonly<{
  boxes: readonly BoxRecipe[];
  /** Sibling sprite ids this recipe already draws, so the builder skips them. */
  consumes?: readonly string[];
}>;

/** Matches the spike wall box height. See spikes/001-threejs-pixel-villa/scene.js:109. */
export const WALL_HEIGHT_TILES = 1.45;

/** Bench and table timber. The reference's low furniture is pale wood, not the atlas's muddy red. */
const PALE_WOOD = '#c9a06a';
const PALE_WOOD_SHADE = '#a37c4e';

/** Planter pot and foliage. Two materials on one sprite, so one measured colour cannot serve both. */
const TERRACOTTA = '#b5673a';
const FOLIAGE_GREEN = '#5f9e52';
const FOLIAGE_FLOWERING = '#6fae5c';

/** The lid rim on a crate. Brighter than the body so the cap reads as a separate piece of timber. */
const CRATE_RIM = '#d8c49a';

/** Warm lamp glow. Bright enough to read as a light source in a dark room. */
const LAMP_GLOW = '#ffd9a0';
/** The cold and neon fixtures glow their own colour rather than warm amber. */
const LAMP_GLOW_COLD = '#bfe4ff';
const LAMP_GLOW_CYAN = '#8ff2ea';
const LAMP_GLOW_MAGENTA = '#ff9de0';

/** Sign panels that are lit tubing rather than painted board. */
const NEON_SIGN_GLOW = '#d98cff';
const MARKET_SIGN_GLOW = '#ffc46b';

/**
 * A lamp, lantern or bollard-style post: footing, stem, head. `headWidth` is what separates a
 * slim neon post from a wide dock lamp.
 */
const post = (height: number, headWidth: number, glow = LAMP_GLOW): readonly BoxRecipe[] => [
  { x: 0, y: 0.05, z: 0, width: 0.26, height: 0.1, depth: 0.26 },
  { x: 0, y: height / 2, z: 0, width: 0.07, height, depth: 0.07 },
  // The head carries its own bright tint AND opts out of lighting. The point light sits inside
  // this box, so every face normal points away from it: lit, the one thing in the room that should
  // glow renders black. Unlit, the authored tint reaches the pixels unchanged.
  { x: 0, y: height + 0.12, z: 0, width: headWidth, height: 0.24, depth: headWidth, tint: glow, glow: true },
];

/** A standing sign: one thin post carrying a flat panel that faces the camera at yaw 0. */
const sign = (panelHeight: number): readonly BoxRecipe[] => [
  { x: 0, y: 0.35, z: 0, width: 0.09, height: 0.7, depth: 0.09 },
  { x: 0, y: 0.7 + panelHeight / 2, z: 0, width: 0.8, height: panelHeight, depth: 0.12 },
];

/**
 * A sign whose panel is a light source rather than a painted board.
 *
 * A neon sign that does not emit is just a purple plank. Downtown places fourteen of them, which is
 * more emitting surface than all its lamp posts put together, and the district's whole problem was
 * that the only coloured light on the street came from a handful of short-range posts.
 *
 * The panel is `glow`, so it draws unlit at its authored colour. It does NOT join
 * `LAMP_SPRITE_IDS_25D`: that set drives the point lights and the additive floor pools, and adding
 * fourteen more point lights would recompile every lit material and break the 2D-parity test that
 * pins the lamp set. This lights the sign, not the street.
 */
const neonSign = (panelHeight: number, glow: string): readonly BoxRecipe[] => [
  { x: 0, y: 0.35, z: 0, width: 0.09, height: 0.7, depth: 0.09 },
  { x: 0, y: 0.7 + panelHeight / 2, z: 0, width: 0.8, height: panelHeight, depth: 0.12, tint: glow, glow: true },
];

/** Seat slab plus a back rail along the north edge. */
const bench = (width: number): readonly BoxRecipe[] => [
  { x: 0, y: 0.18, z: 0, width, height: 0.12, depth: 0.5, tint: PALE_WOOD },
  { x: 0, y: 0.42, z: -0.2, width, height: 0.36, depth: 0.1, tint: PALE_WOOD_SHADE },
];

/** Pot plus the mass growing out of it. */
const planter = (foliageWidth: number, foliage = FOLIAGE_GREEN): readonly BoxRecipe[] => [
  // The pot and the foliage are two materials, so they carry two tints. The sprite's single
  // measured paint is a dark green that turned the whole planter into one black lump.
  { x: 0, y: 0.16, z: 0, width: 0.55, height: 0.32, depth: 0.55, tint: TERRACOTTA },
  { x: 0, y: 0.55, z: 0, width: foliageWidth, height: 0.5, depth: foliageWidth, tint: foliage },
];

// --- One-tile shapes for the run-forming groups ------------------------------------------
//
// These sprites appear in ragged runs, so each tile carries its own box and adjacent tiles read
// as one longer object. Boxes are slightly under a full tile so neighbours meet at a seam rather
// than z-fighting on a shared face.

/** Top slab plus one leg. Two adjacent tiles give a two-tile table on two legs. */
const tableTile = (): readonly BoxRecipe[] => [
  { x: 0, y: 0.46, z: 0, width: 0.98, height: 0.09, depth: 0.7, tint: PALE_WOOD },
  { x: 0, y: 0.23, z: 0, width: 0.09, height: 0.46, depth: 0.6, tint: PALE_WOOD_SHADE },
];

/** Hull slab plus superstructure. Four in a row give the harbour ferry. */
const ferryTile = (): readonly BoxRecipe[] => [
  { x: 0, y: 0.3, z: 0, width: 0.98, height: 0.6, depth: 0.95 },
  { x: 0, y: 0.78, z: 0, width: 0.7, height: 0.36, depth: 0.7 },
];

/**
 * A crate with a smaller one on top, each capped by a lid rim.
 *
 * The rim is a slightly wider, slightly brighter slab across the top face. Without it a crate is
 * one solid colour from base to top and reads as a moulded block; the rim is the single cheapest
 * thing that says "this is a box with a lid on it", and it survives at three screen pixels tall
 * where any painted detail would not. `capWidth` varies the silhouette along a run.
 */
const crateTile = (capWidth: number): readonly BoxRecipe[] => [
  { x: 0, y: 0.33, z: 0, width: 0.94, height: 0.66, depth: 0.9 },
  { x: 0, y: 0.69, z: 0, width: 0.99, height: 0.06, depth: 0.95, tint: CRATE_RIM },
  { x: 0, y: 0.95, z: 0, width: capWidth, height: 0.46, depth: capWidth },
  { x: 0, y: 1.2, z: 0, width: capWidth + 0.05, height: 0.06, depth: capWidth + 0.05, tint: CRATE_RIM },
];

/** Counter with produce heaped on top, and a plank edge where the two meet. */
const produceStallTile = (): readonly BoxRecipe[] => [
  { x: 0, y: 0.4, z: 0, width: 0.96, height: 0.8, depth: 0.8, tint: PALE_WOOD_SHADE },
  { x: 0, y: 0.82, z: 0, width: 1, height: 0.06, depth: 0.86, tint: PALE_WOOD },
  { x: 0, y: 0.97, z: 0, width: 0.84, height: 0.28, depth: 0.66 },
];

/**
 * Counter, two posts, awning.
 *
 * The posts are the point. Without them the awning hung in mid-air over the counter with nothing
 * holding it up — the most obviously wrong thing in the bazaar, and the kind of error the eye
 * catches before it reads anything else in the frame. They sit at the front corners so the camera
 * sees them against the ground rather than lost against the counter behind.
 */
const foodStallTile = (): readonly BoxRecipe[] => [
  { x: 0, y: 0.42, z: 0, width: 0.96, height: 0.84, depth: 0.8, tint: PALE_WOOD_SHADE },
  { x: -0.42, y: 0.68, z: 0.42, width: 0.08, height: 1.36, depth: 0.08, tint: PALE_WOOD_SHADE },
  { x: 0.42, y: 0.68, z: 0.42, width: 0.08, height: 1.36, depth: 0.08, tint: PALE_WOOD_SHADE },
  { x: 0, y: 1.35, z: -0.1, width: 0.98, height: 0.2, depth: 1.0 },
];

/**
 * ponytail: hand-authored table, not generated. 62 landmark sprites is small enough that a
 * generator would cost more than it saves. If the landmark count passes ~200, generate it from a
 * content field instead.
 */
/**
 * Real atlas ids, verified against assets/generated/atlas-index.json. Every landmark sprite is
 * `tile.*` and 32x32 — there are no `object.*` ids in this atlas.
 *
 * Multi-tile objects are the norm, not the exception. Two-tile pairs use `-left` / `-right`;
 * four-tile groups use `-nw` / `-ne` / `-sw` / `-se`. The north-west or left sprite owns the
 * recipe and consumes its siblings, so the group draws as one object instead of two or four
 * disconnected boxes.
 *
 * Offsets are from the OWNING tile's centre, in tiles. A two-tile object running east therefore
 * centres at `x: 0.5`, and a 2x2 group centres at `x: 0.5, z: 0.5`.
 *
 * **Owner-and-consume is only safe when the parts always appear as complete, isolated units.**
 * Checked against all four content maps, and five groups do not:
 *
 * - `sunward-table`, `harbor-cargo-stack`, `sunset-produce-stall` and `sunset-food-stall` are
 *   placed as ragged runs — `left@0 right@1 left@2` — so the run has an odd `-left` with no
 *   partner.
 * - `harbor-ferry` is placed `left@0 left@1 right@2 right@3`, four tiles from two sprite ids.
 *
 * An owner drawing a two-tile box for every `-left` would overhang an empty tile on the odd runs
 * and overlap itself on the ferry. Those five use a one-tile recipe on every part instead, listed
 * in `RUN_FORMING_GROUPS`. `tile.counter-left` / `tile.counter-right` are the same case for a
 * different reason: they appear alone as often as paired.
 *
 * Adjacent one-tile boxes read as one longer object, which is also how the 2D renderer draws them.
 */
export const PROP_RECIPES: Readonly<Record<string, PropRecipe>> = Object.freeze({
  // --- Sunward villa interior -------------------------------------------------------------
  // The measured paint is a dark teal that reads near-navy once the night curve and face shade
  // are applied. Lifted through the authored-tint knob so the largest object in the room stays
  // legible, and given a lighter cushion so the seat reads separately from the frame.
  'tile.sofa-left': {
    boxes: [
      { x: 0.5, y: 0.18, z: 0, width: 1.9, height: 0.36, depth: 0.85, tint: '#5f9e88' },
      { x: 0.5, y: 0.52, z: -0.32, width: 1.9, height: 0.32, depth: 0.22, tint: '#4d8672' },
      { x: -0.38, y: 0.44, z: 0, width: 0.16, height: 0.5, depth: 0.85, tint: '#4d8672' },
      { x: 1.38, y: 0.44, z: 0, width: 0.16, height: 0.5, depth: 0.85, tint: '#4d8672' },
    ],
    consumes: ['tile.sofa-right'],
  },
  // Ragged run, so one box per tile. See RUN_FORMING_GROUPS below.
  'tile.table-left': { boxes: tableTile() },
  'tile.table-right': { boxes: tableTile() },
  // The bed runs EAST, not south: content/maps/northwest.json places villa-bed as
  // tile.bed-head@0,0 and tile.bed-foot@1,0.
  'tile.bed-head': {
    boxes: [
      { x: 0.5, y: 0.22, z: 0, width: 1.9, height: 0.44, depth: 0.9 },
      { x: -0.4, y: 0.55, z: 0, width: 0.12, height: 0.66, depth: 0.9 },
    ],
    consumes: ['tile.bed-foot'],
  },
  // Counters stand alone as often as they pair, so no consume. See the note above.
  'tile.counter-left': {
    boxes: [{ x: 0, y: 0.42, z: 0, width: 0.96, height: 0.84, depth: 0.8 }],
  },
  'tile.counter-right': {
    boxes: [{ x: 0, y: 0.42, z: 0, width: 0.96, height: 0.84, depth: 0.8 }],
  },
  'tile.landmark-fountain-nw': {
    boxes: [
      { x: 0.5, y: 0.18, z: 0.5, width: 2.0, height: 0.36, depth: 2.0 },
      { x: 0.5, y: 0.6, z: 0.5, width: 0.5, height: 0.6, depth: 0.5 },
    ],
    consumes: [
      'tile.landmark-fountain-ne',
      'tile.landmark-fountain-sw',
      'tile.landmark-fountain-se',
    ],
  },

  // --- Harbour ----------------------------------------------------------------------------
  // Ragged run: the one ferry places left@0 left@1 right@2 right@3, so one box per tile.
  'tile.landmark-ferry-left': { boxes: ferryTile() },
  'tile.landmark-ferry-right': { boxes: ferryTile() },
  'tile.cargo-crane-nw': {
    boxes: [
      { x: 0.5, y: 0.16, z: 0.5, width: 1.9, height: 0.32, depth: 1.9 },
      { x: 0.5, y: 1.3, z: 0.5, width: 0.34, height: 2.0, depth: 0.34, tint: '#c8b45a' },
      { x: 0.5, y: 2.4, z: 0.4, width: 0.28, height: 0.22, depth: 1.8, tint: '#c8b45a' },
      // A hanging hook, so the jib reads as a crane rather than a beam on a pole.
      { x: 0.5, y: 1.95, z: -0.35, width: 0.09, height: 0.7, depth: 0.09, tint: '#6a6a72' },
    ],
    consumes: ['tile.cargo-crane-ne', 'tile.cargo-crane-sw', 'tile.cargo-crane-se'],
  },
  // Ragged run, so one box per tile.
  'tile.cargo-stack-left': { boxes: crateTile(0.62) },
  'tile.cargo-stack-right': { boxes: crateTile(0.5) },
  'tile.pallet-rack-nw': {
    boxes: [
      // Uprights on the CORNERS of the shelves, not inside them. Set in by even a tenth of a tile
      // and the top shelf hides all four from above, leaving the rack a flat plate again.
      { x: -0.42, y: 0.7, z: -0.42, width: 0.16, height: 1.4, depth: 0.16, tint: '#8a6a44' },
      { x: 1.42, y: 0.7, z: -0.42, width: 0.16, height: 1.4, depth: 0.16, tint: '#8a6a44' },
      { x: -0.42, y: 0.7, z: 1.42, width: 0.16, height: 1.4, depth: 0.16, tint: '#8a6a44' },
      { x: 1.42, y: 0.7, z: 1.42, width: 0.16, height: 1.4, depth: 0.16, tint: '#8a6a44' },
      { x: 0.5, y: 0.12, z: 0.5, width: 1.7, height: 0.24, depth: 1.7 },
      { x: 0.5, y: 0.72, z: 0.5, width: 1.7, height: 0.14, depth: 1.7 },
      { x: 0.5, y: 1.25, z: 0.5, width: 1.7, height: 0.14, depth: 1.7 },
    ],
    consumes: ['tile.pallet-rack-ne', 'tile.pallet-rack-sw', 'tile.pallet-rack-se'],
  },
  'tile.dock-bench': { boxes: bench(0.9) },
  'tile.mooring-bollard': {
    boxes: [{ x: 0, y: 0.2, z: 0, width: 0.3, height: 0.4, depth: 0.3 }],
  },

  // --- Sunset market ----------------------------------------------------------------------
  'tile.market-canopy-nw': {
    boxes: [
      // Four corner posts, not one. A single central post left the canopy reading as a slab
      // hanging in mid-air, which is the biggest thing wrong with the market district.
      { x: -0.3, y: 0.9, z: -0.3, width: 0.12, height: 1.8, depth: 0.12, tint: PALE_WOOD_SHADE },
      { x: 1.3, y: 0.9, z: -0.3, width: 0.12, height: 1.8, depth: 0.12, tint: PALE_WOOD_SHADE },
      { x: -0.3, y: 0.9, z: 1.3, width: 0.12, height: 1.8, depth: 0.12, tint: PALE_WOOD_SHADE },
      { x: 1.3, y: 0.9, z: 1.3, width: 0.12, height: 1.8, depth: 0.12, tint: PALE_WOOD_SHADE },
      { x: 0.5, y: 1.9, z: 0.5, width: 2.1, height: 0.18, depth: 2.1 },
    ],
    consumes: ['tile.market-canopy-ne', 'tile.market-canopy-sw', 'tile.market-canopy-se'],
  },
  // Ragged runs, so one box per tile.
  'tile.produce-stall-left': { boxes: produceStallTile() },
  'tile.produce-stall-right': { boxes: produceStallTile() },
  'tile.food-stall-left': { boxes: foodStallTile() },
  'tile.food-stall-right': { boxes: foodStallTile() },
  'tile.sunset-fountain-nw': {
    boxes: [
      { x: 0.5, y: 0.18, z: 0.5, width: 2.0, height: 0.36, depth: 2.0 },
      { x: 0.5, y: 0.6, z: 0.5, width: 0.5, height: 0.6, depth: 0.5 },
    ],
    consumes: ['tile.sunset-fountain-ne', 'tile.sunset-fountain-sw', 'tile.sunset-fountain-se'],
  },
  'tile.sunset-market-bench': { boxes: bench(0.9) },
  'tile.flowering-market-planter': { boxes: planter(0.78, FOLIAGE_FLOWERING) },

  // --- Lamps and lanterns -----------------------------------------------------------------
  'tile.fixture-lamp': { boxes: post(0.8, 0.32) },
  'tile.fixture-dock-lamp-amber': { boxes: post(1.15, 0.36) },
  'tile.fixture-dock-lamp-cold': { boxes: post(1.15, 0.36, LAMP_GLOW_COLD) },
  'tile.fixture-festival-lantern': { boxes: post(0.95, 0.3) },
  'tile.fixture-neon-lamp-cyan': { boxes: post(1.3, 0.22, LAMP_GLOW_CYAN) },
  'tile.fixture-neon-lamp-magenta': { boxes: post(1.3, 0.22, LAMP_GLOW_MAGENTA) },
  'tile.fixture-planter': { boxes: planter(0.7) },
  'tile.plant-palm': {
    boxes: [
      { x: 0, y: 0.75, z: 0, width: 0.22, height: 1.5, depth: 0.22, tint: '#8a6a44' },
      { x: 0, y: 1.65, z: 0, width: 1.1, height: 0.3, depth: 1.1, tint: FOLIAGE_GREEN },
    ],
  },

  // --- Signs ------------------------------------------------------------------------------
  'tile.sign-civic': { boxes: sign(0.5) },
  'tile.sign-harbor': { boxes: sign(0.5) },
  'tile.sign-market': { boxes: sign(0.5) },
  'tile.sign-neon': { boxes: neonSign(0.62, NEON_SIGN_GLOW) },
  'tile.sign-spa': { boxes: sign(0.5) },
  'tile.sign-sunset-market': { boxes: neonSign(0.62, MARKET_SIGN_GLOW) },

  // --- Parked cars ------------------------------------------------------------------------
  'tile.parked-car-cyan-left': {
    boxes: [
      { x: 0.5, y: 0.26, z: 0, width: 2.0, height: 0.52, depth: 0.85 },
      { x: 0.5, y: 0.7, z: 0, width: 1.1, height: 0.36, depth: 0.72 },
    ],
    consumes: ['tile.parked-car-cyan-right'],
  },
  'tile.parked-car-coral-left': {
    boxes: [
      { x: 0.5, y: 0.26, z: 0, width: 2.0, height: 0.52, depth: 0.85 },
      { x: 0.5, y: 0.7, z: 0, width: 1.1, height: 0.36, depth: 0.72 },
    ],
    consumes: ['tile.parked-car-coral-right'],
  },
});

/**
 * Sprites that stay flat floor decals on purpose. Not an oversight.
 *
 * The market details are scattered chalk, herbs, paper and petals on the ground. A character walks
 * over them, so they must not stand up. Rule of thumb: anything a character walks past stands up;
 * anything a character walks over stays flat.
 */
/**
 * The colour each lamp fixture GLOWS, read straight off its recipe.
 *
 * A lamp's point light must be the colour of its own head. Taking the district accent instead made
 * an amber dock lamp cast teal light: the source and the pool it throws disagreed, and the whole
 * harbour read as one cold monochrome with warm dots floating in it. Derived from `PROP_RECIPES`
 * rather than listed by hand, so a recipe change cannot leave the two out of step.
 */
export const LAMP_GLOW_COLORS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(PROP_RECIPES)
      .map(([sprite, recipe]) => [sprite, recipe.boxes.find((box) => box.glow === true)?.tint])
      .filter((entry): entry is [string, string] => entry[1] !== undefined),
  ),
);

/**
 * The largest fully-OPAQUE rectangle inside each prop sprite, and that rectangle's mean luminance.
 *
 * Measured by `npx tsx scripts/art/measure-prop-cores.ts`. Re-run it if the atlas is regenerated.
 *
 * This is what lets furniture carry grain instead of being a flat plastic colour. Mapping the whole
 * sprite onto a box is the obvious way to do that and does not work: prop sprites have transparent
 * margins, and `alphaTest` turns those into holes punched straight through the furniture. A core
 * has no transparent texel in it by construction, so a face UV'd to the core samples grain and can
 * never sample a hole.
 *
 * `luminance` is not decoration. The mapped material multiplies texture by vertex colour, so a
 * sprite at luminance 97 would darken the intended paint to a third of itself. The builder divides
 * it back out, which is why the field is stored next to the rectangle it belongs to.
 */
export const PROP_CORES: Readonly<Record<string, Readonly<{
  x: number; y: number; width: number; height: number; luminance: number;
}>>> = Object.freeze({
  'tile.bed-head': { x: 3, y: 3, width: 26, height: 29, luminance: 134.4 },
  'tile.cargo-crane-nw': { x: 21, y: 4, width: 9, height: 28, luminance: 82.4 },
  'tile.cargo-stack-left': { x: 2, y: 7, width: 30, height: 23, luminance: 97.7 },
  'tile.cargo-stack-right': { x: 0, y: 7, width: 30, height: 23, luminance: 97.7 },
  'tile.counter-left': { x: 2, y: 9, width: 30, height: 22, luminance: 135.8 },
  'tile.counter-right': { x: 0, y: 9, width: 30, height: 22, luminance: 135.8 },
  'tile.dock-bench': { x: 3, y: 13, width: 26, height: 13, luminance: 74.2 },
  'tile.fixture-dock-lamp-amber': { x: 10, y: 3, width: 12, height: 10, luminance: 71.1 },
  'tile.fixture-dock-lamp-cold': { x: 10, y: 3, width: 12, height: 10, luminance: 84.2 },
  'tile.fixture-festival-lantern': { x: 10, y: 3, width: 12, height: 12, luminance: 95.2 },
  'tile.fixture-lamp': { x: 14, y: 4, width: 4, height: 28, luminance: 95.4 },
  'tile.fixture-neon-lamp-cyan': { x: 10, y: 3, width: 12, height: 10, luminance: 74.4 },
  'tile.fixture-neon-lamp-magenta': { x: 10, y: 3, width: 12, height: 10, luminance: 81.3 },
  'tile.fixture-planter': { x: 7, y: 9, width: 18, height: 22, luminance: 71.7 },
  'tile.flowering-market-planter': { x: 7, y: 13, width: 18, height: 18, luminance: 95.0 },
  'tile.food-stall-left': { x: 3, y: 7, width: 29, height: 23, luminance: 88.4 },
  'tile.food-stall-right': { x: 0, y: 7, width: 29, height: 23, luminance: 88.4 },
  'tile.landmark-ferry-left': { x: 3, y: 7, width: 29, height: 22, luminance: 122.1 },
  'tile.landmark-ferry-right': { x: 0, y: 7, width: 29, height: 22, luminance: 122.1 },
  'tile.landmark-fountain-nw': { x: 4, y: 5, width: 28, height: 27, luminance: 138.1 },
  'tile.market-canopy-nw': { x: 3, y: 5, width: 29, height: 21, luminance: 125.9 },
  'tile.mooring-bollard': { x: 10, y: 12, width: 12, height: 20, luminance: 76.4 },
  'tile.pallet-rack-nw': { x: 4, y: 5, width: 28, height: 27, luminance: 89.9 },
  'tile.parked-car-coral-left': { x: 2, y: 5, width: 30, height: 23, luminance: 87.4 },
  'tile.parked-car-cyan-left': { x: 2, y: 5, width: 30, height: 23, luminance: 86.9 },
  'tile.plant-palm': { x: 3, y: 0, width: 22, height: 16, luminance: 85.9 },
  'tile.produce-stall-left': { x: 3, y: 8, width: 29, height: 22, luminance: 89.2 },
  'tile.produce-stall-right': { x: 0, y: 8, width: 29, height: 22, luminance: 89.2 },
  'tile.sign-civic': { x: 5, y: 3, width: 22, height: 20, luminance: 118.0 },
  'tile.sign-harbor': { x: 4, y: 4, width: 24, height: 18, luminance: 96.4 },
  'tile.sign-market': { x: 4, y: 4, width: 24, height: 18, luminance: 109.6 },
  'tile.sign-neon': { x: 3, y: 5, width: 26, height: 20, luminance: 90.7 },
  'tile.sign-spa': { x: 4, y: 3, width: 24, height: 17, luminance: 118.3 },
  'tile.sign-sunset-market': { x: 4, y: 4, width: 24, height: 18, luminance: 107.8 },
  'tile.sofa-left': { x: 3, y: 7, width: 29, height: 23, luminance: 98.0 },
  'tile.sunset-fountain-nw': { x: 4, y: 7, width: 28, height: 25, luminance: 137.9 },
  'tile.sunset-market-bench': { x: 3, y: 13, width: 26, height: 13, luminance: 87.6 },
  'tile.table-left': { x: 3, y: 5, width: 29, height: 22, luminance: 111.3 },
  'tile.table-right': { x: 0, y: 5, width: 29, height: 22, luminance: 111.3 },
});

export const FLAT_SPRITES: ReadonlySet<string> = new Set<string>([
  'tile.market-detail-chalk',
  'tile.market-detail-herbs',
  'tile.market-detail-paper',
  'tile.market-detail-petals',
]);

/**
 * Groups whose parts are placed in ragged runs in `content/maps/`, so every part carries its own
 * one-tile recipe and nothing is consumed. The recipes test derives this same set from the map
 * files, so adding a ragged placement to a currently-safe group fails the build rather than
 * silently drawing an overhanging box.
 */
export const RUN_FORMING_GROUPS: ReadonlySet<string> = new Set([
  'sunward-table',
  'harbor-ferry',
  'harbor-cargo-stack',
  'sunset-produce-stall',
  'sunset-food-stall',
]);

/**
 * The dominant opaque colour of each prop sprite, for the flat-shaded pass.
 *
 * Measured from `assets/generated/world-atlas.png`: the most common opaque colour in each cell,
 * quantised to 5 bits per channel so near-identical shades group together, and with OUTLINE pixels
 * excluded — anything below luminance 55.
 *
 * Both of the obvious cheaper choices are wrong. The centre texel lands on an outline or a
 * highlight for 15 of these 39 sprites. An unfiltered modal is worse for thin objects: a lamp post
 * is mostly outline BY COUNT, so it returned near-black and every lamp, crate and planter rendered
 * as a black lump.
 *
 * Data, not art: nothing here regenerates the atlas, so `art:check` is untouched. Regenerate this
 * table if the atlas art changes; the values only need to be close, not exact.
 */
export const PROP_FLAT_COLORS: Readonly<Record<string, string>> = Object.freeze({
  'tile.sofa-left': '#5c9494',
  'tile.table-left': '#b47444',
  'tile.table-right': '#b47444',
  'tile.bed-head': '#5c8c94',
  'tile.counter-left': '#84949c',
  'tile.counter-right': '#84949c',
  'tile.landmark-fountain-nw': '#549cac',
  'tile.landmark-ferry-left': '#7c94a4',
  'tile.landmark-ferry-right': '#7c94a4',
  'tile.cargo-crane-nw': '#64747c',
  'tile.cargo-stack-left': '#5c7c84',
  'tile.cargo-stack-right': '#5c7c84',
  'tile.pallet-rack-nw': '#8c6c54',
  'tile.dock-bench': '#7c6454',
  'tile.mooring-bollard': '#3c444c',
  'tile.market-canopy-nw': '#dc6c64',
  'tile.produce-stall-left': '#744434',
  'tile.produce-stall-right': '#744434',
  'tile.food-stall-left': '#6c3c44',
  'tile.food-stall-right': '#6c3c44',
  'tile.sunset-fountain-nw': '#64bcb4',
  'tile.sunset-market-bench': '#ac6c4c',
  'tile.flowering-market-planter': '#346444',
  'tile.fixture-lamp': '#545c5c',
  'tile.fixture-dock-lamp-amber': '#54443c',
  'tile.fixture-dock-lamp-cold': '#3c444c',
  'tile.fixture-festival-lantern': '#f4ac4c',
  'tile.fixture-neon-lamp-cyan': '#44445c',
  'tile.fixture-neon-lamp-magenta': '#44445c',
  'tile.fixture-planter': '#2c4c34',
  'tile.plant-palm': '#4c744c',
  'tile.sign-civic': '#7494a4',
  'tile.sign-harbor': '#5c7c84',
  'tile.sign-market': '#c48c44',
  'tile.sign-neon': '#643c74',
  'tile.sign-spa': '#7ca494',
  'tile.sign-sunset-market': '#cc6c64',
  'tile.parked-car-cyan-left': '#3ca4ac',
  'tile.parked-car-coral-left': '#c45474',
});

export function recipeFor(spriteId: string): PropRecipe | undefined {
  return PROP_RECIPES[spriteId];
}

/** Every sprite some other recipe already draws. These need no recipe of their own. */
export const CONSUMED_SPRITES: ReadonlySet<string> = new Set(
  Object.values(PROP_RECIPES).flatMap((recipe) => recipe.consumes ?? []),
);

/**
 * Coverage rule. A landmark sprite is handled when it owns a recipe, is consumed by one, or is
 * deliberately flat. Missing the middle case would count every `-right` and corner sprite as
 * unresolved — and the only way to make that pass would be to dump them into `FLAT_SPRITES`,
 * drawing half of every sofa, table, bed and fountain as a floor decal.
 */
export function isResolved(spriteId: string): boolean {
  return recipeFor(spriteId) !== undefined ||
    CONSUMED_SPRITES.has(spriteId) ||
    FLAT_SPRITES.has(spriteId);
}
