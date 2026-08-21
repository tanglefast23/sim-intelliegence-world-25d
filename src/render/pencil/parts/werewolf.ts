import type { PencilLayout, PencilPalette } from '../layout';
import { gaitSwing, screenSideForAttachment, type VampirePose } from '../pose';
import { seatedArmAnchors, seatedLegAnchors, segmentBox } from '../seated';
import type { Point, Sketch } from '../sketch';

type WerewolfOptions = Readonly<{ dressed: boolean; seated?: boolean }>;
type FurColor = Extract<keyof PencilPalette,
  'pale' | 'ash' | 'hollow' | 'hair' | 'hairEdge' | 'shirt' | 'lining' | 'fang'
>;

function werewolfLayout(F: PencilLayout): PencilLayout {
  const floorY = F.body(0, 286).y;
  const chinY = F.head(0, 128).y;
  return {
    ...F,
    head: (dx, dy) => {
      const point = F.head(dx * 0.88, dy);
      return { x: point.x, y: chinY - (chinY - point.y) * 0.84 };
    },
    body: (dx, dy) => {
      const point = F.body(dx * 1.12, dy);
      return { x: point.x, y: floorY - (floorY - point.y) * 1.2 };
    },
  };
}

function furMass(
  sketch: Sketch,
  F: PencilLayout,
  points: readonly Point[],
  color: FurColor,
  angle = -0.45,
): void {
  F.media.tone(sketch, points, { style: 'scribble', angle, paper: false });
  F.media.skin(sketch, points, F.colors[color], { paper: false, underdraw: false, alpha: 0.84 });
  F.media.edge(sketch, [...points, points[0]!], F.lwThin * 0.92);
}

function drawTail(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const side = screenSideForAttachment('left', pose.facing, 'trailing');
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const rootX = side * (profile ? 28 : 18);
  const reach = profile ? 76 : 68;
  furMass(sketch, F, sketch.smooth([
    F.body(rootX - 9, 211), F.body(rootX + 10, 207),
    F.body(side * (reach - 11), 193), F.body(side * (reach + 10), 204),
    F.body(side * (reach + 15), 226), F.body(side * (reach + 4), 249),
    F.body(side * (reach - 10), 255), F.body(side * (reach - 3), 230),
    F.body(side * (reach - 18), 214),
  ]), 'hairEdge', side * 0.62);
  F.media.edge(sketch, [F.body(rootX, 212), F.body(side * reach, 210), F.body(side * (reach + 3), 246)], F.lwThin * 0.5);
}

function drawLegs(sketch: Sketch, F: PencilLayout, pose: VampirePose, seated = false): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  if (seated) {
    for (const side of [-1, 1] as const) {
      const anchors = seatedLegAnchors(F, pose.facing, side, 1.18);
      const color: FurColor = side === -1 && profile ? 'ash' : 'pale';
      furMass(sketch, F, sketch.smooth(segmentBox(anchors.hip, anchors.knee, 10 * F.k)), color, side * 0.48);
      furMass(sketch, F, sketch.smooth(segmentBox(anchors.knee, anchors.ankle, 8 * F.k)), color, -side * 0.48);
      const paw = { x: anchors.ankle.x + anchors.footDirection * 8 * F.k, y: F.body(0, 290).y };
      furMass(sketch, F, sketch.blobPts(paw.x, paw.y, profile ? 15 : 17, 8.5, anchors.footDirection * 0.05, 0.32), 'ash', side * 0.35);
    }
    return;
  }
  const swing = pose.moving ? gaitSwing(pose.gait) * 0.72 : 0;
  for (const side of [-1, 1] as const) {
    const x = profile ? side * 17 : side * 27;
    const step = side * swing;
    const lift = pose.moving && side === (pose.gait === 0 ? 1 : -1) ? 7 : 0;
    furMass(sketch, F, sketch.smooth([
      F.body(x - 19, 207), F.body(x + 19, 207),
      F.body(x + side * 23, 236), F.body(x + side * 12, 253),
      F.body(x + side * 20 + step * 0.3, 273 - lift), F.body(x - side * 4 + step * 0.3, 273 - lift),
      F.body(x - side * 15, 251), F.body(x - side * 21, 231),
    ]), side === -1 && profile ? 'ash' : 'pale', side * 0.48);
    const pawDir = profile ? dir : side;
    const paw = F.body(x + step * 0.4 + pawDir * 7, 284 - lift);
    furMass(sketch, F, sketch.blobPts(paw.x, paw.y, profile ? 15 : 17, 8.5, pawDir * 0.05, 0.32), 'ash', side * 0.35);
    for (const claw of [-6, 0, 6]) {
      const base = profile
        ? { x: paw.x + pawDir * 9, y: paw.y + claw * 0.45 }
        : { x: paw.x + claw, y: paw.y + 4 };
      const tip = profile
        ? { x: base.x + pawDir * 6, y: base.y + 1 }
        : { x: base.x + side, y: base.y + 6 };
      furMass(sketch, F, [
        { x: base.x - (profile ? 0 : 2), y: base.y - (profile ? 2 : 0) },
        tip,
        { x: base.x + (profile ? 0 : 2), y: base.y + (profile ? 2 : 0) },
      ], 'fang', pawDir * 0.2);
    }
  }
}

function drawTorso(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 9 : 0;
  const torso = profile
    ? sketch.smooth([
      F.body(centre - 53, 137), F.body(centre + 55, 135), F.body(centre + 70, 165),
      F.body(centre + 59, 200), F.body(centre + 39, 229), F.body(centre - 37, 229),
      F.body(centre - 60, 204), F.body(centre - 72, 166),
    ])
    : sketch.smooth([
      F.body(-72, 145), F.body(-52, 130), F.body(-25, 124), F.body(25, 124),
      F.body(52, 130), F.body(72, 145), F.body(76, 172), F.body(61, 207),
      F.body(39, 230), F.body(-39, 230), F.body(-61, 207), F.body(-76, 172),
    ]);
  furMass(sketch, F, torso, 'pale', profile ? dir * 0.36 : -0.35);

  const chest = profile
    ? [F.body(centre - 30, 150), F.body(centre + 44, 148), F.body(centre + 35, 195), F.body(centre - 26, 202)]
    : [F.body(-48, 149), F.body(0, 166), F.body(48, 149), F.body(38, 198), F.body(0, 211), F.body(-38, 198)];
  furMass(sketch, F, sketch.smooth(chest), pose.facing === 'rear' ? 'ash' : 'hairEdge', 0.55);
  if (pose.facing !== 'rear') {
    F.media.edge(sketch, [F.body(-42, 174), F.body(0, 188), F.body(42, 174)], F.lwThin * 0.62);
  }
}

function drawManeAndNeck(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 10 : 0;
  furMass(sketch, F, sketch.smooth([
    F.head(centre - 40, 93), F.head(centre + 40, 93),
    F.body(centre + 58, 145), F.body(centre + 48, 183), F.body(centre, 166),
    F.body(centre - 48, 183), F.body(centre - 58, 145),
  ]), 'ash', 0.7);
}

function drawArm(
  sketch: Sketch,
  F: PencilLayout,
  pose: VampirePose,
  side: -1 | 1,
  far: boolean,
  wristband: boolean,
  seated = false,
): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  if (seated) {
    const anchors = seatedArmAnchors(F, pose.facing, side, 1.22);
    const color: FurColor = far ? 'ash' : 'pale';
    furMass(sketch, F, sketch.smooth(segmentBox(anchors.shoulder, anchors.elbow, 10 * F.k)), color, side * 0.58);
    furMass(sketch, F, sketch.smooth(segmentBox(anchors.elbow, anchors.wrist, 8 * F.k)), color, -side * 0.58);
    if (wristband) furMass(sketch, F, sketch.smooth(segmentBox(
      { x: anchors.wrist.x + (anchors.elbow.x - anchors.wrist.x) * 0.38, y: anchors.wrist.y + (anchors.elbow.y - anchors.wrist.y) * 0.38 },
      anchors.wrist,
      8.5 * F.k,
    )), 'lining', side * 0.2);
    const hand = { x: anchors.wrist.x, y: anchors.wrist.y + 6 * F.k };
    furMass(sketch, F, sketch.blobPts(hand.x, hand.y, 12.5, 14, side * 0.1, 0.3), color, side * 0.45);
    return;
  }
  const swing = pose.moving ? gaitSwing(pose.gait) * side * 0.34 : 0;
  const shoulderX = profile ? side * (far ? 34 : 52) : side * 69;
  const elbowX = profile ? side * (far ? 45 : 68) : side * 83;
  const wristX = profile ? side * (far ? 48 : 75) : side * 88;
  furMass(sketch, F, sketch.smooth([
    F.body(shoulderX - 18, 143), F.body(shoulderX + 18, 143),
    F.body(elbowX + 17, 180 + swing), F.body(wristX + 13, 220 + swing),
    F.body(wristX - 13, 220 + swing), F.body(elbowX - 18, 181 + swing),
  ]), far ? 'ash' : 'pale', side * 0.58);
  if (wristband) {
    furMass(sketch, F, [
      F.body(wristX - 14, 204 + swing), F.body(wristX + 14, 204 + swing),
      F.body(wristX + 13, 219 + swing), F.body(wristX - 13, 219 + swing),
    ], 'lining', side * 0.2);
  }
  const hand = F.body(wristX, 235 + swing);
  furMass(sketch, F, sketch.blobPts(hand.x, hand.y, 12.5, 14, side * 0.1, 0.3), far ? 'ash' : 'pale', side * 0.45);
  for (const claw of [-7, -2, 3, 8]) {
    F.media.edge(sketch, [
      { x: hand.x + claw, y: hand.y + 2 },
      { x: hand.x + claw + side * 3, y: hand.y + 13 },
    ], F.lwThin * 0.65);
  }
}

function drawShorts(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 8 : 0;
  furMass(sketch, F, sketch.smooth([
    F.body(centre - 43, 213), F.body(centre + 43, 213),
    F.body(centre + 40, 250), F.body(centre + 10, 246), F.body(centre, 233),
    F.body(centre - 10, 246), F.body(centre - 40, 250),
  ]), 'shirt', 0.35);
  F.media.edge(sketch, [F.body(centre - 43, 220), F.body(centre + 43, 220)], F.lwThin * 0.7);
}

function drawTankTop(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 9 : 0;
  const tank = profile
    ? sketch.smooth([
      F.body(centre - 46, 148), F.body(centre + 43, 146), F.body(centre + 50, 175),
      F.body(centre + 43, 222), F.body(centre - 39, 222), F.body(centre - 49, 177),
    ])
    : sketch.smooth([
      F.body(-55, 146), F.body(-29, 140), F.body(29, 140), F.body(55, 146),
      F.body(50, 222), F.body(-50, 222),
    ]);
  furMass(sketch, F, tank, 'shirt', profile ? dir * 0.3 : 0.35);

  const goldNeckline = profile
    ? sketch.smooth([
      F.body(centre - 25, 148), F.body(centre + 31, 147), F.body(centre + 19, 177),
      F.body(centre - 18, 179),
    ])
    : sketch.smooth([
      F.body(-31, 145), F.body(0, pose.facing === 'rear' ? 166 : 178), F.body(31, 145),
      F.body(22, 163), F.body(0, pose.facing === 'rear' ? 176 : 190), F.body(-22, 163),
    ]);
  furMass(sketch, F, goldNeckline, 'lining', 0.2);

  const opening = profile
    ? sketch.smooth([
      F.body(centre - 19, 150), F.body(centre + 24, 150), F.body(centre + 14, 170),
      F.body(centre - 13, 172),
    ])
    : sketch.smooth([
      F.body(-24, 147), F.body(0, pose.facing === 'rear' ? 163 : 174), F.body(24, 147),
      F.body(17, 158), F.body(0, pose.facing === 'rear' ? 170 : 183), F.body(-17, 158),
    ]);
  furMass(sketch, F, opening, pose.facing === 'rear' ? 'ash' : 'hairEdge', 0.55);
}

function drawEars(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const ears = profile
    ? [
      [F.head(-dir * 24, 53), F.head(-dir * 38, 5), F.head(-dir * 3, 40)],
      [F.head(dir * 5, 49), F.head(dir * 20, 2), F.head(dir * 33, 53)],
    ]
    : [
      [F.head(-34, 54), F.head(-50, 4), F.head(-11, 42)],
      [F.head(34, 54), F.head(50, 4), F.head(11, 42)],
    ];
  ears.forEach((ear, index) => {
    furMass(sketch, F, sketch.smooth(ear), index === 0 && profile ? 'ash' : 'pale', index === 0 ? -0.45 : 0.45);
  });
}

function drawHead(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const outline = profile
    ? sketch.smooth([
      F.head(-dir * 39, 50), F.head(-dir * 20, 35), F.head(dir * 18, 36),
      F.head(dir * 38, 54), F.head(dir * 44, 74), F.head(dir * 61, 88),
      F.head(dir * 66, 106), F.head(dir * 54, 121), F.head(dir * 35, 133),
      F.head(-dir * 31, 130), F.head(-dir * 46, 104), F.head(-dir * 47, 70),
    ])
    : sketch.smooth([
      F.head(-42, 51), F.head(-27, 34), F.head(27, 34), F.head(42, 51),
      F.head(48, 78), F.head(46, 108), F.head(34, 132), F.head(20, 139),
      F.head(-20, 139), F.head(-34, 132), F.head(-46, 108), F.head(-48, 78),
    ]);
  furMass(sketch, F, outline, 'pale', profile ? dir * 0.3 : -0.35);
  if (pose.facing === 'rear') {
    for (const x of [-27, -12, 3, 18, 30]) {
      F.media.edge(sketch, [F.head(x, 45), F.head(x - 3, 83), F.head(x + 2, 127)], F.lwThin * 0.48);
    }
  }
}

function drawFace(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  if (pose.facing === 'rear') return;
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const eyes = profile ? [dir * 25] : [-18, 18];
  for (const x of eyes) {
    const eye = F.head(x, 72);
    furMass(sketch, F, sketch.blobPts(eye.x, eye.y, 5.8, 4.2, 0, 0.2), 'hollow', dir * 0.2);
    F.media.skin(sketch, sketch.blobPts(eye.x + dir, eye.y, 2.2, 2.2, 0, 0.1), F.colors.lining, {
      paper: false, underdraw: false, alpha: 0.98,
    });
  }
  if (profile) {
    F.media.edge(sketch, [F.head(dir * 10, 62), F.head(dir * 35, 67)], F.lwThin * 0.9);
  } else {
    F.media.edge(sketch, [F.head(-32, 61), F.head(-7, 68)], F.lwThin * 0.9);
    F.media.edge(sketch, [F.head(7, 68), F.head(32, 61)], F.lwThin * 0.9);
  }

  const muzzle = profile
    ? sketch.smooth([
      F.head(dir * 8, 81), F.head(dir * 58, 82), F.head(dir * 70, 96),
      F.head(dir * 64, 116), F.head(dir * 38, 126), F.head(dir * 7, 113),
    ])
    : sketch.smooth([
      F.head(-27, 83), F.head(27, 83), F.head(35, 100), F.head(29, 123),
      F.head(0, 134), F.head(-29, 123), F.head(-35, 100),
    ]);
  furMass(sketch, F, muzzle, 'hairEdge', profile ? dir * 0.2 : -0.2);
  const nose = profile ? F.head(dir * 67, 96) : F.head(0, 98);
  furMass(sketch, F, sketch.blobPts(nose.x, nose.y, profile ? 7.5 : 9.5, 6.8, 0, 0.2), 'hollow', 0.1);
  F.media.edge(sketch, profile
    ? [F.head(dir * 18, 112), F.head(dir * 58, 113)]
    : [F.head(-24, 115), F.head(0, 121), F.head(24, 115)], F.lwThin * 0.78);

  const fangs = profile ? [dir * 46] : [-21, 21];
  for (const x of fangs) {
    const side = x < 0 ? -1 : 1;
    furMass(sketch, F, [
      F.head(x - 5, 114), F.head(x + 5, 114), F.head(x + side * 2, 132),
    ], 'fang', side * 0.2);
  }
}

export function drawLiteralWerewolf(
  sketch: Sketch,
  F: PencilLayout,
  pose: VampirePose,
  options: WerewolfOptions = { dressed: true },
): void {
  F = werewolfLayout(F);
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const wristbandSide = screenSideForAttachment('left', pose.facing, 'leading');

  if (!profile) drawTail(sketch, F, pose);
  drawLegs(sketch, F, pose, options.seated);
  if (profile) drawArm(sketch, F, pose, -wristbandSide as -1 | 1, true, false, options.seated);
  drawTorso(sketch, F, pose);
  if (profile) drawTail(sketch, F, pose);
  drawManeAndNeck(sketch, F, pose);
  if (options.dressed) {
    drawTankTop(sketch, F, pose);
    drawShorts(sketch, F, pose);
  }
  drawEars(sketch, F, pose);
  drawHead(sketch, F, pose);
  if (profile) drawArm(sketch, F, pose, wristbandSide, false, options.dressed, options.seated);
  else {
    drawArm(sketch, F, pose, -1, false, options.dressed && wristbandSide === -1, options.seated);
    drawArm(sketch, F, pose, 1, false, options.dressed && wristbandSide === 1, options.seated);
  }
  drawFace(sketch, F, pose);
}
