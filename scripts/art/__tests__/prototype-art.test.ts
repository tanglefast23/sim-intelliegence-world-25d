import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildAtlas } from '../build-world-atlas';
import {
  composeFrontFrame,
  loadCharacterSources,
  loadMultiTileCompositions,
  tokenFrameToBitmap,
} from '../character-source';
import { decodePng } from '../png';
import {
  canonicalMaterialDistribution,
  selectMaterialVariants,
} from '../../../src/world/presentation/material-selection';
import {
  ART_PRESENTATION_REVISION,
  MATERIAL_RECIPE_BY_ID,
} from '../../../src/world/presentation/recipes';

const PROTOTYPE_CHARACTERS = ['protagonist', 'linda', 'generic-resident'] as const;
const DIRECTIONS = ['front-1', 'front-2', 'rear-1', 'rear-2', 'left-1', 'left-2', 'right-1', 'right-2'] as const;
const MATERIALS = [
  ['warm-sand', 4],
  ['dune-grass', 4],
  ['villa-floor', 4],
  ['spa-stone', 2],
  ['shallow-water', 4],
] as const;

function cellPixels(
  atlas: ReturnType<typeof decodePng>,
  rectangle: Readonly<{ x: number; y: number; width: number; height: number }>,
): Buffer {
  const pixels = Buffer.alloc(rectangle.width * rectangle.height * 4);
  for (let row = 0; row < rectangle.height; row += 1) {
    const sourceStart = ((rectangle.y + row) * atlas.width + rectangle.x) * 4;
    atlas.data.copy(pixels, row * rectangle.width * 4, sourceStart, sourceStart + rectangle.width * 4);
  }
  return pixels;
}

function alphaCount(pixels: Buffer): number {
  return [...pixels].filter((_value, offset) => offset % 4 === 3 && pixels[offset] !== 0).length;
}

describe('Phase 28 hard Sunward prototype art', () => {
  test('gives every prototype material real balanced 2x2 or 3x3 compositions', () => {
    for (const [materialId, expectedVariants] of MATERIALS) {
      const recipe = MATERIAL_RECIPE_BY_ID[materialId];
      expect(recipe).toBeDefined();
      expect(recipe!.publicVariantSprites).toHaveLength(expectedVariants);
      expect(new Set(recipe!.publicVariantSprites).size).toBe(expectedVariants);
      const report = canonicalMaterialDistribution(`phase-28-${materialId}`, recipe!, ART_PRESENTATION_REVISION);
      expect(report.passed).toBe(true);
      const selected = selectMaterialVariants({
        mapId: `phase-28-${materialId}`,
        width: 12,
        height: 12,
        materialIds: Array.from({ length: 144 }, () => materialId),
        artRevision: ART_PRESENTATION_REVISION,
        recipesById: { [materialId]: recipe! },
      });
      expect(new Set(selected.map(({ variantIndex }) => variantIndex)).size).toBe(expectedVariants);
      expect(new Set(selected.map(({ compositionSize }) => compositionSize)).size).toBe(1);
    }
  });

  test('keeps eight reachable stable 24x30 cells, contour growth, and a 24x29 portrait per character', () => {
    const built = buildAtlas();
    const atlas = decodePng(built.png);
    const sources = new Map(loadCharacterSources().map((source) => [source.id, source]));
    const frontMasks = new Set<string>();
    for (const characterId of PROTOTYPE_CHARACTERS) {
      const source = sources.get(characterId)!;
      const rawFront = tokenFrameToBitmap(composeFrontFrame(source, 0), source.palette);
      const rawAlpha = alphaCount(rawFront.data);
      for (const direction of DIRECTIONS) {
        const rectangle = built.index.sprites[`character.${characterId}.${direction}`];
        expect(rectangle).toMatchObject({ width: 24, height: 30, visibility: 'public' });
        const pixels = cellPixels(atlas, rectangle!);
        expect(alphaCount(pixels)).toBeGreaterThan(0);
        if (direction === 'front-1' && characterId !== 'protagonist') {
          expect(alphaCount(pixels)).toBeGreaterThan(rawAlpha);
          frontMasks.add([...pixels].filter((_value, offset) => offset % 4 === 3).join(','));
        } else if (direction === 'front-1') {
          frontMasks.add([...pixels].filter((_value, offset) => offset % 4 === 3).join(','));
        }
      }
      // Both cells of a pair are the walk cycle and must differ, in every direction and for
      // every character including the protagonist, whose stride poses are derived from its
      // authored idle frames.
      for (const direction of ['front', 'rear', 'left', 'right'] as const) {
        const first = cellPixels(atlas, built.index.sprites[`character.${characterId}.${direction}-1`]!);
        const second = cellPixels(atlas, built.index.sprites[`character.${characterId}.${direction}-2`]!);
        expect(first).not.toEqual(second);
      }
      expect(built.index.sprites[`portrait.${characterId}`]).toMatchObject({
        width: 24,
        height: 29,
        visibility: 'public',
      });
    }
    expect(frontMasks.size).toBe(PROTOTYPE_CHARACTERS.length);
  });

  test('ships complete soft and built masks plus a separate Sunward roof family', () => {
    const { png, index } = buildAtlas();
    const atlas = decodePng(png);
    for (let mask = 1; mask <= 15; mask += 1) {
      const soft = cellPixels(atlas, index.sprites[`tile.transition-soft-${mask.toString(16)}`]!);
      const built = cellPixels(atlas, index.sprites[`tile.transition-built-${mask.toString(16)}`]!);
      expect(alphaCount(soft)).toBeGreaterThan(0);
      expect(alphaCount(built)).toBeGreaterThan(alphaCount(soft));
    }
    for (const kind of ['base', 'edge', 'corner']) {
      expect(index.sprites[`tile.roof-sunward-${kind}`]).toMatchObject({
        width: 32,
        height: 32,
        category: 'roof',
        visibility: 'public',
      });
      expect(index.groundCells).not.toContain(`tile.roof-sunward-${kind}`);
    }
  });

  test('keeps prototype multi-tile forms continuous and below atlas memory limits', () => {
    const { png, index } = buildAtlas();
    const atlas = decodePng(png);
    const compositions = new Map(loadMultiTileCompositions().map((group) => [group.id, group]));
    for (const groupId of ['sunward-sofa', 'sunward-table', 'sunward-fountain']) {
      const group = compositions.get(groupId)!;
      expect(group).toBeDefined();
      const partPixels = group.partIds.map((partId) => cellPixels(atlas, index.sprites[`tile.${partId}`]!));
      let opaquePairs = 0;
      for (let row = 0; row < group.rows; row += 1) {
        for (let column = 1; column < group.columns; column += 1) {
          const left = partPixels[row * group.columns + column - 1]!;
          const right = partPixels[row * group.columns + column]!;
          for (let y = 0; y < 32; y += 1) {
            const leftOffset = (y * 32 + 31) * 4;
            const rightOffset = y * 32 * 4;
            if (left[leftOffset + 3] && right[rightOffset + 3]) {
              opaquePairs += 1;
              expect([...left.subarray(leftOffset, leftOffset + 4)])
                .toEqual([...right.subarray(rightOffset, rightOffset + 4)]);
            }
          }
        }
      }
      for (let row = 1; row < group.rows; row += 1) {
        for (let column = 0; column < group.columns; column += 1) {
          const top = partPixels[(row - 1) * group.columns + column]!;
          const bottom = partPixels[row * group.columns + column]!;
          for (let x = 0; x < 32; x += 1) {
            const topOffset = ((31 * 32) + x) * 4;
            const bottomOffset = x * 4;
            if (top[topOffset + 3] && bottom[bottomOffset + 3]) {
              opaquePairs += 1;
              expect([...top.subarray(topOffset, topOffset + 4)])
                .toEqual([...bottom.subarray(bottomOffset, bottomOffset + 4)]);
            }
          }
        }
      }
      expect(opaquePairs).toBeGreaterThanOrEqual(8);
      expect(index.multiTileCompositions[groupId]).toEqual(group.partIds);
    }
    expect(atlas.width).toBeLessThanOrEqual(1024);
    expect(atlas.height).toBeLessThanOrEqual(1024);
    expect(atlas.width * atlas.height * 4).toBeLessThanOrEqual(4 * 1024 * 1024);
  });

  test('provides visibly distinct closed-unlocked and closed-locked door fixtures', () => {
    const { png, index } = buildAtlas();
    const atlas = decodePng(png);
    const unlocked = cellPixels(atlas, index.sprites['tile.closed-door']!);
    const locked = cellPixels(atlas, index.sprites['tile.closed-locked-door']!);
    expect(index.sprites['tile.closed-locked-door']).toMatchObject({
      width: 32,
      height: 32,
      category: 'wall-door',
      visibility: 'public',
    });
    expect(locked.equals(unlocked)).toBe(false);
  });

  test('tracks the full prototype family ledger and native review rules', () => {
    const bible = readFileSync(resolve('docs/art/halcyra-art-bible.md'), 'utf8');
    for (const required of [
      '## 16. Phase 28 prototype family ledger',
      '### 16.1 Characters',
      '### 16.2 Materials',
      '### 16.3 Building and roof',
      '### 16.4 Props, vegetation, and landmark',
      'Good sample rules',
      'Rejected sample rules',
    ]) expect(bible).toContain(required);
    for (const family of [
      'Protagonist', 'Linda', 'Generic resident', 'Warm sand', 'Dune grass',
      'Villa floor', 'Spa stone', 'Shallow water', 'Villa wall', 'Villa door',
      'Sunward roof', 'Sofa', 'Table', 'Planter', 'Palm', 'Lamp', 'Fountain landmark',
    ]) expect(bible).toContain(family);
  });
});
