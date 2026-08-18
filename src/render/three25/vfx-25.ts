import { recipeFor, WALL_HEIGHT_TILES } from './recipes';
import type { QuadDescriptor } from './scene-builder';
import { shelteredTileKeys, type WorldFrameState } from '../world-frame';

const TILE_SIZE = 32;

/**
 * A VFX primitive, placed for the tilted view.
 *
 * `x`/`z` are the ground position in tiles and `y` is the quad centre's height above the floor.
 * `upright` decides which way it faces: a plume of steam stands up and turns to the camera, a water
 * glint lies flat on the surface it is a glint on.
 */
export type VfxQuad = Readonly<{
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  /** 6-digit `#rrggbb`. */
  tint: string;
  /** 0..1. Premultiplied into the colour for the additive batch, used as-is for the alpha batch. */
  opacity: number;
  upright: boolean;
}>;

/**
 * The two batches VFX can land in, and the rule for choosing.
 *
 * ADDITIVE is for things that ARE light: fire, sparkle, fireflies, neon, a glint off water, a
 * muzzle flash. ALPHA is for things that are MATTER: steam, leaves, fronds, a dust smear, a blood
 * stain. The first pass forced everything additive, which does not merely look wrong — it deletes
 * marks. Blood is `#5e1a18` and dust is drawn in the shadow colour; added to a lit floor a dark
 * colour contributes nothing at all, so two of the marks the spec calls critical vanished
 * structurally rather than being hard to see.
 */
export type VfxQuads = Readonly<{ additive: readonly VfxQuad[]; alpha: readonly VfxQuad[] }>;

/**
 * Roles that exist only to fake compositing in the 2D renderer.
 *
 * Each is a dark rect drawn under its bright partner so the bright one reads against a lit tile.
 * The lit scene supplies that contrast itself, and a dark rect in the additive batch adds nothing.
 */
const COMPOSITING_ONLY_ROLES: ReadonlySet<string> = new Set([
  'sparkle-shadow',
  'leaves-shadow',
  'palm-shadow',
]);

/**
 * Roles that are a dark BACKER for a pale primary, and are kept.
 *
 * Dropping every `-shadow` role was right for the ones above, whose partners are bright enough to
 * read on their own. It was wrong for steam and water, and measurably so: a cream wisp at 65% alpha
 * over the bazaar's courtyard, whose floor sits at mean luminance 93, changed 18 pixels out of a
 * whole plume, and a cyan glint over water changed none at all. Pale on pale is not a contrast.
 *
 * The backer is what carried the silhouette in 2D and it does the same job here for the same
 * reason. It costs nothing: it rides the alpha batch its primary already uses.
 */
const SILHOUETTE_BACKER_ROLES: ReadonlySet<string> = new Set([
  'steam-shadow',
  'steam-wisp-shadow',
  'water-shadow',
]);

/**
 * How far BELOW the emitter's tile centre each kind's cull box reaches, in world pixels.
 *
 * Mirrors the extent table in `vfx/procedural-effects.ts`. `VfxGeometry` carries `bounds` but not
 * the tile it was authored on, and `bounds` is a cull box rather than a ground contact — using its
 * bottom as the ground line, which the first pass did, slides every effect south, which at yaw 45
 * is toward the camera. The horizontal extents are symmetric so the tile centre's x falls out of
 * the box directly; the vertical ones are not, so the offset has to come back off here.
 */
const BOUNDS_BOTTOM_EXTENT: Readonly<Record<string, number>> = Object.freeze({
  fire: 3,
  sparkle: 3,
  insects: 8,
  leaves: 8,
  neon: 5,
  palm: 7,
  steam: 2,
  water: 4,
});

/**
 * Where each kind sits, and how.
 *
 * `mode` is what the authored rect's vertical position MEANS in three dimensions:
 *
 * - `rise` — it is height. A flame and a steam wisp go up, so the rect's distance above the
 *   emitter's tile centre becomes its height above the floor.
 * - `spread` — it is north-south POSITION. Two fireflies one above the other in 2D are two
 *   fireflies a stride apart on the ground, not one hovering over the other; the same holds for a
 *   band of water glints and a scatter of leaves. Height is a fixed value for the kind instead.
 *   Spending that offset on height is what turned the harbour's glints into a fence of light.
 * - `fixed` — the effect belongs at a known height on the object it decorates, and the authored
 *   vertical position is a glyph detail rather than a placement.
 *
 * The fixed heights are derived from the recipes the effects decorate, not guessed: a neon sign
 * panel centres at 1.01 tiles (`recipes.ts`, a 0.7 post plus half a 0.62 panel) and a palm canopy
 * centres at 1.65 (trunk to 1.5, foliage 1.5 to 1.8).
 */
type VfxKindRule = Readonly<{
  mode: 'rise' | 'spread' | 'fixed';
  height: number;
  upright: boolean;
  additive: boolean;
}>;

const KIND_RULES: Readonly<Record<string, VfxKindRule>> = Object.freeze({
  fire: { mode: 'rise', height: 0, upright: true, additive: true },
  steam: { mode: 'rise', height: 0, upright: true, additive: false },
  sparkle: { mode: 'fixed', height: 0.2, upright: true, additive: true },
  insects: { mode: 'spread', height: 0.5, upright: true, additive: true },
  leaves: { mode: 'spread', height: 0.9, upright: true, additive: false },
  palm: { mode: 'spread', height: 1.65, upright: true, additive: false },
  neon: { mode: 'fixed', height: 1.01, upright: true, additive: true },
  water: { mode: 'spread', height: 0.03, upright: false, additive: true },
});

/** The fallback for a kind with no rule: a low upright glow, rather than dropping it silently. */
const DEFAULT_RULE: VfxKindRule = { mode: 'fixed', height: 0.3, upright: true, additive: true };

/** Ground marks sit fractionally above the floor so they never z-fight the tile they mark. */
const GROUND_MARK_HEIGHT = 0.014;

/** Aerial one-shots — a muzzle flash, a tracer — happen at chest height, not at the ankles. */
const AERIAL_TRANSIENT_HEIGHT = 0.5;

/** A quad never sinks below this, so a `rise` effect cannot bury half of itself in the floor. */
const MINIMUM_RISE = 0.03;

/**
 * How high a `rise` plume starts: the top of whatever it rises OUT of, at the emitter's tile.
 *
 * Steam comes off a food stall, and the emitter is authored on the stall's own tile. In 2D that is
 * fine - the plume is composited over the sprite. Here the stall is a box 1.35 tiles tall and the
 * plume renders INSIDE it, so a wisp at the authored height is hidden by the counter it belongs to.
 *
 * This is why widening the steam made it worse, not better: at 2.4x a sliver still caught the edge
 * of the counter and changed 18 pixels; at 4x the whole quad fell within the box's silhouette and
 * changed none. The probe that settled it forced the same quads to three tiles wide, at which size
 * they cleared the stall and changed 67,326.
 *
 * **Measured per emitter, not fixed per kind.** The first fix was a flat `steam: 1.55` minimum,
 * sized for the tallest stall in the game and applied to every steam emitter. Indoors that is above
 * the 1.45-tile wall top and inside the 1.45-1.57 roof lid, so the office kettle's plume rendered
 * ON TOP of the annex roof - two pale wisps floating on the shingles from outside the building.
 * Reading the prop the emitter actually stands on puts each plume on its own source instead: 1.45
 * on the food stall, 1.11 on the produce stall, the counter top on the office kettle.
 *
 * The tile test is the box FOOTPRINT, not the prop's anchor tile, so a multi-tile prop whose
 * recipe lives on a sibling tile still counts.
 */
function riseBaseHeights(frame: WorldFrameState): ReadonlyMap<string, number> {
  const tops = new Map<string, number>();
  for (const prop of frame.props) {
    for (const box of recipeFor(prop.sprite)?.boxes ?? []) {
      const centreX = prop.tile.x + 0.5 + box.x;
      const centreZ = prop.tile.y + 0.5 + box.z;
      const top = box.y + box.height / 2;
      for (let x = Math.floor(centreX - box.width / 2); x < Math.ceil(centreX + box.width / 2); x += 1) {
        for (let y = Math.floor(centreZ - box.depth / 2); y < Math.ceil(centreZ + box.depth / 2); y += 1) {
          const key = `${x},${y}`;
          tops.set(key, Math.max(tops.get(key) ?? 0, top));
        }
      }
    }
  }
  return tops;
}

/**
 * The highest a quad may reach on a roofed tile, in tiles.
 *
 * A roof lid spans `WALL_HEIGHT_TILES` to `WALL_HEIGHT_TILES + 0.12`, so anything that reaches the
 * wall top pokes through it and draws on the outside of the building. The margin keeps an upright
 * quad's TOP edge clear of the lid, not just its centre.
 */
const INDOOR_CEILING_TILES = WALL_HEIGHT_TILES - 0.03;

/**
 * How much of its authored climb a `rise` plume keeps under a ceiling. 1 outdoors, always.
 *
 * A flat clamp is the obvious fix and it is the wrong one. The office ceiling is 1.45 tiles and the
 * kettle it rises from tops out at 1.06, so every step of the animation clamps to the same value
 * and the plume freezes: a still column of steam, which is worse than one poking through the roof
 * because it looks like a bug in the animation rather than in the geometry.
 *
 * Scaling the climb into the headroom keeps all four steps distinct. The plume is shorter indoors,
 * which is what a low ceiling should do to it.
 */
function indoorRiseScale(boundsTop: number, anchorY: number, riseBase: number): number {
  // Measured against the emitter's declared cull box, NOT against this step's rects. The cull box
  // is the envelope of the whole animation and never moves; the rects do. Scaling to the rects
  // renormalises every step, which pins the tallest wisp to the ceiling on every frame and freezes
  // the plume just as flatly as a clamp would - only at the ceiling instead of at the spout.
  const envelope = (anchorY - boundsTop) / TILE_SIZE;
  if (envelope <= 0) return 1;
  return Math.max(0, Math.min(1, (INDOOR_CEILING_TILES - riseBase) / envelope));
}

/**
 * How much wider a kind is drawn than its authored rect, per kind.
 *
 * Steam wisps are two pixels across and water glints one. That is thin, and a tilted camera does
 * not help: a 2-pixel quad is 6 screen pixels at zoom 3 and disappears into any floor near its own
 * value. Widening is the one lever that needs no new art and no second batch, and it was verified
 * by forcing the same quads large and bright first — the batch rasterises, the primitives were
 * simply too small.
 *
 * Width only. Taller would change how far the plume rises, which the recipe means literally.
 */
const KIND_WIDTH_SCALE: Readonly<Record<string, number>> = Object.freeze({ steam: 4, water: 2 });

/**
 * How much more opaque a kind is drawn than its authored alpha, per kind.
 *
 * Width alone was not enough. Measured against a control frame with the effects suppressed, a
 * 2.4x-wide plume changed 18 pixels over the bazaar's courtyard, whose floor sits at mean luminance
 * 93 — the authored 65% cream has nowhere to go against ground that bright. The same plume over the
 * harbour's darker yard changed 188.
 *
 * Capped at 1 so this can only ever recover an effect, never invent one brighter than authored.
 */
const KIND_OPACITY_SCALE: Readonly<Record<string, number>> = Object.freeze({ steam: 1.5, water: 1.4 });

/** `#rrggbb` or `#rrggbbaa` split into a 6-digit colour and a 0..1 alpha. */
function splitColor(color: string): Readonly<{ hex: string; alpha: number }> {
  return {
    hex: color.slice(0, 7),
    alpha: color.length > 7 ? Number.parseInt(color.slice(7, 9), 16) / 255 : 1,
  };
}

/**
 * Every VFX primitive in the frame, split by the batch it belongs in.
 *
 * **The 2.5D renderer drew none of these at all.** `frame.effects` and `frame.transientEffects` were
 * read only by the 2D path, so the club neon, the courtyard steam, the yard steam, the harbour water
 * glint, the patio fire and the player's own footfall dust rendered as nothing. Three of the four
 * district captures are deliberately framed on a fixture.
 *
 * The rects arrive in SCREEN space authored for a top-down camera, where "up the screen", "north"
 * and "up in the air" are one direction. Under yaw 45 and tilt 30 they are three, and which one a
 * given effect meant is a property of the effect — see `KIND_RULES`. Applying one rule to all of
 * them, which the first pass did, stands water glints up into a fence of light along the shoreline
 * and hangs a neon sign's bloom at knee height in front of the sign.
 *
 * One authored distortion is knowingly kept. A ripple ring is pre-squashed by the recipe so it reads
 * as ground under a top-down camera, and on the real ground plane it squashes again. Undoing it
 * needs the cue's origin, which a transient rect does not carry. A flatter ring still reads as a
 * splash.
 */
export function vfxQuads(frame: WorldFrameState): VfxQuads {
  const additive: VfxQuad[] = [];
  const alpha: VfxQuad[] = [];
  const riseBases = riseBaseHeights(frame);
  const roofedTiles = shelteredTileKeys([...frame.shelterCells, ...frame.roofedCells]);

  for (const geometry of frame.effects) {
    const rule = KIND_RULES[geometry.kind] ?? DEFAULT_RULE;
    const bounds = geometry.bounds;
    // The emitter's tile centre, recovered from the cull box rather than assumed to be its edge.
    const anchorY = bounds.bottom - (BOUNDS_BOTTOM_EXTENT[geometry.kind] ?? 0);
    const anchorX = (bounds.left + bounds.right) / 2;
    const emitterTile = `${Math.floor(anchorX / TILE_SIZE)},${Math.floor(anchorY / TILE_SIZE)}`;
    const riseBase = riseBases.get(emitterTile) ?? 0;
    const riseScale = roofedTiles.has(emitterTile)
      ? indoorRiseScale(bounds.top, anchorY, riseBase)
      : 1;
    geometry.rects.forEach((rect, index) => {
      if (COMPOSITING_ONLY_ROLES.has(rect.role)) return;
      const color = frame.effectRoleColors[rect.role];
      if (color === undefined) return;
      const { hex, alpha: opacity } = splitColor(color);
      const centreX = rect.x + rect.width / 2;
      const centreY = rect.y + rect.height / 2;
      const isBacker = SILHOUETTE_BACKER_ROLES.has(rect.role);
      const height = rect.height / TILE_SIZE;
      const quad: VfxQuad = {
        id: `${geometry.emitterId}#${String(index)}`,
        x: centreX / TILE_SIZE,
        // The quad's TOP edge is what the scale is applied to, then the half-height comes back off
        // to get the centre. Scaling the centre instead leaves every rect clearing the ceiling by
        // its own half-height. At `riseScale` 1 - every outdoor emitter - this is exactly
        // `riseBase + (anchorY - centreY) / TILE_SIZE`, so nothing outdoors moves.
        y: rule.mode === 'rise'
          ? Math.max(riseBase + ((anchorY - rect.y) / TILE_SIZE) * riseScale - height / 2, MINIMUM_RISE)
          : rule.height,
        // `spread` keeps the authored offset as depth; the others hold the emitter's own depth.
        z: (rule.mode === 'spread' ? centreY : anchorY) / TILE_SIZE,
        // A backer is drawn slightly wider than the primary it sits behind, so it reads as an
        // outline around it rather than as a second wisp of its own.
        width: (rect.width * (KIND_WIDTH_SCALE[geometry.kind] ?? 1) * (isBacker ? 1.35 : 1)) / TILE_SIZE,
        height,
        tint: hex,
        opacity: Math.min(1, opacity * (KIND_OPACITY_SCALE[geometry.kind] ?? 1)),
        upright: rule.upright,
      };
      // A backer is always alpha, never additive: a dark rect added to a lit floor is nothing.
      (rule.additive && !isBacker ? additive : alpha).push(quad);
    });
  }

  /**
   * One-shots carry no kind — only a layer and a resolved colour — so the layer is the whole
   * selector. `ground` is a mark on the floor: a dust smear, a ripple, a blood stain, all matter
   * and all alpha. `aerial` is a flash in the air, which is light.
   */
  frame.transientEffects?.forEach((rect, index) => {
    const { hex, alpha: opacity } = splitColor(rect.color);
    const ground = rect.layer === 'ground';
    const quad: VfxQuad = {
      id: `transient#${String(index)}`,
      x: (rect.x + rect.width / 2) / TILE_SIZE,
      y: ground ? GROUND_MARK_HEIGHT : AERIAL_TRANSIENT_HEIGHT,
      z: (rect.y + rect.height / 2) / TILE_SIZE,
      width: rect.width / TILE_SIZE,
      height: rect.height / TILE_SIZE,
      tint: hex,
      opacity,
      upright: !ground,
    };
    (ground ? alpha : additive).push(quad);
  });

  return { additive, alpha };
}

/**
 * One-shot glows, as lamp-pool descriptors.
 *
 * A transient glow is a stepped additive light on the floor, which is exactly what a lamp pool is.
 * The 2D path draws them through its own lamp-glow batch; here they append to the pool list and the
 * radial fan bake does the rest, for zero extra draw calls.
 */
export function vfxGlowPools(frame: WorldFrameState): readonly QuadDescriptor[] {
  return (frame.transientGlows ?? []).map((glow, index) => ({
    id: `glow-${String(index)}`,
    sprite: 'transient-glow',
    source: { x: 0, y: 0, width: 0, height: 0 } as QuadDescriptor['source'],
    x: glow.worldX / TILE_SIZE,
    z: glow.worldY / TILE_SIZE,
    width: (glow.radius * 2) / TILE_SIZE,
    depth: (glow.radius * 2) / TILE_SIZE,
    tint: glow.color,
    opacity: glow.opacity,
  }));
}
