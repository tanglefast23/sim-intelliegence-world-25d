import type { Sketch } from '../sketch';
import { pt, type VampireLayout } from '../layout';
import type { VampirePose } from '../pose';

export function drawEyes(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  if (pose.facing === 'rear') return;
  const { cx, colors } = F;
  const y = F.L.eyeY;

  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const ex = cx + dir * 8;
    sketch.fill(sketch.blobPts(ex, y, 6, 6, 0, 0.2), colors.hollow, 0.82);
    sketch.fill(sketch.blobPts(ex, y, 4.6, 3.6, 0, 0.15), colors.white, 0.72);
    sketch.fill(sketch.blobPts(ex + dir, y + 1, 1.8, 2.2, 0, 0.1), colors.red, 1);
    sketch.sline([pt(ex - 6, y - 10), pt(ex + 6, y - 12)], F.lwMain, 0.78);
    return;
  }

  for (const side of [-1, 1] as const) {
    const ex = cx + F.L.eyeX(side);
    sketch.fill(sketch.blobPts(ex, y, 8, 7, 0, 0.25), colors.hollow, 0.82);
    sketch.fill(sketch.blobPts(ex, y, 6.2, 4.4, 0, 0.2), colors.white, 0.72);
    sketch.fill(sketch.blobPts(ex + side, y + 1, 2.1, 2.5, 0, 0.1), colors.red, 1);
    sketch.sline([pt(ex - 8, y - 11), pt(ex + 8, y - 13)], F.lwMain, 0.78);
  }
}
