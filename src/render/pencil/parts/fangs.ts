import type { Sketch } from '../sketch';
import type { VampireLayout } from '../layout';
import type { VampirePose } from '../pose';

export function drawFangs(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  if (pose.facing === 'rear') return;
  const { colors } = F;

  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const fang = [F.head(dir * 17, 104), F.head(dir * 21, 122), F.head(dir * 25, 104)];
    sketch.sline([F.head(dir * 14, 103), F.head(dir * 28, 106)], F.lwThin * 1.5, 0.72);
    sketch.fill(fang, colors.fang, 1);
    sketch.broken(fang, F.lwThin * 1.2);
    return;
  }

  sketch.sline([F.head(-9, 104), F.head(9, 104)], F.lwThin * 1.5, 0.72);
  const left = [F.head(-9, 104), F.head(-3, 124), F.head(1, 104)];
  const right = [F.head(2, 104), F.head(8, 124), F.head(12, 104)];
  sketch.fill(left, colors.fang, 1);
  sketch.fill(right, colors.fang, 1);
  sketch.broken(left, F.lwThin * 1.2);
  sketch.broken(right, F.lwThin * 1.2);
  sketch.sline([F.head(-10, 104), F.head(12, 104)], F.lwThin, 0.6);
}
