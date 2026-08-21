import type { PencilLayout, PencilPalette } from '../layout';
import { gaitSwing, screenSideForAttachment, type VampirePose } from '../pose';
import { seatedArmAnchors, seatedLegAnchors, segmentBox } from '../seated';
import type { Point, Sketch } from '../sketch';

type OrcOptions = Readonly<{ dressed: boolean; seated?: boolean }>;
type Color = Extract<keyof PencilPalette,
  'pale' | 'ash' | 'hollow' | 'hair' | 'hairEdge' | 'cloak' | 'cloakLift' | 'shirt' | 'lining' | 'fang' | 'white'
>;

function mass(
  sketch: Sketch,
  F: PencilLayout,
  points: readonly Point[],
  color: Color,
  style: 'light' | 'hatch' | 'scribble' | 'black' = 'light',
  angle = -0.4,
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
      const anchors = seatedLegAnchors(F, pose.facing, side, 1.08);
      mass(sketch, F, sketch.smooth(segmentBox(anchors.hip, anchors.knee, 7 * F.k)), 'pale', 'light', side * 0.42);
      mass(sketch, F, sketch.smooth(segmentBox(anchors.knee, anchors.ankle, 6 * F.k)), 'pale', 'light', -side * 0.42);
      const foot = { x: anchors.ankle.x + anchors.footDirection * 6 * F.k, y: F.body(0, 292).y };
      mass(sketch, F, sketch.blobPts(foot.x, foot.y, profile ? 10.5 : 12.3, 7.5, anchors.footDirection * 0.06, 0.34), 'ash');
      for (const toe of [-5, 0, 5]) {
        mass(sketch, F, [
          { x: foot.x + anchors.footDirection * 7, y: foot.y + toe * 0.35 - 2 },
          { x: foot.x + anchors.footDirection * 15, y: foot.y + toe * 0.45 },
          { x: foot.x + anchors.footDirection * 7, y: foot.y + toe * 0.35 + 2 },
        ], 'hollow', 'black');
      }
    }
    return;
  }
  const swing = pose.moving ? gaitSwing(pose.gait) * 0.72 : 0;
  for (const side of [-1, 1] as const) {
    const x = profile ? side * 15 : side * 22;
    const step = side * swing;
    const lift = pose.moving && side === (pose.gait === 0 ? 1 : -1) ? 6 : 0;
    mass(sketch, F, sketch.smooth([
      F.body(x - 12, 226), F.body(x + 12, 226),
      F.body(x + side * 15, 250), F.body(x + side * 12 + step * 0.3, 274 - lift),
      F.body(x - side * 3 + step * 0.3, 274 - lift), F.body(x - side * 14, 249),
    ]), 'pale', 'light', side * 0.42);
    const footDir = profile ? dir : side;
    const foot = F.body(x + step * 0.4 + footDir * 6, 284 - lift);
    mass(sketch, F, sketch.blobPts(foot.x, foot.y, profile ? 10.5 : 12.3, 7.5, footDir * 0.06, 0.34), 'ash');
    for (const toe of [-5, 0, 5]) {
      mass(sketch, F, [
        { x: foot.x + footDir * 7, y: foot.y + toe * 0.35 - 2 },
        { x: foot.x + footDir * 15, y: foot.y + toe * 0.45 },
        { x: foot.x + footDir * 7, y: foot.y + toe * 0.35 + 2 },
      ], 'hollow', 'black');
    }
  }
}

function drawNeck(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 7 : 0;
  mass(sketch, F, sketch.smooth([
    F.body(centre - 31, 121), F.body(centre + 31, 121),
    F.body(centre + 37, 170), F.body(centre - 37, 170),
  ]), 'ash', 'light', 0.28);
}

function drawTorso(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 8 : 0;
  const torso = profile
    ? sketch.smooth([
      F.body(centre - 42, 146), F.body(centre + 45, 144), F.body(centre + 56, 169),
      F.body(centre + 48, 205), F.body(centre + 33, 239), F.body(centre - 31, 239),
      F.body(centre - 48, 208), F.body(centre - 56, 170),
    ])
    : sketch.smooth([
      F.body(-56, 148), F.body(-36, 137), F.body(36, 137), F.body(56, 148),
      F.body(62, 174), F.body(49, 211), F.body(33, 239), F.body(-33, 239),
      F.body(-49, 211), F.body(-62, 174),
    ]);
  mass(sketch, F, torso, 'pale', 'light', profile ? dir * 0.34 : -0.3);

  if (pose.facing === 'rear') {
    F.media.edge(sketch, [F.body(-39, 159), F.body(0, 177), F.body(39, 159)], F.lwThin * 0.58);
    F.media.edge(sketch, [F.body(0, 156), F.body(0, 224)], F.lwThin * 0.5);
  } else {
    F.media.edge(sketch, [F.body(-35, 172), F.body(0, 183), F.body(35, 172)], F.lwThin * 0.58);
    F.media.edge(sketch, [F.body(-31, 201), F.body(0, 209), F.body(31, 201)], F.lwThin * 0.5);
  }
}

function drawArm(
  sketch: Sketch,
  F: PencilLayout,
  pose: VampirePose,
  side: -1 | 1,
  far: boolean,
  wrapped: boolean,
  seated = false,
): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  if (seated) {
    const anchors = seatedArmAnchors(F, pose.facing, side, 1.12);
    const color = far ? 'ash' : 'pale';
    mass(sketch, F, sketch.smooth(segmentBox(anchors.shoulder, anchors.elbow, 8 * F.k)), color, 'light', side * 0.48);
    mass(sketch, F, sketch.smooth(segmentBox(anchors.elbow, anchors.wrist, 7 * F.k)), color, 'light', -side * 0.48);
    if (wrapped) mass(sketch, F, sketch.smooth(segmentBox(
      { x: anchors.wrist.x + (anchors.elbow.x - anchors.wrist.x) * 0.35, y: anchors.wrist.y + (anchors.elbow.y - anchors.wrist.y) * 0.35 },
      anchors.wrist,
      7.5 * F.k,
    )), 'hairEdge', 'hatch', side * 0.2);
    const hand = { x: anchors.wrist.x, y: anchors.wrist.y + 4 * F.k };
    mass(sketch, F, sketch.blobPts(hand.x, hand.y, 11.5, 12.5, side * 0.08, 0.3), color);
    return;
  }
  const swing = pose.moving ? gaitSwing(pose.gait) * side * 0.28 : 0;
  const shoulderX = profile ? side * (far ? 28 : 43) : side * 57;
  const elbowX = profile ? side * (far ? 34 : 52) : side * 68;
  const wristX = profile ? side * (far ? 31 : 57) : side * 70;
  mass(sketch, F, sketch.smooth([
    F.body(shoulderX - 15, 151), F.body(shoulderX + 15, 151),
    F.body(elbowX + 14, 190 + swing), F.body(wristX + 11, 224 + swing),
    F.body(wristX - 11, 224 + swing), F.body(elbowX - 14, 190 + swing),
  ]), far ? 'ash' : 'pale', 'light', side * 0.48);
  if (wrapped) {
    mass(sketch, F, [
      F.body(wristX - 12, 208 + swing), F.body(wristX + 12, 208 + swing),
      F.body(wristX + 11, 224 + swing), F.body(wristX - 11, 224 + swing),
    ], 'hairEdge', 'hatch', side * 0.2);
  }
  const hand = F.body(wristX, 236 + swing);
  mass(sketch, F, sketch.blobPts(hand.x, hand.y, 11.5, 12.5, side * 0.08, 0.3), far ? 'ash' : 'pale');
  for (const finger of [-6, 0, 6]) {
    F.media.edge(sketch, [
      { x: hand.x + finger, y: hand.y - 1 },
      { x: hand.x + finger + side * 1.5, y: hand.y + 8 },
    ], F.lwThin * 0.62);
  }
}

function drawApronAndShorts(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 6 : 0;
  const shorts = sketch.smooth([
    F.body(centre - 38, 222), F.body(centre + 38, 222),
    F.body(centre + 35, 260), F.body(centre + 8, 257), F.body(centre, 246),
    F.body(centre - 8, 257), F.body(centre - 35, 260),
  ]);
  mass(sketch, F, shorts, 'shirt', 'hatch', 0.48);

  if (pose.facing === 'rear') {
    F.media.edge(sketch, [F.body(-30, 151), F.body(0, 178), F.body(30, 151)], F.lwThin * 0.72);
    F.media.edge(sketch, [F.body(-43, 224), F.body(43, 224)], F.lwThin * 0.72);
    mass(sketch, F, [
      F.body(-3, 221), F.body(-21, 212), F.body(-17, 229), F.body(-2, 225),
      F.body(3, 225), F.body(17, 229), F.body(21, 212), F.body(3, 221),
    ], 'cloakLift', 'light');
    return;
  }

  const apron = profile
    ? sketch.smooth([
      F.body(centre - 19, 150), F.body(centre + 20, 150), F.body(centre + 26, 207),
      F.body(centre + 34, 244), F.body(centre - 29, 244), F.body(centre - 25, 205),
    ])
    : sketch.smooth([
      F.body(-20, 148), F.body(20, 148), F.body(24, 193),
      F.body(38, 244), F.body(-38, 244), F.body(-24, 193),
    ]);
  mass(sketch, F, apron, 'cloak', 'light', profile ? dir * 0.5 : -0.48);
  const strapY = 153;
  F.media.edge(sketch, [F.body(centre - 42, strapY), F.body(centre + 42, strapY)], F.lwThin * 0.7);
  F.media.edge(sketch, [F.body(centre - 33, 225), F.body(centre + 33, 225)], F.lwThin * 0.65);
}

function drawEars(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  if (profile) {
    const side = -dir;
    mass(sketch, F, sketch.smooth([
      F.head(side * 34, 72), F.head(side * 56, 76),
      F.head(side * 38, 92), F.head(side * 28, 94),
    ]), 'ash', 'light', side * 0.4);
    F.media.edge(sketch, [F.head(side * 34, 80), F.head(side * 49, 79)], F.lwThin * 0.52);
    return;
  }
  for (const side of [-1, 1] as const) {
    mass(sketch, F, sketch.smooth([
      F.head(side * 40, 72), F.head(side * 62, 70),
      F.head(side * 45, 91), F.head(side * 34, 94),
    ]), 'ash', 'light', side * 0.4);
    F.media.edge(sketch, [F.head(side * 42, 79), F.head(side * 56, 75)], F.lwThin * 0.52);
  }
}

function drawHead(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const outline = profile
    ? sketch.smooth([
      F.head(-dir * 36, 54), F.head(-dir * 14, 43), F.head(dir * 22, 45),
      F.head(dir * 39, 63), F.head(dir * 44, 82), F.head(dir * 55, 100),
      F.head(dir * 53, 119), F.head(dir * 37, 135), F.head(-dir * 28, 133),
      F.head(-dir * 43, 109), F.head(-dir * 45, 76),
    ])
    : sketch.smooth([
      F.head(-39, 53), F.head(-24, 42), F.head(24, 42), F.head(39, 53),
      F.head(45, 80), F.head(47, 108), F.head(38, 130), F.head(24, 138),
      F.head(-24, 138), F.head(-38, 130), F.head(-47, 108), F.head(-45, 80),
    ]);
  mass(sketch, F, outline, 'pale', 'light', profile ? dir * 0.24 : -0.28);
}

function drawHair(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const mohawk = profile
    ? sketch.smooth([
      F.head(-dir * 28, 52), F.head(-dir * 18, 33), F.head(-dir * 5, 39),
      F.head(dir * 6, 26), F.head(dir * 14, 42), F.head(dir * 28, 48),
    ])
    : sketch.smooth([
      F.head(-15, 48), F.head(-12, 31), F.head(-3, 38),
      F.head(2, 24), F.head(10, 40), F.head(16, 49),
    ]);
  mass(sketch, F, mohawk, pose.facing === 'rear' ? 'hairEdge' : 'hair', 'scribble', 0.62);
  const napeSide = profile ? -dir * 30 : 0;
  mass(sketch, F, sketch.smooth([
    F.head(napeSide - 10, 112), F.head(napeSide + 10, 112),
    F.body(napeSide + 12, 145), F.body(napeSide, 158), F.body(napeSide - 12, 145),
  ]), 'hairEdge', 'scribble', 0.7);
}

function drawFace(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  if (pose.facing === 'rear') return;
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const eyes = profile ? [dir * 23] : [-17, 17];
  for (const x of eyes) {
    const eye = F.head(x, 78);
    mass(sketch, F, sketch.blobPts(eye.x, eye.y, 5.5, 4.2, 0, 0.2), 'white');
    mass(sketch, F, sketch.blobPts(eye.x + dir, eye.y + 0.5, 2.1, 2.2, 0, 0.15), 'hollow', 'black');
  }
  if (profile) {
    F.media.edge(sketch, [F.head(dir * 8, 68), F.head(dir * 31, 72)], F.lwThin * 0.88);
  } else {
    F.media.edge(sketch, [F.head(-30, 68), F.head(-8, 74)], F.lwThin * 0.88);
    F.media.edge(sketch, [F.head(8, 74), F.head(30, 68)], F.lwThin * 0.88);
  }

  const nose = profile
    ? sketch.smooth([
      F.head(dir * 18, 85), F.head(dir * 48, 88), F.head(dir * 51, 101),
      F.head(dir * 36, 106), F.head(dir * 18, 100),
    ])
    : sketch.smooth([
      F.head(-15, 88), F.head(15, 88), F.head(20, 103),
      F.head(10, 108), F.head(0, 104), F.head(-10, 108), F.head(-20, 103),
    ]);
  mass(sketch, F, nose, 'ash', 'light', 0.1);
  const nostrils = profile ? [dir * 42] : [-9, 9];
  for (const x of nostrils) {
    const nostril = F.head(x, 99);
    mass(sketch, F, sketch.blobPts(nostril.x, nostril.y, 2.1, 1.6, 0, 0.1), 'hollow', 'black');
  }

  const jaw = profile
    ? sketch.smooth([
      F.head(dir * 10, 107), F.head(dir * 51, 108), F.head(dir * 52, 126),
      F.head(dir * 36, 136), F.head(-dir * 25, 133), F.head(-dir * 31, 119),
    ])
    : sketch.smooth([
      F.head(-39, 108), F.head(39, 108), F.head(43, 126), F.head(27, 139),
      F.head(-27, 139), F.head(-43, 126),
    ]);
  mass(sketch, F, jaw, 'ash', 'light', profile ? dir * 0.3 : -0.2);
  F.media.edge(sketch, profile
    ? [F.head(dir * 14, 119), F.head(dir * 45, 119)]
    : [F.head(-27, 120), F.head(0, 124), F.head(27, 120)], F.lwThin * 0.78);

  const tusks = profile ? [dir * 41] : [-23, 23];
  for (const x of tusks) {
    const side = x < 0 ? -1 : 1;
    const rootY = profile ? 132 : 125;
    const tipY = profile ? 106 : 94;
    mass(sketch, F, [
      F.head(x - 5, rootY), F.head(x + 5, rootY),
      F.head(x + side * 2, tipY), F.head(x - side * 2, tipY + 10),
    ], 'fang', 'light', side * 0.2);
  }
}

function drawLadle(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const side = screenSideForAttachment('right', pose.facing, 'trailing');
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const x = side * (profile ? 68 : 82);
  mass(sketch, F, [
    F.body(x - 2, 143), F.body(x + 2, 143),
    F.body(x + side * 4 + 2, 276), F.body(x + side * 4 - 2, 276),
  ], 'lining', 'hatch', side * 0.18);
  const bowl = F.body(x, 132);
  mass(sketch, F, sketch.blobPts(bowl.x, bowl.y, 7.5, 10.5, side * 0.05, 0.25), 'white', 'light');
  mass(sketch, F, sketch.blobPts(bowl.x, bowl.y, 4.4, 6.8, side * 0.05, 0.18), 'hollow', 'black');
}

export function drawLiteralOrc(
  sketch: Sketch,
  F: PencilLayout,
  pose: VampirePose,
  options: OrcOptions = { dressed: true },
): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const propSide = screenSideForAttachment('right', pose.facing, 'trailing');

  drawLegs(sketch, F, pose, options.seated);
  if (profile) drawArm(sketch, F, pose, -propSide as -1 | 1, true, options.dressed, options.seated);
  drawNeck(sketch, F, pose);
  drawTorso(sketch, F, pose);
  if (options.dressed) drawApronAndShorts(sketch, F, pose);
  drawEars(sketch, F, pose);
  drawHead(sketch, F, pose);
  if (options.dressed) drawHair(sketch, F, pose);
  if (profile) drawArm(sketch, F, pose, propSide, false, options.dressed, options.seated);
  else {
    drawArm(sketch, F, pose, -1, false, options.dressed, options.seated);
    drawArm(sketch, F, pose, 1, false, options.dressed, options.seated);
  }
  drawFace(sketch, F, pose);
  if (options.dressed && !options.seated) drawLadle(sketch, F, pose);
}
