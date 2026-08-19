import type { Sketch } from '../sketch';
import type { VampireLayout } from '../layout';
import { gaitSwing, type VampirePose } from '../pose';

export function drawArms(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  const { colors } = F;
  const swing = pose.moving ? gaitSwing(pose.gait) : 0;

  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const hand = F.body(dir * 8 - swing * 0.7, 214);
    sketch.broken([
      F.body(dir * 6, 140),
      F.body(dir * 4 - swing * 0.4, 178),
      hand,
    ], F.lwMain);
    sketch.fill(sketch.blobPts(hand.x, hand.y + 4, 7, 7, 0, 0.55), colors.pale, 0.94);
    return;
  }

  // From behind the cape hangs closed over both arms. Drawing the pale hands there put the
  // front of the character on his back.
  if (pose.facing === 'rear') return;

  // Opposite phase, like the legs. The first version pushed both hands the same way along x, so
  // the arms opened and closed together and read as a shrug rather than a swing. A front view
  // cannot show an arm travelling forward, so the swing is carried on y: one hand rises as the
  // other drops, against the leg that is lifting.
  const sway = swing * 0.25;
  const leftHand = F.body(-30 + sway, 214 - swing * 0.4);
  const rightHand = F.body(30 + sway, 214 + swing * 0.4);
  sketch.broken([F.body(-14, 140), F.body(-34, 178), leftHand], F.lwMain);
  sketch.broken([F.body(14, 140), F.body(34, 178), rightHand], F.lwMain);
  sketch.fill(sketch.blobPts(leftHand.x, leftHand.y + 4, 8, 8, 0, 0.55), colors.pale, 0.94);
  sketch.fill(sketch.blobPts(rightHand.x, rightHand.y + 4, 8, 8, 0, 0.55), colors.pale, 0.94);
}
