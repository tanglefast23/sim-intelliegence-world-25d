import type { Sketch } from '../sketch';
import type { VampireLayout } from '../layout';
import type { VampirePose } from '../pose';

/**
 * The skull, authored in head space and mapped by `F.head`.
 *
 * The side silhouette used to span -18..+22 while the front spanned -30..+30, so the head lost a
 * third of its width the moment he turned and the profile read as a thin man. Both facings now use
 * the same -30..+30 envelope; the profile only shifts its weight forward.
 */
export function drawSkull(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  const { s, colors } = F;
  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const skull = sketch.smooth([
      F.head(-dir * 8, 38),
      F.head(dir * 12, 48),
      F.head(dir * 30, 70),
      F.head(dir * 27, 102),
      F.head(dir * 16, 118),
      F.head(-dir * 8, 126),
      F.head(-dir * 26, 110),
      F.head(-dir * 28, 78),
      F.head(-dir * 14, 52),
    ]);
    sketch.fill(skull, colors.pale, 0.97);
    sketch.fill(sketch.blobPts(F.head(dir * 8, 96).x, F.head(0, 96).y, s * 0.14, s * 0.12, 0, 0.3), colors.ash, 0.4);
    sketch.broken(skull, F.lwMain);
    return;
  }

  const skull = sketch.smooth([
    F.head(0, 38),
    F.head(14, 46),
    F.head(26, 60),
    F.head(30, 82),
    F.head(22, 102),
    F.head(13, 116),
    F.head(0, 126),
    F.head(-13, 116),
    F.head(-22, 102),
    F.head(-30, 82),
    F.head(-26, 60),
    F.head(-14, 46),
  ]);
  sketch.fill(skull, colors.pale, 0.97);
  if (pose.facing === 'front') {
    sketch.fill(sketch.blobPts(F.head(12, 94).x, F.head(0, 94).y, s * 0.18, s * 0.14, 0.1, 0.35), colors.ash, 0.44);
    sketch.fill(sketch.blobPts(F.head(-12, 94).x, F.head(0, 94).y, s * 0.18, s * 0.14, -0.1, 0.35), colors.ash, 0.44);
  }
  sketch.broken(skull, F.lwMain);
}
