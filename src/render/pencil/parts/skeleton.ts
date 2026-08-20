import type { PencilLayout } from '../layout';
import { gaitSwing, screenSideForAttachment, type VampirePose } from '../pose';
import type { Point, Sketch } from '../sketch';

type SkeletonOptions = Readonly<{ dressed: boolean }>;

function boneMass(
  sketch: Sketch,
  F: PencilLayout,
  points: readonly Point[],
  outline = F.lwThin * 0.45,
): void {
  F.media.tone(sketch, points, { style: 'light', angle: -0.35 });
  F.media.skin(sketch, points, F.colors.pale, { paper: false, underdraw: false, alpha: 0.84 });
  F.media.edge(sketch, points, outline);
}

function boneSegment(sketch: Sketch, F: PencilLayout, start: Point, end: Point, halfWidth: number): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length * halfWidth;
  const ny = dx / length * halfWidth;
  boneMass(sketch, F, sketch.smooth([
    { x: start.x + nx, y: start.y + ny },
    { x: end.x + nx, y: end.y + ny },
    { x: end.x - nx, y: end.y - ny },
    { x: start.x - nx, y: start.y - ny },
  ]));
}

function joint(sketch: Sketch, F: PencilLayout, point: Point, radius = 2.3): void {
  boneMass(sketch, F, sketch.blobPts(point.x, point.y, radius, radius, 0, 0.35));
}

function darkMass(sketch: Sketch, F: PencilLayout, points: readonly Point[]): void {
  F.media.tone(sketch, points, { style: 'black', paper: false });
  F.media.skin(sketch, points, F.colors.hollow, { paper: false, underdraw: false, alpha: 0.72 });
}

function clothMass(sketch: Sketch, F: PencilLayout, points: readonly Point[], charcoal = false): void {
  F.media.tone(sketch, points, { style: 'light', angle: charcoal ? 0.2 : -0.5 });
  F.media.skin(sketch, points, charcoal ? F.colors.cloakLift : F.colors.shirt, {
    paper: false,
    underdraw: false,
    alpha: charcoal ? 0.84 : 0.88,
  });
  F.media.edge(sketch, [...points, points[0]!], F.lwThin * 0.75);
}

function drawHairRoot(sketch: Sketch, F: PencilLayout, side: -1 | 1): void {
  const root = sketch.smooth([
    F.head(side * 8, 18), F.head(side * 34, 31), F.head(side * 45, 63),
    F.head(side * 35, 98), F.head(side * 22, 116), F.head(side * 23, 67),
  ]);
  F.media.tone(sketch, root, { style: 'black', angle: 0.08 });
  F.media.skin(sketch, root, F.colors.hair, { paper: false, underdraw: false, alpha: 0.68 });
  F.media.edge(sketch, root, F.lwMain);
}

function drawBraid(sketch: Sketch, F: PencilLayout, pose: VampirePose, side: -1 | 1): void {
  const sway = pose.moving ? (pose.gait === 0 ? -2 : 2) : 0;
  const centers = [
    F.head(side * 31, 105), F.head(side * 29, 119), F.body(side * 44, 146),
    F.body(side * 51 + sway, 169), F.body(side * 55 + sway, 194),
    F.body(side * 54 + sway, 219), F.body(side * 50 + sway, 241),
  ];
  F.media.edge(sketch, centers, F.lwMain * 0.85);
  centers.forEach((center, index) => {
    const radius = 4.1 - index * 0.22;
    const braid = sketch.blobPts(center.x, center.y, radius, radius * 1.2, index % 2 === 0 ? 0.35 : -0.35, 0.9);
    F.media.tone(sketch, braid, { style: 'hatch', angle: index % 2 === 0 ? 0.4 : -0.4 });
    F.media.skin(sketch, braid, F.colors.hair, { paper: false, underdraw: false, alpha: 0.86 });
    F.media.edge(sketch, braid, F.lwThin * 0.9);
  });
}

function drawSkull(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const dir = pose.facing === 'right' ? 1 : pose.facing === 'left' ? -1 : 0;
  const rear = pose.facing === 'rear';
  const outline = dir === 0
    ? [
      F.head(-35, 22), F.head(-45, 43), F.head(-43, 79), F.head(-31, 102),
      F.head(-23, 121), F.head(23, 121), F.head(31, 102), F.head(43, 79),
      F.head(45, 43), F.head(35, 22),
    ]
    : [
      F.head(-dir * 31, 27), F.head(-dir * 39, 53), F.head(-dir * 33, 88),
      F.head(-dir * 19, 113), F.head(dir * 25, 121), F.head(dir * 42, 92),
      F.head(dir * 43, 51), F.head(dir * 27, 24),
    ];
  boneMass(sketch, F, sketch.smooth(outline), F.lwMain);

  if (rear) {
    F.media.edge(sketch, [F.head(-18, 56), F.head(0, 48), F.head(18, 56)], F.lwThin);
    return;
  }

  const socketY = F.head(0, 76).y;
  const socketXs = dir === 0 ? [-16, 16] : [dir * 18];
  for (const x of socketXs) {
    const center = F.head(x, 76);
    darkMass(sketch, F, sketch.blobPts(center.x, socketY, 8.5 * F.hs, 10 * F.hs, dir * 0.12, 0.45));
    const pupil = sketch.blobPts(center.x + dir * F.hs, center.y, 1.8, 2.3, 0, 0.25);
    F.media.skin(sketch, pupil, F.colors.lining, { paper: false, underdraw: false, alpha: 0.95 });
  }

  const nose = dir === 0
    ? [F.head(-5, 91), F.head(0, 82), F.head(6, 92), F.head(0, 100)]
    : [F.head(dir * 12, 87), F.head(dir * 27, 95), F.head(dir * 10, 101)];
  darkMass(sketch, F, nose);

  const jaw = dir === 0
    ? [F.head(-22, 103), F.head(22, 103), F.head(18, 126), F.head(-17, 126)]
    : [F.head(-dir * 10, 105), F.head(dir * 31, 103), F.head(dir * 24, 124), F.head(-dir * 8, 126)];
  boneMass(sketch, F, sketch.smooth(jaw), F.lwThin * 0.9);
  for (const x of [-12, -4, 4, 12]) {
    if (dir !== 0 && x * dir < -4) continue;
    F.media.edge(sketch, [F.head(x, 106), F.head(x, 118)], F.lwThin * 0.7);
  }
  F.media.edge(sketch, [F.head(dir * 2 - 17, 119), F.head(dir * 2 + 17, 119)], F.lwThin);
}

function drawRibCage(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : pose.facing === 'left' ? -1 : 0;
  const rear = pose.facing === 'rear';
  const spineX = profile ? -dir * 4 : 0;
  const neckTop = F.head(profile ? -dir * 4 : 0, 123);
  const neckBase = F.body(spineX, 149);
  boneSegment(sketch, F, neckTop, neckBase, 1.25);
  for (const t of [0.35, 0.7]) {
    joint(sketch, F, {
      x: neckTop.x + (neckBase.x - neckTop.x) * t,
      y: neckTop.y + (neckBase.y - neckTop.y) * t,
    }, 1.7);
  }
  boneSegment(sketch, F, neckBase, F.body(spineX, 216), 1.7);
  for (const y of [149, 160, 171]) joint(sketch, F, F.body(spineX, y), 2.1);

  const ribCount = 5;
  for (let row = 0; row < ribCount; row += 1) {
    const y = 157 + row * 11;
    const width = profile ? 18 - row : 36 - row * 2;
    for (const side of profile ? [dir] : [-1, 1]) {
      const start = F.body(spineX, y);
      const outer = F.body(side * width, y + 2);
      const tip = F.body(side * (profile ? 7 : 5), y + 9);
      boneSegment(sketch, F, start, outer, 1.25);
      boneSegment(sketch, F, outer, tip, 1.1);
    }
  }
  if (!rear) boneSegment(sketch, F, F.body(dir * 2, 151), F.body(dir * 2, 209), 1.45);
}

function drawPelvis(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const width = profile ? 15 : 28;
  const left = sketch.smooth([
    F.body(-width, 210), F.body(-4, 213), F.body(-7, 232), F.body(-18, 228),
  ]);
  const right = sketch.smooth([
    F.body(4, 213), F.body(width, 210), F.body(18, 228), F.body(7, 232),
  ]);
  boneMass(sketch, F, left);
  boneMass(sketch, F, right);
  boneSegment(sketch, F, F.body(-7, 229), F.body(7, 229), 1.7);
}

function drawArm(sketch: Sketch, F: PencilLayout, shoulder: Point, elbow: Point, wrist: Point): void {
  boneSegment(sketch, F, shoulder, elbow, 2.1);
  boneSegment(sketch, F, elbow, wrist, 1.45);
  boneSegment(sketch, F, { x: elbow.x + 1.8, y: elbow.y }, { x: wrist.x + 1.4, y: wrist.y }, 0.75);
  joint(sketch, F, shoulder, 2.7);
  joint(sketch, F, elbow, 2.3);
  joint(sketch, F, wrist, 1.8);
  for (const spread of [-2.4, 0, 2.4]) {
    boneSegment(sketch, F, wrist, { x: wrist.x + spread, y: wrist.y + 7 }, 0.45);
  }
}

function drawProfileArm(sketch: Sketch, F: PencilLayout, pose: VampirePose, side: -1 | 1): void {
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const swing = pose.moving ? gaitSwing(pose.gait) : 0;
  const armSwing = side === dir ? swing : -swing;
  drawArm(
    sketch, F,
    F.body(side * 15, 149),
    F.body(side * 22 - armSwing * 0.18, 184),
    F.body(side * 19 - armSwing * 0.3, 218),
  );
}

function drawArms(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const swing = pose.moving ? gaitSwing(pose.gait) : 0;
  for (const side of [-1, 1] as const) {
    const verticalSwing = side * swing * 0.34;
    drawArm(
      sketch, F,
      F.body(side * 24, 149),
      F.body(side * 38, 181 + verticalSwing * 0.45),
      F.body(side * 36, 218 + verticalSwing),
    );
  }
}

function drawLeg(sketch: Sketch, F: PencilLayout, hip: Point, knee: Point, ankle: Point, toe: Point): void {
  boneSegment(sketch, F, hip, knee, 2.5);
  boneSegment(sketch, F, knee, ankle, 1.55);
  boneSegment(sketch, F, { x: knee.x + 2, y: knee.y }, { x: ankle.x + 2, y: ankle.y }, 0.75);
  joint(sketch, F, hip, 3);
  joint(sketch, F, knee, 2.5);
  joint(sketch, F, ankle, 2);
  boneSegment(sketch, F, ankle, toe, 1.1);
  for (const spread of [-2, 0, 2]) boneSegment(sketch, F, toe, { x: toe.x + spread, y: toe.y + 2 }, 0.4);
}

function drawLegs(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const spread = pose.moving && pose.gait === 0;
    const leadX = (pose.moving ? (spread ? 14 : 5) : 5) * dir;
    const trailX = (pose.moving ? (spread ? -14 : -2) : -5) * dir;
    const trailLift = pose.moving && !spread ? 10 : 0;
    drawLeg(sketch, F, F.body(dir * 4, 226), F.body(trailX * 0.5, 255), F.body(trailX, 282 - trailLift), F.body(trailX + dir * 9, 287 - trailLift));
    drawLeg(sketch, F, F.body(-dir * 3, 226), F.body(leadX * 0.5, 257), F.body(leadX, 285), F.body(leadX + dir * 10, 288));
    return;
  }
  const phase = pose.gait === 0 ? 1 : -1;
  for (const side of [-1, 1] as const) {
    const lift = pose.moving && side * phase > 0 ? 12 : 0;
    const footX = side * 8 + (pose.moving ? -side * phase * 5 : 0);
    drawLeg(
      sketch, F,
      F.body(side * 8, 226),
      F.body(side * 7 - side * phase * 2, 255 - lift * 0.25),
      F.body(footX, 282 - lift),
      F.body(footX + side * 9, 287 - lift),
    );
  }
}

function drawClothing(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir = pose.facing === 'right' ? 1 : -1;
  const width = profile ? 20 : 38;
  const leftTop = [F.body(-width, 145), F.body(-7, 145), F.body(-17, 166), F.body(-8, 204), F.body(-30, 204), F.body(-width, 184)];
  const rightTop = [F.body(7, 145), F.body(width, 145), F.body(width, 184), F.body(30, 204), F.body(8, 204), F.body(17, 166)];
  if (profile) {
    clothMass(sketch, F, [
      F.body(-dir * 7, 145), F.body(dir * 18, 145), F.body(dir * 14, 166),
      F.body(dir * 9, 204), F.body(-dir * 7, 204), F.body(-dir * 7, 178),
    ]);
  } else if (pose.facing === 'rear') {
    clothMass(sketch, F, [
      F.body(-width, 145), F.body(width, 145), F.body(30, 204), F.body(-30, 204),
    ]);
  } else {
    clothMass(sketch, F, leftTop);
    clothMass(sketch, F, rightTop);
  }

  const skirtWidth = profile ? 19 : 32;
  clothMass(sketch, F, [
    F.body(-skirtWidth * 0.72, 212), F.body(skirtWidth * 0.72, 212),
    F.body(skirtWidth, 247), F.body(-skirtWidth, 247),
  ], true);

  if (pose.facing !== 'rear') {
    const knot = F.body(0, 143);
    clothMass(sketch, F, sketch.blobPts(F.body(-11, 143).x, knot.y, 5.5, 3.8, 0.3, 0.35), true);
    clothMass(sketch, F, sketch.blobPts(F.body(11, 143).x, knot.y, 5.5, 3.8, -0.3, 0.35), true);
    clothMass(sketch, F, sketch.blobPts(knot.x, knot.y, 2.7, 2.7, 0, 0.25), true);
  }
}

export function drawPriyaSkeleton(
  sketch: Sketch,
  F: PencilLayout,
  pose: VampirePose,
  options: SkeletonOptions = { dressed: true },
): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const farSide: -1 | 1 = dir === 1 ? -1 : 1;
  const hairSide = screenSideForAttachment('right', pose.facing, 'trailing');
  if (options.dressed) drawHairRoot(sketch, F, hairSide);
  drawLegs(sketch, F, pose);
  drawPelvis(sketch, F, pose);
  drawRibCage(sketch, F, pose);
  if (profile) drawProfileArm(sketch, F, pose, farSide);
  if (options.dressed) drawClothing(sketch, F, pose);
  drawSkull(sketch, F, pose);
  if (options.dressed) drawBraid(sketch, F, pose, hairSide);
  if (profile) drawProfileArm(sketch, F, pose, dir);
  else drawArms(sketch, F, pose);
}
