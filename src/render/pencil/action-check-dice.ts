import { GRAPHITE, type Rgb } from './media';
import { hashSeed, Sketch, type Point } from './sketch';

export type DieFace = 1 | 2 | 3 | 4 | 5 | 6;
export type DieOrientationFrameId = `die-t${DieFace}-l${DieFace}-r${DieFace}`;
export type ActionCheckDiceFrameId = DieOrientationFrameId | 'soft-flight-shadow' | 'strong-contact-shadow';
export type DieOrientation = Readonly<{
  frameId: DieOrientationFrameId;
  top: DieFace;
  left: DieFace;
  right: DieFace;
}>;

type Axis = readonly [-1 | 0 | 1, -1 | 0 | 1, -1 | 0 | 1];

const AXES: readonly Axis[] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
const FACE_NORMALS: Readonly<Record<DieFace, Axis>> = {
  1: [0, 1, 0], 2: [-1, 0, 0], 3: [0, 0, 1],
  4: [0, 0, -1], 5: [1, 0, 0], 6: [0, -1, 0],
};

function dot(left: Axis, right: Axis): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Axis, right: Axis): Axis {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ] as Axis;
}

function transform(normal: Axis, xAxis: Axis, yAxis: Axis, zAxis: Axis): Axis {
  return [
    normal[0] * xAxis[0] + normal[1] * yAxis[0] + normal[2] * zAxis[0],
    normal[0] * xAxis[1] + normal[1] * yAxis[1] + normal[2] * zAxis[1],
    normal[0] * xAxis[2] + normal[1] * yAxis[2] + normal[2] * zAxis[2],
  ] as Axis;
}

function sameAxis(left: Axis, right: Axis): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function faceAt(direction: Axis, xAxis: Axis, yAxis: Axis, zAxis: Axis): DieFace {
  const match = (Object.entries(FACE_NORMALS) as [string, Axis][]).find(([, normal]) => (
    sameAxis(transform(normal, xAxis, yAxis, zAxis), direction)
  ));
  if (!match) throw new Error(`No die face occupies direction ${direction.join(',')}.`);
  return Number(match[0]) as DieFace;
}

function buildOrientations(): readonly DieOrientation[] {
  const orientations: DieOrientation[] = [];
  for (const xAxis of AXES) {
    for (const yAxis of AXES) {
      if (dot(xAxis, yAxis) !== 0) continue;
      const zAxis = cross(xAxis, yAxis);
      const top = faceAt([0, 1, 0], xAxis, yAxis, zAxis);
      const left = faceAt([-1, 0, 0], xAxis, yAxis, zAxis);
      const right = faceAt([0, 0, 1], xAxis, yAxis, zAxis);
      orientations.push({ frameId: `die-t${top}-l${left}-r${right}`, top, left, right });
    }
  }
  const unique = new Map(orientations.map((orientation) => [orientation.frameId, orientation]));
  if (unique.size !== 24) throw new Error(`A physical die must have 24 rotations, received ${unique.size}.`);
  return [...unique.values()].sort((left, right) => left.frameId.localeCompare(right.frameId));
}

export const ACTION_CHECK_DICE_ORIENTATIONS = buildOrientations();
export const ACTION_CHECK_DICE_CANONICAL_FINALS = Object.freeze(Object.fromEntries(
  ([1, 2, 3, 4, 5, 6] as const).map((face) => {
    const orientation = ACTION_CHECK_DICE_ORIENTATIONS.find((candidate) => candidate.top === face);
    if (!orientation) throw new Error(`Missing canonical orientation for die face ${face}.`);
    return [face, orientation.frameId];
  }),
) as Readonly<Record<DieFace, DieOrientationFrameId>>);

const WIDTH = 128;
const HEIGHT = 128;
const DICE_BOUNDS = { x: 2, y: 2, width: 124, height: 124 } as const;
const SHADOW_BOUNDS = { x: 2, y: 82, width: 124, height: 44 } as const;
const GROUND_CONTACT = { x: 64, y: 112 } as const;
const DIE_ANCHORS = {
  topFace: { x: 64, y: 43 },
  center: { x: 64, y: 64 },
  groundContact: GROUND_CONTACT,
} as const;
const SHADOW_ANCHORS = {
  center: { x: 67, y: 106 },
  groundContact: GROUND_CONTACT,
} as const;

const frame = (
  kind: 'die' | 'shadow',
  bounds: typeof DICE_BOUNDS | typeof SHADOW_BOUNDS,
  anchors: typeof DIE_ANCHORS | typeof SHADOW_ANCHORS,
) => ({
  kind,
  transparentBounds: bounds,
  anchors,
});

const orientationFrames = Object.fromEntries(ACTION_CHECK_DICE_ORIENTATIONS.map(({ frameId }) => (
  [frameId, frame('die', DICE_BOUNDS, DIE_ANCHORS)]
))) as Readonly<Record<DieOrientationFrameId, ReturnType<typeof frame>>>;

export const ACTION_CHECK_DICE_RECIPE = {
  version: 2,
  status: 'approved',
  assetId: 'action-check-dice-01',
  brief: 'Warm isometric pencil dice for the deterministic Action Check overlay.',
  seed: 260823,
  upstreamCommit: 'de339ad739d8cbd28ff2dd4a940af38c0ede86c8',
  medium: 'graphite',
  canvas: { width: WIDTH, height: HEIGHT },
  layoutAnchors: DIE_ANCHORS,
  orderedParts: ['left-face', 'right-face', 'top-face', 'pips', 'edges'],
  colors: {
    ink: [58, 36, 25] as Rgb,
    top: [247, 226, 184] as Rgb,
    left: [220, 188, 130] as Rgb,
    right: [177, 132, 83] as Rgb,
    shadow: [57, 39, 31] as Rgb,
  },
  canonicalFinals: ACTION_CHECK_DICE_CANONICAL_FINALS,
  frames: {
    ...orientationFrames,
    'soft-flight-shadow': frame('shadow', SHADOW_BOUNDS, SHADOW_ANCHORS),
    'strong-contact-shadow': frame('shadow', SHADOW_BOUNDS, SHADOW_ANCHORS),
  },
} as const;

export const ACTION_CHECK_DICE_WIDTH = WIDTH;
export const ACTION_CHECK_DICE_HEIGHT = HEIGHT;
export const ACTION_CHECK_DICE_FRAME_IDS = Object.keys(ACTION_CHECK_DICE_RECIPE.frames) as ActionCheckDiceFrameId[];

const PIPS: Readonly<Record<number, readonly [number, number][]>> = {
  1: [[0.5, 0.5]],
  2: [[0.25, 0.25], [0.75, 0.75]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.25, 0.2], [0.75, 0.2], [0.25, 0.5], [0.75, 0.5], [0.25, 0.8], [0.75, 0.8]],
};
function closed(points: readonly Point[]): readonly Point[] {
  return [...points, points[0]!];
}

function mass(sketch: Sketch, points: readonly Point[], color: Rgb, angle: number): void {
  GRAPHITE.tone(sketch, points, { style: 'hatch', angle });
  GRAPHITE.skin(sketch, points, color, { alpha: 0.78, paper: false, underdraw: false });
  GRAPHITE.edge(sketch, closed(points), 2.1);
}

function pip(sketch: Sketch, x: number, y: number, radius = 4): void {
  const points = sketch.blobPts(x, y, radius, radius * 0.84, 0, 0.12);
  GRAPHITE.tone(sketch, points, { style: 'black', paper: false, pen: 0.85 });
  GRAPHITE.skin(sketch, points, ACTION_CHECK_DICE_RECIPE.colors.ink, {
    alpha: 0.9,
    paper: false,
    underdraw: false,
  });
}

function drawTopPips(sketch: Sketch, face: number, centerX: number, topY: number, halfWidth: number, halfTop: number): void {
  for (const [u, v] of PIPS[face] ?? PIPS[1]!) {
    pip(sketch, centerX + (u - v) * halfWidth * 1.25, topY - halfTop + (u + v) * halfTop);
  }
}

function drawSidePips(
  sketch: Sketch,
  face: number,
  side: 'left' | 'right',
  centerX: number,
  topY: number,
  halfWidth: number,
  halfTop: number,
  sideHeight: number,
): void {
  for (const [u, v] of PIPS[face] ?? PIPS[1]!) {
    const x = side === 'left' ? centerX - halfWidth + u * halfWidth : centerX + u * halfWidth;
    const y = side === 'left'
      ? topY + u * halfTop + v * sideHeight
      : topY + (1 - u) * halfTop + v * sideHeight;
    pip(sketch, x, y, 3.2);
  }
}

function drawDie(sketch: Sketch, orientation: DieOrientation): void {
  const centerX = 64;
  const topY = 43;
  const halfWidth = 42;
  const halfTop = 23;
  const sideHeight = 43;
  const top: readonly Point[] = [
    { x: centerX, y: topY - halfTop },
    { x: centerX + halfWidth, y: topY },
    { x: centerX, y: topY + halfTop },
    { x: centerX - halfWidth, y: topY },
  ];
  const left: readonly Point[] = [
    { x: centerX - halfWidth, y: topY },
    { x: centerX, y: topY + halfTop },
    { x: centerX, y: topY + halfTop + sideHeight },
    { x: centerX - halfWidth, y: topY + sideHeight },
  ];
  const right: readonly Point[] = [
    { x: centerX + halfWidth, y: topY },
    { x: centerX, y: topY + halfTop },
    { x: centerX, y: topY + halfTop + sideHeight },
    { x: centerX + halfWidth, y: topY + sideHeight },
  ];
  mass(sketch, left, ACTION_CHECK_DICE_RECIPE.colors.left, 0.28);
  mass(sketch, right, ACTION_CHECK_DICE_RECIPE.colors.right, -0.24);
  mass(sketch, top, ACTION_CHECK_DICE_RECIPE.colors.top, 0.04);
  drawSidePips(sketch, orientation.left, 'left', centerX, topY, halfWidth, halfTop, sideHeight);
  drawSidePips(sketch, orientation.right, 'right', centerX, topY, halfWidth, halfTop, sideHeight);
  drawTopPips(sketch, orientation.top, centerX, topY, halfWidth, halfTop);
}

function drawShadow(sketch: Sketch, strong: boolean): void {
  const points = sketch.blobPts(67, strong ? 108 : 104, strong ? 48 : 42, strong ? 10 : 7, 0.03, 0.14);
  GRAPHITE.tone(sketch, points, {
    style: strong ? 'scribble' : 'light',
    gap: strong ? 1.15 : 1.5,
    paper: false,
    pen: strong ? 1 : 0.8,
  });
  GRAPHITE.skin(sketch, points, ACTION_CHECK_DICE_RECIPE.colors.shadow, {
    alpha: strong ? 0.28 : 0.14,
    paper: false,
    underdraw: false,
  });
}

export function bakeActionCheckDiceFrame(frameId: ActionCheckDiceFrameId): Uint8ClampedArray {
  const sketch = new Sketch(WIDTH, HEIGHT);
  sketch.boil(hashSeed(ACTION_CHECK_DICE_RECIPE.assetId, ACTION_CHECK_DICE_RECIPE.seed, frameId));
  if (frameId.startsWith('die-')) {
    const orientation = ACTION_CHECK_DICE_ORIENTATIONS.find((candidate) => candidate.frameId === frameId);
    if (!orientation) throw new Error(`Unknown die orientation frame: ${frameId}`);
    drawDie(sketch, orientation);
  } else drawShadow(sketch, frameId === 'strong-contact-shadow');
  return sketch.data;
}
