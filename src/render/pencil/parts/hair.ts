import type { Sketch } from '../sketch';
import type { VampireLayout } from '../layout';
import type { VampirePose } from '../pose';

/**
 * Hair is a scribbled mass, not a slow line.
 *
 * Kindergrimm treats wobble as a statement about the hand — an eye at ~.4, a scribbled mass at 1.
 * Every shape here was drawn at .1-.5, so the hair was as careful as the pupils.
 */
const HAIR_SCRIBBLE = 5;

export function drawHair(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const hair = sketch.smooth(sketch.jitterRing([
      F.head(-dir * 8, 24),
      F.head(dir * 18, 30),
      F.head(dir * 30, 46),
      F.head(dir * 18, 58),
      F.head(dir * 8, 66),
      F.head(-dir * 20, 62),
      F.head(-dir * 36, 48),
      F.head(-dir * 28, 34),
    ], HAIR_SCRIBBLE * F.k));
    F.media.tone(sketch, hair, { style: 'black' });
    sketch.broken(hair, F.lwMain);
    return;
  }

  if (pose.facing === 'rear') {
    const hair = sketch.smooth(sketch.jitterRing([
      F.head(0, 24),
      F.head(26, 32),
      F.head(34, 64),
      F.head(26, 100),
      F.head(0, 116),
      F.head(-26, 100),
      F.head(-34, 64),
      F.head(-26, 32),
    ], HAIR_SCRIBBLE * F.k));
    F.media.tone(sketch, hair, { style: 'black' });
    sketch.broken(hair, F.lwMain);
    return;
  }

  // A slicked-back black mass with two temple points and one deep widow peak. The reference image
  // supplied the hair grammar only; no silver streaks or copied costume details carry over.
  const hair = sketch.smooth(sketch.jitterRing([
    F.head(0, 24),
    F.head(22, 30),
    F.head(36, 48),
    F.head(28, 58),
    F.head(14, 64),
    F.head(6, 62),
    F.head(0, 82),
    F.head(-6, 62),
    F.head(-14, 64),
    F.head(-28, 58),
    F.head(-36, 48),
    F.head(-22, 30),
  ], HAIR_SCRIBBLE * F.k));
  F.media.tone(sketch, hair, { style: 'black', angle: -0.12 });
  sketch.broken(hair, F.lwMain);
}
