import type { PencilLayout, PencilPalette } from '../layout';
import { gaitSwing, screenSideForAttachment, type VampirePose } from '../pose';
import { seatedArmAnchors, seatedLegAnchors, segmentBox } from '../seated';
import type { Point, Sketch } from '../sketch';

type GoblinOptions = Readonly<{ dressed: boolean; seated?: boolean }>;
type Color = Extract<keyof PencilPalette,
  'pale' | 'ash' | 'hollow' | 'hair' | 'hairEdge' | 'cloak' | 'cloakLift' | 'lining' | 'fang'
>;

function mass(
  sketch: Sketch,
  F: PencilLayout,
  points: readonly Point[],
  color: Color,
  style: 'light' | 'hatch' | 'scribble' | 'black' = 'light',
  angle = -0.35,
): void {
  F.media.tone(sketch, points, { style, angle, paper: false });
  F.media.skin(sketch, points, F.colors[color], { paper: false, underdraw: false, alpha: 0.82 });
  F.media.edge(sketch, [...points, points[0]!], F.lwThin * 0.86);
}

function drawFeetAndLegs(sketch: Sketch, F: PencilLayout, pose: VampirePose, seated = false): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  if (seated) {
    for (const side of [-1, 1] as const) {
      const anchors = seatedLegAnchors(F, pose.facing, side, 0.92);
      mass(sketch, F, sketch.smooth(segmentBox(anchors.hip, anchors.knee, 5.5 * F.k)), 'pale', 'light', side * 0.35);
      mass(sketch, F, sketch.smooth(segmentBox(anchors.knee, anchors.ankle, 5 * F.k)), 'pale', 'light', -side * 0.35);
      const foot = { x: anchors.ankle.x + anchors.footDirection * 4 * F.k, y: F.body(0, 291).y };
      mass(sketch, F, sketch.blobPts(foot.x, foot.y, profile ? 8.8 : 10.5, 6.4, anchors.footDirection * 0.06, 0.38), 'pale', 'light');
    }
    return;
  }
  const swing = pose.moving ? gaitSwing(pose.gait) * 0.72 : 0;
  const xs = profile ? [-dir * 24, dir * 12] : [-17, 17];
  xs.forEach((x, index) => {
    const side: -1 | 1 = index === 0 ? -1 : 1;
    const step = side * swing;
    const lift = pose.moving && side === (pose.gait === 0 ? 1 : -1) ? 6 : 0;
    mass(sketch, F, sketch.smooth([
      F.body(x - 8, 225), F.body(x + 8, 225), F.body(x + 11 + step * 0.15, 268 - lift),
      F.body(x - 10 + step * 0.15, 268 - lift),
    ]), 'pale', 'light', side * 0.35);
    const footDir = profile ? dir : side;
    const foot = F.body(x + step * 0.42 + footDir * 4, 279 - lift);
    mass(sketch, F, sketch.blobPts(foot.x, foot.y, profile ? 8.8 : 10.5, 6.4, footDir * 0.06, 0.38), 'pale', 'light');
    for (const toe of [-3.6, 0, 3.6]) {
      F.media.edge(sketch, [
        { x: foot.x + footDir * 3, y: foot.y + toe * 0.45 },
        { x: foot.x + footDir * 10, y: foot.y + toe * 0.7 },
      ], F.lwThin * 0.55);
    }
  });
}

function drawArm(
  sketch: Sketch,
  F: PencilLayout,
  pose: VampirePose,
  side: -1 | 1,
  bracelet: boolean,
  seated = false,
): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  if (seated) {
    const anchors = seatedArmAnchors(F, pose.facing, side, 0.95);
    mass(sketch, F, sketch.smooth(segmentBox(anchors.shoulder, anchors.elbow, 5.5 * F.k)), 'pale', 'light', side * 0.45);
    mass(sketch, F, sketch.smooth(segmentBox(anchors.elbow, anchors.wrist, 5 * F.k)), 'pale', 'light', -side * 0.45);
    const hand = { x: anchors.wrist.x, y: anchors.wrist.y + 3 * F.k };
    mass(sketch, F, sketch.blobPts(hand.x, hand.y, 7.8, 7.1, side * 0.08, 0.35), 'pale', 'light');
    if (bracelet) mass(sketch, F, sketch.smooth(segmentBox(
      { x: anchors.wrist.x + (anchors.elbow.x - anchors.wrist.x) * 0.38, y: anchors.wrist.y + (anchors.elbow.y - anchors.wrist.y) * 0.38 },
      anchors.wrist,
      5.5 * F.k,
    )), 'lining', 'hatch', 0.2);
    return;
  }
  const swing = pose.moving ? gaitSwing(pose.gait) * side * 0.26 : 0;
  const shoulderX = profile ? side * 20 : side * 39;
  const elbowX = profile ? side * 27 : side * 47;
  const wristX = profile ? side * 31 : side * 52;
  const arm = sketch.smooth([
    F.body(shoulderX - 7, 155), F.body(shoulderX + 7, 155),
    F.body(elbowX + 7, 190 + swing), F.body(wristX + 6, 222 + swing),
    F.body(wristX - 6, 222 + swing), F.body(elbowX - 7, 190 + swing),
  ]);
  mass(sketch, F, arm, 'pale', 'light', side * 0.45);
  const hand = F.body(wristX, 228 + swing);
  mass(sketch, F, sketch.blobPts(hand.x, hand.y, 7.8, 7.1, side * 0.08, 0.35), 'pale', 'light');
  for (const claw of [-3, 0, 3]) {
    F.media.edge(sketch, [
      { x: hand.x + claw, y: hand.y + 2 },
      { x: hand.x + claw + side * 2, y: hand.y + 8 },
    ], F.lwThin * 0.58);
  }
  if (!bracelet) return;
  mass(sketch, F, [
    F.body(wristX - 7, 216 + swing), F.body(wristX + 7, 216 + swing),
    F.body(wristX + 7, 222 + swing), F.body(wristX - 7, 222 + swing),
  ], 'lining', 'hatch', 0.2);
  const charm = F.body(wristX + side * 6, 227 + swing);
  mass(sketch, F, sketch.blobPts(charm.x, charm.y, 2.8, 3.4, 0, 0.2), 'lining', 'light');
}

function drawTorso(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 5 : 0;
  const torso = sketch.smooth([
    F.body(centre - 31, 143), F.body(centre + 31, 143), F.body(centre + 39, 177),
    F.body(centre + 35, 216), F.body(centre + 23, 238), F.body(centre - 23, 238),
    F.body(centre - 36, 216), F.body(centre - 40, 177),
  ]);
  mass(sketch, F, torso, 'pale', 'light', profile ? dir * 0.28 : -0.25);
}

function drawNeck(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 4 : 0;
  const neck = sketch.smooth([
    F.body(centre - 13, 126), F.body(centre + 13, 126),
    F.body(centre + 15, 160), F.body(centre - 15, 160),
  ]);
  F.media.tone(sketch, neck, { style: 'light', angle: 0.2, paper: false });
  F.media.skin(sketch, neck, F.colors.pale, { paper: false, underdraw: false, alpha: 0.9 });
}

function drawTunic(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 5 : 0;
  const tunic = sketch.smooth([
    F.body(centre - 30, 151), F.body(centre + 30, 151), F.body(centre + 34, 202),
    F.body(centre + 28, 224), F.body(centre + 14, 216), F.body(centre, 228),
    F.body(centre - 14, 216), F.body(centre - 29, 224), F.body(centre - 35, 202),
  ]);
  mass(sketch, F, tunic, 'cloak', 'light', profile ? dir * 0.5 : -0.55);
  const belt = [
    F.body(centre - 34, 194), F.body(centre + 34, 194),
    F.body(centre + 34, 204), F.body(centre - 34, 204),
  ];
  mass(sketch, F, belt, 'hairEdge', 'hatch', 0.1);
  if (pose.facing !== 'rear') {
    mass(sketch, F, [
      F.body(centre - 5, 193), F.body(centre + 5, 193),
      F.body(centre + 5, 205), F.body(centre - 5, 205),
    ], 'lining', 'light');
  }
}

function drawEars(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  if (profile) {
    const trailing = -dir;
    mass(sketch, F, sketch.smooth([
      F.head(trailing * 31, 72), F.head(trailing * 70, 57),
      F.head(trailing * 51, 86), F.head(trailing * 31, 96),
    ]), 'pale', 'light', trailing * 0.4);
    F.media.edge(sketch, [F.head(trailing * 35, 78), F.head(trailing * 60, 64)], F.lwThin * 0.56);
    return;
  }
  for (const side of [-1, 1] as const) {
    mass(sketch, F, sketch.smooth([
      F.head(side * 27, 66), F.head(side * 69, 50),
      F.head(side * 52, 79), F.head(side * 28, 91),
    ]), 'pale', 'light', side * 0.4);
    F.media.edge(sketch, [F.head(side * 32, 71), F.head(side * 60, 58)], F.lwThin * 0.56);
  }
}

function drawHead(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const outline = profile
    ? sketch.smooth([
      F.head(-dir * 31, 48), F.head(-dir * 14, 38), F.head(dir * 20, 42),
      F.head(dir * 37, 57), F.head(dir * 42, 84), F.head(dir * 34, 111),
      F.head(dir * 16, 128), F.head(-dir * 22, 125), F.head(-dir * 36, 101),
    ])
    : sketch.smooth([
      F.head(-38, 49), F.head(-22, 37), F.head(22, 37), F.head(38, 49),
      F.head(43, 79), F.head(35, 110), F.head(19, 128), F.head(-19, 128),
      F.head(-35, 110), F.head(-43, 79),
    ]);
  mass(sketch, F, outline, 'pale', 'light', profile ? dir * 0.2 : -0.25);
}

function drawHairBack(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const hair = profile
    ? sketch.smooth([
      F.head(-dir * 35, 42), F.head(dir * 17, 35), F.head(dir * 28, 57),
      F.head(dir * 24, 91), F.head(-dir * 14, 100), F.head(-dir * 42, 82),
    ])
    : sketch.smooth([
      F.head(-38, 42), F.head(-23, 29), F.head(23, 29), F.head(39, 43),
      F.head(42, 94), F.head(29, 108), F.head(-29, 108), F.head(-42, 93),
    ]);
  mass(sketch, F, hair, pose.facing === 'rear' ? 'hairEdge' : 'hair', 'scribble', 0.65);
}

function drawHairFront(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  if (pose.facing === 'rear') {
    mass(sketch, F, sketch.smooth([
      F.head(-37, 41), F.head(-23, 29), F.head(23, 29), F.head(37, 41),
      F.head(40, 95), F.head(24, 108), F.head(8, 96), F.head(-8, 96),
      F.head(-24, 108), F.head(-40, 95),
    ]), 'hair', 'scribble', 0.62);
    return;
  }
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const fringe = profile
    ? [
      F.head(-dir * 27, 48), F.head(-dir * 8, 35), F.head(dir * 20, 42),
      F.head(dir * 29, 57), F.head(dir * 15, 65), F.head(-dir * 4, 58), F.head(-dir * 25, 70),
    ]
    : [
      F.head(-35, 48), F.head(-22, 32), F.head(22, 32), F.head(35, 48),
      F.head(25, 64), F.head(8, 58), F.head(-6, 67), F.head(-23, 58),
    ];
  mass(sketch, F, sketch.smooth(fringe), 'hair', 'scribble', 0.55);
  const sides = profile ? [-dir] as const : [-1, 1] as const;
  for (const side of sides) {
    mass(sketch, F, sketch.smooth([
      F.head(side * 31, 49), F.head(side * 40, 57), F.head(side * 40, 97),
      F.head(side * 31, 111), F.head(side * 26, 93), F.head(side * 27, 63),
    ]), 'hair', 'scribble', side * 0.55);
  }
}

function drawFace(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  if (pose.facing === 'rear') return;
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const eyes = profile ? [dir * 21] : [-16, 16];
  for (const x of eyes) {
    const eye = F.head(x, 78);
    mass(sketch, F, sketch.blobPts(eye.x, eye.y, 5.6, 6.6, 0, 0.2), 'hollow', 'black');
    F.media.skin(sketch, sketch.blobPts(eye.x + dir * 0.8, eye.y + 1, 1.8, 2.2, 0, 0.1), F.colors.lining, {
      paper: false, underdraw: false, alpha: 0.98,
    });
  }
  const nose = profile ? F.head(dir * 38, 93) : F.head(0, 94);
  mass(sketch, F, sketch.blobPts(nose.x, nose.y, profile ? 5.1 : 5.8, 5.2, 0, 0.22), 'ash', 'light');
  const mouth = profile
    ? [F.head(dir * 18, 109), F.head(dir * 35, 110)]
    : [F.head(-16, 108), F.head(0, 113), F.head(16, 108)];
  F.media.edge(sketch, mouth, F.lwThin * 0.78);
  const fangX = profile ? dir * 28 : 8;
  mass(sketch, F, [F.head(fangX - 3, 109), F.head(fangX + 3, 109), F.head(fangX, 119)], 'fang', 'light');
  const browY = 66;
  if (profile) {
    F.media.edge(sketch, [F.head(dir * 12, browY), F.head(dir * 28, browY - 4)], F.lwThin * 0.75);
  } else {
    F.media.edge(sketch, [F.head(-24, browY - 4), F.head(-9, browY)], F.lwThin * 0.75);
    F.media.edge(sketch, [F.head(9, browY), F.head(24, browY - 4)], F.lwThin * 0.75);
  }
}

export function drawLiteralGoblin(
  sketch: Sketch,
  F: PencilLayout,
  pose: VampirePose,
  options: GoblinOptions,
): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const braceletSide = screenSideForAttachment('left', pose.facing, 'leading');

  drawFeetAndLegs(sketch, F, pose, options.seated);
  if (options.dressed) drawHairBack(sketch, F, pose);
  drawEars(sketch, F, pose);
  if (profile) drawArm(sketch, F, pose, -braceletSide as -1 | 1, false, options.seated);
  drawNeck(sketch, F, pose);
  drawTorso(sketch, F, pose);
  if (options.dressed) drawTunic(sketch, F, pose);
  drawHead(sketch, F, pose);
  if (options.dressed) drawHairFront(sketch, F, pose);
  if (profile) drawArm(sketch, F, pose, braceletSide, options.dressed, options.seated);
  else {
    drawArm(sketch, F, pose, -1, options.dressed && braceletSide === -1, options.seated);
    drawArm(sketch, F, pose, 1, options.dressed && braceletSide === 1, options.seated);
  }
  drawFace(sketch, F, pose);
}
