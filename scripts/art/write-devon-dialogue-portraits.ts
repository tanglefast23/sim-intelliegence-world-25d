import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { blitScaled, createBitmap, encodePng, fillRect, type Bitmap, type Rgba } from './png';

export type DevonPortraitExpression = 'rest' | 'joy' | 'upset';

const OUTPUT_WIDTH = 754;
const OUTPUT_HEIGHT = 900;
const EXPRESSIONS: readonly DevonPortraitExpression[] = ['rest', 'joy', 'upset'];

const C = {
  ink: [25, 27, 34, 255],
  skin: [132, 158, 172, 255],
  skinLight: [174, 194, 203, 255],
  skinShade: [91, 118, 133, 255],
  eye: [19, 20, 26, 255],
  burgundy: [105, 43, 54, 255],
  burgundyLight: [143, 61, 72, 255],
  cream: [226, 216, 190, 255],
  creamShade: [185, 174, 150, 255],
  copper: [188, 115, 56, 255],
  copperLight: [225, 157, 88, 255],
} as const satisfies Record<string, Rgba>;

function rect(bitmap: Bitmap, x: number, y: number, width: number, height: number, color: Rgba): void {
  fillRect(bitmap, x, y, width, height, color);
}

function span(bitmap: Bitmap, y: number, left: number, right: number, color: Rgba): void {
  rect(bitmap, left, y, right - left + 1, 1, color);
}

function drawDialogueAntenna(bitmap: Bitmap): void {
  rect(bitmap, 18, 3, 2, 4, C.skinShade);
  rect(bitmap, 19, 2, 2, 3, C.skin);
  rect(bitmap, 20, 1, 2, 2, C.skin);
  rect(bitmap, 21, 0, 2, 2, C.copper);
  rect(bitmap, 22, 0, 1, 1, C.copperLight);
}

function drawDialogueHead(bitmap: Bitmap): void {
  const rows = [
    [1, 9, 14], [2, 7, 16], [3, 6, 17], [4, 5, 18], [5, 4, 19],
    [6, 4, 19], [7, 4, 19], [8, 4, 19], [9, 4, 19], [10, 4, 19],
    [11, 4, 19], [12, 5, 18], [13, 5, 18], [14, 6, 17], [15, 7, 16], [16, 9, 14],
  ] as const;
  rows.forEach(([y, left, right]) => {
    span(bitmap, y, left, right, C.skin);
    rect(bitmap, left, y, 1, 1, C.ink);
    rect(bitmap, right, y, 1, 1, C.ink);
  });
  span(bitmap, 1, 10, 13, C.ink);
  span(bitmap, 2, 8, 10, C.skinLight);
  rect(bitmap, 5, 5, 1, 6, C.skinLight);
  rect(bitmap, 18, 5, 1, 7, C.skinShade);
  span(bitmap, 14, 7, 9, C.skinLight);
  span(bitmap, 15, 14, 16, C.skinShade);
}

function drawDialogueEyes(bitmap: Bitmap, expression: DevonPortraitExpression): void {
  if (expression === 'joy') {
    span(bitmap, 8, 6, 10, C.eye);
    span(bitmap, 8, 13, 17, C.eye);
    span(bitmap, 9, 7, 9, C.eye);
    span(bitmap, 9, 14, 16, C.eye);
  } else if (expression === 'upset') {
    span(bitmap, 7, 6, 8, C.eye);
    span(bitmap, 8, 6, 10, C.eye);
    span(bitmap, 9, 7, 10, C.eye);
    span(bitmap, 7, 15, 17, C.eye);
    span(bitmap, 8, 13, 17, C.eye);
    span(bitmap, 9, 13, 16, C.eye);
  } else {
    span(bitmap, 7, 7, 9, C.eye);
    span(bitmap, 8, 6, 10, C.eye);
    span(bitmap, 9, 7, 9, C.eye);
    span(bitmap, 7, 14, 16, C.eye);
    span(bitmap, 8, 13, 17, C.eye);
    span(bitmap, 9, 14, 16, C.eye);
  }
}

function drawDialogueFace(bitmap: Bitmap, expression: DevonPortraitExpression): void {
  drawDialogueEyes(bitmap, expression);
  rect(bitmap, 11, 11, 1, 1, C.ink);
  rect(bitmap, 13, 11, 1, 1, C.ink);
  if (expression === 'joy') {
    span(bitmap, 13, 9, 15, C.ink);
    span(bitmap, 14, 10, 14, C.skinLight);
  } else if (expression === 'upset') {
    span(bitmap, 14, 9, 15, C.ink);
    span(bitmap, 13, 10, 14, C.ink);
  } else {
    span(bitmap, 14, 10, 14, C.ink);
  }
}

function drawDialogueBody(bitmap: Bitmap): void {
  rect(bitmap, 10, 16, 5, 4, C.skinShade);
  span(bitmap, 19, 7, 17, C.cream);
  span(bitmap, 20, 6, 18, C.creamShade);
  rect(bitmap, 4, 21, 16, 8, C.burgundy);
  rect(bitmap, 5, 21, 3, 8, C.burgundyLight);
  span(bitmap, 21, 9, 15, C.cream);
  rect(bitmap, 11, 21, 2, 8, C.ink);
  rect(bitmap, 12, 23, 1, 1, C.copperLight);
  rect(bitmap, 19, 22, 2, 2, C.copper);
  rect(bitmap, 20, 24, 3, 4, C.copper);
  span(bitmap, 24, 20, 22, C.copperLight);
  span(bitmap, 28, 20, 22, C.ink);
}

export function buildDevonDialoguePortrait(expression: DevonPortraitExpression): Bitmap {
  const logical = createBitmap(24, 29);
  drawDialogueAntenna(logical);
  drawDialogueBody(logical);
  drawDialogueHead(logical);
  drawDialogueFace(logical, expression);
  const output = createBitmap(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  blitScaled(logical, output, Math.floor((OUTPUT_WIDTH - logical.width * 31) / 2), 0, 31);
  return output;
}

function drawCinematicAntenna(bitmap: Bitmap): void {
  rect(bitmap, 21, 4, 2, 5, C.skinShade);
  rect(bitmap, 22, 2, 2, 4, C.skin);
  rect(bitmap, 23, 1, 3, 2, C.skin);
  rect(bitmap, 25, 0, 3, 2, C.copper);
  rect(bitmap, 27, 0, 1, 1, C.copperLight);
}

function drawCinematicHead(bitmap: Bitmap): void {
  const rows = [
    [2, 10, 19], [3, 8, 21], [4, 6, 23], [5, 5, 24], [6, 4, 25],
    [7, 3, 25], [8, 3, 25], [9, 3, 25], [10, 3, 25], [11, 3, 25],
    [12, 3, 25], [13, 3, 25], [14, 4, 24], [15, 4, 24], [16, 5, 23],
    [17, 5, 23], [18, 6, 22], [19, 7, 21], [20, 8, 20], [21, 10, 19],
  ] as const;
  rows.forEach(([y, left, right]) => {
    span(bitmap, y, left, right, C.skin);
    rect(bitmap, left, y, 1, 1, C.ink);
    rect(bitmap, right, y, 1, 1, C.ink);
  });
  span(bitmap, 2, 11, 18, C.ink);
  span(bitmap, 3, 9, 13, C.skinLight);
  rect(bitmap, 4, 7, 2, 8, C.skinLight);
  rect(bitmap, 23, 7, 2, 9, C.skinShade);
  span(bitmap, 17, 6, 9, C.skinLight);
  span(bitmap, 19, 17, 21, C.skinShade);
}

function drawCinematicFace(bitmap: Bitmap): void {
  span(bitmap, 9, 6, 10, C.eye);
  span(bitmap, 10, 5, 11, C.eye);
  span(bitmap, 11, 6, 10, C.eye);
  span(bitmap, 8, 17, 20, C.eye);
  span(bitmap, 9, 16, 22, C.eye);
  span(bitmap, 10, 17, 21, C.eye);
  rect(bitmap, 13, 13, 1, 1, C.ink);
  rect(bitmap, 15, 13, 1, 1, C.ink);
  span(bitmap, 17, 11, 18, C.ink);
  rect(bitmap, 18, 16, 1, 1, C.ink);
}

function drawCinematicBody(bitmap: Bitmap): void {
  rect(bitmap, 12, 21, 6, 5, C.skinShade);
  span(bitmap, 24, 8, 22, C.cream);
  span(bitmap, 25, 6, 24, C.creamShade);
  rect(bitmap, 3, 26, 24, 8, C.burgundy);
  rect(bitmap, 4, 26, 5, 8, C.burgundyLight);
  rect(bitmap, 24, 27, 3, 7, C.skinShade);
  span(bitmap, 26, 11, 19, C.cream);
  rect(bitmap, 14, 26, 2, 8, C.ink);
  rect(bitmap, 15, 28, 1, 1, C.copperLight);
  rect(bitmap, 25, 27, 2, 2, C.copperLight);
  rect(bitmap, 25, 29, 4, 4, C.copper);
  span(bitmap, 33, 25, 28, C.ink);
}

export function buildDevonCinematicPortrait(): Bitmap {
  const logical = createBitmap(29, 34);
  drawCinematicAntenna(logical);
  drawCinematicBody(logical);
  drawCinematicHead(logical);
  drawCinematicFace(logical);
  const output = createBitmap(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  blitScaled(logical, output, 0, 8, 26);
  return output;
}

export function writeDevonDialoguePortraits(root = process.cwd()): readonly string[] {
  const paths = EXPRESSIONS.map((expression) => {
    const suffix = expression === 'rest' ? '' : `.${expression}`;
    const path = resolve(root, 'assets/source/dialogue-portraits', `devon-price${suffix}.png`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, encodePng(buildDevonDialoguePortrait(expression)));
    return path;
  });
  const cinematicPath = resolve(root, 'assets/source/dialogue-portraits/devon-price.cinematic.png');
  writeFileSync(cinematicPath, encodePng(buildDevonCinematicPortrait()));
  return [...paths, cinematicPath];
}

if (require.main === module) {
  process.stdout.write(`${writeDevonDialoguePortraits().join('\n')}\n`);
}
