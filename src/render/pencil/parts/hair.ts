import type { Point, Sketch } from '../sketch';
import type { VampireLayout } from '../layout';
import type { VampirePose } from '../pose';

/**
 * Hair is a scribbled mass, not a slow line.
 *
 * Kindergrimm treats wobble as a statement about the hand — an eye at ~.4, a scribbled mass at 1.
 * Every shape here was drawn at .1-.5, so the hair was as careful as the pupils.
 */
const HAIR_SCRIBBLE = 5;

export type VampireHairOptions = Readonly<{ flare?: number; fall?: number; offset?: Point }>;

export function drawVampireHairBack(
  sketch: Sketch,
  F: VampireLayout,
  pose: VampirePose,
  options: VampireHairOptions = {},
): void {
  const flare = options.flare ?? 1;
  const fall = options.fall ?? 0.82;
  const dir = pose.facing === 'right' ? 1 : pose.facing === 'left' ? -1 : 0;
  const offset = options.offset ?? { x: 0, y: 0 };
  const H = (x: number, y: number): Point => {
    const point = F.head(x, y);
    return { x: point.x + offset.x, y: point.y + offset.y };
  };
  const half = (pose.facing === 'left' || pose.facing === 'right' ? 31 : 35) * flare;
  const bottom = 111 + Math.max(0, fall - 0.8) * 85;
  const hair = sketch.smooth(sketch.jitterRing([
    H(dir * 3, 24), H(half + dir * 4, 42), H(half, bottom),
    H(dir * 4, bottom + 8), H(-half, bottom), H(-half + dir * 4, 42),
  ], HAIR_SCRIBBLE * F.k));
  F.media.tone(sketch, hair, { style: 'scribble', angle: -0.25 });
  F.media.edge(sketch, [...hair, hair[0]!], F.lwMain);
}

export function drawHair(
  sketch: Sketch,
  F: VampireLayout,
  pose: VampirePose,
  options: VampireHairOptions = {},
): void {
  const flare = options.flare ?? 1;
  const offset = options.offset ?? { x: 0, y: 0 };
  const H = (x: number, y: number): Point => {
    const point = F.head(x, y);
    return { x: point.x + offset.x, y: point.y + offset.y };
  };
  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const hair = sketch.smooth(sketch.jitterRing([
      H(-dir * 8, 24),
      H(dir * 18, 30),
      H(dir * 30, 46),
      H(dir * 18, 58),
      H(dir * 8, 66),
      H(-dir * 20, 62),
      H(-dir * 36 * flare, 48),
      H(-dir * 28, 34),
    ], HAIR_SCRIBBLE * F.k));
    F.media.tone(sketch, hair, { style: 'black' });
    sketch.broken(hair, F.lwMain);
    return;
  }

  if (pose.facing === 'rear') {
    const hair = sketch.smooth(sketch.jitterRing([
      H(0, 24),
      H(26 * flare, 32),
      H(34, 64),
      H(28, 108),
      H(0, 118),
      H(-28, 108),
      H(-34, 64),
      H(-26 * flare, 32),
    ], HAIR_SCRIBBLE * F.k));
    F.media.tone(sketch, hair, { style: 'black' });
    sketch.broken(hair, F.lwMain);
    return;
  }

  // A slicked-back black mass with two temple points and one deep widow peak. The reference image
  // supplied the hair grammar only; no silver streaks or copied costume details carry over.
  const hair = sketch.smooth(sketch.jitterRing([
    H(0, 24),
    H(22 * flare, 30),
    H(36 * flare, 48),
    H(28, 58),
    H(14, 64),
    H(6, 62),
    H(0, 82),
    H(-6, 62),
    H(-14, 64),
    H(-28, 58),
    H(-36 * flare, 48),
    H(-22 * flare, 30),
  ], HAIR_SCRIBBLE * F.k));
  F.media.tone(sketch, hair, { style: 'black', angle: -0.12 });
  sketch.broken(hair, F.lwMain);
}
