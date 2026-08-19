import type { Sketch } from '../sketch';
import { pt, type VampireLayout } from '../layout';
import { gaitSwing, type VampirePose } from '../pose';

export function drawCloak(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  const { cx, colors } = F;
  const sway = gaitSwing(pose.gait) * 0.35;

  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const wing = sketch.smooth([
      pt(cx - dir * 6, 124),
      pt(cx - dir * 18, 132),
      pt(cx - dir * 52, 176),
      pt(cx - dir * 64 + sway, 250),
      pt(cx - dir * 40 + sway, 328),
      pt(cx - dir * 8, 250),
      pt(cx - dir * 4, 166),
    ]);
    sketch.fill(wing, colors.cloak, 0.92);
    sketch.fill(sketch.smooth([
      pt(cx - dir * 20, 160),
      pt(cx - dir * 46, 230),
      pt(cx - dir * 28, 300),
      pt(cx - dir * 10, 180),
    ]), colors.lining, 0.34);
    sketch.broken(wing, F.lwMain);
    const collar = [pt(cx - dir * 2, 118), pt(cx - dir * 22, 84), pt(cx - dir * 10, 126)];
    sketch.fill(collar, colors.cloak, 0.96);
    sketch.broken(collar, F.lwThin * 1.6);
    const chest = sketch.smooth([
      pt(cx - 8, 132), pt(cx + 8, 132), pt(cx + 9, F.B.hipY), pt(cx - 9, F.B.hipY),
    ]);
    sketch.fill(chest, colors.cloakLift, 0.82);
    sketch.broken(chest, F.lwMain);
    return;
  }

  if (pose.facing === 'rear') {
    const back = sketch.smooth([
      pt(cx - 18, 124), pt(cx + 18, 124),
      pt(cx + 62 + sway, 190), pt(cx + 58 + sway, 320),
      pt(cx, 338),
      pt(cx - 58 - sway, 320), pt(cx - 62 - sway, 190),
    ]);
    sketch.fill(back, colors.cloak, 0.94);
    sketch.broken(back, F.lwMain);
    return;
  }

  const left = sketch.smooth([
    pt(cx - 8, 124), pt(cx - 42, 132), pt(cx - 68, 172), pt(cx - 72 + sway, 238),
    pt(cx - 54 + sway, F.B.bootY + 18), pt(cx - 28 + sway, 330), pt(cx - 14, 256), pt(cx - 10, 166),
  ]);
  const right = sketch.smooth([
    pt(cx + 8, 124), pt(cx + 42, 132), pt(cx + 68, 172), pt(cx + 72 + sway, 238),
    pt(cx + 54 + sway, F.B.bootY + 18), pt(cx + 28 + sway, 330), pt(cx + 14, 256), pt(cx + 10, 166),
  ]);
  sketch.fill(left, colors.cloak, 0.9);
  sketch.fill(right, colors.cloak, 0.9);
  sketch.fill(sketch.smooth([
    pt(cx - 44, 158), pt(cx - 62, 224), pt(cx - 40, 292), pt(cx - 22, 178),
  ]), colors.lining, 0.32);
  sketch.broken(left, F.lwMain);
  sketch.broken(right, F.lwMain);
  const leftCollar = [pt(cx - 4, 118), pt(cx - 28, 82), pt(cx - 18, 124)];
  const rightCollar = [pt(cx + 4, 118), pt(cx + 28, 82), pt(cx + 18, 124)];
  sketch.fill(leftCollar, colors.cloak, 0.96);
  sketch.fill(rightCollar, colors.cloak, 0.96);
  sketch.broken(leftCollar, F.lwThin * 1.6);
  sketch.broken(rightCollar, F.lwThin * 1.6);
  const chest = sketch.smooth([
    pt(cx - 12, 132), pt(cx + 12, 132), pt(cx + 14, F.B.hipY), pt(cx - 14, F.B.hipY),
  ]);
  sketch.fill(chest, colors.cloakLift, 0.82);
  sketch.broken(chest, F.lwMain);
}
