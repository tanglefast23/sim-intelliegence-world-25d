import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import revision16PixelHashes from '../../../assets/source/art/revision-16-pixel-hashes.json';
import northeastMap from '../../../content/maps/northeast.json';
import southeastMap from '../../../content/maps/southeast.json';
import southwestMap from '../../../content/maps/southwest.json';
import { WORLD_MAP_CATALOG } from '../../../src/application/runtime/map-catalog';
import { ART_PRESENTATION_REVISION, MATERIAL_RECIPE_BY_ID } from '../../../src/world/presentation/recipes';
import { buildAtlas } from '../build-world-atlas';
import { buildContentAuthorityReport } from '../content-authority';
import { decodePng } from '../png';

const MAP_OVERRIDE_PREFIXES = {
  northeast_downtown: ['tile.dark-asphalt', 'tile.neon-paver', 'tile.neon-floor'],
  southwest_commercial: ['tile.sunset-cobble', 'tile.sunset-promenade', 'tile.sunset-mosaic'],
  southeast_docks: ['tile.harbor-yard', 'tile.harbor-water', 'tile.dock-boardwalk'],
} as const;

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

function cellHash(pixels: Buffer): string {
  return createHash('sha256').update(pixels).digest('hex');
}

function alphaCount(pixels: Buffer): number {
  return [...pixels].filter((_value, offset) => offset % 4 === 3 && pixels[offset] !== 0).length;
}

describe('current shared and district art', () => {
  const built = buildAtlas();
  const bitmap = decodePng(built.png);
  const revision15Cells = revision16PixelHashes.cells as Readonly<Record<string, string>>;

  test('uses revision 16 map-specific material cells', () => {
    expect(ART_PRESENTATION_REVISION).toBe(16);
    expect(MATERIAL_RECIPE_BY_ID['dark-asphalt']?.publicVariantSprites).toEqual([
      'tile.dark-asphalt', 'tile.dark-asphalt-b', 'tile.dark-asphalt-c',
    ]);
    for (const [mapId, prefixes] of Object.entries(MAP_OVERRIDE_PREFIXES)) {
      const map = WORLD_MAP_CATALOG[mapId as keyof typeof WORLD_MAP_CATALOG];
      for (const prefix of prefixes) {
        const cells = map.presentation.ground.filter(({ sprite }) => sprite.startsWith(prefix));
        expect(cells.length).toBeGreaterThan(0);
      }
    }
  });

  test('matches the current revisioned wall cells', () => {
    for (const family of ['downtown', 'commercial', 'civic'] as const) {
      for (const id of built.index.walls[family] ?? []) {
        const rectangle = built.index.sprites[id];
        expect(rectangle).toBeDefined();
        expect(cellHash(rectanglePixels(bitmap, rectangle!))).toBe(revision15Cells[id]);
      }
    }
  });

  test('gives all Tier B wall masks visible, unique, structural identities', () => {
    for (const family of ['downtown', 'commercial', 'civic'] as const) {
      const hashes = (built.index.walls[family] ?? []).map((id) => {
        const pixels = rectanglePixels(bitmap, built.index.sprites[id]!);
        expect(alphaCount(pixels)).toBeGreaterThanOrEqual(500);
        return cellHash(pixels);
      });
      expect(hashes).toHaveLength(16);
      expect(new Set(hashes).size).toBe(16);
    }
    for (let mask = 0; mask < 16; mask += 1) {
      const hashes = ['downtown', 'commercial', 'civic'].map((family) => cellHash(rectanglePixels(
        bitmap,
        built.index.sprites[`tile.wall-${family}-${mask.toString(16)}`]!,
      )));
      expect(new Set(hashes).size).toBe(3);
    }
  });

  test('keeps every Tier B solid footprint visibly represented at the same offset', () => {
    for (const map of [northeastMap, southwestMap, southeastMap]) {
      for (const object of map.objects) {
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
    }
  });

  test('keeps current district content authority revisioned and complete', () => {
    const report = buildContentAuthorityReport();
    expect(report.maps.map(({ mapId }) => mapId)).toEqual([
      'northeast_downtown', 'southwest_commercial', 'southeast_docks',
    ]);
    for (const entry of report.maps) {
      expect(entry.layoutRevision).toBe(2);
      for (const hash of [entry.authoritativeHash, entry.mapSourceSha256, entry.placementHash]) {
        expect(hash).toMatch(/^[0-9a-f]{64}$/u);
      }
    }
    for (const map of [northeastMap, southwestMap, southeastMap]) {
      expect(map.layoutRevision).toBe(2);
      expect(map.objects.length).toBeGreaterThan(0);
    }
  });

  test('records the current district rules', () => {
    const bible = readFileSync(resolve(process.cwd(), 'docs/art/halcyra-art-bible.md'), 'utf8');
    expect(bible).toContain('## 10. District identity');
    for (const label of ['Neon Crescent', 'Palm Exchange', 'Harbor Authority']) {
      expect(bible).toContain(label);
    }
  });
});
