import type { Sketch } from '../sketch';
import { pt, type VampireLayout } from '../layout';
import type { VampirePose } from '../pose';

export function drawHair(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  const { cx, s, colors } = F;
  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const hair = sketch.smooth([
      pt(cx - dir * 8, F.L.hairY),
      pt(cx + dir * 10, 34),
      pt(cx + dir * 20, 56),
      pt(cx + dir * 8, 68),
      pt(cx, 72),
      pt(cx - dir * 16, 58),
      pt(cx - dir * 18, 40),
    ]);
    sketch.fill(hair, colors.hair, 0.96);
    sketch.broken(hair, F.lwMain);
    return;
  }

  if (pose.facing === 'rear') {
    const hair = sketch.smooth([
      pt(cx, F.L.hairY - 2),
      pt(cx + 22, 38),
      pt(cx + 30, 70),
      pt(cx + 18, 96),
      pt(cx, 104),
      pt(cx - 18, 96),
      pt(cx - 30, 70),
      pt(cx - 22, 38),
    ]);
    sketch.fill(hair, colors.hair, 0.96);
    sketch.broken(hair, F.lwMain);
    return;
  }

  const hair = sketch.smooth([
    pt(cx, F.L.hairY),
    pt(cx + 18, 36),
    pt(cx + 28, 52),
    pt(cx + 22, 64),
    pt(cx + 8, 56),
    pt(cx, 70),
    pt(cx - 8, 56),
    pt(cx - 22, 64),
    pt(cx - 28, 52),
    pt(cx - 18, 36),
  ]);
  sketch.fill(hair, colors.hair, 0.96);
  sketch.fill(sketch.blobPts(cx - 12, 48, s * 0.16, s * 0.12, 0.2, 0.5), colors.hairEdge, 0.42);
  sketch.broken(hair, F.lwMain);
}
