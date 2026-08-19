import type { Sketch } from '../sketch';
import type { VampireLayout } from '../layout';
import { headRingPoints, toHeadPoints } from '../head-shape';
import type { VampirePose } from '../pose';

/**
 * The skull, built from `F.shape` rather than a hardcoded polygon.
 *
 * The ring is smoothed twice, like the reference, and slid most of the way onto the shape's target
 * radius. Changing a character's whole silhouette is now one word in the layout.
 *
 * The side view uses the same ring with `profileDir`, so a square head stays square in profile. The
 * hand-authored side polygon it replaced spanned `-18..+22` against a front `-30..+30`, which is
 * why he used to lose a third of his head width the moment he turned.
 */
export function drawSkull(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  const { s, colors } = F;
  const profileDir = pose.facing === 'right' ? 1 : pose.facing === 'left' ? -1 : 0;
  const ring = toHeadPoints(headRingPoints(F.shape, { profileDir }), F.head);
  const skull = sketch.smooth(sketch.smooth(ring));
  F.media.skin(sketch, skull, colors.pale, { alpha: 0.3 });

  if (profileDir !== 0) {
    F.media.skin(sketch, sketch.blobPts(F.head(profileDir * 8, 96).x, F.head(0, 96).y, s * 0.14, s * 0.12, 0, 0.75), colors.ash, { paper: false, underdraw: false, alpha: 0.3 });
  } else if (pose.facing === 'front') {
    F.media.skin(sketch, sketch.blobPts(F.head(12, 94).x, F.head(0, 94).y, s * 0.18, s * 0.14, 0.1, 0.8), colors.ash, { paper: false, underdraw: false, alpha: 0.3 });
    F.media.skin(sketch, sketch.blobPts(F.head(-12, 94).x, F.head(0, 94).y, s * 0.18, s * 0.14, -0.1, 0.8), colors.ash, { paper: false, underdraw: false, alpha: 0.3 });
  }
  sketch.broken(skull, F.lwMain);
}
