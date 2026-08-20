import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  bakePencilCharacterFrames,
  PENCIL_CHARACTER_RECIPES,
  type PencilVisualId,
} from '../../src/render/pencil/characters';
import { bakeVampireFrames, PENCIL_HEIGHT, PENCIL_WIDTH } from '../../src/render/pencil/vampire';
import { drawText } from './build-review-sheet';
import { blitScaled, createBitmap, decodePng, encodePng, setPixel, type Bitmap } from './png';

const CAST = [
  ['linda', 'LINDA / BIGFOOT'],
  ['mina-park', 'MINA / WITCH'],
  ['devon-price', 'DEVON / GOBLIN'],
  ['rafael-cruz', 'RAFAEL / ORC'],
  ['tomas-reed', 'TOMAS / GHOST'],
  ['priya-nair', 'PRIYA / SKELETON'],
  ['sora-tan', 'SORA / GHOUL'],
  ['elise-moreau', 'ELISE / FRANKENSTEIN'],
] as const satisfies readonly (readonly [PencilVisualId, string])[];

const IDLE_INDEXES = [0, 9, 18, 27] as const;

function frameBitmap(data: Uint8ClampedArray): Bitmap {
  return { width: PENCIL_WIDTH, height: PENCIL_HEIGHT, data: Buffer.from(data) };
}

function silhouetteBitmap(data: Uint8ClampedArray): Bitmap {
  const bitmap = frameBitmap(data);
  for (let offset = 0; offset < bitmap.data.length; offset += 4) {
    if (bitmap.data[offset + 3] === 0) continue;
    bitmap.data[offset] = 24;
    bitmap.data[offset + 1] = 22;
    bitmap.data[offset + 2] = 26;
    bitmap.data[offset + 3] = 255;
  }
  return bitmap;
}

export function writePencilCastReview(root = process.cwd()): string {
  const scale = 2;
  const labelHeight = 30;
  const rowHeight = PENCIL_HEIGHT * scale + labelHeight;
  const output = createBitmap(PENCIL_WIDTH * scale * 4, rowHeight * CAST.length, [246, 241, 229, 255]);
  CAST.forEach(([visualId, label], row) => {
    const recipe = PENCIL_CHARACTER_RECIPES[visualId];
    const frames = bakePencilCharacterFrames(recipe);
    const status = recipe.artStatus.worldBody === 'approved-literal-anatomy' ? 'APPROVED' : 'REJECTED';
    drawText(output, `${label} / ${status}`, 8, row * rowHeight + 8, [31, 29, 26, 255], 2);
    IDLE_INDEXES.forEach((index, column) => {
      blitScaled(
        frameBitmap(frames[index]!),
        output,
        column * PENCIL_WIDTH * scale,
        row * rowHeight + labelHeight,
        scale,
      );
    });
  });
  const directory = resolve(root, 'artifacts/creature-cast-recast');
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, 'pencil-cast-four-facings.png');
  writeFileSync(path, encodePng(output));
  return path;
}

export function writeDialoguePortraitReview(root = process.cwd()): string {
  const cardWidth = 188;
  const imageHeight = 224;
  const labelHeight = 28;
  const output = createBitmap(cardWidth * 4, (imageHeight + labelHeight) * 2, [24, 21, 27, 255]);
  CAST.forEach(([visualId, label], index) => {
    const recipe = PENCIL_CHARACTER_RECIPES[visualId];
    const source = decodePng(readFileSync(resolve(root, 'assets/source/dialogue-portraits', `${visualId}.png`)));
    const cardX = (index % 4) * cardWidth;
    const cardY = Math.floor(index / 4) * (imageHeight + labelHeight);
    const status = recipe.artStatus.dialoguePortrait === 'approved-literal-anatomy' ? 'APPROVED' : 'REJECTED';
    drawText(output, `${label} / ${status}`, cardX + 5, cardY + 8, [244, 228, 166, 255]);
    for (let y = 0; y < imageHeight; y += 1) {
      for (let x = 0; x < cardWidth; x += 1) {
        const sx = Math.min(source.width - 1, Math.floor(x * source.width / cardWidth));
        const sy = Math.min(source.height - 1, Math.floor(y * source.height / imageHeight));
        const offset = (sy * source.width + sx) * 4;
        if (source.data[offset + 3] === 0) continue;
        setPixel(output, cardX + x, cardY + labelHeight + y, [
          source.data[offset]!, source.data[offset + 1]!, source.data[offset + 2]!, 255,
        ]);
      }
    }
  });
  const directory = resolve(root, 'artifacts/creature-cast-recast');
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, 'dialogue-portraits.png');
  writeFileSync(path, encodePng(output));
  return path;
}

export function writePriyaLiteralReview(root = process.cwd()): string {
  return writeCreatureLiteralReview('priya-nair', 'priya-literal-anatomy-review.png', root);
}

function writeCreatureLiteralReview(
  visualId: PencilVisualId,
  filename: string,
  root: string,
): string {
  const scale = 3;
  const labelHeight = 26;
  const rowHeight = PENCIL_HEIGHT * scale + labelHeight;
  const output = createBitmap(PENCIL_WIDTH * scale * 4, rowHeight * 5, [246, 241, 229, 255]);
  const recipe = PENCIL_CHARACTER_RECIPES[visualId];
  const dressed = bakePencilCharacterFrames(recipe);
  const anatomyOnly = bakePencilCharacterFrames(recipe, { hidePersonalLayers: true });
  const rows = [
    ['ANATOMY ONLY', anatomyOnly, [246, 241, 229, 255] as const, false],
    ['DRESSED', dressed, [246, 241, 229, 255] as const, false],
    ['BRIGHT GROUND', dressed, [213, 202, 136, 255] as const, false],
    ['DARK GROUND', dressed, [48, 57, 64, 255] as const, false],
    ['SILHOUETTE', dressed, [246, 241, 229, 255] as const, true],
  ] as const;
  rows.forEach(([label, frames, background, silhouette], row) => {
    const rowY = row * rowHeight;
    for (let y = rowY; y < rowY + rowHeight; y += 1) {
      for (let x = 0; x < output.width; x += 1) setPixel(output, x, y, background);
    }
    drawText(output, label, 8, rowY + 7, [31, 29, 26, 255], 2);
    IDLE_INDEXES.forEach((index, column) => {
      const frame = silhouette ? silhouetteBitmap(frames[index]!) : frameBitmap(frames[index]!);
      blitScaled(frame, output, column * PENCIL_WIDTH * scale, rowY + labelHeight, scale);
    });
  });
  const directory = resolve(root, 'artifacts/creature-cast-recast');
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, filename);
  writeFileSync(path, encodePng(output));
  return path;
}

export function writeEliseLiteralReview(tag = 'pass-1', root = process.cwd()): string {
  return writeCreatureLiteralReview('elise-moreau', `elise-${tag}-literal-anatomy-review.png`, root);
}

export function writePriyaMotionReviews(root = process.cwd()): readonly string[] {
  return writeMotionReviews('priya', bakePencilCharacterFrames(PENCIL_CHARACTER_RECIPES['priya-nair']), root);
}

export function writeEliseMotionReviews(tag = 'pass-1', root = process.cwd()): readonly string[] {
  return writeMotionReviews(`elise-${tag}`, bakePencilCharacterFrames(PENCIL_CHARACTER_RECIPES['elise-moreau']), root);
}

function writeMotionReviews(prefix: string, frames: readonly Uint8ClampedArray[], root: string): readonly string[] {
  const scale = 3;
  const labelHeight = 26;
  const rowHeight = PENCIL_HEIGHT * scale + labelHeight;
  const directory = resolve(root, 'artifacts/creature-cast-recast');
  mkdirSync(directory, { recursive: true });
  return ['front', 'rear', 'left', 'right'].map((facing, facingIndex) => {
    const output = createBitmap(PENCIL_WIDTH * scale * 3, rowHeight * 3, [246, 241, 229, 255]);
    ['IDLE', 'WALK A', 'WALK B'].forEach((state, stateIndex) => {
      drawText(output, `${facing.toUpperCase()} / ${state}`, 8, stateIndex * rowHeight + 7, [31, 29, 26, 255], 2);
      for (let boil = 0; boil < 3; boil += 1) {
        blitScaled(
          frameBitmap(frames[facingIndex * 9 + stateIndex * 3 + boil]!),
          output,
          boil * PENCIL_WIDTH * scale,
          stateIndex * rowHeight + labelHeight,
          scale,
        );
      }
    });
    const path = resolve(directory, `${prefix}-motion-${facing}.png`);
    writeFileSync(path, encodePng(output));
    return path;
  });
}

export function writeVampireMotionReviews(tag = 'baseline', root = process.cwd()): readonly string[] {
  return writeMotionReviews(`vampire-${tag}`, bakeVampireFrames(), root);
}

export function writeVampireFourFacingReview(tag = 'baseline', root = process.cwd()): string {
  const scale = 3;
  const labelHeight = 26;
  const rowHeight = PENCIL_HEIGHT * scale + labelHeight;
  const frames = bakeVampireFrames();
  const rows = [
    ['DRESSED', [246, 241, 229, 255] as const, false],
    ['BRIGHT GROUND', [213, 202, 136, 255] as const, false],
    ['DARK GROUND', [48, 57, 64, 255] as const, false],
    ['SILHOUETTE', [246, 241, 229, 255] as const, true],
  ] as const;
  const output = createBitmap(PENCIL_WIDTH * scale * 4, rowHeight * rows.length, rows[0]![1]);
  rows.forEach(([label, background, silhouette], row) => {
    const rowY = row * rowHeight;
    for (let y = rowY; y < rowY + rowHeight; y += 1) {
      for (let x = 0; x < output.width; x += 1) setPixel(output, x, y, background);
    }
    drawText(output, label, 8, rowY + 7, [31, 29, 26, 255], 2);
    IDLE_INDEXES.forEach((index, column) => {
      const frame = silhouette ? silhouetteBitmap(frames[index]!) : frameBitmap(frames[index]!);
      blitScaled(frame, output, column * PENCIL_WIDTH * scale, rowY + labelHeight, scale);
    });
  });
  const directory = resolve(root, 'artifacts/creature-cast-recast');
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, `vampire-${tag}-four-facings.png`);
  writeFileSync(path, encodePng(output));
  return path;
}

export function writePriyaPortraitExpressionReview(root = process.cwd()): string {
  return writePortraitExpressionReview('priya-nair', 'priya-dialogue-portrait-expressions.png', root);
}

function writePortraitExpressionReview(visualId: PencilVisualId, filename: string, root: string): string {
  const cardWidth = 251;
  const imageHeight = 300;
  const labelHeight = 28;
  const expressions = ['REST', 'JOY', 'UPSET'] as const;
  const output = createBitmap(cardWidth * expressions.length, imageHeight + labelHeight, [24, 21, 27, 255]);
  expressions.forEach((expression, index) => {
    const suffix = expression === 'REST' ? '' : `.${expression.toLowerCase()}`;
    const source = decodePng(readFileSync(resolve(root, 'assets/source/dialogue-portraits', `${visualId}${suffix}.png`)));
    const cardX = index * cardWidth;
    drawText(output, expression, cardX + 8, 8, [244, 228, 166, 255], 2);
    for (let y = 0; y < imageHeight; y += 1) {
      for (let x = 0; x < cardWidth; x += 1) {
        const sx = Math.min(source.width - 1, Math.floor(x * source.width / cardWidth));
        const sy = Math.min(source.height - 1, Math.floor(y * source.height / imageHeight));
        const offset = (sy * source.width + sx) * 4;
        if (source.data[offset + 3] === 0) continue;
        setPixel(output, cardX + x, labelHeight + y, [
          source.data[offset]!, source.data[offset + 1]!, source.data[offset + 2]!, 255,
        ]);
      }
    }
  });
  const directory = resolve(root, 'artifacts/creature-cast-recast');
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, filename);
  writeFileSync(path, encodePng(output));
  return path;
}

export function writeElisePortraitExpressionReview(root = process.cwd()): string {
  return writePortraitExpressionReview('elise-moreau', 'elise-dialogue-portrait-expressions.png', root);
}

if (require.main === module) {
  process.stdout.write(`${writePencilCastReview()}\n${writeDialoguePortraitReview()}\n${writePriyaLiteralReview()}\n${writePriyaMotionReviews().join('\n')}\n${writePriyaPortraitExpressionReview()}\n`);
}
