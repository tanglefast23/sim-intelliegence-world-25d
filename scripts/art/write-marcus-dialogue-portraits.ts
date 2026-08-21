import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { blitScaled, createBitmap, encodePng, fillRect, type Bitmap, type Rgba } from './png';

export type MarcusPortraitExpression = 'rest' | 'joy' | 'upset';

const OUTPUT_WIDTH = 754;
const OUTPUT_HEIGHT = 900;
const EXPRESSIONS: readonly MarcusPortraitExpression[] = ['rest', 'joy', 'upset'];

const C = {
  ink: [28, 27, 27, 255],
  fur: [126, 72, 52, 255],
  furLight: [161, 96, 67, 255],
  furShade: [101, 58, 44, 255],
  furDeep: [68, 45, 39, 255],
  mane: [49, 48, 48, 255],
  maneLight: [75, 70, 68, 255],
  eye: [231, 205, 48, 255],
  eyeLight: [255, 239, 110, 255],
  fang: [242, 234, 212, 255],
  shorts: [54, 48, 55, 255],
  gold: [204, 155, 47, 255],
} as const satisfies Record<string, Rgba>;

function rect(bitmap: Bitmap, x: number, y: number, width: number, height: number, color: Rgba): void {
  fillRect(bitmap, x, y, width, height, color);
}

function span(bitmap: Bitmap, y: number, left: number, right: number, color: Rgba): void {
  rect(bitmap, left, y, right - left + 1, 1, color);
}

function drawDialogueBody(bitmap: Bitmap): void {
  span(bitmap, 23, 10, 19, C.mane);
  span(bitmap, 24, 5, 24, C.furDeep);
  span(bitmap, 25, 2, 27, C.fur);
  span(bitmap, 26, 1, 28, C.fur);
  rect(bitmap, 0, 27, 30, 7, C.fur);
  rect(bitmap, 0, 29, 5, 5, C.furShade);
  rect(bitmap, 25, 29, 5, 5, C.furLight);
  rect(bitmap, 8, 27, 14, 7, C.furLight);
  rect(bitmap, 10, 28, 10, 6, C.fur);
  span(bitmap, 25, 8, 21, C.gold);
  span(bitmap, 26, 7, 22, C.shorts);
  rect(bitmap, 5, 27, 20, 7, C.shorts);
  span(bitmap, 25, 11, 18, C.furDeep);
  span(bitmap, 26, 12, 17, C.fur);
  span(bitmap, 27, 13, 16, C.fur);
  span(bitmap, 28, 14, 15, C.furShade);
  rect(bitmap, 6, 28, 2, 6, C.maneLight);
  rect(bitmap, 22, 28, 2, 6, C.mane);
  rect(bitmap, 25, 29, 5, 2, C.gold);
}

function drawDialogueHead(bitmap: Bitmap): void {
  for (const [y, left, right] of [
    [0, 5, 7], [1, 4, 8], [2, 4, 9], [3, 3, 10], [4, 3, 11], [5, 4, 11],
    [0, 22, 24], [1, 21, 25], [2, 20, 25], [3, 19, 26], [4, 18, 26], [5, 18, 25],
  ] as const) span(bitmap, y, left, right, C.fur);
  span(bitmap, 2, 5, 7, C.furLight);
  span(bitmap, 2, 22, 24, C.furLight);

  for (const [y, left, right] of [
    [4, 9, 20], [5, 7, 22], [6, 5, 24], [7, 4, 25], [8, 3, 26],
    [9, 3, 26], [10, 3, 26], [11, 3, 26], [12, 3, 26], [13, 3, 26],
    [14, 3, 26], [15, 3, 26], [16, 3, 26], [17, 3, 26], [18, 4, 25],
    [19, 4, 25], [20, 5, 24], [21, 6, 23], [22, 8, 21],
  ] as const) span(bitmap, y, left, right, C.fur);
  rect(bitmap, 4, 8, 2, 10, C.furLight);
  rect(bitmap, 24, 9, 2, 10, C.furShade);
  span(bitmap, 20, 7, 22, C.furShade);
  span(bitmap, 3, 6, 8, C.furDeep);
  span(bitmap, 3, 21, 23, C.furDeep);
  rect(bitmap, 3, 16, 3, 4, C.mane);
  rect(bitmap, 24, 16, 3, 4, C.mane);
}

function drawDialogueFace(bitmap: Bitmap, expression: MarcusPortraitExpression): void {
  if (expression === 'upset') {
    span(bitmap, 9, 6, 12, C.ink);
    span(bitmap, 8, 18, 24, C.ink);
  } else {
    span(bitmap, 8, 6, 12, C.ink);
    span(bitmap, 8, 18, 24, C.ink);
  }
  if (expression === 'joy') {
    span(bitmap, 10, 8, 11, C.eye);
    span(bitmap, 10, 19, 22, C.eye);
  } else {
    rect(bitmap, 8, 9, 4, 3, C.eye);
    rect(bitmap, 18, 9, 4, 3, C.eye);
    rect(bitmap, 9, 9, 1, 1, C.eyeLight);
    rect(bitmap, 19, 9, 1, 1, C.eyeLight);
  }

  rect(bitmap, 7, 12, 16, 8, C.furShade);
  rect(bitmap, 9, 12, 12, 2, C.furLight);
  rect(bitmap, 11, 13, 8, 4, C.ink);
  rect(bitmap, 12, 13, 6, 1, C.maneLight);
  span(bitmap, expression === 'joy' ? 19 : 18, 9, 20, C.ink);
  if (expression === 'joy') span(bitmap, 20, 11, 18, C.fang);
  else if (expression === 'upset') span(bitmap, 20, 12, 17, C.ink);
  rect(bitmap, 8, 18, 2, 4, C.fang);
  rect(bitmap, 20, 18, 2, 4, C.fang);
}

export function buildMarcusDialoguePortrait(expression: MarcusPortraitExpression): Bitmap {
  const logical = createBitmap(30, 34);
  drawDialogueBody(logical);
  drawDialogueHead(logical);
  drawDialogueFace(logical, expression);
  const output = createBitmap(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  blitScaled(logical, output, 2, 25, 25);
  return output;
}

function drawCinematicBody(bitmap: Bitmap): void {
  span(bitmap, 38, 19, 30, C.mane);
  span(bitmap, 39, 12, 37, C.furDeep);
  span(bitmap, 40, 7, 42, C.fur);
  span(bitmap, 41, 4, 45, C.fur);
  rect(bitmap, 2, 42, 46, 16, C.fur);
  rect(bitmap, 2, 47, 8, 11, C.furShade);
  rect(bitmap, 40, 47, 8, 11, C.furLight);
  rect(bitmap, 12, 42, 26, 16, C.furLight);
  rect(bitmap, 16, 44, 18, 14, C.fur);
  span(bitmap, 40, 14, 35, C.gold);
  span(bitmap, 41, 11, 38, C.shorts);
  rect(bitmap, 9, 42, 32, 16, C.shorts);
  span(bitmap, 40, 18, 31, C.furDeep);
  span(bitmap, 41, 19, 30, C.fur);
  span(bitmap, 42, 20, 29, C.fur);
  span(bitmap, 43, 21, 28, C.furShade);
  span(bitmap, 44, 22, 27, C.furShade);
  rect(bitmap, 10, 45, 3, 13, C.maneLight);
  rect(bitmap, 37, 45, 3, 13, C.mane);
  rect(bitmap, 41, 49, 7, 3, C.gold);
  rect(bitmap, 41, 52, 7, 2, C.furDeep);
}

function drawCinematicHead(bitmap: Bitmap): void {
  for (const [y, left, right] of [
    [0, 10, 10], [1, 9, 11], [2, 8, 12], [3, 7, 13], [4, 6, 14], [5, 7, 16], [6, 8, 17],
    [0, 39, 39], [1, 38, 40], [2, 37, 41], [3, 36, 42], [4, 35, 43], [5, 33, 42], [6, 32, 41],
  ] as const) span(bitmap, y, left, right, C.fur);
  span(bitmap, 2, 8, 11, C.furLight);
  span(bitmap, 2, 38, 41, C.furLight);

  for (const [y, left, right] of [
    [5, 17, 32], [6, 13, 36], [7, 10, 39], [8, 8, 41], [9, 7, 42],
    [10, 6, 43], [11, 5, 44], [12, 5, 44], [13, 5, 44], [14, 5, 44],
    [15, 5, 44], [16, 5, 44], [17, 5, 44], [18, 5, 44], [19, 5, 44],
    [20, 5, 44], [21, 5, 44], [22, 5, 44], [23, 5, 44], [24, 5, 44],
    [25, 5, 44], [26, 5, 44], [27, 5, 44], [28, 5, 44], [29, 5, 44],
    [30, 6, 43], [31, 6, 43], [32, 7, 42], [33, 8, 41], [34, 9, 40],
    [35, 11, 38], [36, 13, 36], [37, 16, 33],
  ] as const) span(bitmap, y, left, right, C.fur);
  rect(bitmap, 6, 11, 3, 16, C.furLight);
  rect(bitmap, 41, 12, 3, 17, C.furShade);
  span(bitmap, 34, 12, 37, C.furShade);
  span(bitmap, 3, 9, 11, C.furDeep);
  span(bitmap, 4, 8, 12, C.furDeep);
  span(bitmap, 3, 38, 40, C.furDeep);
  span(bitmap, 4, 37, 41, C.furDeep);
  rect(bitmap, 4, 28, 5, 6, C.mane);
  rect(bitmap, 41, 28, 5, 6, C.mane);
  span(bitmap, 35, 14, 35, C.mane);
  span(bitmap, 36, 16, 33, C.mane);
  span(bitmap, 37, 19, 30, C.maneLight);
}

function drawCinematicFace(bitmap: Bitmap): void {
  rect(bitmap, 9, 14, 12, 2, C.ink);
  rect(bitmap, 27, 13, 12, 2, C.ink);
  rect(bitmap, 11, 16, 9, 6, C.eye);
  rect(bitmap, 28, 15, 9, 6, C.eye);
  rect(bitmap, 13, 17, 3, 3, C.eyeLight);
  rect(bitmap, 30, 16, 3, 3, C.eyeLight);

  for (const [y, left, right] of [
    [21, 17, 39], [22, 15, 42], [23, 14, 45], [24, 14, 46], [25, 14, 46],
    [26, 14, 46], [27, 15, 45], [28, 16, 44], [29, 17, 43], [30, 19, 41],
    [31, 21, 39], [32, 23, 37],
  ] as const) span(bitmap, y, left, right, C.furShade);
  span(bitmap, 22, 19, 37, C.furLight);
  span(bitmap, 23, 18, 39, C.furLight);
  rect(bitmap, 42, 23, 7, 6, C.ink);
  rect(bitmap, 43, 23, 4, 2, C.maneLight);
  span(bitmap, 29, 19, 42, C.ink);
  span(bitmap, 30, 21, 40, C.furDeep);
  span(bitmap, 31, 23, 38, C.furLight);
  rect(bitmap, 24, 29, 4, 7, C.fang);
  rect(bitmap, 25, 34, 3, 3, C.fang);
  rect(bitmap, 37, 29, 4, 7, C.fang);
  rect(bitmap, 37, 34, 3, 3, C.fang);
  rect(bitmap, 7, 24, 4, 5, C.furDeep);
  rect(bitmap, 8, 24, 2, 2, C.furLight);
}

export function buildMarcusCinematicPortrait(): Bitmap {
  const logical = createBitmap(50, 58);
  drawCinematicBody(logical);
  drawCinematicHead(logical);
  drawCinematicFace(logical);
  const output = createBitmap(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  blitScaled(logical, output, 27, 44, 14);
  return output;
}

export function writeMarcusDialoguePortraits(root = process.cwd()): readonly string[] {
  const paths = EXPRESSIONS.map((expression) => {
    const suffix = expression === 'rest' ? '' : `.${expression}`;
    const path = resolve(root, 'assets/source/dialogue-portraits', `linda-boyfriend${suffix}.png`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, encodePng(buildMarcusDialoguePortrait(expression)));
    return path;
  });
  const cinematicPath = resolve(root, 'assets/source/dialogue-portraits/linda-boyfriend.cinematic.png');
  writeFileSync(cinematicPath, encodePng(buildMarcusCinematicPortrait()));
  return [...paths, cinematicPath];
}

if (require.main === module) {
  process.stdout.write(`${writeMarcusDialoguePortraits().join('\n')}\n`);
}
