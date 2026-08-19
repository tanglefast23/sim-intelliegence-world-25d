import type { Point } from './sketch';

/**
 * The shape family is the character's identity, and it is nine words in one list.
 *
 * Kindergrimm's step 4: lay down a ring, smooth it twice, then slide every point most of the way
 * onto a target radius function. The vampire is `tall`; a Frankenstein is `square`. Before this
 * existed the skull was a hardcoded twelve-point polygon, so every character we drew would have
 * worn the vampire's exact head.
 */
export const HEAD_SHAPES = [
  'round', 'square', 'tall', 'drop', 'pear', 'lump', 'wide', 'bumpy', 'wonky',
] as const;
export type HeadShape = typeof HEAD_SHAPES[number];

/** Points around the ring before smoothing. */
const RING_POINTS = 24;
/**
 * How far a point slides onto the target shape.
 *
 * Never 1. At 1 the silhouette is the maths, and it stops looking drawn. Kindergrimm slides
 * .82-.97 of the way and keeps the remainder as the hand.
 */
export const HEAD_ROUND = 0.92;

/** The authored skull box in head space: centre row 82, half width 30, half height 44. */
export const HEAD_CENTRE_ROW = 82;
export const HEAD_HALF_WIDTH = 30;
export const HEAD_HALF_HEIGHT = 44;

/**
 * Radius multiplier for one angle of one shape.
 *
 * `y` is down, so `sin > 0` is the jaw and `sin < 0` is the crown. Getting that backwards swaps
 * `pear` and `lump`, which is the easy mistake to make here.
 */
export function headRadius(shape: HeadShape, theta: number): number {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const jaw = Math.max(0, s);
  const crown = Math.max(0, -s);
  switch (shape) {
    case 'round': return 1;
    case 'square': {
      const n = 5.5;
      return 1 / (Math.abs(c) ** n + Math.abs(s) ** n) ** (1 / n);
    }
    case 'tall': return 1 + 0.16 * Math.abs(s) - 0.12 * Math.abs(c);
    case 'wide': return 1 + 0.18 * Math.abs(c) - 0.1 * Math.abs(s);
    case 'drop': return 1 - 0.24 * crown + 0.12 * jaw;
    case 'pear': return 1 - 0.14 * crown + 0.22 * jaw;
    case 'lump': return 1 + 0.22 * crown - 0.08 * jaw;
    case 'bumpy': return 1 + 0.09 * Math.sin(theta * 5) + 0.05 * Math.sin(theta * 8);
    case 'wonky': return 1 + 0.13 * Math.sin(theta * 2 + 0.9);
  }
}

/**
 * The skull ring in head space, as `(dx, designRow)` pairs for `F.head`.
 *
 * `profile` collapses the far side and swells the near side, which is what turns a front skull into
 * a head seen from the side without authoring a second polygon.
 */
export function headRingPoints(
  shape: HeadShape,
  options: Readonly<{ round?: number; profileDir?: -1 | 0 | 1 }> = {},
): readonly Readonly<{ dx: number; row: number }>[] {
  const round = options.round ?? HEAD_ROUND;
  const dir = options.profileDir ?? 0;
  const points: { dx: number; row: number }[] = [];
  for (let i = 0; i < RING_POINTS; i += 1) {
    const theta = (i / RING_POINTS) * Math.PI * 2;
    const radius = 1 + (headRadius(shape, theta) - 1) * round;
    let dx = HEAD_HALF_WIDTH * Math.cos(theta) * radius;
    const row = HEAD_CENTRE_ROW + HEAD_HALF_HEIGHT * Math.sin(theta) * radius;
    if (dir !== 0) {
      // The reference's 3/4 turn: the near side swells by 10% and the far side collapses by
      // 28%. The audit caught the swell at 2%.
      const forward = Math.cos(theta) * dir;
      dx *= forward > 0 ? 1.1 : 0.72;
      dx += dir * 3;
    }
    points.push({ dx, row });
  }
  return points;
}

export function toHeadPoints(
  ring: readonly Readonly<{ dx: number; row: number }>[],
  head: (dx: number, row: number) => Point,
): Point[] {
  return ring.map(({ dx, row }) => head(dx, row));
}
