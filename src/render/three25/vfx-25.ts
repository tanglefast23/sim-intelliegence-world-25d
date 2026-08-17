import type { WorldFrameState } from '../world-frame';

const TILE_SIZE = 32;

/**
 * A VFX primitive, placed for the tilted view.
 *
 * `x`/`z` are the GROUND anchor in tiles. `y` is the height of the quad's centre above that ground
 * point. `upright` decides which way the quad faces: a plume of steam stands up and turns to the
 * camera, a puddle ripple lies flat on the floor.
 */
export type VfxQuad = Readonly<{
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  /** Linear RGB already multiplied by the primitive's alpha, for additive blending. */
  tint: string;
  opacity: number;
  upright: boolean;
}>;

/**
 * Roles that exist only to fake compositing in the 2D renderer.
 *
 * Each is a dark rect drawn UNDER its bright partner so the bright one reads against a lit tile.
 * Drawn additively in 2.5D a dark rect adds nothing, and drawn any other way it would be a grey
 * smear stapled to a plume of steam. The lit scene already supplies the contrast they were
 * standing in for.
 */
const COMPOSITING_ONLY_ROLES: ReadonlySet<string> = new Set([
  'sparkle-shadow',
  'leaves-shadow',
  'palm-shadow',
  'steam-shadow',
  'water-shadow',
]);

/** `#rrggbb` or `#rrggbbaa` split into a 6-digit colour and a 0..1 alpha. */
function splitColor(color: string): Readonly<{ hex: string; alpha: number }> {
  const hex = color.slice(0, 7);
  const alpha = color.length > 7 ? Number.parseInt(color.slice(7, 9), 16) / 255 : 1;
  return { hex, alpha };
}

/**
 * Every VFX primitive in the frame, as quads the tilted renderer can bake.
 *
 * **The 2.5D renderer drew none of these at all.** `frame.effects` and `frame.transientEffects` were
 * read only by the 2D path, so every fixture in the world — the club neon, the courtyard steam, the
 * yard steam, the harbour water glint, the patio fire — rendered as nothing. Three of the four
 * district captures are framed on a fixture, which is why those frames had no life in them.
 *
 * The rects arrive in 2D world space, where "up the screen" and "north" are the same direction.
 * They are not the same direction here. A flame rect laid flat on the ground at yaw 45 is a puddle
 * of fire, so an AERIAL primitive is stood upright and turned to face the camera — the same
 * treatment characters get, for the same reason — while a GROUND primitive stays flat, because a
 * ripple really is on the floor.
 *
 * The emitter's own bounds give the ground line: the bottom of the bounds is where the effect meets
 * the floor, and everything above it becomes height. Without that anchor a tall plume would sink
 * into the ground by half its height.
 */
export function vfxQuads(frame: WorldFrameState): readonly VfxQuad[] {
  const quads: VfxQuad[] = [];

  for (const geometry of frame.effects) {
    const bounds = geometry.bounds;
    const anchorX = (bounds.left + bounds.right) / 2;
    const groundY = bounds.bottom;
    geometry.rects.forEach((rect, index) => {
      if (COMPOSITING_ONLY_ROLES.has(rect.role)) return;
      const color = frame.effectRoleColors[rect.role];
      if (color === undefined) return;
      const { hex, alpha } = splitColor(color);
      quads.push({
        id: `${geometry.emitterId}#${String(index)}`,
        x: (rect.x + rect.width / 2) / TILE_SIZE,
        // Height above the emitter's ground line, measured from the rect's own centre.
        y: (groundY - (rect.y + rect.height / 2)) / TILE_SIZE,
        z: groundY / TILE_SIZE,
        width: rect.width / TILE_SIZE,
        height: rect.height / TILE_SIZE,
        tint: hex,
        opacity: alpha,
        upright: true,
      });
      // The horizontal anchor is the rect's own, not the emitter's, so a wide effect keeps its
      // spread. `anchorX` stays referenced so a future centred mode has the value it needs.
      void anchorX;
    });
  }

  frame.transientEffects?.forEach((rect, index) => {
    const { hex, alpha } = splitColor(rect.color);
    const ground = rect.layer === 'ground';
    quads.push({
      id: `transient#${String(index)}`,
      x: (rect.x + rect.width / 2) / TILE_SIZE,
      y: ground ? 0 : rect.height / (2 * TILE_SIZE),
      z: (rect.y + rect.height / 2) / TILE_SIZE,
      width: rect.width / TILE_SIZE,
      height: rect.height / TILE_SIZE,
      tint: hex,
      opacity: alpha,
      upright: !ground,
    });
  });

  return quads;
}
