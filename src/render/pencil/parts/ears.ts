import type { Sketch } from '../sketch';
import type { VampireLayout } from '../layout';
import type { VampirePose } from '../pose';

export function drawEars(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  const { colors } = F;
  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'left' ? -1 : 1;
    const ear = [F.head(-dir * 12, 64), F.head(-dir * 32, 50), F.head(-dir * 10, 78)];
    F.media.skin(sketch, ear, colors.pale, { alpha: 0.35 });
    sketch.sline([F.head(-dir * 14, 66), F.head(-dir * 26, 58)], F.lwThin, 0.5);
    sketch.broken(ear, F.lwThin * 1.4);
    return;
  }

  const left = [F.head(-25, 64), F.head(-38, 50), F.head(-26, 80)];
  const right = [F.head(25, 64), F.head(38, 50), F.head(26, 80)];
  F.media.skin(sketch, left, colors.pale, { alpha: 0.35 });
  F.media.skin(sketch, right, colors.pale, { alpha: 0.35 });
  sketch.sline([F.head(-27, 66), F.head(-35, 57)], F.lwThin, 0.5);
  sketch.sline([F.head(27, 66), F.head(35, 57)], F.lwThin, 0.5);
  sketch.broken(left, F.lwThin * 1.4);
  sketch.broken(right, F.lwThin * 1.4);
}
