import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { composePortrait, loadCharacterSources, tokenFrameToBitmap } from './character-source';
import { blitScaled, createBitmap, encodePng, type Bitmap } from './png';

const OUTPUT_WIDTH = 754;
const OUTPUT_HEIGHT = 900;
const SCALE = 31;

export function buildProtagonistDialoguePortrait(root = process.cwd()): Bitmap {
  const source = loadCharacterSources(root).find(({ id }) => id === 'vampire-01');
  if (!source) throw new Error('The vampire-01 character source is missing.');
  const portrait = tokenFrameToBitmap(composePortrait(source, 'rest'), source.palette);
  const output = createBitmap(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const x = Math.floor((OUTPUT_WIDTH - portrait.width * SCALE) / 2);
  const y = Math.floor((OUTPUT_HEIGHT - portrait.height * SCALE) / 2);
  blitScaled(portrait, output, x, y, SCALE);
  return output;
}

export function writeProtagonistDialoguePortrait(root = process.cwd()): string {
  const path = resolve(root, 'assets/source/dialogue-portraits/protagonist.png');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(buildProtagonistDialoguePortrait(root)));
  return path;
}

if (require.main === module) {
  process.stdout.write(`Protagonist portrait: ${writeProtagonistDialoguePortrait()}\n`);
}
