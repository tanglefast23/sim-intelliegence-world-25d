import type { Sketch } from '../sketch';
import type { VampireLayout } from '../layout';
import type { VampirePose } from '../pose';

/**
 * A button nose.
 *
 * Without one the only thing on the lower face was a pair of white spikes, and in profile that
 * single spike read as a long hanging nose rather than a tooth. Giving him an actual nose lets the
 * fangs be fangs.
 *
 * **No outline.** A `broken` ring around the button draws a closed circle, which detaches it from
 * the face: front-on the pair read as spectacles, and in profile the nose floated off the edge as a
 * ball. The shape is carried by a shadow under it instead, so the fill merges into the skull.
 *
 * It sits at row 95, between the eyes at 85 and the mouth at 103. At 90 it overlapped the eye
 * blobs.
 */
export function drawNose(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  if (pose.facing === 'rear') return;
  const { hs, colors } = F;

  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    // Straddles the profile edge so it reads as a nose pushing out of the silhouette.
    const centre = F.head(dir * 27, 95);
    sketch.fill(sketch.blobPts(centre.x, centre.y, 7 * hs, 5.5 * hs, 0, 0.28), colors.pale, 1);
    sketch.fill(
      sketch.blobPts(centre.x - dir * 1.5 * hs, centre.y + 3 * hs, 4.5 * hs, 2 * hs, 0, 0.7),
      colors.ash,
      0.42,
    );
    return;
  }

  const centre = F.head(0, 95);
  sketch.fill(sketch.blobPts(centre.x, centre.y, 5.5 * hs, 4.5 * hs, 0, 0.28), colors.pale, 1);
  sketch.fill(
    sketch.blobPts(centre.x, centre.y + 2.6 * hs, 4 * hs, 1.8 * hs, 0, 0.7),
    colors.ash,
    0.42,
  );
}
