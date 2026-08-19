import type { Sketch } from '../sketch';
import { pt, type VampireLayout } from '../layout';
import type { VampirePose } from '../pose';

export function drawFangs(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  if (pose.facing === 'rear') return;
  const { cx, colors } = F;
  const y = F.L.my;

  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const fang = [pt(cx + dir * 4, y), pt(cx + dir * 8, y + 18), pt(cx + dir * 12, y)];
    sketch.sline([pt(cx + dir * 2, y), pt(cx + dir * 14, y)], F.lwThin * 1.5, 0.72);
    sketch.fill(fang, colors.fang, 1);
    sketch.broken(fang, F.lwThin * 1.2);
    return;
  }

  sketch.sline([pt(cx - 9, y), pt(cx + 9, y)], F.lwThin * 1.5, 0.72);
  const left = [pt(cx - 9, y), pt(cx - 3, y + 20), pt(cx + 1, y)];
  const right = [pt(cx + 2, y), pt(cx + 8, y + 20), pt(cx + 12, y)];
  sketch.fill(left, colors.fang, 1);
  sketch.fill(right, colors.fang, 1);
  sketch.broken(left, F.lwThin * 1.2);
  sketch.broken(right, F.lwThin * 1.2);
  sketch.sline([pt(cx - 10, y), pt(cx + 12, y)], F.lwThin, 0.6);
}
