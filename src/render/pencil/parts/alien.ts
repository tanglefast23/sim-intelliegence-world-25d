import type { PencilLayout, PencilPalette } from '../layout';
import { gaitSwing, screenSideForAttachment, type VampirePose } from '../pose';
import { seatedArmAnchors, seatedLegAnchors, segmentBox } from '../seated';
import type { Point, Sketch } from '../sketch';

type AlienOptions = Readonly<{ dressed: boolean; seated?: boolean }>;
type AlienColor = Extract<keyof PencilPalette,
  'pale' | 'ash' | 'hollow' | 'hairEdge' | 'cloak' | 'cloakLift' | 'shirt' | 'lining' | 'fang'
>;

function mass(
  sketch: Sketch,
  F: PencilLayout,
  points: readonly Point[],
  color: AlienColor,
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
      const anchors = seatedLegAnchors(F, pose.facing, side, 0.92);
      const color = side === -1 && profile ? 'ash' : 'pale';
      mass(sketch, F, sketch.smooth(segmentBox(anchors.hip, anchors.knee, 4.5 * F.k)), color, 'light', side * 0.35);
      mass(sketch, F, sketch.smooth(segmentBox(anchors.knee, anchors.ankle, 4 * F.k)), color, 'light', -side * 0.35);
      const foot = { x: anchors.ankle.x + anchors.footDirection * 4 * F.k, y: F.body(0, 291).y };
      mass(sketch, F, sketch.blobPts(foot.x, foot.y, profile ? 8 : 9, 5.5, anchors.footDirection * 0.05, 0.28), color);
    }
    return;
  }
  const swing = pose.moving ? gaitSwing(pose.gait) * 0.62 : 0;
  for (const side of [-1, 1] as const) {
    const x = profile ? side * 11 : side * 14;
    const step = side * swing;
    const lift = pose.moving && side === (pose.gait === 0 ? 1 : -1) ? 6 : 0;
    mass(sketch, F, sketch.smooth([
      F.body(x - 6, 221), F.body(x + 6, 221),
      F.body(x + 7 + step * 0.2, 273 - lift), F.body(x - 7 + step * 0.2, 273 - lift),
    ]), side === -1 && profile ? 'ash' : 'pale', 'light', side * 0.35);
    const footDir = profile ? dir : side;
    const foot = F.body(x + step * 0.35 + footDir * 4, 282 - lift);
    mass(sketch, F, sketch.blobPts(foot.x, foot.y, profile ? 8 : 9, 5.5, footDir * 0.05, 0.28),
      side === -1 && profile ? 'ash' : 'pale');
  }
}

function drawArm(sketch: Sketch, F: PencilLayout, pose: VampirePose, side: -1 | 1, far: boolean, seated = false): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  if (seated) {
    const anchors = seatedArmAnchors(F, pose.facing, side, 0.95);
    const color = far ? 'ash' : 'pale';
    mass(sketch, F, sketch.smooth(segmentBox(anchors.shoulder, anchors.elbow, 5 * F.k)), color, 'light', side * 0.48);
    mass(sketch, F, sketch.smooth(segmentBox(anchors.elbow, anchors.wrist, 4 * F.k)), color, 'light', -side * 0.48);
    for (const finger of [-1, 0, 1]) {
      mass(sketch, F, sketch.blobPts(
        anchors.wrist.x + finger * 4.5,
        anchors.wrist.y + 8 + Math.abs(finger) * 2,
        1.35,
        5.8,
        finger * 0.24,
        0.16,
      ), color);
    }
    mass(sketch, F, sketch.blobPts(anchors.wrist.x, anchors.wrist.y + 2, 4.2, 5.6, side * 0.06, 0.22), color);
    return;
  }
  const swing = pose.moving ? gaitSwing(pose.gait) * side * 0.3 : 0;
  const shoulderX = profile ? side * (far ? 18 : 26) : side * 28;
  const elbowX = profile ? side * (far ? 24 : 35) : side * 39;
  const wristX = profile ? side * (far ? 27 : 40) : side * 44;
  mass(sketch, F, sketch.smooth([
    F.body(shoulderX - 5, 151), F.body(shoulderX + 5, 151),
    F.body(elbowX + 5, 197 + swing), F.body(wristX + 4, 244 + swing),
    F.body(wristX - 4, 244 + swing), F.body(elbowX - 5, 197 + swing),
  ]), far ? 'ash' : 'pale', 'light', side * 0.48);
  const palm = F.body(wristX, 251 + swing);
  const handColor = far ? 'ash' : 'pale';
  for (const finger of [-1, 0, 1]) {
    mass(sketch, F, sketch.blobPts(
      palm.x + finger * 4.5,
      palm.y + 8 + Math.abs(finger) * 2,
      1.35,
      5.8,
      finger * 0.24,
      0.16,
    ), handColor);
  }
  mass(sketch, F, sketch.blobPts(palm.x, palm.y, 4.2, 5.6, side * 0.06, 0.22), handColor);
}

function drawTorso(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 5 : 0;
  mass(sketch, F, sketch.smooth([
    F.body(centre - 24, 146), F.body(centre + 24, 146), F.body(centre + 26, 183),
    F.body(centre + 19, 224), F.body(centre - 19, 224), F.body(centre - 26, 183),
  ]), pose.facing === 'rear' ? 'ash' : 'pale', 'light', profile ? dir * 0.3 : -0.25);
}

function drawNeck(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 5 : 0;
  mass(sketch, F, [
    F.body(centre - 8, 127), F.body(centre + 8, 127),
    F.body(centre + 10, 160), F.body(centre - 10, 160),
  ], pose.facing === 'rear' ? 'ash' : 'pale');
}

function drawVest(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 5 : 0;
  const vest = sketch.smooth([
    F.body(centre - 22, 151), F.body(centre - 8, 151), F.body(centre, pose.facing === 'rear' ? 169 : 188),
    F.body(centre + 8, 151), F.body(centre + 22, 151), F.body(centre + 23, 218),
    F.body(centre - 23, 218),
  ]);
  mass(sketch, F, vest, 'cloak', 'hatch', profile ? dir * 0.4 : 0.45);
  mass(sketch, F, [
    F.body(centre - 13, 151), F.body(centre, pose.facing === 'rear' ? 164 : 174), F.body(centre + 13, 151),
    F.body(centre + 8, 148), F.body(centre, pose.facing === 'rear' ? 158 : 166), F.body(centre - 8, 148),
  ], 'shirt', 'light');
}

function drawAntenna(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const side = screenSideForAttachment('left', pose.facing, 'trailing');
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const root = F.head(side * (profile ? 17 : 20), 41);
  const bend = F.head(side * (profile ? 33 : 37), 18);
  const tip = F.head(side * (profile ? 44 : 47), 4);
  mass(sketch, F, sketch.smooth([
    { x: root.x - side * 1.5, y: root.y + 2 },
    { x: bend.x - side * 1.7, y: bend.y + 1 },
    { x: tip.x - side, y: tip.y + 2 },
    { x: tip.x + side, y: tip.y - 2 },
    { x: bend.x + side * 1.7, y: bend.y - 1 },
    { x: root.x + side * 1.5, y: root.y - 2 },
  ]), pose.facing === 'rear' ? 'ash' : 'pale', 'light');
  mass(sketch, F, sketch.blobPts(tip.x, tip.y, 3.5, 4.4, side * 0.12, 0.22), 'fang', 'light');
}

function drawHead(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const outline = profile
    ? sketch.smooth([
      F.head(-dir * 34, 54), F.head(-dir * 22, 31), F.head(dir * 4, 22),
      F.head(dir * 26, 30), F.head(dir * 39, 50), F.head(dir * 42, 77),
      F.head(dir * 32, 109), F.head(dir * 15, 132), F.head(-dir * 14, 132),
      F.head(-dir * 32, 105),
    ])
    : sketch.smooth([
      F.head(-37, 53), F.head(-25, 30), F.head(0, 20), F.head(25, 30),
      F.head(37, 53), F.head(41, 79), F.head(31, 111), F.head(15, 134),
      F.head(0, 140), F.head(-15, 134), F.head(-31, 111), F.head(-41, 79),
    ]);
  mass(sketch, F, outline, pose.facing === 'rear' ? 'ash' : 'pale', 'light', profile ? dir * 0.25 : -0.25);
}

function drawFace(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  if (pose.facing === 'rear') return;
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const eyes = profile ? [dir * 21] : [-17, 17];
  for (const x of eyes) {
    const centre = F.head(x, 77);
    const eye = profile
      ? sketch.smooth([
        F.head(dir * 7, 77), F.head(dir * 22, 65), F.head(dir * 36, 77),
        F.head(dir * 22, 89),
      ])
      : sketch.smooth([
        { x: centre.x - 15 * F.hs, y: centre.y },
        { x: centre.x, y: centre.y - 10 * F.hs },
        { x: centre.x + 15 * F.hs, y: centre.y },
        { x: centre.x, y: centre.y + 10 * F.hs },
      ]);
    mass(sketch, F, eye, 'hollow', 'black', x < 0 ? -0.3 : 0.3);
  }
  const noseX = profile ? dir * 35 : 0;
  const nostrils = profile ? [noseX] : [-4, 4];
  for (const x of nostrils) {
    const point = F.head(x, 99);
    mass(sketch, F, sketch.blobPts(point.x, point.y, 1.6, 2, 0, 0.12), 'hollow', 'black');
  }
  F.media.edge(sketch, profile
    ? [F.head(dir * 20, 114), F.head(dir * 34, 114)]
    : [F.head(-11, 114), F.head(0, 116), F.head(11, 114)], F.lwThin * 0.72);
}

function drawShakerHolster(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const side = screenSideForAttachment('right', pose.facing, 'trailing');
  const belt = F.body(side * 18, 199);
  F.media.edge(sketch, [belt, F.body(side * 23, 211)], F.lwThin * 0.75);
  const top = F.body(side * 24, 211);
  const bottom = F.body(side * 26, 242);
  mass(sketch, F, sketch.smooth([
    { x: top.x - 5, y: top.y }, { x: top.x + 5, y: top.y },
    { x: bottom.x + 7, y: bottom.y }, { x: bottom.x - 7, y: bottom.y },
  ]), 'lining', 'hatch', side * 0.4);
  mass(sketch, F, [
    { x: top.x - 4, y: top.y - 4 }, { x: top.x + 4, y: top.y - 4 },
    { x: top.x + 5, y: top.y + 1 }, { x: top.x - 5, y: top.y + 1 },
  ], 'fang', 'light');
}

export function drawLiteralAlien(
  sketch: Sketch,
  F: PencilLayout,
  pose: VampirePose,
  options: AlienOptions,
): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  drawLegs(sketch, F, pose, options.seated);
  drawAntenna(sketch, F, pose);
  if (profile) drawArm(sketch, F, pose, pose.facing === 'right' ? -1 : 1, true, options.seated);
  drawNeck(sketch, F, pose);
  drawTorso(sketch, F, pose);
  if (options.dressed) drawVest(sketch, F, pose);
  if (options.dressed && profile) drawShakerHolster(sketch, F, pose);
  drawHead(sketch, F, pose);
  if (profile) drawArm(sketch, F, pose, pose.facing === 'right' ? 1 : -1, false, options.seated);
  else {
    drawArm(sketch, F, pose, -1, false, options.seated);
    drawArm(sketch, F, pose, 1, false, options.seated);
  }
  drawFace(sketch, F, pose);
  if (options.dressed && !profile) drawShakerHolster(sketch, F, pose);
}
