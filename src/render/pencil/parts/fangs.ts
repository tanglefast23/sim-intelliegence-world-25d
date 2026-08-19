import type { Sketch } from '../sketch';
import type { VampireLayout } from '../layout';
import type { VampirePose } from '../pose';

/**
 * A mouth, with the fangs hanging out of it.
 *
 * The first version drew bare white triangles on the skin with no mouth behind them. Front-on they
 * read as two loose teeth; in profile the single triangle read as a long hanging nose. A fang only
 * says "vampire" when it is clearly coming out of a mouth, so the dark mouth is drawn first and the
 * fangs hang from its lower edge.
 */
export function drawFangs(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  if (pose.facing === 'rear') return;
  const { colors } = F;

  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const mouth = sketch.smooth([
      F.head(dir * 12, 103), F.head(dir * 27, 104),
      F.head(dir * 26, 111), F.head(dir * 12, 109),
    ]);
    sketch.fill(mouth, colors.hollow, 0.92);
    sketch.broken(mouth, F.lwThin * 1.4);
    const fang = [F.head(dir * 20, 109), F.head(dir * 23, 120), F.head(dir * 25, 108)];
    sketch.fill(fang, colors.fang, 1);
    sketch.broken(fang, F.lwThin * 1.1);
    return;
  }

  const mouth = sketch.smooth([
    F.head(-11, 103), F.head(11, 103),
    F.head(9, 112), F.head(-9, 112),
  ]);
  sketch.fill(mouth, colors.hollow, 0.92);
  sketch.broken(mouth, F.lwThin * 1.4);
  const left = [F.head(-8, 108), F.head(-5, 119), F.head(-2, 107)];
  const right = [F.head(2, 107), F.head(5, 119), F.head(8, 108)];
  sketch.fill(left, colors.fang, 1);
  sketch.fill(right, colors.fang, 1);
  sketch.broken(left, F.lwThin * 1.1);
  sketch.broken(right, F.lwThin * 1.1);
}
