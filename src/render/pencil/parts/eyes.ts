import type { Sketch } from '../sketch';
import type { VampireLayout } from '../layout';
import type { VampirePose } from '../pose';

/**
 * Big pupils, per the reference's eye language.
 *
 * Its creatures carry large dark pupils with a white glint, and that is most of their charm. The
 * first version drew small red-ringed blobs, which read as sore eyes rather than eyes. The red
 * stays — it is the vampire's identity — but as an iris around a big dark pupil.
 */
export function drawEyes(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  if (pose.facing === 'rear') return;
  const { cx, hs, colors } = F;
  const y = F.L.eyeY;

  const eye = (ex: number, scale: number): void => {
    F.media.skin(sketch, sketch.blobPts(ex, y, 8 * hs * scale, 6.2 * hs * scale, 0, 0.2), colors.white, {
      paper: false, underdraw: false, alpha: 0.92,
    });
    F.media.skin(sketch, sketch.blobPts(ex, y + 0.4 * hs, 3.8 * hs * scale, 4.1 * hs * scale, 0, 0.12), colors.red, {
      paper: false, underdraw: false, alpha: 0.7,
    });
    F.media.skin(sketch, sketch.blobPts(ex, y + 0.6 * hs, 2.3 * hs * scale, 2.6 * hs * scale, 0, 0.1), colors.hair, {
      paper: false, underdraw: false, alpha: 0.95,
    });
    F.media.skin(sketch, sketch.blobPts(ex, y + 6.2 * hs, 6 * hs * scale, 1.8 * hs, 0.08, 0.45), colors.ash, {
      paper: false, underdraw: false, alpha: 0.34,
    });
    // A 2px glint; one pixel vanished at play zoom.
    sketch.put(ex - 1.2 * hs, y - 0.9 * hs, colors.white[0], colors.white[1], colors.white[2], 0.95);
    sketch.put(ex - 1.2 * hs + 1, y - 0.9 * hs, colors.white[0], colors.white[1], colors.white[2], 0.85);
  };

  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const ex = cx + dir * 5 * hs;
    eye(ex, 0.85);
    sketch.sline([F.head(dir * 5 - 5, 75), F.head(dir * 5 + 5, 72)], F.lwMain, 0.7);
    return;
  }

  for (const side of [-1, 1] as const) {
    const ex = cx + F.L.eyeX(side);
    eye(ex, 1);
    sketch.sline([F.head(side * 12 - 6, 74), F.head(side * 12 + 6, 72)], F.lwMain, 0.7);
  }
}
