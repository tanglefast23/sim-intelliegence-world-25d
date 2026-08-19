import type { Sketch } from '../sketch';
import type { VampireLayout } from '../layout';
import type { VampirePose } from '../pose';

export function drawHair(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  const { s, colors } = F;
  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const hair = sketch.smooth([
      F.head(-dir * 10, 28),
      F.head(dir * 14, 34),
      F.head(dir * 28, 56),
      F.head(dir * 12, 68),
      F.head(0, 72),
      F.head(-dir * 22, 58),
      F.head(-dir * 26, 40),
    ]);
    sketch.fill(hair, colors.hair, 0.96);
    sketch.broken(hair, F.lwMain);
    return;
  }

  if (pose.facing === 'rear') {
    const hair = sketch.smooth([
      F.head(0, 26),
      F.head(24, 38),
      F.head(32, 74),
      F.head(24, 106),
      F.head(0, 118),
      F.head(-24, 106),
      F.head(-32, 74),
      F.head(-24, 38),
    ]);
    sketch.fill(hair, colors.hair, 0.96);
    sketch.broken(hair, F.lwMain);
    return;
  }

  const hair = sketch.smooth([
    F.head(0, 28),
    F.head(18, 36),
    F.head(28, 52),
    F.head(22, 64),
    F.head(8, 56),
    F.head(0, 70),
    F.head(-8, 56),
    F.head(-22, 64),
    F.head(-28, 52),
    F.head(-18, 36),
  ]);
  sketch.fill(hair, colors.hair, 0.96);
  sketch.fill(
    sketch.blobPts(F.head(-12, 48).x, F.head(0, 48).y, s * 0.16, s * 0.12, 0.2, 0.5),
    colors.hairEdge,
    0.42,
  );
  sketch.broken(hair, F.lwMain);
}
