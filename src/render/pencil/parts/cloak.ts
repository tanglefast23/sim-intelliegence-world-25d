import type { Sketch } from '../sketch';
import type { VampireLayout } from '../layout';
import { gaitSwing, type VampirePose } from '../pose';

export function drawCloak(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  const { colors } = F;
  const sway = pose.moving ? gaitSwing(pose.gait) * 0.35 : 0;

  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const wing = sketch.smooth([
      F.body(-dir * 6, 124),
      F.body(-dir * 18, 132),
      F.body(-dir * 52, 176),
      F.body(-dir * 64 + sway, 250),
      F.body(-dir * 40 + sway, 328),
      F.body(-dir * 8, 250),
      F.body(-dir * 4, 166),
    ]);
    F.media.tone(sketch, wing, { style: 'black', angle: 0.45 });
    F.media.skin(sketch, sketch.smooth([
      F.body(-dir * 20, 160),
      F.body(-dir * 46, 230),
      F.body(-dir * 28, 300),
      F.body(-dir * 10, 180),
    ]), colors.lining, { paper: false, underdraw: false, alpha: 0.3 });
    sketch.broken(wing, F.lwMain);
    const collar = [F.body(-dir * 2, 118), F.body(-dir * 22, 84), F.body(-dir * 10, 126)];
    F.media.tone(sketch, collar, { style: 'black', angle: 0.45 });
    sketch.broken(collar, F.lwThin * 1.6);
    const chest = sketch.smooth([
      F.body(-8, 132), F.body(8, 132), F.body(9, 198), F.body(-9, 198),
    ]);
    F.media.tone(sketch, chest, { style: 'hatch' });
    F.media.skin(sketch, chest, colors.cloakLift, { paper: false, underdraw: false, alpha: 0.45 });
    sketch.broken(chest, F.lwMain);
    return;
  }

  if (pose.facing === 'rear') {
    const back = sketch.smooth([
      F.body(-18, 124), F.body(18, 124),
      F.body(62 + sway, 190), F.body(56 + sway, 254),
      F.body(0, 272),
      F.body(-56 - sway, 254), F.body(-62 - sway, 190),
    ]);
    F.media.tone(sketch, back, { style: 'black', angle: 0.45 });
    sketch.broken(back, F.lwMain);
    return;
  }

  const left = sketch.smooth([
    F.body(-8, 124), F.body(-42, 132), F.body(-68, 172), F.body(-72 + sway, 238),
    F.body(-54 + sway, 250), F.body(-30 + sway, 268), F.body(-16, 236), F.body(-10, 166),
  ]);
  const right = sketch.smooth([
    F.body(8, 124), F.body(42, 132), F.body(68, 172), F.body(72 + sway, 238),
    F.body(54 + sway, 250), F.body(30 + sway, 268), F.body(16, 236), F.body(10, 166),
  ]);
  F.media.tone(sketch, left, { style: 'black', angle: 0.45 });
  F.media.tone(sketch, right, { style: 'black', angle: 0.45 });
  F.media.skin(sketch, sketch.smooth([
    F.body(-44, 158), F.body(-60, 214), F.body(-40, 248), F.body(-22, 178),
  ]), colors.lining, { paper: false, underdraw: false, alpha: 0.3 });
  sketch.broken(left, F.lwMain);
  sketch.broken(right, F.lwMain);
  const leftCollar = [F.body(-4, 118), F.body(-28, 82), F.body(-18, 124)];
  const rightCollar = [F.body(4, 118), F.body(28, 82), F.body(18, 124)];
  F.media.tone(sketch, leftCollar, { style: 'black', angle: 0.45 });
  F.media.tone(sketch, rightCollar, { style: 'black', angle: 0.45 });
  sketch.broken(leftCollar, F.lwThin * 1.6);
  sketch.broken(rightCollar, F.lwThin * 1.6);
  const chest = sketch.smooth([
    F.body(-12, 132), F.body(12, 132), F.body(14, 198), F.body(-14, 198),
  ]);
  F.media.tone(sketch, chest, { style: 'hatch' });
  F.media.skin(sketch, chest, colors.cloakLift, { paper: false, underdraw: false, alpha: 0.45 });
  sketch.broken(chest, F.lwMain);
}
