import { GRAPHITE, type Rgb } from './media';
import { hashSeed, Sketch, type Point } from './sketch';

export type ActionCheckDiceFrameId =
  | 'die-1' | 'die-2' | 'die-3' | 'die-4' | 'die-5' | 'die-6'
  | 'soft-flight-shadow' | 'strong-contact-shadow';

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

export const ACTION_CHECK_DICE_RECIPE = {
  version: 1,
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
  frames: {
    'die-1': frame('die', DICE_BOUNDS, DIE_ANCHORS),
    'die-2': frame('die', DICE_BOUNDS, DIE_ANCHORS),
    'die-3': frame('die', DICE_BOUNDS, DIE_ANCHORS),
    'die-4': frame('die', DICE_BOUNDS, DIE_ANCHORS),
    'die-5': frame('die', DICE_BOUNDS, DIE_ANCHORS),
    'die-6': frame('die', DICE_BOUNDS, DIE_ANCHORS),
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
const SIDE_FACES = [[2, 3], [1, 3], [1, 2], [1, 2], [1, 3], [2, 3]] as const;

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

function drawDie(sketch: Sketch, face: number): void {
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
  const [leftFace, rightFace] = SIDE_FACES[face - 1] ?? SIDE_FACES[0];
  drawSidePips(sketch, leftFace, 'left', centerX, topY, halfWidth, halfTop, sideHeight);
  drawSidePips(sketch, rightFace, 'right', centerX, topY, halfWidth, halfTop, sideHeight);
  drawTopPips(sketch, face, centerX, topY, halfWidth, halfTop);
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
  if (frameId.startsWith('die-')) drawDie(sketch, Number(frameId.slice(4)));
  else drawShadow(sketch, frameId === 'strong-contact-shadow');
  return sketch.data;
}
