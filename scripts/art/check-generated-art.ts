import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import pixelBaseline from '../../assets/source/art/revision-16-pixel-hashes.json';
import { buildAtlas, type AtlasIndex } from './build-world-atlas';
import { decodePng } from './png';

const REQUIRED_GENERATED_ARTIFACTS = [
  'assets/generated/atlas-index.json',
  'assets/generated/atlas-report.json',
  'src/world/presentation/generated-recipes.json',
  'assets/generated/world-atlas.png',
  'assets/source/art/manifest.json',
  'assets/source/art/material-recipes.json',
  'assets/source/art/roof-recipes.json',
  'assets/source/art/decal-recipes.json',
  'assets/source/art/transition-recipes.json',
  'assets/source/art/revision-16-pixel-hashes.json',
] as const;

type AtlasRect = Readonly<{ x: number; y: number; width: number; height: number }>;

function rectanglePixels(
  atlas: ReturnType<typeof decodePng>,
  rectangle: AtlasRect,
): Buffer {
  const result = Buffer.alloc(rectangle.width * rectangle.height * 4);
  for (let row = 0; row < rectangle.height; row += 1) {
    const sourceStart = ((rectangle.y + row) * atlas.width + rectangle.x) * 4;
    atlas.data.copy(result, row * rectangle.width * 4, sourceStart, sourceStart + rectangle.width * 4);
  }
  return result;
}

function aggregatePublicCellHash(
  atlas: ReturnType<typeof decodePng>,
  index: AtlasIndex,
): string {
  const hash = createHash('sha256');
  for (const id of [...index.publicSpriteIds].sort()) {
    const rectangle = index.sprites[id];
    if (!rectangle) throw new Error(`Missing public cell ${id}.`);
    hash.update(`${id}\0${rectangle.width}x${rectangle.height}\0`);
    hash.update(rectanglePixels(atlas, rectangle));
  }
  return hash.digest('hex');
}

/**
 * Both cells of a direction pair must exist at 24x30, and the animated directions must DIFFER.
 *
 * This rule used to require every pair to be byte-identical, which is what enforced the old
 * "rounded floating movement" — the walk frame swapped between two copies of the same pixels.
 * Directions are added to `animated` as their stride art lands, so the check stays meaningful
 * at every step rather than being switched off wholesale.
 */
function assertWalkCells(index: AtlasIndex, atlas: ReturnType<typeof decodePng>): void {
  for (const [characterId, character] of Object.entries(index.characters)) {
    // The protagonist's eight cells come from protagonistReferenceFrames() and stay identical
    // until its stride poses are authored.
    const animated = characterId === 'protagonist' ? new Set<string>() : new Set(['front']);
    for (const direction of ['front', 'rear', 'left', 'right'] as const) {
      const first = index.sprites[character.frames[`${direction}-1`] as string];
      const second = index.sprites[character.frames[`${direction}-2`] as string];
      if (!first || !second || first.width !== 24 || first.height !== 30 || second.width !== 24 || second.height !== 30) {
        throw new Error(`${characterId} ${direction} must have two 24x30 atlas cells.`);
      }
      const identical = rectanglePixels(atlas, first).equals(rectanglePixels(atlas, second));
      if (animated.has(direction) && identical) {
        throw new Error(`${characterId} ${direction} cells must differ; the walk frame is not animating.`);
      }
      if (!animated.has(direction) && !identical) {
        throw new Error(`${characterId} ${direction} cells must be byte-identical until that direction animates.`);
      }
    }
  }
}

function main(root = process.cwd()): void {
  for (const path of REQUIRED_GENERATED_ARTIFACTS) {
    if (!existsSync(resolve(root, path))) throw new Error(`Required generated art artifact is missing: ${path}`);
  }
  const built = buildAtlas(root);
  const generatedPng = readFileSync(resolve(root, 'assets/generated/world-atlas.png'));
  const generatedIndex = readFileSync(resolve(root, 'assets/generated/atlas-index.json'), 'utf8');
  const generatedReport = readFileSync(resolve(root, 'assets/generated/atlas-report.json'), 'utf8');
  const generatedPresentationRecipes = readFileSync(resolve(root, 'src/world/presentation/generated-recipes.json'), 'utf8');
  if (!generatedPng.equals(built.png)) throw new Error('Generated atlas PNG does not match the deterministic builder.');
  if (generatedIndex !== `${JSON.stringify(built.index, null, 2)}\n`) {
    throw new Error('Generated atlas index does not match the deterministic builder.');
  }
  if (generatedReport !== `${JSON.stringify(built.report, null, 2)}\n`) {
    throw new Error('Generated atlas report does not match the deterministic builder.');
  }
  if (generatedPresentationRecipes !== `${JSON.stringify(built.presentationRecipes, null, 2)}\n`) {
    throw new Error('Generated art presentation recipes do not match the deterministic builder.');
  }
  if (pixelBaseline.artRevision !== built.index.artRevision) {
    throw new Error('Revisioned pixel baseline does not match the atlas art revision.');
  }
  const atlas = decodePng(generatedPng);
  if (aggregatePublicCellHash(atlas, built.index) !== pixelBaseline.allPublicCellsAggregateSha256) {
    throw new Error('Public atlas inner pixels changed without a new art revision and aggregate baseline.');
  }
  for (const [id, expected] of Object.entries(pixelBaseline.cells)) {
    const rectangle = built.index.sprites[id];
    if (!rectangle) throw new Error(`Revisioned pixel baseline references missing cell ${id}.`);
    const digest = createHash('sha256').update(rectanglePixels(atlas, rectangle)).digest('hex');
    if (digest !== expected) throw new Error(`${id} changed without a new revisioned pixel baseline.`);
  }
  assertWalkCells(built.index, atlas);
  const generatedPaths = [
    'assets/generated/world-atlas.png',
    'assets/generated/atlas-index.json',
    'assets/generated/atlas-report.json',
    'src/world/presentation/generated-recipes.json',
  ];
  execFileSync('git', ['ls-files', '--error-unmatch', ...generatedPaths], {
    cwd: root,
    stdio: 'ignore',
  });
  execFileSync('git', ['diff', '--exit-code', '--', ...generatedPaths], {
    cwd: root,
    stdio: 'inherit',
  });
  process.stdout.write(
    `Generated art is deterministic and staged at revision ${built.index.artRevision}; historical evidence was not regenerated.\n`,
  );
}

try {
  main();
} catch (error: unknown) {
  process.stderr.write(`Generated art check failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
