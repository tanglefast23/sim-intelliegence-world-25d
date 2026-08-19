import type { Sketch } from '../sketch';
import { pt, type VampireLayout } from '../layout';
import { gaitSwing, type VampirePose } from '../pose';

export function drawArms(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  const { cx, colors } = F;
  const swing = gaitSwing(pose.gait);

  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const handX = cx + dir * 8 - swing * 0.7;
    sketch.broken([
      pt(cx + dir * 6, F.B.shoulderY),
      pt(cx + dir * 4 - swing * 0.4, 178),
      pt(handX, 214),
    ], F.lwMain);
    sketch.fill(sketch.blobPts(handX, 218, 7, 7, 0, 0.35), colors.pale, 0.94);
    return;
  }

  sketch.broken([
    pt(cx - 14, F.B.shoulderY), pt(cx - 34, 178), pt(cx - 30 - swing * 0.45, 212),
  ], F.lwMain);
  sketch.broken([
    pt(cx + 14, F.B.shoulderY), pt(cx + 34, 178), pt(cx + 30 + swing * 0.45, 212),
  ], F.lwMain);
  sketch.fill(sketch.blobPts(cx - 30 - swing * 0.45, 216, 8, 8, 0, 0.35), colors.pale, 0.94);
  sketch.fill(sketch.blobPts(cx + 30 + swing * 0.45, 216, 8, 8, 0, 0.35), colors.pale, 0.94);
}
