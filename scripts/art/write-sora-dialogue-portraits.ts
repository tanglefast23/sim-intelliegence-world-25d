import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { blitScaled, createBitmap, encodePng, fillRect, type Bitmap, type Rgba } from './png';

export type SoraPortraitExpression = 'rest' | 'joy' | 'upset';

const OUTPUT_WIDTH = 754;
const OUTPUT_HEIGHT = 900;
const EXPRESSIONS: readonly SoraPortraitExpression[] = ['rest', 'joy', 'upset'];
const C = {
  ink: [29, 28, 31, 255],
  skin: [157, 184, 69, 255],
  skinLight: [184, 207, 88, 255],
  skinShade: [111, 139, 51, 255],
  gum: [102, 126, 47, 255],
  mottle: [128, 153, 58, 255],
  cavity: [27, 27, 30, 255],
  tooth: [229, 220, 181, 255],
  plum: [88, 48, 91, 255],
  plumLight: [126, 70, 129, 255],
  gold: [183, 137, 61, 255],
  amber: [236, 178, 52, 255],
} as const satisfies Record<string, Rgba>;

function rect(bitmap: Bitmap, x: number, y: number, width: number, height: number, color: Rgba): void {
  fillRect(bitmap, x, y, width, height, color);
}

function span(bitmap: Bitmap, y: number, left: number, right: number, color: Rgba): void {
  rect(bitmap, left, y, right - left + 1, 1, color);
}

function drawDialogueBody(bitmap: Bitmap): void {
  rect(bitmap, 4, 25, 22, 11, C.plum);
  rect(bitmap, 4, 25, 3, 11, C.skinShade);
  rect(bitmap, 23, 25, 3, 11, C.skin);
  span(bitmap, 25, 8, 21, C.plumLight);
  span(bitmap, 26, 10, 19, C.skin);
  span(bitmap, 27, 11, 18, C.skinShade);
  rect(bitmap, 13, 26, 4, 5, C.gold);
  rect(bitmap, 14, 27, 2, 3, C.amber);
}

function drawDialogueSkull(bitmap: Bitmap): void {
  for (const [y, left, right] of [
    [1, 8, 21], [2, 5, 24], [3, 4, 25], [4, 3, 26], [5, 2, 27],
    [6, 2, 27], [7, 1, 28], [8, 1, 28], [9, 1, 28], [10, 1, 28],
    [11, 1, 28], [12, 1, 28], [13, 1, 28], [14, 1, 28], [15, 2, 27],
    [16, 2, 27], [17, 3, 26], [18, 3, 26], [19, 4, 25], [20, 5, 24],
    [21, 6, 23], [22, 8, 21], [23, 10, 19],
  ] as const) span(bitmap, y, left, right, C.skin);
  rect(bitmap, 2, 7, 2, 9, C.skinLight);
  rect(bitmap, 26, 7, 2, 10, C.skinShade);
  rect(bitmap, 5, 4, 5, 2, C.mottle);
  rect(bitmap, 22, 13, 4, 3, C.mottle);
  rect(bitmap, 6, 15, 3, 2, C.skinShade);
}

function drawDialogueFace(bitmap: Bitmap, expression: SoraPortraitExpression): void {
  rect(bitmap, 4, expression === 'upset' ? 9 : 8, 8, 7, C.cavity);
  rect(bitmap, 18, expression === 'upset' ? 9 : 8, 8, 7, C.cavity);
  rect(bitmap, 6, 7, 4, 1, C.cavity);
  rect(bitmap, 20, 7, 4, 1, C.cavity);
  const pupilY = expression === 'joy' ? 10 : expression === 'upset' ? 12 : 11;
  rect(bitmap, 7, pupilY, expression === 'upset' ? 1 : 2, 2, C.amber);
  rect(bitmap, 21, pupilY, expression === 'upset' ? 1 : 2, 2, C.amber);
  rect(bitmap, 13, 14, 4, 3, C.cavity);
  rect(bitmap, 14, 13, 2, 1, C.cavity);

  const mouthTop = expression === 'joy' ? 17 : 18;
  rect(bitmap, 4, mouthTop - 1, 22, 6, C.gum);
  rect(bitmap, 6, mouthTop, 18, expression === 'joy' ? 3 : 2, C.cavity);
  const teeth = expression === 'upset' ? [8, 13, 18, 22] : [7, 11, 15, 19, 23];
  teeth.forEach((x, index) => {
    const height = expression === 'joy' ? 3 + (index % 2) : 2 + (index % 2);
    rect(bitmap, x, mouthTop, 2, height, C.tooth);
  });
  if (expression === 'joy') span(bitmap, mouthTop + 4, 8, 21, C.skinShade);
}

export function buildSoraDialoguePortrait(expression: SoraPortraitExpression): Bitmap {
  const logical = createBitmap(30, 36);
  drawDialogueBody(logical);
  drawDialogueSkull(logical);
  drawDialogueFace(logical, expression);
  const output = createBitmap(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  blitScaled(logical, output, 2, 0, 25);
  return output;
}

function drawCinematicBody(bitmap: Bitmap): void {
  rect(bitmap, 4, 47, 44, 17, C.plum);
  rect(bitmap, 4, 48, 6, 16, C.skinShade);
  rect(bitmap, 42, 48, 6, 16, C.skin);
  span(bitmap, 47, 13, 38, C.plumLight);
  span(bitmap, 48, 17, 34, C.skin);
  span(bitmap, 49, 19, 32, C.skinShade);
  rect(bitmap, 23, 49, 6, 8, C.gold);
  rect(bitmap, 25, 51, 2, 4, C.amber);
}

function drawCinematicSkull(bitmap: Bitmap): void {
  for (let y = 3; y <= 44; y += 1) {
    const inset = y < 8 ? 8 - y : y > 37 ? Math.floor((y - 37) * 0.8) : 0;
    span(bitmap, y, 2 + inset, 49 - inset, C.skin);
  }
  span(bitmap, 2, 16, 35, C.skin);
  span(bitmap, 1, 21, 30, C.skin);
  rect(bitmap, 3, 10, 3, 23, C.skinLight);
  rect(bitmap, 46, 11, 3, 23, C.skinShade);
  rect(bitmap, 10, 6, 9, 4, C.mottle);
  rect(bitmap, 39, 26, 7, 6, C.mottle);
  rect(bitmap, 8, 33, 6, 4, C.skinShade);
  rect(bitmap, 30, 5, 4, 3, C.mottle);
}

function drawCinematicFace(bitmap: Bitmap): void {
  rect(bitmap, 7, 14, 15, 13, C.cavity);
  rect(bitmap, 30, 14, 15, 13, C.cavity);
  rect(bitmap, 10, 12, 9, 2, C.cavity);
  rect(bitmap, 33, 12, 9, 2, C.cavity);
  rect(bitmap, 13, 19, 4, 4, C.amber);
  rect(bitmap, 35, 19, 4, 4, C.amber);
  rect(bitmap, 15, 19, 1, 1, C.tooth);
  rect(bitmap, 37, 19, 1, 1, C.tooth);
  rect(bitmap, 23, 24, 6, 7, C.cavity);
  rect(bitmap, 25, 22, 2, 3, C.cavity);
  rect(bitmap, 6, 30, 40, 11, C.gum);
  rect(bitmap, 10, 32, 32, 5, C.cavity);
  [11, 17, 23, 29, 35, 40].forEach((x, index) => {
    rect(bitmap, x, 31, 3, 4 + (index % 2), C.tooth);
  });
  span(bitmap, 41, 12, 39, C.skinShade);
  rect(bitmap, 45, 34, 4, 5, C.cavity);
}

export function buildSoraCinematicPortrait(): Bitmap {
  const logical = createBitmap(52, 64);
  drawCinematicBody(logical);
  drawCinematicSkull(logical);
  drawCinematicFace(logical);
  const output = createBitmap(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  blitScaled(logical, output, 13, 2, 14);
  return output;
}

export function writeSoraDialoguePortraits(root = process.cwd()): readonly string[] {
  const paths = EXPRESSIONS.map((expression) => {
    const suffix = expression === 'rest' ? '' : `.${expression}`;
    const path = resolve(root, 'assets/source/dialogue-portraits', `sora-tan${suffix}.png`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, encodePng(buildSoraDialoguePortrait(expression)));
    return path;
  });
  const cinematicPath = resolve(root, 'assets/source/dialogue-portraits/sora-tan.cinematic.png');
  writeFileSync(cinematicPath, encodePng(buildSoraCinematicPortrait()));
  return [...paths, cinematicPath];
}

if (require.main === module) process.stdout.write(`${writeSoraDialoguePortraits().join('\n')}\n`);
