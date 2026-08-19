import type { Sketch } from '../sketch';
import type { VampireLayout } from '../layout';
import type { VampirePose } from '../pose';

export function drawEyes(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  if (pose.facing === 'rear') return;
  const { cx, hs, colors } = F;
  const y = F.L.eyeY;

  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const ex = cx + dir * 5 * hs;
    sketch.fill(sketch.blobPts(ex, y, 6 * hs, 6 * hs, 0, 0.2), colors.hollow, 0.82);
    sketch.fill(sketch.blobPts(ex, y, 4.6 * hs, 3.6 * hs, 0, 0.15), colors.white, 0.72);
    sketch.fill(sketch.blobPts(ex + dir * hs, y + hs, 1.8 * hs, 2.2 * hs, 0, 0.1), colors.red, 1);
    sketch.sline([F.head(dir * 5 - 7, 75), F.head(dir * 5 + 7, 72)], F.lwMain, 0.78);
    return;
  }

  for (const side of [-1, 1] as const) {
    const ex = cx + F.L.eyeX(side);
    sketch.fill(sketch.blobPts(ex, y, 8 * hs, 7 * hs, 0, 0.25), colors.hollow, 0.82);
    sketch.fill(sketch.blobPts(ex, y, 6.2 * hs, 4.4 * hs, 0, 0.2), colors.white, 0.72);
    sketch.fill(sketch.blobPts(ex + side * hs, y + hs, 2.1 * hs, 2.5 * hs, 0, 0.1), colors.red, 1);
    sketch.sline([F.head(side * 12 - 8, 74), F.head(side * 12 + 8, 72)], F.lwMain, 0.78);
  }
}
