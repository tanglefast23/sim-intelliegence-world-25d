import type { QuadDescriptor } from './scene-builder';
import type { WorldFrameState } from '../world-frame';

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
  'steam-shadow',
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
 * How much wider a kind is drawn than its authored rect, per kind.
 *
 * Steam wisps are two pixels across. That was thin even in 2D, where dark `steam-shadow` backers
 * carried the silhouette — and those backers are dropped here, because the lit scene supplies the
 * contrast they faked. On a courtyard floor at mean luminance 93 a two-pixel cream wisp is simply
 * not there. Widening the quad is the one lever that does not need new art or a second batch.
 *
 * Width only. Taller would change how far the plume rises, which the recipe means literally.
 */
const KIND_WIDTH_SCALE: Readonly<Record<string, number>> = Object.freeze({ steam: 2.4 });

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

  for (const geometry of frame.effects) {
    const rule = KIND_RULES[geometry.kind] ?? DEFAULT_RULE;
    const bounds = geometry.bounds;
    // The emitter's tile centre, recovered from the cull box rather than assumed to be its edge.
    const anchorY = bounds.bottom - (BOUNDS_BOTTOM_EXTENT[geometry.kind] ?? 0);
    geometry.rects.forEach((rect, index) => {
      if (COMPOSITING_ONLY_ROLES.has(rect.role)) return;
      const color = frame.effectRoleColors[rect.role];
      if (color === undefined) return;
      const { hex, alpha: opacity } = splitColor(color);
      const centreX = rect.x + rect.width / 2;
      const centreY = rect.y + rect.height / 2;
      const quad: VfxQuad = {
        id: `${geometry.emitterId}#${String(index)}`,
        x: centreX / TILE_SIZE,
        y: rule.mode === 'rise'
          ? Math.max((anchorY - centreY) / TILE_SIZE, MINIMUM_RISE)
          : rule.height,
        // `spread` keeps the authored offset as depth; the others hold the emitter's own depth.
        z: (rule.mode === 'spread' ? centreY : anchorY) / TILE_SIZE,
        width: (rect.width * (KIND_WIDTH_SCALE[geometry.kind] ?? 1)) / TILE_SIZE,
        height: rect.height / TILE_SIZE,
        tint: hex,
        opacity,
        upright: rule.upright,
      };
      (rule.additive ? additive : alpha).push(quad);
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
