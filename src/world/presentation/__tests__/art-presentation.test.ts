import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import northwestMapJson from '../../../../content/maps/northwest.json';
import { compileWorldMapV2 } from '../../maps/compiler';
import { pointsInRect, tileKey, WorldMapV2Schema } from '../../maps/schema';
import { compileArtPresentation } from '../art-presentation';
import { MATERIAL_RECIPE_BY_ID } from '../recipes';
import { visualBoundsIntersectTileWindow } from '../visual-bounds';

const SOURCE = WorldMapV2Schema.parse(northwestMapJson);
const KNOWN_LOCATIONS = new Set([SOURCE.id, ...SOURCE.locationBindings.map(({ locationId }) => locationId)]);

function compile(visualBoundsBySprite?: Readonly<Record<string, Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>>>) {
  return compileWorldMapV2(SOURCE, {
    knownLocationIds: KNOWN_LOCATIONS,
    validateDensity: false,
    visualBoundsBySprite,
  });
}

describe('immutable art presentation index', () => {
  test('is byte deterministic across fresh compiles and does not use save or simulation state', () => {
    const first = compile();
    const second = compile();
    expect(second.presentation).toEqual(first.presentation);
    expect(second.presentation.hash).toBe(first.presentation.hash);
    expect(Object.isFrozen(first.presentation)).toBe(true);
    expect(Object.isFrozen(first.presentation.ground)).toBe(true);
    expect(first.presentation.ground).toHaveLength(64 * 48);
    expect(first.presentation.mapId).toBe('northwest_residential');
    const source = readFileSync(resolve('src/world/presentation/art-presentation.ts'), 'utf8');
    expect(source).not.toMatch(/Math\.random|Date\.now|WorldState|reduceCommand|simulation/u);
  });

  test('keeps internal logical variants out of maps, saves, events, and public sprite validation', () => {
    const compiled = compile();
    expect(compiled.presentation.ground.some(({ logicalVariantId }) => logicalVariantId.endsWith('-a'))).toBe(true);
    expect(JSON.stringify(compiled.source)).not.toContain('logicalVariantId');
    expect(JSON.stringify(compiled.source)).not.toContain('boardwalk-a');
    for (const path of [
      'content/maps/northwest.json',
      'content/maps/northeast.json',
      'content/maps/southwest.json',
      'content/maps/southeast.json',
      'src/domain/state/schema.ts',
    ]) {
      expect(readFileSync(resolve(path), 'utf8')).not.toMatch(/logicalVariantId|\.variant\./u);
    }
  });

  test('keeps small decals passable and gives large vegetation matching collision owners', () => {
    const compiled = compile();
    expect(compiled.presentation.decals.every(({ interactive }) => !interactive)).toBe(true);
    expect(compiled.presentation.decals.some(({ solid }) => solid)).toBe(true);
    expect(compiled.presentation.decals.every(({ id, tile, solid }) => (
      solid
        ? compiled.staticSolidOwnerByTile.get(tileKey(tile))?.id === id
        : !compiled.staticSolidOwnerByTile.has(tileKey(tile))
    ))).toBe(true);
    expect(compiled.presentation.decals.filter(({ solid }) => solid).every(({ sprite }) => [
      'tile.decal-sand-shells', 'tile.decal-sapling', 'tile.decal-young-palm',
      'tile.decal-canopy-tree', 'tile.decal-neon-planter',
      // Solid since 2026-08-20: it renders as a box the size of the saplings beside it, and Joe
      // walked straight through one.
      'tile.decal-flowering-shrub',
    ].includes(sprite))).toBe(true);
    expect(compiled.presentation.transitions.every(({ solid, interactive }) => !solid && !interactive)).toBe(true);
    expect(compiled.presentation.transitions.every(({ ownerMaterialId, sprite }) => (
      sprite === null
        ? MATERIAL_RECIPE_BY_ID[ownerMaterialId]?.edgeMode === 'hard'
        : /^tile\.transition-(?:soft|built)-[1-9a-f]$/u.test(sprite)
    ))).toBe(true);
  });

  test('leaves declared hard material edges unblended', () => {
    const groundSprites = Array.from({ length: SOURCE.width * SOURCE.height }, () => 'tile.warm-sand');
    groundSprites[0] = 'tile.dark-asphalt';
    const presentation = compileArtPresentation({ map: SOURCE, groundSprites });
    const hardTransitions = presentation.transitions.filter(({ ownerMaterialId }) => ownerMaterialId === 'dark-asphalt');
    expect(hardTransitions.length).toBeGreaterThan(0);
    expect(hardTransitions.every(({ sprite }) => sprite === null)).toBe(true);
  });

  test('does not place presentation decals inside roofed rooms', () => {
    const groundSprites = Array.from({ length: SOURCE.width * SOURCE.height }, () => 'tile.warm-sand');
    const presentation = compileArtPresentation({ map: SOURCE, groundSprites });
    const roofTiles = new Set(SOURCE.roofGroups.flatMap(({ cells }) => cells.flatMap(pointsInRect)).map(tileKey));
    expect(presentation.decals.some(({ tile }) => roofTiles.has(tileKey(tile)))).toBe(false);
  });

  test('derives authored roof cells without changing roof masks or ownership', () => {
    const compiled = compile();
    for (const roof of SOURCE.roofGroups) {
      const expected = new Set(roof.cells.flatMap(pointsInRect).map(tileKey));
      const presented = new Set(compiled.presentation.roofs
        .filter(({ roofGroupId }) => roofGroupId === roof.id)
        .map(({ tile }) => tileKey(tile)));
      expect(presented).toEqual(expected);
      expect(compiled.roofGroupById.get(roof.id)?.cellKeys).toEqual(expected);
    }
    expect(new Set(compiled.presentation.roofs.map(({ sprite }) => sprite))).toEqual(new Set([
      'tile.roof-sunward-base', 'tile.roof-sunward-edge', 'tile.roof-sunward-corner',
    ]));
  });

  test('uses visual bounds for culling without changing any solid, route, or density authority', () => {
    const ordinary = compile();
    const overhang = compile({ 'tile.boardwalk': { left: -64, top: -64, right: 96, bottom: 96 } });
    expect(overhang.blockedKeys).toEqual(ordinary.blockedKeys);
    expect(overhang.staticSolidOwnerByTile).toEqual(ordinary.staticSolidOwnerByTile);
    expect(overhang.interactionById).toEqual(ordinary.interactionById);
    expect(overhang.densityByAreaId).toEqual(ordinary.densityByAreaId);
    expect(visualBoundsIntersectTileWindow(
      { x: 12, y: 12 },
      { left: -64, top: -64, right: 96, bottom: 96 },
      { minimumX: 10, minimumY: 10, maximumX: 10, maximumY: 10 },
    )).toBe(true);
    expect(visualBoundsIntersectTileWindow(
      { x: 12, y: 12 },
      { left: 0, top: 0, right: 32, bottom: 32 },
      { minimumX: 10, minimumY: 10, maximumX: 10, maximumY: 10 },
    )).toBe(false);
  });
});
