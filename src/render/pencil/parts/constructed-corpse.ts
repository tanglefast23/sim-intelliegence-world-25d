import type { PencilLayout } from '../layout';
import { gaitSwing, screenSideForAttachment, type AnatomicalSide, type VampirePose } from '../pose';
import { seatedArmAnchors, seatedLegAnchors, segmentBox } from '../seated';
import type { Point, Sketch } from '../sketch';

type ConstructedCorpseOptions = Readonly<{ dressed: boolean; seated?: boolean }>;

function fleshMass(
  sketch: Sketch,
  F: PencilLayout,
  points: readonly Point[],
  color: 'pale' | 'ash' | 'hollow' = 'pale',
  angle = -0.35,
): void {
  F.media.tone(sketch, points, { style: color === 'hollow' ? 'scribble' : 'light', angle });
  F.media.skin(sketch, points, F.colors[color], {
    paper: false,
    underdraw: false,
    alpha: color === 'hollow' ? 0.58 : 0.86,
  });
  F.media.edge(sketch, [...points, points[0]!], F.lwThin * 0.8);
}

function darkMass(sketch: Sketch, F: PencilLayout, points: readonly Point[]): void {
  F.media.tone(sketch, points, { style: 'black', paper: false });
  F.media.skin(sketch, points, F.colors.hair, { paper: false, underdraw: false, alpha: 0.78 });
  F.media.edge(sketch, [...points, points[0]!], F.lwThin * 0.8);
}

function metalMass(sketch: Sketch, F: PencilLayout, points: readonly Point[]): void {
  F.media.tone(sketch, points, { style: 'hatch', angle: 0.55 });
  F.media.skin(sketch, points, F.colors.fang, { paper: false, underdraw: false, alpha: 0.8 });
  F.media.edge(sketch, [...points, points[0]!], F.lwThin * 0.85);
}

function clothMass(
  sketch: Sketch,
  F: PencilLayout,
  points: readonly Point[],
  color: 'shirt' | 'cloak',
  angle: number,
): void {
  F.media.tone(sketch, points, { style: 'hatch', angle });
  F.media.skin(sketch, points, F.colors[color], { paper: false, underdraw: false, alpha: 0.88 });
  F.media.edge(sketch, [...points, points[0]!], F.lwThin * 0.8);
}

function seam(sketch: Sketch, F: PencilLayout, points: readonly Point[]): void {
  F.media.edge(sketch, points, F.lwThin * 0.8);
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]!;
    F.media.edge(sketch, [
      { x: point.x - 1.8, y: point.y - 1.2 },
      { x: point.x + 1.8, y: point.y + 1.2 },
    ], F.lwThin * 0.55);
  }
}

function sideVisible(side: AnatomicalSide, pose: VampirePose): boolean {
  if (pose.facing === 'front') return true;
  if (pose.facing === 'rear') return false;
  return pose.facing === side;
}

function drawHead(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const rear = pose.facing === 'rear';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const rightSide = screenSideForAttachment('right', pose.facing, 'trailing');
  const leftSide = rightSide === 1 ? -1 : 1;
  const outline = profile
    ? sketch.smooth([
      F.head(-dir * 37, 31), F.head(dir * 27, 29), F.head(dir * 40, 42),
      F.head(dir * 41, 78), F.head(dir * 48, 91), F.head(dir * 39, 103),
      F.head(dir * (pose.facing === 'left' ? 39 : 34), 128), F.head(-dir * 22, 128), F.head(-dir * 36, 102),
    ])
    : sketch.smooth([
      F.head(-37, 30), F.head(-43, 38), F.head(-42, 82), F.head(-34, 106),
      F.head(-27, 128), F.head(25, 128), F.head(36, 106), F.head(42, 82),
      F.head(42, 37), F.head(35, 30),
    ]);
  fleshMass(sketch, F, outline);

  const rightPatchVisible = !profile || pose.facing === 'right';
  if (rightPatchVisible) {
    const patchSide = profile ? -dir : rightSide;
    const patch = sketch.smooth([
      F.head(patchSide * 4, 32), F.head(patchSide * 33, 34), F.head(patchSide * 36, 70),
      F.head(patchSide * 28, 92), F.head(patchSide * 7, 82),
    ]);
    fleshMass(sketch, F, patch, 'ash', 0.45);
  }

  const crownEnd = profile ? F.head(-dir * 27, 68) : F.head(rightSide * 34, 67);
  seam(sketch, F, [F.head(0, 30), F.head(rightSide * 8, 45), crownEnd]);
  if (rear) {
    for (const side of [-1, 1] as const) {
      fleshMass(sketch, F, [
        F.head(side * 38, 62), F.head(side * 47, 62),
        F.head(side * 47, 71), F.head(side * 39, 72),
      ], 'hollow', side * 0.12);
    }
    seam(sketch, F, [F.head(-28, 77), F.head(0, 70), F.head(27, 78)]);
    return;
  }

  const eyeSides = profile ? [pose.facing as AnatomicalSide] : ['right', 'left'] as const;
  for (const side of eyeSides) {
    const screen = profile ? dir : screenSideForAttachment(side, pose.facing, 'trailing');
    const lower = side === 'right' ? 4 : 0;
    const centre = F.head(screen * (profile ? 18 : 15), 77 + lower);
    darkMass(sketch, F, sketch.blobPts(centre.x, centre.y, 6.5 * F.hs, 5.5 * F.hs, 0, 0.35));
    fleshMass(sketch, F, sketch.blobPts(centre.x + screen * F.hs, centre.y, 2.1, 2.1, 0, 0.2), 'ash');
  }

  const brows = profile
    ? [[F.head(-dir * 2, 64), F.head(dir * 37, 61), F.head(dir * 43, 69), F.head(dir * 2, 72)]]
    : [
      [F.head(-45, 63), F.head(-7, 60), F.head(-2, 67), F.head(-39, 73)],
      [F.head(3, 67), F.head(8, 60), F.head(45, 63), F.head(39, 73)],
    ];
  for (const brow of brows) fleshMass(sketch, F, sketch.smooth(brow), 'hollow', 0.05);

  const nose = profile
    ? [F.head(dir * 22, 83), F.head(dir * 47, 92), F.head(dir * 22, 98)]
    : [F.head(-5, 84), F.head(5, 84), F.head(8, 99), F.head(-4, 98)];
  fleshMass(sketch, F, nose, 'ash');

  const jawLeft = leftSide === -1 ? -35 : -27;
  const jawRight = leftSide === 1 ? 35 : 27;
  F.media.edge(sketch, profile
    ? [F.head(-dir * 12, 100), F.head(dir * 38, 100), F.head(dir * 34, 118), F.head(-dir * 16, 120)]
    : [F.head(jawLeft, 99), F.head(jawLeft + 3, 119), F.head(jawRight - 2, 119), F.head(jawRight, 99)],
  F.lwThin * 0.75);
  const mouthY = F.head(0, 110).y;
  F.media.edge(sketch, [
    { x: F.head(profile ? dir * 4 : -18, 110).x, y: mouthY },
    { x: F.head(profile ? dir * 29 : 19, 109).x, y: mouthY + F.hs },
  ], F.lwThin);

  if (sideVisible('left', pose)) {
    const side = profile ? dir : leftSide;
    const jawPatch = sketch.smooth([
      F.head(side * 14, 99), F.head(side * 34, 100), F.head(side * 31, 118), F.head(side * 11, 118),
    ]);
    F.media.skin(sketch, jawPatch, F.colors.hollow, { paper: false, underdraw: false, alpha: 0.28 });
    seam(sketch, F, [F.head(side * 13, 101), F.head(side * 12, 116)]);
  }

  if (sideVisible('right', pose)) {
    const cheekSide = profile ? dir : rightSide;
    seam(sketch, F, [F.head(cheekSide * 30, 79), F.head(cheekSide * 25, 91), F.head(cheekSide * 31, 104)]);
  }
}

function drawNeck(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const width = profile ? 18 : 28;
  fleshMass(sketch, F, [
    F.body(-width, 126), F.body(width, 126), F.body(width + 2, 165), F.body(-width - 2, 165),
  ], 'ash', 0.35);
  seam(sketch, F, [F.body(-width - 1, 150), F.body(0, 153), F.body(width + 1, 150)]);

  const right = screenSideForAttachment('right', pose.facing, 'trailing');
  const left = right === 1 ? -1 : 1;
  if (!profile || pose.facing === 'right') {
    const side = profile ? -dir : right;
    const centre = F.body(side * 28, 151);
    F.media.edge(sketch, [F.body(side * 22, 151), centre], F.lwThin * 1.1);
    metalMass(sketch, F, sketch.blobPts(centre.x, centre.y, 4, 4, 0, 0.25));
  }
  if (!profile || pose.facing === 'left') {
    const side = profile ? -dir : left;
    F.media.edge(sketch, [F.body(side * 21, 151), F.body(side * 25, 151)], F.lwThin * 1.1);
    metalMass(sketch, F, [
      F.body(side * 25, 144), F.body(side * 34, 144), F.body(side * 34, 157), F.body(side * 25, 157),
    ]);
  }
}

function drawTorso(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const width = profile ? 24 : 38;
  const torso = sketch.smooth([
    F.body(-width, 158), F.body(width, 158), F.body(width + (profile ? dir * 5 : 2), 201),
    F.body(width - 8, 231), F.body(-width + 8, 231), F.body(-width, 201),
  ]);
  fleshMass(sketch, F, torso, 'pale', -0.55);
  const panelSide = profile ? -dir : screenSideForAttachment('right', pose.facing, 'trailing');
  const panel = sketch.smooth([
    F.body(panelSide * 2, 160), F.body(panelSide * 34, 162), F.body(panelSide * 31, 205),
    F.body(panelSide * 8, 222),
  ]);
  fleshMass(sketch, F, panel, 'ash', 0.5);
  seam(sketch, F, [F.body(panelSide * 4, 162), F.body(panelSide * 9, 189), F.body(panelSide * 7, 220)]);
}

function drawHand(sketch: Sketch, F: PencilLayout, wrist: Point, side: -1 | 1, y: number): void {
  const centre = { x: wrist.x + side * 1.5, y };
  fleshMass(sketch, F, sketch.blobPts(centre.x, centre.y, 6.8, 8.2, side * 0.08, 0.45), 'ash');
  for (const offset of [-3, 0, 3]) {
    F.media.edge(sketch, [
      { x: centre.x + offset, y: centre.y - 2 },
      { x: centre.x + offset + side, y: centre.y + 5 },
    ], F.lwThin * 0.45);
  }
}

function drawArm(sketch: Sketch, F: PencilLayout, pose: VampirePose, side: -1 | 1, profile = false, seated = false): void {
  if (seated) {
    const anchors = seatedArmAnchors(F, pose.facing, side, 1.02);
    const isLeft = side === screenSideForAttachment('left', pose.facing, 'trailing');
    const isRight = side === screenSideForAttachment('right', pose.facing, 'trailing');
    fleshMass(sketch, F, sketch.smooth(segmentBox(anchors.shoulder, anchors.elbow, 5.5 * F.k)), isLeft ? 'ash' : 'pale', side * 0.4);
    fleshMass(sketch, F, sketch.smooth(segmentBox(anchors.elbow, anchors.wrist, 5 * F.k)), isLeft ? 'hollow' : 'pale', -side * 0.45);
    if (isRight) seam(sketch, F, segmentBox(anchors.shoulder, anchors.elbow, 2 * F.k).slice(0, 2));
    drawHand(sketch, F, anchors.wrist, side, anchors.wrist.y + 5 * F.k);
    return;
  }
  const swing = pose.moving ? gaitSwing(pose.gait) : 0;
  const vertical = side * swing * 0.28;
  const shoulderX = profile ? side * 16 : side * 39;
  const elbowX = profile ? side * 22 : side * 48;
  const wristX = profile ? side * 21 : side * 46;
  const upper = sketch.smooth([
    F.body(shoulderX - side * 6, 163), F.body(shoulderX + side * 6, 163),
    F.body(elbowX + side * 5, 194 + vertical * 0.4), F.body(elbowX - side * 5, 194 + vertical * 0.4),
  ]);
  const isLeft = side === screenSideForAttachment('left', pose.facing, 'trailing');
  const isRight = side === screenSideForAttachment('right', pose.facing, 'trailing');
  fleshMass(sketch, F, upper, isLeft ? 'ash' : 'pale', side * 0.4);
  const lower = sketch.smooth([
    F.body(elbowX - side * 5, 191 + vertical * 0.4), F.body(elbowX + side * 5, 191 + vertical * 0.4),
    F.body(wristX + side * 5, 221 + vertical), F.body(wristX - side * 5, 221 + vertical),
  ]);
  fleshMass(sketch, F, lower, isLeft ? 'hollow' : 'pale', -side * 0.45);
  if (isRight) {
    seam(sketch, F, [F.body(shoulderX - side * 4, 170), F.body(shoulderX + side * 4, 178)]);
  }
  if (isLeft) {
    seam(sketch, F, [F.body(elbowX - side * 4, 202 + vertical), F.body(wristX + side * 3, 211 + vertical)]);
  }
  drawHand(sketch, F, F.body(wristX, 222 + vertical), side, F.body(0, 231 + vertical).y);
}

function drawFoot(sketch: Sketch, F: PencilLayout, x: number, y: number, dir: -1 | 1, booted: boolean): void {
  const points = sketch.smooth([
    F.body(x - 8, y - 8), F.body(x + 6, y - 9), F.body(x + dir * 15, y - 3),
    F.body(x + dir * 17, y + 3), F.body(x - dir * 10, y + 3),
  ]);
  if (booted) clothMass(sketch, F, points, 'cloak', 0.2);
  else fleshMass(sketch, F, points, 'ash', 0.15);
}

function drawLeg(sketch: Sketch, F: PencilLayout, pose: VampirePose, side: -1 | 1, profile: boolean, booted: boolean, seated = false): void {
  if (seated) {
    const anchors = seatedLegAnchors(F, pose.facing, side, 0.98);
    const isLeft = side === screenSideForAttachment('left', pose.facing, 'trailing');
    fleshMass(sketch, F, sketch.smooth(segmentBox(anchors.hip, anchors.knee, 5.5 * F.k)), isLeft ? 'ash' : 'pale', side * 0.25);
    fleshMass(sketch, F, sketch.smooth(segmentBox(anchors.knee, anchors.ankle, 5 * F.k)), isLeft ? 'ash' : 'pale', -side * 0.25);
    drawFoot(sketch, F, (anchors.ankle.x - F.cx) / (F.k * 0.8), 290, anchors.footDirection, booted);
    return;
  }
  const phase = pose.gait === 0 ? 1 : -1;
  const passing = pose.moving && side * phase > 0;
  const lift = passing ? 9 : 0;
  const x = profile
    ? side * (pose.moving ? 10 : 5)
    : side * (pose.moving ? (passing ? 7 : 15) : 12);
  const leg = sketch.smooth([
    F.body(x - 7, 226), F.body(x + 7, 226), F.body(x + 7, 278 - lift), F.body(x - 7, 278 - lift),
  ]);
  const isLeft = side === screenSideForAttachment('left', pose.facing, 'trailing');
  fleshMass(sketch, F, leg, isLeft ? 'ash' : 'pale', side * 0.25);
  if (side === screenSideForAttachment('right', pose.facing, 'trailing')) {
    seam(sketch, F, [F.body(x - 6, 251 - lift), F.body(x + 6, 255 - lift)]);
  }
  drawFoot(sketch, F, x, 285 - lift, profile ? (pose.facing === 'right' ? 1 : -1) : side, booted);
}

function drawClothing(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  if (profile) {
    clothMass(sketch, F, [
      F.body(-dir * 8, 161), F.body(dir * 31, 161), F.body(dir * 30, 218),
      F.body(dir * 4, 228), F.body(-dir * 8, 211),
    ], 'shirt', -dir * 0.5);
    F.media.edge(sketch, [F.body(dir * 12, 165), F.body(dir * 4, 217)], F.lwThin);
  } else if (pose.facing === 'rear') {
    clothMass(sketch, F, [
      F.body(-38, 161), F.body(38, 161), F.body(31, 224), F.body(-31, 224),
    ], 'shirt', 0.55);
  } else {
    clothMass(sketch, F, [
      F.body(-39, 161), F.body(-5, 161), F.body(-13, 179), F.body(-7, 222), F.body(-32, 222),
    ], 'shirt', -0.5);
    clothMass(sketch, F, [
      F.body(5, 161), F.body(39, 161), F.body(32, 222), F.body(7, 222), F.body(13, 179),
    ], 'shirt', 0.5);
  }

  const skirtWidth = profile ? 22 : 34;
  clothMass(sketch, F, [
    F.body(-skirtWidth, 222), F.body(skirtWidth, 222),
    F.body(skirtWidth, 234), F.body(skirtWidth - 7, 234), F.body(skirtWidth - 7, 240),
    F.body(-skirtWidth + 7, 240), F.body(-skirtWidth + 7, 234), F.body(-skirtWidth, 234),
  ], 'cloak', 0.1);
}

function drawHair(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const rear = pose.facing === 'rear';
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const patches = profile
    ? [[-27, -8], [2, 24]] as const
    : [[-32, -8], [2, 29]] as const;
  for (const [index, [start, end]] of patches.entries()) {
    darkMass(sketch, F, sketch.smooth([
      F.head(start, 30 + index % 2), F.head(end - 2, 28),
      F.head(end + 1, 32 + index % 2), F.head(start + 2, 34),
    ]));
  }
  const side = screenSideForAttachment('right', pose.facing, 'trailing');
  const tuft = sketch.smooth([
    F.head(side * 20, 29), F.head(side * 31, 21), F.head(side * 36, 35), F.head(side * 30, 47),
  ]);
  darkMass(sketch, F, tuft);
  if (rear) F.media.edge(sketch, [F.head(-24, 35), F.head(0, 31), F.head(24, 35)], F.lwThin);
}

function drawRecorder(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const side = screenSideForAttachment('left', pose.facing, 'trailing');
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const full = !profile || pose.facing === 'left';
  const shoulder = F.body(side * (profile ? 22 : 35), 164);
  const recorder = full
    ? [
      { x: shoulder.x - 5, y: shoulder.y - 3 }, { x: shoulder.x + 5, y: shoulder.y - 3 },
      { x: shoulder.x + 6, y: shoulder.y + 17 }, { x: shoulder.x - 5, y: shoulder.y + 17 },
    ]
    : [
      { x: shoulder.x - 2, y: shoulder.y }, { x: shoulder.x + 3, y: shoulder.y },
      { x: shoulder.x + 3, y: shoulder.y + 13 }, { x: shoulder.x - 2, y: shoulder.y + 13 },
    ];
  F.media.edge(sketch, [F.body(0, 157), shoulder, F.body(-side * 14, 216)], F.lwThin * 1.3);
  metalMass(sketch, F, [
    { x: shoulder.x - 4, y: shoulder.y - 5 }, { x: shoulder.x + 4, y: shoulder.y - 5 },
    { x: shoulder.x + 4, y: shoulder.y }, { x: shoulder.x - 4, y: shoulder.y },
  ]);
  F.media.tone(sketch, recorder, { style: 'hatch', angle: -0.4 });
  F.media.skin(sketch, recorder, F.colors.lining, { paper: false, underdraw: false, alpha: 0.9 });
  F.media.edge(sketch, [...recorder, recorder[0]!], F.lwThin * 0.9);
  if (full) darkMass(sketch, F, sketch.blobPts(shoulder.x, shoulder.y + 6, 2.3, 3.1, 0, 0.2));
}

export function drawConstructedCorpse(
  sketch: Sketch,
  F: PencilLayout,
  pose: VampirePose,
  options: ConstructedCorpseOptions = { dressed: true },
): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const far: -1 | 1 = profile ? (dir === 1 ? -1 : 1) : -1;
  const near: -1 | 1 = profile ? dir : 1;

  if (profile) {
    drawLeg(sketch, F, pose, far, true, options.dressed, options.seated);
    drawLeg(sketch, F, pose, near, true, options.dressed, options.seated);
  } else {
    drawLeg(sketch, F, pose, -1, false, options.dressed, options.seated);
    drawLeg(sketch, F, pose, 1, false, options.dressed, options.seated);
  }
  if (profile) drawArm(sketch, F, pose, far, true, options.seated);
  drawTorso(sketch, F, pose);
  drawNeck(sketch, F, pose);
  if (!profile) {
    drawArm(sketch, F, pose, -1, false, options.seated);
    drawArm(sketch, F, pose, 1, false, options.seated);
  }
  if (options.dressed) drawClothing(sketch, F, pose);
  drawHead(sketch, F, pose);
  if (options.dressed) {
    drawHair(sketch, F, pose);
    drawRecorder(sketch, F, pose);
  }
  if (profile) drawArm(sketch, F, pose, near, true, options.seated);
}
