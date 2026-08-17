import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import northwestMapJson from '../../../content/maps/northwest.json';
import revision15PixelHashes from '../../../assets/source/art/revision-15-pixel-hashes.json';
import { buildAtlas } from '../build-world-atlas';
import { decodePng } from '../png';
import {
  ART_PRESENTATION_REVISION,
  MATERIAL_RECIPE_BY_ID,
} from '../../../src/world/presentation/recipes';
import { selectMaterialVariants } from '../../../src/world/presentation/material-selection';

const SUNWARD_SPRITES = [
  'tile.warm-sand', 'tile.warm-sand-b', 'tile.warm-sand-c', 'tile.warm-sand-d',
  'tile.villa-floor', 'tile.villa-floor-b', 'tile.plaza-paver', 'tile.boardwalk',
  'tile.open-door', 'tile.opening-door', 'tile.closed-door', 'tile.closed-locked-door',
  'tile.bed-head', 'tile.bed-foot', 'tile.sofa-left', 'tile.sofa-right',
  'tile.table-left', 'tile.table-right', 'tile.counter-left', 'tile.counter-right',
  'tile.sign-spa', 'tile.sign-market', 'tile.fixture-lamp', 'tile.fixture-planter',
  'tile.plant-palm',
  'tile.roof-sunward-base', 'tile.roof-sunward-edge', 'tile.roof-sunward-corner',
  ...Array.from({ length: 16 }, (_unused, mask) => `tile.wall-villa-${mask.toString(16)}`),
  'tile.villa-floor-c', 'tile.villa-floor-d', 'tile.plaza-paver-b',
  'tile.boardwalk-b', 'tile.decal-sand-shells',
] as const;
const MAP_SOURCE_SHA256 = '8a2bd0b59b11f37152ccfa75a6085c1649eba0bf45b2d86ad2461ddd6a0138a5';

function rectanglePixels(
  bitmap: ReturnType<typeof decodePng>,
  rectangle: Readonly<{ x: number; y: number; width: number; height: number }>,
): Buffer {
  const pixels = Buffer.alloc(rectangle.width * rectangle.height * 4);
  for (let row = 0; row < rectangle.height; row += 1) {
    const sourceStart = ((rectangle.y + row) * bitmap.width + rectangle.x) * 4;
    bitmap.data.copy(pixels, row * rectangle.width * 4, sourceStart, sourceStart + rectangle.width * 4);
  }
  return pixels;
}

function cellHash(
  bitmap: ReturnType<typeof decodePng>,
  rectangle: Readonly<{ x: number; y: number; width: number; height: number }>,
): string {
  return createHash('sha256').update(rectanglePixels(bitmap, rectangle)).digest('hex');
}

function alphaCount(pixels: Buffer): number {
  return [...pixels].filter((_value, offset) => offset % 4 === 3 && pixels[offset] !== 0).length;
}

describe('Phase 30 complete Tier A Sunward art', () => {
  const built = buildAtlas();
  const bitmap = decodePng(built.png);
  const revision15Cells = revision15PixelHashes.cells as Readonly<Record<string, string>>;

  test('keeps the revised Sunward geometry generated and versioned', () => {
    const source = readFileSync(resolve(process.cwd(), 'content/maps/northwest.json'));
    expect(createHash('sha256').update(source).digest('hex')).toBe(MAP_SOURCE_SHA256);
    expect(northwestMapJson.layoutRevision).toBe(3);
    expect(northwestMapJson.ground.regions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'sunward-shallows', sprite: 'tile.shallow-water' }),
    ]));
  });

  test('makes all completed Sunward materials and states public and revisioned', () => {
    expect(ART_PRESENTATION_REVISION).toBe(15);
    expect(MATERIAL_RECIPE_BY_ID['warm-sand']?.publicVariantSprites).toEqual([
      'tile.warm-sand', 'tile.warm-sand-b', 'tile.warm-sand-c', 'tile.warm-sand-d',
    ]);
    expect(MATERIAL_RECIPE_BY_ID['villa-floor']?.publicVariantSprites).toEqual([
      'tile.villa-floor', 'tile.villa-floor-b', 'tile.villa-floor-c', 'tile.villa-floor-d',
    ]);
    expect(MATERIAL_RECIPE_BY_ID['plaza-paver']?.publicVariantSprites).toEqual([
      'tile.plaza-paver', 'tile.plaza-paver-b',
    ]);
    expect(MATERIAL_RECIPE_BY_ID.boardwalk?.publicVariantSprites).toEqual([
      'tile.boardwalk', 'tile.boardwalk-b',
    ]);
    for (const id of SUNWARD_SPRITES) {
      expect(built.index.publicSpriteIds).toContain(id);
      const rectangle = built.index.sprites[id];
      expect(rectangle).toBeDefined();
      expect(revision15Cells[id]).toBeDefined();
      expect(cellHash(bitmap, rectangle!)).toBe(revision15Cells[id]);
    }
  });

  test('keeps all current villa wall variants revisioned and visibly massive', () => {
    const villaHashes = (built.index.walls.villa ?? []).map((id) => {
      const rectangle = built.index.sprites[id];
      const pixels = rectanglePixels(bitmap, rectangle!);
      expect(alphaCount(pixels)).toBeGreaterThanOrEqual(600);
      const hash = createHash('sha256').update(pixels).digest('hex');
      expect(hash).toBe(revision15Cells[id]);
      return hash;
    });
    expect(new Set(villaHashes).size).toBe(16);
  });

  test('gives each Sunward solid footprint visible blocking art at the same offset', () => {
    for (const object of northwestMapJson.objects) {
      for (const footprint of object.solidFootprints) {
        for (let y = 0; y < footprint.bounds.height; y += 1) {
          for (let x = 0; x < footprint.bounds.width; x += 1) {
            const offsetX = footprint.bounds.x + x;
            const offsetY = footprint.bounds.y + y;
            const part = object.renderParts.find(({ offset }) => offset.x === offsetX && offset.y === offsetY);
            expect(part).toBeDefined();
            const rectangle = built.index.sprites[part!.sprite];
            expect(rectangle).toBeDefined();
            expect(alphaCount(rectanglePixels(bitmap, rectangle!))).toBeGreaterThanOrEqual(128);
          }
        }
      }
    }
  });

  test('removes long diagonal stamp runs from the native warm-sand board', () => {
    const recipe = MATERIAL_RECIPE_BY_ID['warm-sand']!;
    const width = 12;
    const selections = selectMaterialVariants({
      mapId: 'phase-30-warm-sand',
      width,
      height: 12,
      materialIds: Array.from({ length: 144 }, () => recipe.id),
      artRevision: ART_PRESENTATION_REVISION,
      recipesById: { [recipe.id]: recipe },
    });
    let longestRun = 0;
    for (const deltaX of [-1, 1] as const) {
      for (let startY = 0; startY < 12; startY += 1) {
        for (let startX = 0; startX < width; startX += 1) {
          let x = startX;
          let y = startY;
          let previous = -1;
          let run = 0;
          while (x >= 0 && x < width && y < 12) {
            const variant = selections[y * width + x]!.variantIndex;
            run = variant === previous ? run + 1 : 1;
            longestRun = Math.max(longestRun, run);
            previous = variant;
            x += deltaX;
            y += 1;
          }
        }
      }
    }
    expect(longestRun).toBeLessThanOrEqual(4);
  });

  test('tracks the completed family contract in the art bible', () => {
    const bible = readFileSync(resolve(process.cwd(), 'docs/art/halcyra-art-bible.md'), 'utf8');
    expect(bible).toContain('## 18. Phase 30 complete Sunward family ledger');
    for (const family of ['Warm sand', 'Villa floor', 'Plaza paver', 'Boardwalk', 'Villa walls']) {
      expect(bible).toContain(family);
    }
  });
});
