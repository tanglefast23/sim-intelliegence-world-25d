import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { blitScaled, createBitmap, encodePng, fillRect, type Bitmap, type Rgba } from './png';

export type CalderPortraitExpression = 'rest' | 'joy' | 'upset';

const OUTPUT_WIDTH = 754;
const OUTPUT_HEIGHT = 900;
const EXPRESSIONS: readonly CalderPortraitExpression[] = ['rest', 'joy', 'upset'];

const C = {
  ink: [28, 29, 31, 255],
  ivory: [220, 215, 194, 255],
  ivoryLight: [244, 239, 216, 255],
  ivoryShade: [171, 167, 151, 255],
  steel: [64, 88, 104, 255],
  steelLight: [91, 120, 137, 255],
  brass: [174, 119, 34, 255],
  amber: [232, 171, 49, 255],
  rubber: [39, 42, 43, 255],
} as const satisfies Record<string, Rgba>;

function rect(bitmap: Bitmap, x: number, y: number, width: number, height: number, color: Rgba): void {
  fillRect(bitmap, x, y, width, height, color);
}

function span(bitmap: Bitmap, y: number, left: number, right: number, color: Rgba): void {
  rect(bitmap, left, y, right - left + 1, 1, color);
}

function drawHead(bitmap: Bitmap, expression: CalderPortraitExpression): void {
  rect(bitmap, 4, 2, 16, 15, C.ink);
  rect(bitmap, 5, 1, 14, 17, C.ink);
  rect(bitmap, 5, 2, 14, 14, C.ivory);
  rect(bitmap, 6, 2, 4, 1, C.ivoryLight);
  rect(bitmap, 18, 4, 1, 10, C.ivoryShade);

  if (expression === 'joy') {
    span(bitmap, 7, 7, 10, C.ink);
    span(bitmap, 7, 13, 16, C.ink);
    span(bitmap, 8, 8, 9, C.amber);
    span(bitmap, 8, 14, 15, C.amber);
  } else if (expression === 'upset') {
    span(bitmap, 6, 7, 9, C.ink);
    span(bitmap, 7, 7, 10, C.ink);
    span(bitmap, 6, 14, 16, C.ink);
    span(bitmap, 7, 13, 16, C.ink);
    rect(bitmap, 8, 7, 2, 2, C.amber);
    rect(bitmap, 14, 7, 2, 2, C.amber);
  } else {
    rect(bitmap, 7, 7, 4, 3, C.ink);
    rect(bitmap, 13, 7, 4, 3, C.ink);
    rect(bitmap, 8, 8, 2, 1, C.amber);
    rect(bitmap, 14, 8, 2, 1, C.amber);
  }

  span(bitmap, 12, 8, 15, C.ink);
  if (expression === 'joy') span(bitmap, 13, 9, 14, C.ink);
  else if (expression === 'upset') span(bitmap, 11, 9, 14, C.ink);
  else span(bitmap, 14, 8, 15, C.ink);
}

function drawDialogueBody(bitmap: Bitmap): void {
  rect(bitmap, 10, 17, 4, 3, C.steel);
  span(bitmap, 18, 7, 16, C.brass);
  rect(bitmap, 5, 20, 14, 9, C.ink);
  rect(bitmap, 6, 20, 12, 9, C.steel);
  rect(bitmap, 8, 21, 8, 6, C.ivory);
  span(bitmap, 23, 8, 15, C.ivoryShade);
  rect(bitmap, 10, 21, 4, 2, C.brass);
  rect(bitmap, 4, 21, 2, 7, C.steelLight);
  rect(bitmap, 18, 21, 2, 7, C.steel);
  rect(bitmap, 3, 27, 3, 2, C.rubber);
  rect(bitmap, 18, 27, 3, 2, C.rubber);
}

export function buildCalderDialoguePortrait(expression: CalderPortraitExpression): Bitmap {
  const logical = createBitmap(24, 29);
  drawDialogueBody(logical);
  drawHead(logical, expression);
  const output = createBitmap(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  blitScaled(logical, output, Math.floor((OUTPUT_WIDTH - logical.width * 31) / 2), 0, 31);
  return output;
}

function drawCinematicBody(bitmap: Bitmap): void {
  rect(bitmap, 12, 21, 5, 4, C.steel);
  span(bitmap, 23, 7, 23, C.brass);
  rect(bitmap, 4, 25, 23, 9, C.ink);
  rect(bitmap, 5, 25, 21, 9, C.steel);
  rect(bitmap, 9, 26, 12, 7, C.ivory);
  span(bitmap, 29, 9, 20, C.ivoryShade);
  rect(bitmap, 13, 26, 5, 2, C.brass);
  rect(bitmap, 22, 27, 3, 4, C.ivoryLight);
  rect(bitmap, 23, 28, 1, 1, C.brass);
  rect(bitmap, 2, 27, 4, 7, C.steelLight);
  rect(bitmap, 26, 27, 3, 7, C.rubber);
}

function drawCinematicHead(bitmap: Bitmap): void {
  rect(bitmap, 3, 3, 22, 19, C.ink);
  rect(bitmap, 4, 2, 20, 20, C.ink);
  rect(bitmap, 4, 3, 20, 17, C.ivory);
  rect(bitmap, 5, 3, 6, 2, C.ivoryLight);
  rect(bitmap, 22, 5, 2, 13, C.ivoryShade);
  rect(bitmap, 6, 8, 7, 4, C.ink);
  rect(bitmap, 15, 7, 7, 4, C.ink);
  rect(bitmap, 8, 9, 3, 2, C.amber);
  rect(bitmap, 17, 8, 3, 2, C.amber);
  span(bitmap, 15, 8, 20, C.ink);
  span(bitmap, 17, 9, 19, C.ink);
  span(bitmap, 19, 11, 17, C.ink);
}

export function buildCalderCinematicPortrait(): Bitmap {
  const logical = createBitmap(29, 34);
  drawCinematicBody(logical);
  drawCinematicHead(logical);
  const output = createBitmap(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  blitScaled(logical, output, 0, 8, 26);
  return output;
}

export function writeCalderDialoguePortraits(root = process.cwd()): readonly string[] {
  const paths = EXPRESSIONS.map((expression) => {
    const suffix = expression === 'rest' ? '' : `.${expression}`;
    const path = resolve(root, 'assets/source/dialogue-portraits', `resident-01${suffix}.png`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, encodePng(buildCalderDialoguePortrait(expression)));
    return path;
  });
  const cinematicPath = resolve(root, 'assets/source/dialogue-portraits/resident-01.cinematic.png');
  writeFileSync(cinematicPath, encodePng(buildCalderCinematicPortrait()));
  return [...paths, cinematicPath];
}

if (require.main === module) process.stdout.write(`${writeCalderDialoguePortraits().join('\n')}\n`);
