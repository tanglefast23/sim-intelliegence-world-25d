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
      F.head(dir * 13, 104), F.head(dir * 26, 104),
      F.head(dir * 25, 113), F.head(dir * 13, 113),
    ]);
    F.media.tone(sketch, mouth, { style: 'black', paper: false });
    F.media.skin(sketch, mouth, colors.hollow, { paper: false, underdraw: false, alpha: 0.95 });
    const fang = [F.head(dir * 16, 107), F.head(dir * 20, 113), F.head(dir * 24, 107)];
    F.media.skin(sketch, fang, colors.fang, { paper: false, underdraw: false, alpha: 1 });
    return;
  }

  const mouth = sketch.smooth([
    F.head(-10, 104), F.head(10, 104),
    F.head(9, 113), F.head(-9, 113),
  ]);
  F.media.tone(sketch, mouth, { style: 'black', paper: false });
  F.media.skin(sketch, mouth, colors.hollow, { paper: false, underdraw: false, alpha: 0.95 });
  const left = [F.head(-9, 107), F.head(-6, 113), F.head(-3, 107)];
  const right = [F.head(3, 107), F.head(6, 113), F.head(9, 107)];
  F.media.skin(sketch, left, colors.fang, { paper: false, underdraw: false, alpha: 1 });
  F.media.skin(sketch, right, colors.fang, { paper: false, underdraw: false, alpha: 1 });
}
