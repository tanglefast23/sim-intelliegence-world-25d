import type { Sketch } from '../sketch';
import { pt, type VampireLayout } from '../layout';
import type { VampirePose } from '../pose';

export function drawEars(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  const { cx, colors } = F;
  const y = F.L.earY;
  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'left' ? -1 : 1;
    const ear = [pt(cx - dir * 8, y), pt(cx - dir * 34, y - 20), pt(cx - dir * 6, y + 16)];
    sketch.fill(ear, colors.pale, 0.96);
    sketch.sline([pt(cx - dir * 10, y + 2), pt(cx - dir * 26, y - 10)], F.lwThin, 0.5);
    sketch.broken(ear, F.lwThin * 1.4);
    return;
  }

  const left = [pt(cx - 26, y), pt(cx - 48, y - 18), pt(cx - 28, y + 18)];
  const right = [pt(cx + 26, y), pt(cx + 48, y - 18), pt(cx + 28, y + 18)];
  sketch.fill(left, colors.pale, 0.96);
  sketch.fill(right, colors.pale, 0.96);
  sketch.sline([pt(cx - 30, y + 2), pt(cx - 42, y - 10)], F.lwThin, 0.5);
  sketch.sline([pt(cx + 30, y + 2), pt(cx + 42, y - 10)], F.lwThin, 0.5);
  sketch.broken(left, F.lwThin * 1.4);
  sketch.broken(right, F.lwThin * 1.4);
}
