import type { Sketch } from '../sketch';
import type { VampireLayout } from '../layout';
import { gaitSwing, type VampirePose } from '../pose';

export function drawCloak(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  const { colors } = F;
  const sway = pose.moving ? gaitSwing(pose.gait) * 0.25 : 0;

  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const cardigan = sketch.smooth([
      F.body(-dir * 6, 124),
      F.body(-dir * 18, 132),
      F.body(-dir * 40, 176),
      F.body(-dir * 46 + sway, 228),
      F.body(-dir * 34 + sway, 270),
      F.body(-dir * 12, 244),
      F.body(-dir * 4, 166),
    ]);
    F.media.tone(sketch, cardigan, { style: 'black', angle: 0.45 });
    F.media.skin(sketch, sketch.smooth([
      F.body(-dir * 18, 160),
      F.body(-dir * 34, 210),
      F.body(-dir * 24, 252),
      F.body(-dir * 10, 180),
    ]), colors.lining, { paper: false, underdraw: false, alpha: 0.3 });
    sketch.broken(cardigan, F.lwMain);
    const collarTop = pose.facing === 'right' ? 80 : 102;
    const collar = [F.body(-dir * 2, 118), F.body(-dir * 24, collarTop), F.body(-dir * 12, 128)];
    F.media.tone(sketch, collar, { style: 'black', angle: 0.45 });
    sketch.broken(collar, F.lwThin * 1.6);
    const shirt = sketch.smooth([
      F.body(-8, 132), F.body(8, 132), F.body(9, 198), F.body(-9, 198),
    ]);
    F.media.tone(sketch, shirt, { style: 'hatch' });
    F.media.skin(sketch, shirt, colors.shirt, { paper: false, underdraw: false, alpha: 0.62 });
    sketch.broken(shirt, F.lwMain);
    return;
  }

  if (pose.facing === 'rear') {
    const back = sketch.smooth([
      F.body(-18, 124), F.body(18, 124),
      F.body(48 + sway, 186), F.body(44 + sway, 244),
      F.body(0, 270),
      F.body(-44 - sway, 244), F.body(-48 - sway, 186),
    ]);
    F.media.tone(sketch, back, { style: 'black', angle: 0.45 });
    sketch.broken(back, F.lwMain);
    const leftCollar = [F.body(-4, 118), F.body(-28, 80), F.body(-18, 128)];
    const rightCollar = [F.body(4, 118), F.body(20, 102), F.body(16, 128)];
    F.media.tone(sketch, leftCollar, { style: 'black', angle: 0.45 });
    F.media.tone(sketch, rightCollar, { style: 'black', angle: 0.45 });
    sketch.broken(leftCollar, F.lwThin * 1.6);
    sketch.broken(rightCollar, F.lwThin * 1.6);
    return;
  }

  const left = sketch.smooth([
    F.body(-8, 124), F.body(-34, 132), F.body(-54, 174), F.body(-56 + sway, 228),
    F.body(-42 + sway, 250), F.body(-28 + sway, 270), F.body(-16, 236), F.body(-10, 166),
  ]);
  const right = sketch.smooth([
    F.body(8, 124), F.body(30, 134), F.body(46, 176), F.body(48 + sway, 226),
    F.body(38 + sway, 248), F.body(26 + sway, 266), F.body(16, 236), F.body(10, 166),
  ]);
  F.media.tone(sketch, left, { style: 'black', angle: 0.45 });
  F.media.tone(sketch, right, { style: 'black', angle: 0.45 });
  F.media.skin(sketch, sketch.smooth([
    F.body(34, 158), F.body(46, 206), F.body(34, 244), F.body(20, 178),
  ]), colors.lining, { paper: false, underdraw: false, alpha: 0.3 });
  sketch.broken(left, F.lwMain);
  sketch.broken(right, F.lwMain);
  const leftCollar = [F.body(-4, 118), F.body(-20, 102), F.body(-16, 128)];
  const rightCollar = [F.body(4, 118), F.body(28, 80), F.body(18, 128)];
  F.media.tone(sketch, leftCollar, { style: 'black', angle: 0.45 });
  F.media.tone(sketch, rightCollar, { style: 'black', angle: 0.45 });
  sketch.broken(leftCollar, F.lwThin * 1.6);
  sketch.broken(rightCollar, F.lwThin * 1.6);
  const shirt = sketch.smooth([
    F.body(-12, 132), F.body(12, 132), F.body(14, 198), F.body(-14, 198),
  ]);
  F.media.tone(sketch, shirt, { style: 'hatch' });
  F.media.skin(sketch, shirt, colors.shirt, { paper: false, underdraw: false, alpha: 0.62 });
  sketch.broken(shirt, F.lwMain);
}
