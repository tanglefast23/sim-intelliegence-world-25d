import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { blitScaled, createBitmap, encodePng, fillRect, type Bitmap, type Rgba } from './png';

export type MinaPortraitExpression = 'rest' | 'joy' | 'upset';

const OUTPUT_WIDTH = 754;
const OUTPUT_HEIGHT = 900;
const SCALE = 31;
const EXPRESSIONS: readonly MinaPortraitExpression[] = ['rest', 'joy', 'upset'];

const C = {
  ink: [29, 27, 32, 255],
  skin: [128, 151, 96, 255],
  skinLight: [158, 178, 120, 255],
  skinShade: [92, 116, 72, 255],
  hollow: [52, 63, 47, 255],
  hair: [69, 65, 75, 255],
  hairLight: [104, 98, 111, 255],
  cloth: [39, 31, 45, 255],
  clothLight: [73, 57, 79, 255],
  straw: [181, 142, 52, 255],
  strawLight: [218, 179, 75, 255],
} as const satisfies Record<string, Rgba>;

function rect(bitmap: Bitmap, x: number, y: number, width: number, height: number, color: Rgba): void {
  fillRect(bitmap, x, y, width, height, color);
}

function span(bitmap: Bitmap, y: number, left: number, right: number, color: Rgba): void {
  rect(bitmap, left, y, right - left + 1, 1, color);
}

function drawBroom(bitmap: Bitmap): void {
  rect(bitmap, 1, 12, 1, 15, C.straw);
  rect(bitmap, 0, 25, 4, 4, C.straw);
  rect(bitmap, 0, 28, 1, 1, C.ink);
  rect(bitmap, 3, 28, 1, 1, C.ink);
}

function drawHairAndTorso(bitmap: Bitmap): void {
  rect(bitmap, 3, 8, 4, 17, C.hair);
  rect(bitmap, 18, 8, 4, 17, C.hair);
  rect(bitmap, 4, 9, 1, 14, C.hairLight);
  rect(bitmap, 19, 9, 1, 14, C.hairLight);
  rect(bitmap, 5, 21, 15, 8, C.cloth);
  rect(bitmap, 7, 20, 11, 2, C.clothLight);
  rect(bitmap, 5, 22, 2, 7, C.clothLight);
  rect(bitmap, 18, 22, 2, 7, C.clothLight);
  rect(bitmap, 12, 21, 1, 8, C.ink);
}

function drawFace(bitmap: Bitmap): void {
  const spans = [
    [7, 6, 18], [8, 5, 19], [9, 4, 20], [10, 4, 20], [11, 4, 20],
    [12, 4, 20], [13, 4, 20], [14, 4, 20], [15, 5, 19], [16, 5, 19],
    [17, 6, 18], [18, 7, 17], [19, 8, 16], [20, 10, 14],
  ] as const;
  spans.forEach(([y, left, right]) => span(bitmap, y, left, right, C.skin));
  spans.forEach(([y, left, right]) => {
    rect(bitmap, left, y, 1, 1, C.ink);
    rect(bitmap, right, y, 1, 1, C.ink);
  });
  rect(bitmap, 5, 10, 1, 5, C.skinLight);
  rect(bitmap, 18, 11, 2, 5, C.skinShade);
  rect(bitmap, 6, 15, 3, 2, C.skinShade);
  rect(bitmap, 16, 15, 3, 2, C.skinShade);

  rect(bitmap, 12, 12, 1, 4, C.skinShade);
  rect(bitmap, 13, 14, 1, 3, C.skinShade);
  rect(bitmap, 14, 16, 4, 1, C.skinShade);
  rect(bitmap, 16, 17, 3, 1, C.skinLight);
  rect(bitmap, 17, 18, 2, 1, C.ink);
}

function drawHat(bitmap: Bitmap): void {
  const crown = [
    [0, 9, 9], [1, 8, 10], [2, 7, 12], [3, 6, 16], [4, 5, 17],
    [5, 4, 16], [6, 3, 18], [7, 2, 20], [8, 2, 20],
  ] as const;
  crown.forEach(([y, left, right]) => span(bitmap, y, left, right, C.cloth));
  span(bitmap, 0, 9, 9, C.ink);
  rect(bitmap, 9, 1, 1, 2, C.clothLight);
  rect(bitmap, 10, 2, 1, 3, C.clothLight);
  rect(bitmap, 12, 3, 4, 1, C.clothLight);
  rect(bitmap, 4, 6, 11, 1, C.clothLight);
  span(bitmap, 8, 1, 22, C.ink);
  span(bitmap, 9, 0, 23, C.cloth);
  span(bitmap, 10, 1, 22, C.ink);
}

function drawEyesAndMouth(bitmap: Bitmap, expression: MinaPortraitExpression): void {
  if (expression === 'upset') {
    rect(bitmap, 6, 11, 5, 1, C.ink);
    rect(bitmap, 15, 10, 5, 1, C.ink);
  } else {
    rect(bitmap, 6, 10, 5, 1, C.ink);
    rect(bitmap, 15, 10, 5, 1, C.ink);
  }
  if (expression === 'joy') {
    rect(bitmap, 7, 12, 3, 1, C.hollow);
    rect(bitmap, 16, 12, 3, 1, C.hollow);
    rect(bitmap, 9, 18, 7, 1, C.ink);
    rect(bitmap, 10, 19, 5, 1, C.ink);
    return;
  }
  rect(bitmap, 7, 11, 4, 3, C.hollow);
  rect(bitmap, 16, 11, 4, 3, C.hollow);
  rect(bitmap, 8, 12, 1, 1, C.skinLight);
  rect(bitmap, 17, 12, 1, 1, C.skinLight);
  if (expression === 'upset') {
    rect(bitmap, 9, 19, 7, 1, C.ink);
    rect(bitmap, 10, 18, 5, 1, C.ink);
  } else {
    rect(bitmap, 9, 18, 7, 1, C.ink);
  }
}

function drawMinaCinematicBroom(bitmap: Bitmap): void {
  rect(bitmap, 1, 11, 1, 21, C.straw);
  rect(bitmap, 2, 12, 1, 20, C.strawLight);
  span(bitmap, 28, 0, 4, C.straw);
  span(bitmap, 29, 0, 5, C.straw);
  span(bitmap, 30, 0, 6, C.strawLight);
  span(bitmap, 31, 0, 6, C.straw);
  rect(bitmap, 0, 31, 1, 1, C.ink);
  rect(bitmap, 6, 31, 1, 1, C.ink);
}

function drawMinaCinematicHair(bitmap: Bitmap): void {
  const left = [
    [10, 5, 7], [11, 4, 7], [12, 4, 7], [13, 4, 7], [14, 3, 7],
    [15, 3, 7], [16, 4, 7], [17, 3, 7], [18, 3, 7], [19, 4, 7],
    [20, 3, 7], [21, 3, 7], [22, 4, 8], [23, 3, 8], [24, 3, 8],
    [25, 4, 8], [26, 4, 8], [27, 5, 9], [28, 5, 9],
  ] as const;
  const right = [
    [9, 19, 21], [10, 19, 22], [11, 20, 23], [12, 20, 23], [13, 20, 24],
    [14, 20, 24], [15, 20, 24], [16, 20, 25], [17, 20, 25], [18, 20, 24],
    [19, 20, 25], [20, 20, 25], [21, 20, 24], [22, 19, 24], [23, 19, 25],
    [24, 19, 25], [25, 18, 24], [26, 18, 24], [27, 18, 23], [28, 18, 23],
  ] as const;
  left.forEach(([y, x1, x2]) => span(bitmap, y, x1, x2, C.hair));
  right.forEach(([y, x1, x2]) => span(bitmap, y, x1, x2, C.hair));
  for (const [x, y] of [[5, 12], [4, 16], [5, 20], [4, 24], [6, 27], [21, 11], [22, 15], [21, 19], [22, 23], [20, 27]] as const) {
    rect(bitmap, x, y, 2, 2, C.hairLight);
  }
}

function drawMinaCinematicRobe(bitmap: Bitmap): void {
  span(bitmap, 23, 11, 16, C.skinShade);
  span(bitmap, 24, 9, 18, C.clothLight);
  span(bitmap, 25, 7, 20, C.cloth);
  span(bitmap, 26, 5, 22, C.cloth);
  span(bitmap, 27, 4, 23, C.cloth);
  rect(bitmap, 3, 28, 22, 4, C.cloth);

  span(bitmap, 25, 7, 11, C.clothLight);
  span(bitmap, 26, 6, 10, C.clothLight);
  span(bitmap, 27, 5, 9, C.clothLight);
  span(bitmap, 25, 17, 20, C.clothLight);
  span(bitmap, 26, 18, 21, C.clothLight);
  span(bitmap, 27, 19, 22, C.clothLight);
  rect(bitmap, 12, 25, 4, 7, C.ink);
  rect(bitmap, 11, 26, 1, 4, C.clothLight);
  rect(bitmap, 16, 26, 1, 4, C.clothLight);

  // Her right hand closes around the broom handle.
  span(bitmap, 24, 1, 4, C.skinShade);
  span(bitmap, 25, 1, 5, C.skin);
  span(bitmap, 26, 1, 4, C.skinLight);
  span(bitmap, 27, 1, 3, C.skin);
  rect(bitmap, 4, 26, 1, 2, C.ink);
}

function drawMinaCinematicFace(bitmap: Bitmap): void {
  const face = [
    [9, 9, 18], [10, 8, 19], [11, 7, 20], [12, 6, 21], [13, 6, 21],
    [14, 6, 21], [15, 6, 21], [16, 6, 22], [17, 6, 22], [18, 7, 21],
    [19, 7, 21], [20, 8, 20], [21, 9, 19], [22, 10, 18], [23, 12, 16],
  ] as const;
  face.forEach(([y, x1, x2]) => span(bitmap, y, x1, x2, C.skin));
  face.forEach(([y, x1, x2]) => {
    rect(bitmap, x1, y, 1, 1, C.ink);
    rect(bitmap, x2, y, 1, 1, C.ink);
  });
  span(bitmap, 10, 8, 12, C.skinLight);
  rect(bitmap, 7, 11, 2, 5, C.skinLight);
  rect(bitmap, 19, 11, 2, 8, C.skinShade);
  rect(bitmap, 18, 18, 2, 3, C.skinShade);
  span(bitmap, 19, 13, 17, C.skinLight);
  span(bitmap, 21, 14, 18, C.skinShade);

  span(bitmap, 12, 8, 12, C.ink);
  span(bitmap, 12, 15, 19, C.ink);
  rect(bitmap, 9, 13, 3, 2, C.hollow);
  rect(bitmap, 16, 13, 2, 2, C.hollow);
  rect(bitmap, 10, 13, 1, 1, C.strawLight);
  rect(bitmap, 16, 13, 1, 1, C.strawLight);
  rect(bitmap, 8, 15, 2, 1, C.skinShade);
  rect(bitmap, 17, 15, 2, 1, C.skinShade);

  // The nose grows out of the face silhouette and hooks down.
  rect(bitmap, 5, 16, 1, 1, C.skinShade);
  span(bitmap, 17, 3, 5, C.skin);
  span(bitmap, 18, 2, 4, C.skinShade);
  span(bitmap, 19, 3, 4, C.skinLight);
  rect(bitmap, 2, 16, 3, 1, C.ink);
  rect(bitmap, 2, 17, 1, 1, C.ink);
  rect(bitmap, 1, 18, 1, 1, C.ink);
  rect(bitmap, 2, 19, 1, 1, C.ink);
  rect(bitmap, 3, 20, 2, 1, C.ink);

  rect(bitmap, 7, 18, 3, 2, C.skinShade);
  rect(bitmap, 16, 17, 3, 3, C.skinShade);
  rect(bitmap, 8, 20, 5, 1, C.ink);
  rect(bitmap, 9, 21, 2, 1, C.skinLight);
  rect(bitmap, 11, 21, 1, 1, C.ink);
  rect(bitmap, 12, 20, 1, 1, C.skinLight);
  rect(bitmap, 7, 19, 1, 1, C.hollow);
  rect(bitmap, 20, 18, 1, 1, C.hollow);
}

function drawMinaCinematicHat(bitmap: Bitmap): void {
  const crown = [
    [0, 18, 18], [1, 16, 19], [2, 14, 20], [3, 12, 20], [4, 10, 20],
    [5, 9, 21], [6, 8, 22], [7, 7, 23], [8, 6, 23], [9, 5, 24],
  ] as const;
  crown.forEach(([y, x1, x2]) => span(bitmap, y, x1, x2, C.cloth));
  rect(bitmap, 18, 0, 1, 2, C.clothLight);
  span(bitmap, 2, 16, 19, C.clothLight);
  span(bitmap, 3, 13, 17, C.clothLight);
  span(bitmap, 5, 10, 15, C.clothLight);
  rect(bitmap, 8, 7, 2, 2, C.clothLight);
  span(bitmap, 8, 7, 22, C.ink);
  span(bitmap, 9, 8, 21, C.clothLight);
  rect(bitmap, 14, 9, 2, 1, C.straw);
  span(bitmap, 10, 2, 25, C.ink);
  span(bitmap, 11, 0, 25, C.cloth);
  span(bitmap, 12, 2, 24, C.ink);
}

export function buildMinaCinematicPortrait(): Bitmap {
  const logical = createBitmap(26, 32);
  drawMinaCinematicBroom(logical);
  drawMinaCinematicHair(logical);
  drawMinaCinematicRobe(logical);
  drawMinaCinematicFace(logical);
  drawMinaCinematicHat(logical);

  const cinematicScale = 28;
  const output = createBitmap(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  blitScaled(
    logical,
    output,
    Math.floor((OUTPUT_WIDTH - logical.width * cinematicScale) / 2),
    Math.floor((OUTPUT_HEIGHT - logical.height * cinematicScale) / 2),
    cinematicScale,
  );
  return output;
}

export function buildMinaDialoguePortrait(expression: MinaPortraitExpression): Bitmap {
  const logical = createBitmap(24, 29);
  drawBroom(logical);
  drawHairAndTorso(logical);
  drawFace(logical);
  drawEyesAndMouth(logical, expression);
  drawHat(logical);

  const output = createBitmap(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  blitScaled(logical, output, Math.floor((OUTPUT_WIDTH - logical.width * SCALE) / 2), 0, SCALE);
  return output;
}

export function writeMinaDialoguePortraits(root = process.cwd()): readonly string[] {
  const paths = EXPRESSIONS.map((expression) => {
    const suffix = expression === 'rest' ? '' : `.${expression}`;
    const path = resolve(root, 'assets/source/dialogue-portraits', `mina-park${suffix}.png`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, encodePng(buildMinaDialoguePortrait(expression)));
    return path;
  });
  const cinematicPath = resolve(root, 'assets/source/dialogue-portraits/mina-park.cinematic.png');
  writeFileSync(cinematicPath, encodePng(buildMinaCinematicPortrait()));
  return [...paths, cinematicPath];
}

if (require.main === module) {
  process.stdout.write(`${writeMinaDialoguePortraits().join('\n')}\n`);
}
