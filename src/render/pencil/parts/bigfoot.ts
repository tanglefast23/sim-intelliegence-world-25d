import type { PencilLayout, PencilPalette } from '../layout';
import { gaitSwing, type VampirePose } from '../pose';
import type { Point, Sketch } from '../sketch';

type FurColor = Extract<keyof PencilPalette, 'pale' | 'ash' | 'hollow' | 'hair' | 'hairEdge'>;

function furMass(
  sketch: Sketch,
  F: PencilLayout,
  points: readonly Point[],
  color: FurColor,
  angle = -0.45,
  outline = true,
): void {
  F.media.tone(sketch, points, { style: 'scribble', angle, paper: false });
  F.media.skin(sketch, points, F.colors[color], { paper: false, underdraw: false, alpha: 0.82 });
  if (outline) F.media.edge(sketch, [...points, points[0]!], F.lwThin * 0.9);
}

function drawFoot(sketch: Sketch, F: PencilLayout, x: number, y: number, direction: -1 | 1): void {
  const centre = F.body(x + direction * 7, y - 4);
  furMass(sketch, F, sketch.blobPts(centre.x, centre.y, 10.5, 5.7, direction * 0.08, 0.35), 'pale', direction * 0.4);
  for (const toe of [-3.2, 0, 3.2]) {
    F.media.edge(sketch, [
      { x: centre.x + direction * 5, y: centre.y + toe },
      { x: centre.x + direction * 10, y: centre.y + toe + 0.6 },
    ], F.lwThin * 0.55);
  }
}

function drawLegs(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const direction: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const swing = pose.moving ? gaitSwing(pose.gait) : 0;
  const sides = [-1, 1] as const;
  for (const side of sides) {
    const x = profile ? side * 7 : side * 16;
    const step = pose.moving ? side * swing * 0.24 : 0;
    const lift = pose.moving && side === (pose.gait === 0 ? 1 : -1) ? 7 : 0;
    furMass(sketch, F, [
      F.body(x - 9, 224), F.body(x + 9, 224),
      F.body(x + 11, 246), F.body(x + side * 5 + step, 258 - lift),
      F.body(x + side * 10 + step, 273 - lift), F.body(x + step, 267 - lift),
      F.body(x - side * 8 + step, 276 - lift), F.body(x - 11, 248),
    ], 'hair', side * 0.45);
    for (const offset of [-4, 1, 6]) {
      F.media.edge(sketch, [
        F.body(x + offset, 232), F.body(x + offset - side * 2, 250), F.body(x + offset + side * 3 + step, 270 - lift),
      ], F.lwThin * 0.42);
    }
    const footDirection = profile ? direction : side;
    drawFoot(sketch, F, x + step, 286 - lift, footDirection);
  }
}

function drawTorso(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const direction: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const torso = profile
    ? [
      F.body(-direction * 27, 143), F.body(direction * 25, 147),
      F.body(direction * 35, 174), F.body(direction * 30, 188),
      F.body(direction * 37, 204), F.body(direction * 26, 229),
      F.body(direction * 12, 224), F.body(0, 239), F.body(-direction * 12, 225),
      F.body(-direction * 24, 235), F.body(-direction * 32, 207), F.body(-direction * 39, 190),
      F.body(-direction * 34, 174),
    ]
    : [
      F.body(-42, 146), F.body(42, 146), F.body(47, 172), F.body(42, 188),
      F.body(49, 204), F.body(35, 232), F.body(19, 226), F.body(0, 240),
      F.body(-19, 226), F.body(-35, 232), F.body(-49, 204), F.body(-42, 188), F.body(-47, 172),
    ];
  furMass(sketch, F, torso, 'hair', 0.55);
}

function drawBuriedNeck(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const direction: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const centre = profile ? -direction * 7 : 0;
  const neck = sketch.smooth([
    F.body(centre - 36, 121), F.body(centre + 36, 121),
    F.body(centre + 36, 165), F.body(centre - 36, 165),
  ]);
  F.media.tone(sketch, neck, { style: 'scribble', angle: 0.3, paper: false });
  F.media.skin(sketch, neck, F.colors.hair, {
    paper: false, underdraw: false, alpha: 0.82,
  });
}

function drawArm(sketch: Sketch, F: PencilLayout, pose: VampirePose, side: -1 | 1, far: boolean): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const swing = pose.moving ? gaitSwing(pose.gait) * side * 0.22 : 0;
  const shoulderX = profile ? side * (far ? 19 : 28) : side * 43;
  const elbowX = profile ? side * (far ? 25 : 36) : side * 52;
  const handX = profile ? side * (far ? 22 : 40) : side * 55;
  furMass(sketch, F, [
    F.body(shoulderX - 8, 151), F.body(shoulderX + 8, 151),
    F.body(elbowX + 10, 183 + swing), F.body(elbowX + 6, 201 + swing),
    F.body(elbowX + 12, 217 + swing), F.body(handX + 7, 245 + swing),
    F.body(handX, 238 + swing), F.body(handX - 7, 245 + swing),
    F.body(elbowX - 11, 219 + swing), F.body(elbowX - 6, 199 + swing),
    F.body(elbowX - 11, 181 + swing),
  ], 'hair', side * 0.55);
  for (const offset of [-3, 2, 7]) {
    F.media.edge(sketch, [
      F.body(shoulderX + offset, 158), F.body(elbowX + offset - side * 2, 198 + swing),
      F.body(handX + offset, 238 + swing),
    ], F.lwThin * 0.4);
  }
  const palm = F.body(handX, 247 + swing);
  furMass(sketch, F, sketch.blobPts(palm.x, palm.y, 7.2, 8.4, side * 0.12, 0.35), far ? 'hair' : 'pale', side * 0.3);
  for (const finger of [-3.2, 0, 3.2]) {
    F.media.edge(sketch, [
      { x: palm.x + finger, y: palm.y + 1 },
      { x: palm.x + finger + side * 0.8, y: palm.y + 7 },
    ], F.lwThin * 0.62);
  }
}

function drawHead(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const rear = pose.facing === 'rear';
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const direction: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const outline = profile
    ? sketch.smooth([
      F.head(-direction * 38, 55), F.head(-direction * 18, 40), F.head(direction * 17, 43),
      F.head(direction * 33, 59), F.head(direction * 45, 81), F.head(direction * 54, 94),
      F.head(direction * 38, 112), F.head(direction * 22, 130), F.head(-direction * 23, 129),
      F.head(-direction * 41, 100),
    ])
    : sketch.smooth([
      F.head(-39, 52), F.head(-24, 39), F.head(23, 39), F.head(39, 53),
      F.head(45, 82), F.head(38, 111), F.head(23, 132), F.head(-23, 132),
      F.head(-38, 111), F.head(-45, 82),
    ]);
  furMass(sketch, F, outline, 'hair', -0.7, false);
  const outerEdge = profile
    ? [outline[8]!, outline[9]!, ...outline.slice(0, 8)]
    : [outline[7]!, outline[8]!, outline[9]!, ...outline.slice(0, 7)];
  F.media.edge(sketch, outerEdge, F.lwThin * 0.9);
  if (rear) {
    for (const x of [-30, -18, -6, 6, 18, 30]) {
      F.media.edge(sketch, [
        F.head(x, 46), F.head(x + 3, 82), F.head(x - 2, 126),
        F.body(x + 3, 170), F.body(x - 2, 225),
      ], F.lwThin * 0.42);
    }
    return;
  }

  const headStrands = profile ? [-26, -10, 8, 25] : [-31, -18, 0, 18, 31];
  for (const x of headStrands) {
    F.media.edge(sketch, [
      F.head(x, 47), F.head(x - direction * 3, 63), F.head(x + direction * 2, 91),
      F.head(x, 122), F.body(x - direction * 2, 168), F.body(x + direction * 3, 224),
    ], F.lwThin * 0.36);
  }

  const face = profile
    ? sketch.smooth([
      F.head(direction * 2, 63), F.head(direction * 30, 62), F.head(direction * 47, 88),
      F.head(direction * 35, 118), F.head(direction * 8, 123), F.head(-direction * 6, 94),
    ])
    : sketch.smooth([
      F.head(-27, 62), F.head(27, 62), F.head(34, 87), F.head(25, 120),
      F.head(0, 128), F.head(-25, 120), F.head(-34, 87),
    ]);
  furMass(sketch, F, face, 'pale', 0.15);

  const brow = profile
    ? [F.head(direction * 3, 70), F.head(direction * 33, 67), F.head(direction * 35, 78), F.head(direction * 7, 81)]
    : [F.head(-30, 68), F.head(30, 68), F.head(28, 80), F.head(-28, 80)];
  furMass(sketch, F, brow, 'hair', 0.1);

  const eyes = profile ? [direction * 21] : [-16, 16];
  for (const x of eyes) {
    const eye = F.head(x, 80);
    F.media.skin(sketch, sketch.blobPts(eye.x, eye.y, 3.2, 2.4, 0, 0.2), F.colors.hollow, {
      paper: false, underdraw: false, alpha: 0.95,
    });
    F.media.skin(sketch, sketch.blobPts(eye.x + direction * 0.8, eye.y, 0.9, 0.9, 0, 0.1), F.colors.lining, {
      paper: false, underdraw: false, alpha: 0.95,
    });
  }

  const muzzle = profile
    ? sketch.smooth([
      F.head(direction * 14, 87), F.head(direction * 48, 88), F.head(direction * 52, 103),
      F.head(direction * 34, 115), F.head(direction * 10, 108),
    ])
    : sketch.smooth([
      F.head(-20, 88), F.head(20, 88), F.head(27, 106), F.head(17, 121),
      F.head(-17, 121), F.head(-27, 106),
    ]);
  furMass(sketch, F, muzzle, 'ash', -0.1);
  const nose = profile ? F.head(direction * 43, 96) : F.head(0, 98);
  F.media.skin(sketch, sketch.blobPts(nose.x, nose.y, profile ? 5 : 7, 4.5, 0, 0.25), F.colors.hollow, {
    paper: false, underdraw: false, alpha: 0.92,
  });
  const mouth = profile
    ? [F.head(direction * 18, 111), F.head(direction * 40, 112)]
    : [F.head(-15, 113), F.head(0, 117), F.head(15, 113)];
  F.media.edge(sketch, mouth, F.lwThin * 0.8);
}

function drawLongMane(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const direction: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const sides = profile ? [-direction] as const : [-1, 1] as const;
  for (const side of sides) {
    const mane = [
      F.head(side * 25, 43), F.head(side * 44, 55), F.head(side * 49, 80),
      F.head(side * 43, 105), F.body(side * 49, 151), F.body(side * 43, 169),
      F.body(side * 51, 187), F.body(side * 42, 202), F.body(side * 47, 219),
      F.body(side * 35, 200), F.body(side * 34, 166), F.head(side * 25, 108),
    ];
    furMass(sketch, F, mane, 'hair', side * 0.8);
    for (const offset of [-6, 1, 8]) {
      F.media.edge(sketch, [F.head(side * (31 + offset), 56), F.body(side * (41 + offset), 207)], F.lwThin * 0.45);
    }
  }
}

export function drawLiteralBigfoot(
  sketch: Sketch,
  F: PencilLayout,
  pose: VampirePose,
): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const direction: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const far: -1 | 1 = profile ? (direction === 1 ? -1 : 1) : -1;
  const near: -1 | 1 = profile ? direction : 1;

  drawLegs(sketch, F, pose);
  if (profile) drawArm(sketch, F, pose, far, true);
  drawTorso(sketch, F, pose);
  drawBuriedNeck(sketch, F, pose);
  drawHead(sketch, F, pose);
  drawLongMane(sketch, F, pose);
  if (profile) drawArm(sketch, F, pose, near, false);
  else {
    drawArm(sketch, F, pose, -1, false);
    drawArm(sketch, F, pose, 1, false);
  }
}
