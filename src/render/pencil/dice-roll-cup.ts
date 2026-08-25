import { GRAPHITE, type Rgb } from './media';
import { hashSeed, Sketch, type Point } from './sketch';

export type DiceRollCupView = 'front' | 'side';
export type DiceRollCupAnchorId = 'button' | 'center' | 'groundContact';

const WIDTH = 160;
const HEIGHT = 160;

export const DICE_ROLL_CUP_RECIPE = {
  version: 1,
  status: 'approved',
  assetId: 'dice-roll-cup-01',
  brief: 'A worn warm-brown leather dice cup with a broad stitched button plate.',
  seed: 250825,
  upstreamCommit: 'de339ad739d8cbd28ff2dd4a940af38c0ede86c8',
  medium: 'graphite',
  material: 'worn leather, dark felt opening, stitched paper label plate',
  canvas: { width: WIDTH, height: HEIGHT },
  orderedParts: ['contact-shadow', 'body', 'opening', 'rim', 'seams', 'button-plate'],
  colors: {
    ink: [55, 36, 28] as Rgb,
    leatherDark: [91, 55, 37] as Rgb,
    leather: [147, 92, 55] as Rgb,
    leatherLight: [194, 139, 82] as Rgb,
    felt: [35, 29, 27] as Rgb,
    plate: [108, 63, 41] as Rgb,
    shadow: [50, 34, 29] as Rgb,
  },
  views: {
    front: {
      transparentBounds: { x: 18, y: 18, width: 124, height: 134 },
      anchors: {
        button: { x: 80, y: 89 },
        center: { x: 80, y: 84 },
        groundContact: { x: 80, y: 142 },
      } satisfies Readonly<Record<DiceRollCupAnchorId, Point>>,
    },
    side: {
      transparentBounds: { x: 36, y: 18, width: 88, height: 134 },
      anchors: {
        button: { x: 80, y: 89 },
        center: { x: 80, y: 84 },
        groundContact: { x: 80, y: 142 },
      } satisfies Readonly<Record<DiceRollCupAnchorId, Point>>,
    },
  },
} as const;

export const DICE_ROLL_CUP_WIDTH = WIDTH;
export const DICE_ROLL_CUP_HEIGHT = HEIGHT;

function closed(points: readonly Point[]): readonly Point[] {
  return [...points, points[0]!];
}

function mass(
  sketch: Sketch,
  points: readonly Point[],
  color: Rgb,
  options: Readonly<{ angle?: number; alpha?: number; edge?: number; style?: 'black' | 'hatch' | 'light' | 'scribble' }> = {},
): void {
  GRAPHITE.tone(sketch, points, { angle: options.angle, style: options.style ?? 'hatch' });
  GRAPHITE.skin(sketch, points, color, {
    alpha: options.alpha ?? 0.82,
    paper: false,
    underdraw: false,
  });
  GRAPHITE.edge(sketch, closed(points), options.edge ?? 2);
}

function rect(x: number, y: number, width: number, height: number): readonly Point[] {
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

function drawShadow(sketch: Sketch, view: DiceRollCupView): void {
  const points = sketch.blobPts(80, 143, view === 'front' ? 56 : 39, 7, 0.02, 0.14);
  GRAPHITE.skin(sketch, points, DICE_ROLL_CUP_RECIPE.colors.shadow, {
    alpha: 0.2,
    paper: false,
    underdraw: false,
  });
}

function drawFront(sketch: Sketch): void {
  const body = sketch.smooth([
    { x: 29, y: 40 }, { x: 131, y: 40 }, { x: 120, y: 132 },
    { x: 111, y: 141 }, { x: 49, y: 141 }, { x: 40, y: 132 },
  ]);
  mass(sketch, body, DICE_ROLL_CUP_RECIPE.colors.leather, { angle: 0.16, edge: 2.7, style: 'scribble' });

  const leftShade = sketch.smooth([
    { x: 30, y: 43 }, { x: 55, y: 46 }, { x: 59, y: 135 }, { x: 45, y: 138 }, { x: 39, y: 129 },
  ]);
  GRAPHITE.skin(sketch, leftShade, DICE_ROLL_CUP_RECIPE.colors.leatherDark, {
    alpha: 0.44, paper: false, underdraw: false,
  });
  const rightLight = sketch.smooth([
    { x: 105, y: 45 }, { x: 129, y: 41 }, { x: 120, y: 130 }, { x: 111, y: 138 }, { x: 101, y: 133 },
  ]);
  GRAPHITE.skin(sketch, rightLight, DICE_ROLL_CUP_RECIPE.colors.leatherLight, {
    alpha: 0.26, paper: false, underdraw: false,
  });

  const opening = sketch.blobPts(80, 39, 51, 17, 0.01, 0.1);
  mass(sketch, opening, DICE_ROLL_CUP_RECIPE.colors.felt, { alpha: 0.96, edge: 2.4, style: 'black' });
  const inner = sketch.blobPts(80, 37, 39, 9, 0.01, 0.08);
  GRAPHITE.skin(sketch, inner, DICE_ROLL_CUP_RECIPE.colors.ink, {
    alpha: 0.88, paper: false, underdraw: false,
  });

  const rim = sketch.smooth([
    { x: 27, y: 34 }, { x: 35, y: 26 }, { x: 125, y: 26 }, { x: 133, y: 34 },
    { x: 130, y: 45 }, { x: 121, y: 50 }, { x: 39, y: 50 }, { x: 30, y: 45 },
  ]);
  GRAPHITE.edge(sketch, closed(rim), 3.2);
  GRAPHITE.edge(sketch, [{ x: 39, y: 48 }, { x: 121, y: 48 }], 1.1);

  const plate = sketch.smooth(rect(47, 73, 66, 32));
  mass(sketch, plate, DICE_ROLL_CUP_RECIPE.colors.plate, { angle: -0.12, alpha: 0.78, edge: 1.8, style: 'light' });
  for (let x = 53; x <= 107; x += 9) {
    GRAPHITE.edge(sketch, [{ x, y: 76 }, { x: x + 3, y: 78 }], 0.65);
    GRAPHITE.edge(sketch, [{ x, y: 101 }, { x: x + 3, y: 99 }], 0.65);
  }
  GRAPHITE.edge(sketch, [{ x: 45, y: 55 }, { x: 48, y: 132 }], 1);
  GRAPHITE.edge(sketch, [{ x: 115, y: 55 }, { x: 112, y: 132 }], 1);
}

function drawSide(sketch: Sketch): void {
  const body = sketch.smooth([
    { x: 49, y: 42 }, { x: 111, y: 42 }, { x: 104, y: 134 },
    { x: 97, y: 141 }, { x: 63, y: 141 }, { x: 56, y: 134 },
  ]);
  mass(sketch, body, DICE_ROLL_CUP_RECIPE.colors.leather, { angle: 0.24, edge: 2.5, style: 'scribble' });
  const opening = sketch.blobPts(80, 40, 31, 15, 0.01, 0.08);
  mass(sketch, opening, DICE_ROLL_CUP_RECIPE.colors.felt, { alpha: 0.95, edge: 2.3, style: 'black' });
  const rim = sketch.smooth(rect(44, 27, 72, 23));
  GRAPHITE.edge(sketch, closed(rim), 2.8);
  const plate = sketch.smooth(rect(57, 73, 46, 32));
  mass(sketch, plate, DICE_ROLL_CUP_RECIPE.colors.plate, { angle: -0.1, alpha: 0.78, edge: 1.6, style: 'light' });
  GRAPHITE.edge(sketch, [{ x: 58, y: 54 }, { x: 62, y: 134 }], 0.9);
  GRAPHITE.edge(sketch, [{ x: 102, y: 54 }, { x: 98, y: 134 }], 0.9);
}

export function drawDiceRollCup(sketch: Sketch, view: DiceRollCupView): void {
  drawShadow(sketch, view);
  if (view === 'front') drawFront(sketch);
  else drawSide(sketch);
}

export function bakeDiceRollCupFrame(view: DiceRollCupView): Uint8ClampedArray {
  const sketch = new Sketch(WIDTH, HEIGHT);
  sketch.boil(hashSeed(DICE_ROLL_CUP_RECIPE.assetId, DICE_ROLL_CUP_RECIPE.seed, view));
  drawDiceRollCup(sketch, view);
  return sketch.data;
}
