import type { Sketch } from '../sketch';
import { pt, type VampireLayout } from '../layout';
import { gaitSwing, type VampirePose } from '../pose';

export function drawLegs(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  const { cx, colors } = F;
  const swing = gaitSwing(pose.gait);

  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const front = swing * dir;
    const back = -swing * dir;
    const frontLeg = sketch.smooth([
      pt(cx - 3, F.B.hipY), pt(cx + 3, F.B.hipY),
      pt(cx + front + 4, F.B.floorY + 4), pt(cx + front - 4, F.B.floorY + 4),
    ]);
    const backLeg = sketch.smooth([
      pt(cx - 3, F.B.hipY), pt(cx + 3, F.B.hipY),
      pt(cx + back + 4, F.B.floorY), pt(cx + back - 4, F.B.floorY),
    ]);
    sketch.fill(backLeg, colors.cloak, 0.86);
    sketch.fill(frontLeg, colors.cloak, 0.92);
    sketch.broken(backLeg, F.lwMain);
    sketch.broken(frontLeg, F.lwMain);
    sketch.fill(sketch.smooth([
      pt(cx + front - 8, F.B.bootY + 2), pt(cx + front + 10, F.B.bootY + 2),
      pt(cx + front + 12, F.B.bootY + 18), pt(cx + front - 8, F.B.bootY + 18),
    ]), colors.hair, 0.94);
    return;
  }

  const leftX = swing * 0.35;
  const rightX = -swing * 0.35;
  const leftDown = pose.gait === 0 ? 6 : 0;
  const rightDown = pose.gait === 1 ? 6 : 0;
  const left = sketch.smooth([
    pt(cx - F.B.hipX, F.B.hipY), pt(cx - 1, F.B.hipY),
    pt(cx - 2 + leftX, F.B.floorY + leftDown), pt(cx - 10 + leftX, F.B.floorY + leftDown),
  ]);
  const right = sketch.smooth([
    pt(cx + 1, F.B.hipY), pt(cx + F.B.hipX, F.B.hipY),
    pt(cx + 10 + rightX, F.B.floorY + rightDown), pt(cx + 2 + rightX, F.B.floorY + rightDown),
  ]);
  sketch.fill(left, colors.cloak, 0.9);
  sketch.fill(right, colors.cloak, 0.9);
  sketch.broken(left, F.lwMain);
  sketch.broken(right, F.lwMain);
  sketch.fill(sketch.smooth([
    pt(cx - 12 + leftX, F.B.bootY + leftDown), pt(cx - 1 + leftX, F.B.bootY + leftDown),
    pt(cx - 1 + leftX, F.B.bootY + 18 + leftDown), pt(cx - 14 + leftX, F.B.bootY + 18 + leftDown),
  ]), colors.hair, 0.94);
  sketch.fill(sketch.smooth([
    pt(cx + 1 + rightX, F.B.bootY + rightDown), pt(cx + 12 + rightX, F.B.bootY + rightDown),
    pt(cx + 14 + rightX, F.B.bootY + 18 + rightDown), pt(cx + 1 + rightX, F.B.bootY + 18 + rightDown),
  ]), colors.hair, 0.94);
}
