import type { VampireLayout } from '../layout';
import { gaitSwing, type VampirePose } from '../pose';
import type { Point, Sketch } from '../sketch';

type Rgb = readonly [number, number, number];

function clothMass(
  sketch: Sketch,
  F: VampireLayout,
  points: readonly Point[],
  color: Rgb,
  angle = 0.45,
  smooth = true,
): void {
  const shape = smooth ? sketch.smooth(points) : points;
  F.media.tone(sketch, shape, { style: 'light', angle });
  F.media.skin(sketch, shape, color, { paper: false, underdraw: false, alpha: 0.86 });
  F.media.edge(sketch, [...shape, shape[0]!], F.lwMain);
}

export function drawCloak(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  const { colors } = F;
  const sway = pose.moving ? gaitSwing(pose.gait) * 0.25 : 0;

  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    clothMass(sketch, F, [
      F.body(-dir * 5, 124), F.body(-dir * 22, 132), F.body(-dir * 42, 178),
      F.body(-dir * 44 + sway, 232), F.body(-dir * 30 + sway, 270),
      F.body(-dir * 12, 244), F.body(-dir * 7, 166),
    ], colors.cloak);
    clothMass(sketch, F, [
      F.body(-dir * 5, 128), F.body(dir * 11, 134),
      F.body(dir * 16, 198), F.body(-dir * 9, 198),
    ], colors.shirt, -0.35);
    clothMass(sketch, F, [
      F.body(-dir * 8, 136), F.body(-dir * 15, 150),
      F.body(-dir * 13, 226), F.body(-dir * 7, 210),
    ], colors.lining, -0.55);
    return;
  }

  if (pose.facing === 'rear') {
    clothMass(sketch, F, [
      F.body(-18, 124), F.body(18, 124), F.body(48 + sway, 186),
      F.body(44 + sway, 236), F.body(18, 250), F.body(0, 246), F.body(-18, 250),
      F.body(-44 - sway, 236), F.body(-48 - sway, 186),
    ], colors.cloak);
    F.media.edge(sketch, [F.body(0, 132), F.body(0, 252)], F.lwThin * 1.3);
    return;
  }

  clothMass(sketch, F, [
    F.body(-8, 124), F.body(-34, 132), F.body(-52, 174), F.body(-52 + sway, 228),
    F.body(-40 + sway, 250), F.body(-27 + sway, 270), F.body(-20, 236), F.body(-18, 166),
  ], colors.cloak);
  clothMass(sketch, F, [
    F.body(8, 124), F.body(34, 132), F.body(52, 174), F.body(52 + sway, 228),
    F.body(40 + sway, 250), F.body(27 + sway, 270), F.body(20, 236), F.body(18, 166),
  ], colors.cloak);
  clothMass(sketch, F, [
    F.body(-18, 132), F.body(0, 150), F.body(18, 132),
    F.body(20, 206), F.body(-20, 206),
  ], colors.shirt, -0.35);
  for (const y of [168, 190]) {
    const button = F.body(0, y);
    F.media.skin(sketch, sketch.blobPts(button.x, button.y, 1.4, 1.4, 0, 0.2), colors.lining, {
      paper: false,
      underdraw: false,
      alpha: 0.9,
    });
  }
  clothMass(sketch, F, [
    F.body(-16, 140), F.body(-21, 154), F.body(-20, 228), F.body(-16, 210),
  ], colors.lining, -0.55);
  clothMass(sketch, F, [
    F.body(16, 140), F.body(21, 154), F.body(20, 228), F.body(16, 210),
  ], colors.lining, 0.55);
}

export function drawCollar(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    clothMass(sketch, F, [
      F.body(-dir * 6, 124), F.body(-dir * 38, 136),
      F.head(-dir * 34, 101), F.head(-dir * 27, 118),
    ], F.colors.cloakLift, -dir * 0.25, false);
    return;
  }

  for (const side of [-1, 1] as const) {
    clothMass(sketch, F, [
      F.body(side * 8, 124), F.body(side * 40, 136),
      F.head(side * 34, pose.facing === 'rear' ? 98 : 101), F.head(side * 27, 118),
    ], F.colors.cloakLift, side * 0.25, false);
  }
}
