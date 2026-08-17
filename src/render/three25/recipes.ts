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
}>;

export type PropRecipe = Readonly<{
  boxes: readonly BoxRecipe[];
  /** Sibling sprite ids this recipe already draws, so the builder skips them. */
  consumes?: readonly string[];
}>;

/** Matches the spike wall box height. See spikes/001-threejs-pixel-villa/scene.js:109. */
export const WALL_HEIGHT_TILES = 1.45;

/**
 * A lamp, lantern or bollard-style post: footing, stem, head. `headWidth` is what separates a
 * slim neon post from a wide dock lamp.
 */
const post = (height: number, headWidth: number): readonly BoxRecipe[] => [
  { x: 0, y: 0.05, z: 0, width: 0.26, height: 0.1, depth: 0.26 },
  { x: 0, y: height / 2, z: 0, width: 0.07, height, depth: 0.07 },
  { x: 0, y: height + 0.12, z: 0, width: headWidth, height: 0.24, depth: headWidth },
];

/** A standing sign: one thin post carrying a flat panel that faces the camera at yaw 0. */
const sign = (panelHeight: number): readonly BoxRecipe[] => [
  { x: 0, y: 0.35, z: 0, width: 0.09, height: 0.7, depth: 0.09 },
  { x: 0, y: 0.7 + panelHeight / 2, z: 0, width: 0.8, height: panelHeight, depth: 0.12 },
];

/** Seat slab plus a back rail along the north edge. */
const bench = (width: number): readonly BoxRecipe[] => [
  { x: 0, y: 0.18, z: 0, width, height: 0.12, depth: 0.5 },
  { x: 0, y: 0.42, z: -0.2, width, height: 0.36, depth: 0.1 },
];

/** Pot plus the mass growing out of it. */
const planter = (foliageWidth: number): readonly BoxRecipe[] => [
  { x: 0, y: 0.16, z: 0, width: 0.55, height: 0.32, depth: 0.55 },
  { x: 0, y: 0.55, z: 0, width: foliageWidth, height: 0.5, depth: foliageWidth },
];

// --- One-tile shapes for the run-forming groups ------------------------------------------
//
// These sprites appear in ragged runs, so each tile carries its own box and adjacent tiles read
// as one longer object. Boxes are slightly under a full tile so neighbours meet at a seam rather
// than z-fighting on a shared face.

/** Top slab plus one leg. Two adjacent tiles give a two-tile table on two legs. */
const tableTile = (): readonly BoxRecipe[] => [
  { x: 0, y: 0.46, z: 0, width: 0.98, height: 0.09, depth: 0.7 },
  { x: 0, y: 0.23, z: 0, width: 0.09, height: 0.46, depth: 0.6 },
];

/** Hull slab plus superstructure. Four in a row give the harbour ferry. */
const ferryTile = (): readonly BoxRecipe[] => [
  { x: 0, y: 0.3, z: 0, width: 0.98, height: 0.6, depth: 0.95 },
  { x: 0, y: 0.78, z: 0, width: 0.7, height: 0.36, depth: 0.7 },
];

/** A crate with a smaller one on top. `capWidth` varies the silhouette along a run. */
const crateTile = (capWidth: number): readonly BoxRecipe[] => [
  { x: 0, y: 0.35, z: 0, width: 0.94, height: 0.7, depth: 0.9 },
  { x: 0, y: 0.95, z: 0, width: capWidth, height: 0.5, depth: capWidth },
];

/** Counter with produce heaped on top. */
const produceStallTile = (): readonly BoxRecipe[] => [
  { x: 0, y: 0.4, z: 0, width: 0.96, height: 0.8, depth: 0.8 },
  { x: 0, y: 0.94, z: 0, width: 0.84, height: 0.28, depth: 0.66 },
];

/** Counter with an awning floating above it. */
const foodStallTile = (): readonly BoxRecipe[] => [
  { x: 0, y: 0.42, z: 0, width: 0.96, height: 0.84, depth: 0.8 },
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
  'tile.sofa-left': {
    boxes: [
      { x: 0.5, y: 0.18, z: 0, width: 1.9, height: 0.36, depth: 0.85 },
      { x: 0.5, y: 0.52, z: -0.32, width: 1.9, height: 0.32, depth: 0.22 },
      { x: -0.38, y: 0.44, z: 0, width: 0.16, height: 0.5, depth: 0.85 },
      { x: 1.38, y: 0.44, z: 0, width: 0.16, height: 0.5, depth: 0.85 },
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
      { x: 0.5, y: 1.3, z: 0.5, width: 0.34, height: 2.0, depth: 0.34 },
      { x: 0.5, y: 2.4, z: 0.4, width: 0.28, height: 0.22, depth: 1.8 },
    ],
    consumes: ['tile.cargo-crane-ne', 'tile.cargo-crane-sw', 'tile.cargo-crane-se'],
  },
  // Ragged run, so one box per tile.
  'tile.cargo-stack-left': { boxes: crateTile(0.62) },
  'tile.cargo-stack-right': { boxes: crateTile(0.5) },
  'tile.pallet-rack-nw': {
    boxes: [
      { x: 0.5, y: 0.12, z: 0.5, width: 1.9, height: 0.24, depth: 1.9 },
      { x: 0.5, y: 0.72, z: 0.5, width: 1.9, height: 0.14, depth: 1.9 },
      { x: 0.5, y: 1.25, z: 0.5, width: 1.9, height: 0.14, depth: 1.9 },
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
      { x: 0.5, y: 0.9, z: 0.5, width: 0.14, height: 1.8, depth: 0.14 },
      { x: 0.5, y: 1.95, z: 0.5, width: 2.1, height: 0.3, depth: 2.1 },
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
  'tile.flowering-market-planter': { boxes: planter(0.78) },

  // --- Lamps and lanterns -----------------------------------------------------------------
  'tile.fixture-lamp': { boxes: post(0.8, 0.32) },
  'tile.fixture-dock-lamp-amber': { boxes: post(1.15, 0.36) },
  'tile.fixture-dock-lamp-cold': { boxes: post(1.15, 0.36) },
  'tile.fixture-festival-lantern': { boxes: post(0.95, 0.3) },
  'tile.fixture-neon-lamp-cyan': { boxes: post(1.3, 0.22) },
  'tile.fixture-neon-lamp-magenta': { boxes: post(1.3, 0.22) },
  'tile.fixture-planter': { boxes: planter(0.7) },
  'tile.plant-palm': {
    boxes: [
      { x: 0, y: 0.75, z: 0, width: 0.22, height: 1.5, depth: 0.22 },
      { x: 0, y: 1.65, z: 0, width: 1.1, height: 0.3, depth: 1.1 },
    ],
  },

  // --- Signs ------------------------------------------------------------------------------
  'tile.sign-civic': { boxes: sign(0.5) },
  'tile.sign-harbor': { boxes: sign(0.5) },
  'tile.sign-market': { boxes: sign(0.5) },
  'tile.sign-neon': { boxes: sign(0.62) },
  'tile.sign-spa': { boxes: sign(0.5) },
  'tile.sign-sunset-market': { boxes: sign(0.62) },

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
