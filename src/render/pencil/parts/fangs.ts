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
      F.head(dir * 14, 104), F.head(dir * 25, 105),
      F.head(dir * 24, 110), F.head(dir * 14, 109),
    ]);
    F.media.skin(sketch, mouth, colors.hollow, { paper: false, underdraw: false, alpha: 0.85 });
    sketch.broken(mouth, F.lwThin * 1.4);
    const fang = [F.head(dir * 19, 108), F.head(dir * 21, 116), F.head(dir * 23, 108)];
    F.media.skin(sketch, fang, colors.fang, { paper: false, underdraw: false, alpha: 1 });
    sketch.broken(fang, F.lwThin * 1.1);
    return;
  }

  const mouth = sketch.smooth([
    F.head(-8, 104), F.head(8, 104),
    F.head(6, 109), F.head(-6, 109),
  ]);
  F.media.skin(sketch, mouth, colors.hollow, { paper: false, underdraw: false, alpha: 0.85 });
  sketch.broken(mouth, F.lwThin * 1.4);
  const left = [F.head(-6, 107), F.head(-4, 114), F.head(-2, 107)];
  const right = [F.head(2, 107), F.head(4, 114), F.head(6, 107)];
  F.media.skin(sketch, left, colors.fang, { paper: false, underdraw: false, alpha: 1 });
  F.media.skin(sketch, right, colors.fang, { paper: false, underdraw: false, alpha: 1 });
  sketch.broken(left, F.lwThin * 1.1);
  sketch.broken(right, F.lwThin * 1.1);
}
