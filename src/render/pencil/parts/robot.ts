import type { PencilLayout, PencilPalette } from '../layout';
import { gaitSwing, screenSideForAttachment, type VampirePose } from '../pose';
import { seatedArmAnchors, seatedLegAnchors, segmentBox } from '../seated';
import type { Point, Sketch } from '../sketch';

type RobotOptions = Readonly<{ adorned: boolean; seated?: boolean }>;
type RobotColor = Extract<keyof PencilPalette,
  'pale' | 'ash' | 'hollow' | 'cloak' | 'cloakLift' | 'shirt' | 'lining' | 'fang'
>;

function mass(
  sketch: Sketch,
  F: PencilLayout,
  points: readonly Point[],
  color: RobotColor,
  style: 'light' | 'hatch' | 'black' = 'light',
  angle = -0.35,
): void {
  F.media.tone(sketch, points, { style, angle, paper: false });
  F.media.skin(sketch, points, F.colors[color], { paper: false, underdraw: false, alpha: 0.82 });
  F.media.edge(sketch, [...points, points[0]!], F.lwThin * 0.9);
}

function joint(sketch: Sketch, F: PencilLayout, point: Point, color: RobotColor): void {
  mass(sketch, F, sketch.blobPts(point.x, point.y, 5.2, 5.2, 0, 0.2), color, 'hatch');
}

function drawLegs(sketch: Sketch, F: PencilLayout, pose: VampirePose, seated = false): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  if (seated) {
    for (const side of [-1, 1] as const) {
      const anchors = seatedLegAnchors(F, pose.facing, side, 0.94);
      const metal: RobotColor = side === -1 && profile ? 'ash' : 'pale';
      mass(sketch, F, segmentBox(anchors.hip, anchors.knee, 5 * F.k), metal, 'hatch', side * 0.25);
      joint(sketch, F, anchors.knee, 'ash');
      mass(sketch, F, segmentBox(anchors.knee, anchors.ankle, 4.5 * F.k), metal, 'light', -side * 0.25);
      mass(sketch, F, sketch.smooth([
        { x: anchors.ankle.x - anchors.footDirection * 6 * F.k, y: anchors.ankle.y - 2 * F.k },
        { x: anchors.ankle.x + anchors.footDirection * 14 * F.k, y: anchors.ankle.y - 2 * F.k },
        { x: anchors.ankle.x + anchors.footDirection * 17 * F.k, y: F.body(0, 292).y },
        { x: anchors.ankle.x - anchors.footDirection * 7 * F.k, y: F.body(0, 292).y },
      ]), 'hollow', 'black');
    }
    return;
  }
  const swing = pose.moving ? gaitSwing(pose.gait) * 0.42 : 0;
  for (const side of [-1, 1] as const) {
    const x = profile ? side * 8 : side * 17;
    const step = side * swing;
    const lift = pose.moving && side === (pose.gait === 0 ? 1 : -1) ? 5 : 0;
    const metal: RobotColor = side === -1 && profile ? 'ash' : 'pale';
    mass(sketch, F, [
      F.body(x - 6, 216), F.body(x + 6, 216),
      F.body(x + 6 + step * 0.12, 244 - lift), F.body(x - 6 + step * 0.12, 244 - lift),
    ], metal, 'hatch', side * 0.25);
    joint(sketch, F, F.body(x + step * 0.12, 247 - lift), 'ash');
    mass(sketch, F, [
      F.body(x - 5 + step * 0.18, 250 - lift), F.body(x + 5 + step * 0.18, 250 - lift),
      F.body(x + 6 + step * 0.28, 272 - lift), F.body(x - 6 + step * 0.28, 272 - lift),
    ], metal, 'light', -side * 0.25);
    const footDir = profile ? dir : side;
    mass(sketch, F, sketch.smooth([
      F.body(x - 10 + step * 0.28, 271 - lift),
      F.body(x + footDir * 14 + step * 0.4, 271 - lift),
      F.body(x + footDir * 17 + step * 0.4, 282 - lift),
      F.body(x - 11 + step * 0.28, 282 - lift),
    ]), 'hollow', 'black');
  }
}

function drawClamp(sketch: Sketch, F: PencilLayout, palm: Point, side: -1 | 1, color: RobotColor): void {
  for (const prong of [-1, 0, 1]) {
    mass(sketch, F, sketch.smooth([
      { x: palm.x + prong * 3.5 - 1.6, y: palm.y + 2 },
      { x: palm.x + prong * 5 + side - 1.5, y: palm.y + 10 + Math.abs(prong) * 2 },
      { x: palm.x + prong * 5 + side + 1.5, y: palm.y + 10 + Math.abs(prong) * 2 },
      { x: palm.x + prong * 3.5 + 1.6, y: palm.y + 2 },
    ]), color, 'light', prong * 0.3);
  }
  joint(sketch, F, palm, color);
}

function drawArm(sketch: Sketch, F: PencilLayout, pose: VampirePose, side: -1 | 1, far: boolean, seated = false): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  if (seated) {
    const anchors = seatedArmAnchors(F, pose.facing, side, 1.02);
    const metal: RobotColor = far ? 'ash' : 'pale';
    joint(sketch, F, anchors.shoulder, far ? 'hollow' : 'lining');
    mass(sketch, F, segmentBox(anchors.shoulder, anchors.elbow, 4.5 * F.k), metal, 'hatch', side * 0.35);
    joint(sketch, F, anchors.elbow, 'ash');
    mass(sketch, F, segmentBox(anchors.elbow, anchors.wrist, 4 * F.k), metal, 'light', -side * 0.4);
    drawClamp(sketch, F, { x: anchors.wrist.x, y: anchors.wrist.y + 3 * F.k }, side, metal);
    return;
  }
  const swing = pose.moving ? gaitSwing(pose.gait) * side * 0.26 : 0;
  const shoulderX = profile ? side * (far ? 19 : 29) : side * 37;
  const elbowX = profile ? side * (far ? 26 : 39) : side * 48;
  const wristX = profile ? side * (far ? 31 : 46) : side * 54;
  const metal: RobotColor = far ? 'ash' : 'pale';
  joint(sketch, F, F.body(shoulderX, 158), far ? 'hollow' : 'lining');
  mass(sketch, F, [
    F.body(shoulderX - 5, 162), F.body(shoulderX + 5, 162),
    F.body(elbowX + 5, 194 + swing), F.body(elbowX - 5, 194 + swing),
  ], metal, 'hatch', side * 0.35);
  joint(sketch, F, F.body(elbowX, 198 + swing), 'ash');
  mass(sketch, F, [
    F.body(elbowX - 4, 202 + swing), F.body(elbowX + 4, 202 + swing),
    F.body(wristX + 4, 215 + swing), F.body(wristX - 4, 215 + swing),
  ], metal, 'light', -side * 0.4);
  drawClamp(sketch, F, F.body(wristX, 221 + swing), side, metal);
}

function drawTorso(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 3 : 0;
  const half = profile ? 23 : 31;
  mass(sketch, F, sketch.smooth([
    F.body(centre - half, 145), F.body(centre + half, 145),
    F.body(centre + half + 2, 213), F.body(centre - half - 2, 213),
  ]), pose.facing === 'rear' ? 'ash' : 'cloak', 'hatch', profile ? dir * 0.35 : 0.2);

  if (pose.facing === 'rear') {
    mass(sketch, F, [
      F.body(centre - 19, 160), F.body(centre + 19, 160),
      F.body(centre + 19, 199), F.body(centre - 19, 199),
    ], 'hollow', 'black');
    for (const y of [170, 180, 190]) {
      F.media.edge(sketch, [F.body(centre - 12, y), F.body(centre + 12, y)], F.lwThin * 0.58);
    }
    return;
  }

  const front = profile ? centre + dir * 8 : centre;
  mass(sketch, F, [
    F.body(front - (profile ? 10 : 23), 158), F.body(front + (profile ? 10 : 23), 158),
    F.body(front + (profile ? 10 : 23), 202), F.body(front - (profile ? 10 : 23), 202),
  ], 'shirt', 'light');
  F.media.edge(sketch, [
    F.body(front - (profile ? 8 : 20), 181), F.body(front + (profile ? 8 : 20), 181),
  ], F.lwThin * 0.72);
  mass(sketch, F, [
    F.body(front - 8, 166), F.body(front + 8, 166),
    F.body(front + 8, 174), F.body(front - 8, 174),
  ], 'lining', 'hatch');
}

function drawNeck(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 3 : 0;
  mass(sketch, F, [
    F.body(centre - 9, 127), F.body(centre + 9, 127),
    F.body(centre + 9, 151), F.body(centre - 9, 151),
  ], 'ash', 'hatch');
  for (const y of [133, 143]) {
    F.media.edge(sketch, [F.body(centre - 8, y), F.body(centre + 8, y)], F.lwThin * 0.65);
  }
}

function drawHead(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const outline = profile
    ? sketch.smooth([
      F.head(-dir * 27, 43), F.head(dir * 16, 37), F.head(dir * 31, 48),
      F.head(dir * 37, 65), F.head(dir * 37, 113), F.head(dir * 24, 128),
      F.head(-dir * 26, 125), F.head(-dir * 31, 58),
    ])
    : sketch.smooth([
      F.head(-32, 44), F.head(-21, 34), F.head(21, 34), F.head(32, 44),
      F.head(35, 111), F.head(25, 127), F.head(-25, 127), F.head(-35, 111),
    ]);
  mass(sketch, F, outline, pose.facing === 'rear' ? 'ash' : 'pale', 'light', profile ? dir * 0.22 : -0.2);

  if (pose.facing === 'rear') {
    mass(sketch, F, [F.head(-18, 64), F.head(18, 64), F.head(18, 108), F.head(-18, 108)], 'cloak', 'hatch');
    for (const y of [76, 88, 100]) {
      F.media.edge(sketch, [F.head(-12, y), F.head(12, y)], F.lwThin * 0.58);
    }
  }
}

function drawFace(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  if (pose.facing === 'rear') return;
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const eyeXs = profile ? [dir * 23] : [-14, 14];
  for (const x of eyeXs) {
    const centre = F.head(x, 73);
    mass(sketch, F, sketch.blobPts(centre.x, centre.y, profile ? 7 : 7.5, 5.2, 0, 0.16), 'lining', 'hatch');
  }
  const centre = profile ? dir * 23 : 0;
  for (const y of [94, 101, 108]) {
    F.media.edge(sketch, [F.head(centre - (profile ? 7 : 14), y), F.head(centre + (profile ? 7 : 14), y)], F.lwThin * 0.65);
  }
}

function drawOfficeBadge(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const side = screenSideForAttachment('left', pose.facing, 'trailing');
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const centre = F.body(side * (profile ? 13 : 21), 171);
  const width = profile ? 4 : 9;
  mass(sketch, F, [
    { x: centre.x - width / 2, y: centre.y }, { x: centre.x + width / 2, y: centre.y },
    { x: centre.x + width / 2, y: centre.y + 13 }, { x: centre.x - width / 2, y: centre.y + 13 },
  ], 'fang', 'light');
  if (!profile) {
    F.media.edge(sketch, [
      { x: centre.x - 2.5, y: centre.y + 5 }, { x: centre.x + 2.5, y: centre.y + 5 },
    ], F.lwThin * 0.5);
  }
}

export function drawLiteralRobot(
  sketch: Sketch,
  F: PencilLayout,
  pose: VampirePose,
  options: RobotOptions = { adorned: true },
): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  drawLegs(sketch, F, pose, options.seated);
  if (profile) drawArm(sketch, F, pose, pose.facing === 'right' ? -1 : 1, true, options.seated);
  drawNeck(sketch, F, pose);
  drawTorso(sketch, F, pose);
  drawHead(sketch, F, pose);
  if (profile) drawArm(sketch, F, pose, pose.facing === 'right' ? 1 : -1, false, options.seated);
  else {
    drawArm(sketch, F, pose, -1, false, options.seated);
    drawArm(sketch, F, pose, 1, false, options.seated);
  }
  drawFace(sketch, F, pose);
  if (options.adorned) drawOfficeBadge(sketch, F, pose);
}
