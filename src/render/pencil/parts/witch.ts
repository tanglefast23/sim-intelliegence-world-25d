import type { PencilLayout, PencilPalette } from '../layout';
import type { MinaRigPose } from '../mina-rig';
import { gaitSwing, screenSideForAttachment, type VampirePose } from '../pose';
import type { Point, Sketch } from '../sketch';

type WitchOptions = Readonly<{ dressed: boolean; sideProfile?: boolean }>;
type Color = Extract<keyof PencilPalette, 'pale' | 'ash' | 'hollow' | 'hair' | 'hairEdge' | 'cloak' | 'cloakLift' | 'shirt' | 'lining'>;

function mass(
  sketch: Sketch,
  F: PencilLayout,
  points: readonly Point[],
  color: Color,
  style: 'light' | 'hatch' | 'scribble' | 'black' = 'light',
  angle = -0.4,
): void {
  F.media.tone(sketch, points, { style, angle, paper: false });
  F.media.skin(sketch, points, F.colors[color], { paper: false, underdraw: false, alpha: 0.82 });
  F.media.edge(sketch, [...points, points[0]!], F.lwThin * 0.85);
}

function shade(sketch: Sketch, F: PencilLayout, points: readonly Point[]): void {
  F.media.tone(sketch, points, { style: 'scribble', angle: 0.4, paper: false });
  F.media.skin(sketch, points, F.colors.ash, { paper: false, underdraw: false, alpha: 0.38 });
}

function limbShape(points: readonly Point[], halfWidths: readonly number[]): Point[] {
  const left: Point[] = [];
  const right: Point[] = [];
  points.forEach((point, index) => {
    const before = points[Math.max(0, index - 1)]!;
    const after = points[Math.min(points.length - 1, index + 1)]!;
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length * halfWidths[index]!;
    const ny = dx / length * halfWidths[index]!;
    left.push({ x: point.x + nx, y: point.y + ny });
    right.push({ x: point.x - nx, y: point.y - ny });
  });
  return [...left, ...right.reverse()];
}

function drawRiggedLeg(sketch: Sketch, F: PencilLayout, rig: MinaRigPose, side: 'left' | 'right'): void {
  const points = [rig.joints[`${side}Hip`], rig.joints[`${side}Knee`], rig.joints[`${side}Foot`]];
  mass(sketch, F, sketch.smooth(limbShape(points, [4.6, 4.2, 3.5])), 'ash', 'light', side === 'left' ? -0.4 : 0.4);
  F.media.edge(sketch, points, F.lwThin * 0.42);
  const foot = points[2]!;
  const direction = poseDirection(rig.facing, side);
  mass(sketch, F, sketch.blobPts(foot.x + direction * 2.5, foot.y - 1.5, 7.2, 4.2, direction * 0.08, 0.28), 'hollow', 'hatch', 0.1);
}

function poseDirection(facing: VampirePose['facing'], side: 'left' | 'right'): -1 | 1 {
  if (facing === 'left') return -1;
  if (facing === 'right') return 1;
  return screenSideForAttachment(side, facing, side === 'left' ? 'leading' : 'trailing');
}

function drawRiggedArm(
  sketch: Sketch,
  F: PencilLayout,
  rig: MinaRigPose,
  side: 'left' | 'right',
  dressed: boolean,
): void {
  const points = [rig.joints[`${side}Shoulder`], rig.joints[`${side}Elbow`], rig.joints[`${side}Hand`]];
  mass(sketch, F, sketch.smooth(limbShape(points, [4.8, 4.1, 3.2])), dressed ? 'cloakLift' : 'pale', dressed ? 'hatch' : 'light', side === 'left' ? -0.55 : 0.55);
  F.media.edge(sketch, points, F.lwThin * 0.45);
  const hand = points[2]!;
  const direction = poseDirection(rig.facing, side);
  mass(sketch, F, sketch.blobPts(hand.x, hand.y, 5.4, 6.6, direction * 0.08, 0.22), 'pale', 'light', direction * 0.25);
  if (side === 'left') {
    F.media.edge(sketch, [
      { x: hand.x - direction * 1.6, y: hand.y + 1 },
      { x: hand.x + direction * 1.8, y: hand.y + 2.3 },
    ], F.lwThin * 0.5);
    return;
  }
  for (const finger of [-1.8, 1.8]) {
    F.media.edge(sketch, [
      { x: hand.x + finger, y: hand.y + 0.5 },
      { x: hand.x + finger + direction * 2.6, y: hand.y + 3.5 },
    ], F.lwThin * 0.55);
  }
}

function drawRiggedBroom(sketch: Sketch, F: PencilLayout, rig: MinaRigPose): void {
  const hand = rig.joints.rightHand;
  const brush = rig.joints.broomBrush;
  const side = brush.x >= hand.x ? 1 : -1;
  mass(sketch, F, limbShape([hand, brush], [1.3, 1.7]), 'lining', 'hatch', side * 0.2);
  mass(sketch, F, [
    { x: brush.x - side * 4, y: brush.y - 9 },
    { x: brush.x + side * 7, y: brush.y - 9 },
    { x: brush.x + side * 16, y: brush.y },
    { x: brush.x - side * 10, y: brush.y },
  ], 'lining', 'hatch', side * 0.65);
  for (const offset of [-6, 0, 6]) {
    F.media.edge(sketch, [
      { x: brush.x + offset, y: brush.y - 8 },
      { x: brush.x + offset + side * 5, y: brush.y },
    ], F.lwThin * 0.55);
  }
}

function drawNeck(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -dir * 5 : 0;
  mass(sketch, F, [
    F.body(centre - 10, 128), F.body(centre + 10, 128),
    F.body(centre + 12, 164), F.body(centre - 12, 164),
  ], 'ash', 'light', 0.3);
}

function drawBroom(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const side = screenSideForAttachment('right', pose.facing, 'trailing');
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const x = side * (profile ? 45 : 58);
  mass(sketch, F, [
    F.body(x - 2, 132), F.body(x + 2, 132), F.body(x + side * 8 + 2, 279), F.body(x + side * 8 - 2, 279),
  ], 'lining', 'hatch', side * 0.2);
  const base = x + side * 8;
  mass(sketch, F, [
    F.body(base - side * 4, 267), F.body(base + side * 7, 267),
    F.body(base + side * 17, 286), F.body(base - side * 11, 286),
  ], 'lining', 'hatch', side * 0.65);
  for (const offset of [-6, 0, 6]) {
    F.media.edge(sketch, [F.body(base + offset, 271), F.body(base + offset + side * 5, 286)], F.lwThin * 0.55);
  }
}

function drawHair(sketch: Sketch, F: PencilLayout, pose: VampirePose, offset: Point = { x: 0, y: 0 }): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const rear = pose.facing === 'rear';
  const dir = pose.facing === 'right' ? 1 : -1;
  const hair = (profile
    ? sketch.smooth([
      F.head(-dir * 25, 47), F.head(-dir * 38, 57), F.head(-dir * 37, 109),
      F.body(-dir * 37, 182), F.body(-dir * 23, 232), F.body(-dir * 7, 198),
      F.head(-dir * 8, 84),
    ])
    : sketch.smooth([
      F.head(-34, 48), F.head(35, 48), F.head(40, 91), F.body(36, 203),
      F.body(19, 231), F.body(8, 196), F.body(-9, 198), F.body(-20, 232),
      F.body(-37, 204), F.head(-41, 91),
    ])).map((point) => ({ x: point.x + offset.x, y: point.y + offset.y }));
  mass(sketch, F, hair, rear ? 'hairEdge' : 'hair', 'scribble', 0.8);
  const shifted = (point: Point): Point => ({ x: point.x + offset.x, y: point.y + offset.y });
  if (profile) {
    F.media.edge(sketch, [shifted(F.head(-dir * 25, 54)), shifted(F.body(-dir * 27, 217))], F.lwThin * 0.62);
  } else {
    F.media.edge(sketch, [shifted(F.head(-23, 53)), shifted(F.body(-22, 219))], F.lwThin * 0.55);
    F.media.edge(sketch, [shifted(F.head(24, 53)), shifted(F.body(22, 216))], F.lwThin * 0.55);
  }
}

function drawRearHairCap(sketch: Sketch, F: PencilLayout): void {
  const cap = sketch.smooth([
    F.head(-35, 48), F.head(35, 48), F.head(37, 82), F.head(26, 113),
    F.head(8, 130), F.head(-8, 130), F.head(-27, 113), F.head(-38, 82),
  ]);
  mass(sketch, F, cap, 'hair', 'scribble', 0.85);
  for (const x of [-22, -8, 8, 22]) {
    F.media.edge(sketch, [F.head(x, 53), F.head(x + 2, 117)], F.lwThin * 0.48);
  }
}

function drawLegs(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const swing = pose.moving ? gaitSwing(pose.gait) * 0.8 : 0;
  const xs = profile ? [-7, 7] : [-12, 12];
  for (let index = 0; index < 2; index += 1) {
    const x = xs[index]!;
    const step = index === 0 ? swing : -swing;
    mass(sketch, F, [
      F.body(x - 5, 237), F.body(x + 5, 237), F.body(x + 5 + step * 0.2, 278), F.body(x - 4 + step * 0.2, 278),
    ], 'ash', 'light', index === 0 ? -0.4 : 0.4);
    const footDir = profile ? dir : index === 0 ? -1 : 1;
    mass(sketch, F, sketch.smooth([
      F.body(x - 5 + step * 0.2, 275), F.body(x + 5 + step * 0.2, 275),
      F.body(x + footDir * 14 + step, 286), F.body(x - footDir * 7 + step, 286),
    ]), 'hollow', 'hatch', 0.1);
  }
}

function drawTorso(sketch: Sketch, F: PencilLayout, pose: VampirePose, dressed: boolean): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const back = profile ? -dir * 10 : 0;
  const torso = profile
    ? sketch.smooth([
      F.body(back - 17, 147), F.body(back + 18, 151), F.body(back + 20, 193),
      F.body(back + 14, 235), F.body(back - 16, 235), F.body(back - 25, 176),
    ])
    : sketch.smooth([
      F.body(-28, 151), F.body(25, 151), F.body(22, 232), F.body(-23, 232),
    ]);
  mass(sketch, F, torso, dressed ? 'shirt' : 'ash', dressed ? 'hatch' : 'light', 0.45);
  if (!dressed) {
    const spineX = profile ? -dir * 9 : 0;
    F.media.edge(sketch, [F.body(spineX - dir * 3, 151), F.body(spineX, 222)], F.lwThin * 0.65);
  }
}

function drawRobe(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const back = profile ? -dir * 10 : 0;
  const robe = profile
    ? sketch.smooth([
      F.body(back - 21, 152), F.body(back + 22, 153), F.body(back + 27, 219),
      F.body(back + 35, 260), F.body(back - 34, 260), F.body(back - 26, 204),
    ])
    : sketch.smooth([
      F.body(-29, 151), F.body(28, 151), F.body(31, 207), F.body(43, 260),
      F.body(12, 255), F.body(0, 262), F.body(-13, 255), F.body(-42, 260), F.body(-31, 207),
    ]);
  mass(sketch, F, robe, 'cloak', 'hatch', profile ? dir * 0.6 : -0.6);
  const seamX = profile ? -dir * 3 : 0;
  F.media.edge(sketch, [F.body(seamX, 157), F.body(seamX, 258)], F.lwThin * 0.65);
  const hem = profile
    ? [F.body(-dir * 28, 255), F.body(dir * 36, 255)]
    : [F.body(-37, 254), F.body(0, 260), F.body(38, 254)];
  F.media.edge(sketch, hem, F.lwThin * 0.68);
}

function drawArms(sketch: Sketch, F: PencilLayout, pose: VampirePose, dressed: boolean, sideProfile = false): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const swing = pose.moving ? gaitSwing(pose.gait) * 0.22 : 0;
  const sides: readonly (-1 | 1)[] = profile && sideProfile
    ? [screenSideForAttachment('right', pose.facing, 'trailing')]
    : [-1, 1];
  for (const side of sides) {
    const depth = profile ? side * 24 : side * 39;
    const shoulder = profile ? depth : side * 34;
    const elbow = profile ? depth + side * 7 : side * 43;
    const wrist = profile ? depth + side * 10 : side * 45;
    const yShift = side * swing;
    const arm = sketch.smooth([
      F.body(shoulder - 6, 158), F.body(shoulder + 6, 158),
      F.body(elbow + 5, 201 + yShift), F.body(wrist + 4, 222 + yShift),
      F.body(wrist - 4, 222 + yShift), F.body(elbow - 5, 199 + yShift),
    ]);
    mass(sketch, F, arm, dressed ? 'cloakLift' : 'pale', dressed ? 'hatch' : 'light', side * 0.55);
    const handX = profile ? side * 38 : side * 54;
    const palm = F.body(handX, 224 + yShift);
    mass(sketch, F, sketch.blobPts(palm.x, palm.y, 5.8, 7.2, side * 0.08, 0.24), 'pale', 'light', side * 0.25);
    for (let finger = -1; finger <= 1; finger += 1) {
      F.media.edge(sketch, [
        F.body(handX + finger * 3, 225 + yShift),
        F.body(handX + finger * 3 + side * (11 + Math.abs(finger) * 2), 244 + yShift + Math.abs(finger) * 3),
      ], F.lwThin * 0.72);
    }
  }
}

function drawHead(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const rear = pose.facing === 'rear';
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const outline = profile
    ? sketch.smooth([
      F.head(-dir * 30, 47), F.head(dir * 14, 43), F.head(dir * 28, 58),
      F.head(dir * 27, 78), F.head(dir * 52, 88), F.head(dir * 31, 98),
      F.head(dir * 20, 119), F.head(dir * 8, 132), F.head(-dir * 25, 111),
    ])
    : sketch.smooth([
      F.head(-31, 45), F.head(29, 45), F.head(34, 68), F.head(29, 102),
      F.head(16, 119), F.head(0, 132), F.head(-17, 119), F.head(-31, 101), F.head(-36, 68),
    ]);
  mass(sketch, F, outline, 'pale', 'light', -0.25);
  if (rear) return;

  const eyes = profile ? [dir * 16] : [-14, 14];
  for (const x of eyes) {
    mass(sketch, F, sketch.blobPts(F.head(x, 77).x, F.head(x, 77).y, 4.5, 3.2, 0, 0.25), 'hollow', 'black');
  }
  if (!profile) {
    mass(sketch, F, [F.head(-5, 80), F.head(8, 82), F.head(15, 99), F.head(2, 103), F.head(-3, 96)], 'ash', 'light');
  }
  const cheekCentres = profile ? [F.head(dir * 12, 101)] : [F.head(-22, 99), F.head(22, 99)];
  for (const cheek of cheekCentres) {
    shade(sketch, F, sketch.blobPts(cheek.x, cheek.y, 4.8, 7, 0, 0.3));
  }
  F.media.edge(sketch, profile
    ? [F.head(dir * 5, 113), F.head(dir * 18, 116)]
    : [F.head(-10, 114), F.head(11, 114)], F.lwThin * 0.8);
}

function drawHat(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const brim = profile
    ? [F.head(-dir * 40, 61), F.head(dir * 44, 61), F.head(dir * 37, 71), F.head(-dir * 35, 72)]
    : [F.head(-44, 60), F.head(44, 60), F.head(36, 71), F.head(-39, 71)];
  mass(sketch, F, brim, 'cloak', 'black');
  const crown = profile
    ? [
      F.head(-dir * 39, 62), F.head(-dir * 22, 37), F.head(-dir * 2, 17),
      F.head(dir * 13, 29), F.head(dir * 31, 25),
      F.head(dir * 25, 40), F.head(dir * 39, 62),
    ]
    : [
      F.head(-39, 62), F.head(-22, 37), F.head(-2, 17),
      F.head(13, 29), F.head(31, 25), F.head(25, 41), F.head(39, 62),
    ];
  mass(sketch, F, crown, 'cloak', 'hatch', profile ? dir * 0.55 : 0.55);
  F.media.edge(sketch, [F.head(-27, 58), F.head(28, 58)], F.lwThin * 0.6);
}

export function drawClassicWitch(
  sketch: Sketch,
  F: PencilLayout,
  pose: VampirePose,
  options: WitchOptions = { dressed: true },
): void {
  drawLegs(sketch, F, pose);
  if (options.dressed) drawBroom(sketch, F, pose);
  drawNeck(sketch, F, pose);
  if (options.dressed) drawHair(sketch, F, pose);
  drawTorso(sketch, F, pose, options.dressed);
  if (options.dressed) drawRobe(sketch, F, pose);
  drawArms(sketch, F, pose, options.dressed, options.sideProfile);
  drawHead(sketch, F, pose);
  if (options.dressed && pose.facing === 'rear') drawRearHairCap(sketch, F);
  if (options.dressed) drawHat(sketch, F, pose);
}

function nearSide(side: 'left' | 'right', pose: VampirePose): boolean {
  return screenSideForAttachment(side, pose.facing, side === 'left' ? 'leading' : 'trailing') === 1;
}

export function drawRiggedWitch(
  sketch: Sketch,
  F: PencilLayout,
  pose: VampirePose,
  rig: MinaRigPose,
  partOrder: readonly string[],
  options: WitchOptions = { dressed: true },
): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const sides = [...(['left', 'right'] as const)]
    .sort((a, b) => Number(nearSide(a, pose)) - Number(nearSide(b, pose)));
  const draw: Readonly<Record<string, () => void>> = {
    legs: () => { for (const side of sides) drawRiggedLeg(sketch, F, rig, side); },
    broom: () => { if (options.dressed) drawRiggedBroom(sketch, F, rig); },
    'far-arm': () => { if (!(profile && options.sideProfile)) drawRiggedArm(sketch, F, rig, sides[0]!, options.dressed); },
    neck: () => drawNeck(sketch, F, pose),
    hair: () => { if (options.dressed) drawHair(sketch, F, pose, rig.hairOffset); },
    torso: () => drawTorso(sketch, F, pose, options.dressed),
    robe: () => { if (options.dressed) drawRobe(sketch, F, pose); },
    head: () => drawHead(sketch, F, pose),
    'rear-hair-cap': () => { if (options.dressed && pose.facing === 'rear') drawRearHairCap(sketch, F); },
    hat: () => { if (options.dressed) drawHat(sketch, F, pose); },
    'near-arm': () => drawRiggedArm(sketch, F, rig, profile && options.sideProfile ? 'right' : sides[1]!, options.dressed),
  };
  for (const id of partOrder) {
    const part = draw[id];
    if (!part) throw new Error(`Mina rig data names unknown part ${id}.`);
    part();
  }
}
