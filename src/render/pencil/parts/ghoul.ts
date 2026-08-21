import type { PencilLayout, PencilPalette } from '../layout';
import { gaitSwing, type VampirePose } from '../pose';
import { seatedArmAnchors, seatedLegAnchors, segmentBox } from '../seated';
import type { Point, Sketch } from '../sketch';

type GhoulOptions = Readonly<{ dressed: boolean; seated?: boolean }>;
type GhoulColor = Extract<keyof PencilPalette,
  'pale' | 'ash' | 'hollow' | 'hair' | 'hairEdge' | 'cloak' | 'cloakLift' | 'lining' | 'fang'
>;

function mass(
  sketch: Sketch,
  F: PencilLayout,
  points: readonly Point[],
  color: GhoulColor,
  style: 'light' | 'hatch' | 'scribble' | 'black' = 'light',
  angle = -0.35,
): void {
  F.media.tone(sketch, points, { style, angle, paper: false });
  F.media.skin(sketch, points, F.colors[color], { paper: false, underdraw: false, alpha: 0.84 });
  F.media.edge(sketch, [...points, points[0]!], F.lwThin * 0.9);
}

function drawLegs(sketch: Sketch, F: PencilLayout, pose: VampirePose, seated = false): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  if (seated) {
    for (const side of [-1, 1] as const) {
      const anchors = seatedLegAnchors(F, pose.facing, side, 1.02);
      const color = side === -1 && profile ? 'ash' : 'pale';
      mass(sketch, F, sketch.smooth(segmentBox(anchors.hip, anchors.knee, 5.5 * F.k)), color, 'light', side * 0.45);
      mass(sketch, F, sketch.smooth(segmentBox(anchors.knee, anchors.ankle, 5 * F.k)), color, 'light', -side * 0.45);
      const foot = { x: anchors.ankle.x + anchors.footDirection * 6 * F.k, y: F.body(0, 291).y };
      mass(sketch, F, sketch.blobPts(foot.x, foot.y, profile ? 13 : 15, 7, anchors.footDirection * 0.04, 0.34), color);
    }
    return;
  }
  const swing = pose.moving ? gaitSwing(pose.gait) * 0.55 : 0;
  for (const side of [-1, 1] as const) {
    const x = profile ? side * 13 : side * 17;
    const step = side * swing;
    const lift = pose.moving && side === (pose.gait === 0 ? 1 : -1) ? 5 : 0;
    mass(sketch, F, sketch.smooth([
      F.body(x - 8, 224), F.body(x + 9, 224), F.body(x + side * 13, 250),
      F.body(x + step * 0.25 + side * 7, 273 - lift),
      F.body(x + step * 0.25 - side * 7, 273 - lift), F.body(x - side * 10, 249),
    ]), side === -1 && profile ? 'ash' : 'pale', 'light', side * 0.45);
    const footDir = profile ? dir : side;
    const foot = F.body(x + step * 0.35 + footDir * 6, 282 - lift);
    mass(sketch, F, sketch.blobPts(foot.x, foot.y, profile ? 13 : 15, 7, footDir * 0.04, 0.34),
      side === -1 && profile ? 'ash' : 'pale');
    for (const toe of [-5, 0, 5]) {
      const base = profile
        ? { x: foot.x + footDir * 7, y: foot.y + toe * 0.35 }
        : { x: foot.x + toe, y: foot.y + 3 };
      const tip = profile
        ? { x: base.x + footDir * 6, y: base.y + 1 }
        : { x: base.x + side, y: base.y + 6 };
      mass(sketch, F, [base, tip, { x: base.x - (profile ? 0 : 2), y: base.y + 2 }], 'fang');
    }
  }
}

function drawTorso(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 7 : 0;
  mass(sketch, F, sketch.smooth([
    F.body(centre - 29, 147), F.body(centre + 29, 147), F.body(centre + 35, 179),
    F.body(centre + 25, 224), F.body(centre - 25, 224), F.body(centre - 35, 179),
  ]), pose.facing === 'rear' ? 'ash' : 'pale', 'light', profile ? dir * 0.35 : -0.3);
  if (pose.facing !== 'rear') {
    F.media.edge(sketch, [F.body(centre - 18, 167), F.body(centre, 178), F.body(centre + 18, 167)], F.lwThin * 0.55);
    F.media.edge(sketch, [F.body(centre, 179), F.body(centre, 215)], F.lwThin * 0.55);
  }
}

function drawArm(sketch: Sketch, F: PencilLayout, pose: VampirePose, side: -1 | 1, far: boolean, seated = false): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  if (seated) {
    const anchors = seatedArmAnchors(F, pose.facing, side, 1.02);
    const color = far ? 'ash' : 'pale';
    mass(sketch, F, sketch.smooth(segmentBox(anchors.shoulder, anchors.elbow, 5 * F.k)), color, 'light', side * 0.48);
    mass(sketch, F, sketch.smooth(segmentBox(anchors.elbow, anchors.wrist, 4.5 * F.k)), color, 'light', -side * 0.48);
    const hand = { x: anchors.wrist.x, y: anchors.wrist.y + 4 * F.k };
    mass(sketch, F, sketch.blobPts(hand.x, hand.y, 7.5, 9, side * 0.05, 0.35), color);
    return;
  }
  const swing = pose.moving ? gaitSwing(pose.gait) * side * 0.3 : 0;
  const shoulderX = profile ? side * (far ? 23 : 34) : side * 33;
  const elbowX = profile ? side * (far ? 29 : 44) : side * 44;
  const wristX = profile ? side * (far ? 31 : 49) : side * 49;
  mass(sketch, F, sketch.smooth([
    F.body(shoulderX - 7, 151), F.body(shoulderX + 7, 151),
    F.body(elbowX + 7, 196 + swing), F.body(wristX + 6, 246 + swing),
    F.body(wristX - 6, 246 + swing), F.body(elbowX - 7, 196 + swing),
  ]), far ? 'ash' : 'pale', 'light', side * 0.48);
  const hand = F.body(wristX, 254 + swing);
  mass(sketch, F, sketch.blobPts(hand.x, hand.y, 7.5, 9, side * 0.05, 0.35), far ? 'ash' : 'pale');
  for (const claw of [-4, 0, 4]) {
    F.media.edge(sketch, [
      { x: hand.x + claw, y: hand.y + 3 },
      { x: hand.x + claw + side * 2, y: hand.y + 12 },
    ], F.lwThin * 0.62);
  }
}

function drawNeck(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 6 : 0;
  mass(sketch, F, [
    F.body(centre - 12, 130), F.body(centre + 12, 130),
    F.body(centre + 15, 161), F.body(centre - 15, 161),
  ], pose.facing === 'rear' ? 'ash' : 'pale');
}

function drawGarment(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 7 : 0;
  const wrap = sketch.smooth([
    F.body(centre - 22, 156), F.body(centre, pose.facing === 'rear' ? 168 : 181),
    F.body(centre + 22, 156), F.body(centre + 31, 218),
    F.body(centre + 18, 236), F.body(centre + 7, 226), F.body(centre - 5, 239),
    F.body(centre - 17, 228), F.body(centre - 28, 235), F.body(centre - 31, 219),
  ]);
  mass(sketch, F, wrap, 'cloak', 'hatch', profile ? dir * 0.55 : -0.5);
  const sash = [
    F.body(centre - 29, 201), F.body(centre + 28, 201),
    F.body(centre + 28, 210), F.body(centre - 29, 210),
  ];
  mass(sketch, F, sash, 'cloakLift', 'light');
}

function drawHead(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const outline = profile
    ? sketch.smooth([
      F.head(-dir * 38, 44), F.head(-dir * 18, 31), F.head(dir * 21, 33),
      F.head(dir * 39, 50), F.head(dir * 43, 77), F.head(dir * 55, 99),
      F.head(dir * 48, 119), F.head(dir * 24, 135), F.head(-dir * 24, 132),
      F.head(-dir * 42, 105),
    ])
    : sketch.smooth([
      F.head(-42, 45), F.head(-24, 30), F.head(24, 30), F.head(42, 45),
      F.head(48, 77), F.head(44, 108), F.head(31, 129), F.head(0, 140),
      F.head(-31, 129), F.head(-44, 108), F.head(-48, 77),
    ]);
  mass(sketch, F, outline, pose.facing === 'rear' ? 'ash' : 'pale', 'light', profile ? dir * 0.22 : -0.2);
}

function drawMottling(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const patches = profile
    ? [[-dir * 20, 52, 8, 5], [-dir * 29, 100, 6, 8], [dir * 12, 42, 4, 3]] as const
    : [[-27, 50, 8, 5], [31, 92, 6, 8], [17, 39, 4, 3]] as const;
  for (const [x, y, rx, ry] of patches) {
    const centre = F.head(x, y);
    const patch = sketch.blobPts(centre.x, centre.y, rx * F.hs, ry * F.hs, 0.2, 0.32);
    F.media.tone(sketch, patch, { style: 'light', angle: 0.5, paper: false });
    F.media.skin(sketch, patch, F.colors.ash, { paper: false, underdraw: false, alpha: 0.42 });
  }
}

function drawFace(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  if (pose.facing === 'rear') return;
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const sockets = profile ? [dir * 22] : [-19, 19];
  for (const x of sockets) {
    const eye = F.head(x, 76);
    mass(sketch, F, sketch.blobPts(eye.x, eye.y, profile ? 10 : 12, 13, dir * 0.05, 0.28), 'hollow', 'black');
    mass(sketch, F, sketch.blobPts(eye.x + dir, eye.y + 1, 2.2, 2.4, 0, 0.1), 'lining', 'light');
  }
  const noseX = profile ? dir * 38 : 0;
  mass(sketch, F, [
    F.head(noseX - 4, 89), F.head(noseX + 4, 89), F.head(noseX + dir * 2, 101),
  ], 'hollow', 'black');

  const gums = profile
    ? [F.head(dir * 17, 106), F.head(dir * 55, 105), F.head(dir * 48, 124), F.head(dir * 20, 126)]
    : [F.head(-34, 105), F.head(34, 105), F.head(31, 126), F.head(0, 136), F.head(-31, 126)];
  mass(sketch, F, sketch.smooth(gums), 'ash', 'light');
  const opening = profile
    ? [F.head(dir * 22, 111), F.head(dir * 49, 110), F.head(dir * 44, 119), F.head(dir * 23, 121)]
    : [F.head(-29, 111), F.head(29, 111), F.head(25, 122), F.head(0, 128), F.head(-25, 122)];
  mass(sketch, F, sketch.smooth(opening), 'hollow', 'hatch');
  const teeth = profile ? [27, 38, 47] : [-23, -12, 0, 12, 23];
  for (const x of teeth) {
    const tx = profile ? dir * x : x;
    mass(sketch, F, [F.head(tx - 3, 109), F.head(tx + 3, 109), F.head(tx, 118)], 'fang', 'light');
  }
}

function drawNecklace(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 6 : 0;
  F.media.edge(sketch, [
    F.body(centre - 20, 157), F.body(centre, pose.facing === 'rear' ? 170 : 184), F.body(centre + 20, 157),
  ], F.lwThin * 0.85);
  if (pose.facing === 'rear') return;
  const pendant = F.body(centre, 183);
  mass(sketch, F, sketch.blobPts(pendant.x, pendant.y, 5, 7, 0, 0.2), 'lining', 'hatch');
}

export function drawLiteralGhoul(
  sketch: Sketch,
  F: PencilLayout,
  pose: VampirePose,
  options: GhoulOptions,
): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  drawLegs(sketch, F, pose, options.seated);
  if (profile) drawArm(sketch, F, pose, pose.facing === 'right' ? -1 : 1, true, options.seated);
  drawNeck(sketch, F, pose);
  drawTorso(sketch, F, pose);
  if (options.dressed) drawGarment(sketch, F, pose);
  drawHead(sketch, F, pose);
  drawMottling(sketch, F, pose);
  if (profile) drawArm(sketch, F, pose, pose.facing === 'right' ? 1 : -1, false, options.seated);
  else {
    drawArm(sketch, F, pose, -1, false, options.seated);
    drawArm(sketch, F, pose, 1, false, options.seated);
  }
  drawFace(sketch, F, pose);
  if (options.dressed) drawNecklace(sketch, F, pose);
}
