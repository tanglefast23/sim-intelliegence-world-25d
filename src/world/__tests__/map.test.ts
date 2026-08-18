import northeastMapJson from '../../../content/maps/northeast.json';
import northwestMapJson from '../../../content/maps/northwest.json';
import southeastMapJson from '../../../content/maps/southeast.json';
import southwestMapJson from '../../../content/maps/southwest.json';
import westMapJson from '../../../content/maps/west.json';
import productionLocations from '../../../content/world/locations/production.json';
import prototypeLocations from '../../../content/world/locations/prototype.json';
import { WORLD_MAP_CATALOG } from '../../application/runtime/map-catalog';
import { ATLAS_INDEX } from '../../render/atlas';
import { roofGroupAtV2 } from '../maps/compiled-v2';
import { buildWorldMapV2Catalog } from '../maps/catalog';
import { compileWorldMapV2 } from '../maps/compiler';
import { pointsInRect, tileKey, type WorldMapV2 } from '../maps/schema';
import { findPath } from '../pathfinding/astar';
import { NEIGHBORHOOD_ROUTES } from '../transfers/routes';

const KNOWN_SPRITES = new Set(ATLAS_INDEX.tiles);
const LOCATION_NEIGHBORHOODS = new Map(
  [...prototypeLocations, ...productionLocations].map(({ id, neighborhoodId }) => [id, neighborhoodId]),
);

function compile(candidate: unknown) {
  return compileWorldMapV2(candidate, {
    knownLocationIds: new Set(LOCATION_NEIGHBORHOODS.keys()),
    knownSprites: KNOWN_SPRITES,
    validateDensity: true,
  });
}

describe('northwest world map v2', () => {
  test('compiles one visible collision authority with final density profiles', () => {
    const map = WORLD_MAP_CATALOG.northwest_residential;
    expect(map.source).toEqual(expect.objectContaining({
      schemaVersion: 2,
      layoutRevision: 3,
      id: 'northwest_residential',
      width: 64,
      height: 48,
      tileSize: 32,
    }));
    expect(map.groundSprites).toHaveLength(64 * 48);
    expect(map.source.areas.map(({ id }) => id)).toEqual([
      'bedroom', 'bathroom', 'storage', 'kitchen', 'social', 'shoreglass-spa',
      'sunward-patio', 'villa-promenade', 'beach-market', 'public-beach',
    ]);
    expect(map.densityByAreaId.size).toBe(10);
    expect(new Set(map.staticSolidOwnerByTile.keys())).toEqual(map.blockedKeys);
    expect(map.source.ground.regions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'sunward-shallows', sprite: 'tile.shallow-water' }),
      expect.objectContaining({ id: 'villa-patio-route', sprite: 'tile.plaza-paver' }),
      expect.objectContaining({ id: 'market-beach-route', sprite: 'tile.boardwalk' }),
    ]));
    expect(map.source.terrainSolids).toContainEqual(expect.objectContaining({
      id: 'sunward-shallows', kind: 'water', bounds: { x: 35, y: 42, width: 24, height: 6 },
    }));
  });

  test('all areas, portals, and the exterior are cardinally reachable', () => {
    const map = WORLD_MAP_CATALOG.northwest_residential;
    const start = map.source.spawns.protagonist!;
    for (const area of map.source.areas) {
      const target = pointsInRect(area.bounds).find((tile) => !map.blockedKeys.has(tileKey(tile)));
      expect(target).toBeDefined();
      expect(findPath({
        width: map.source.width,
        height: map.source.height,
        start,
        target: target!,
        blockedKeys: map.blockedKeys,
      }).status).toBe('found');
    }
    for (const portal of map.source.portals) {
      expect(findPath({
        width: map.source.width,
        height: map.source.height,
        start,
        target: portal.tile,
        blockedKeys: map.blockedKeys,
      }).status).toBe('found');
    }
  });

  test('uses the compiled roof mask through its door and restores it outside', () => {
    const map = WORLD_MAP_CATALOG.northwest_residential;
    expect(roofGroupAtV2(map, { x: 18, y: 18 })).toBe('protagonist-villa-roof');
    expect(roofGroupAtV2(map, { x: 17, y: 24 })).toBe('protagonist-villa-roof');
    expect(roofGroupAtV2(map, { x: 17, y: 25 })).toBeUndefined();
  });

  test('rejects blocked portals and unknown transparent-part sprites', () => {
    const blockedPortal = structuredClone(northwestMapJson) as WorldMapV2;
    blockedPortal.terrainSolids.push({ id: 'bad-portal', kind: 'other', bounds: { x: 63, y: 24, width: 1, height: 1 } });
    expect(() => compile(blockedPortal)).toThrow('Portal to-downtown is blocked');

    const unknownSprite = structuredClone(northwestMapJson) as WorldMapV2;
    unknownSprite.objects[0]!.renderParts[0]!.sprite = 'tile.not-real';
    expect(() => compile(unknownSprite)).toThrow('unknown atlas sprite');
  });
});

describe('northeast downtown city layout', () => {
  test('binds the reviewed road, sidewalk, door, car, and street-light contract', () => {
    const map = WORLD_MAP_CATALOG.northeast_downtown;
    const regions = new Map(map.source.ground.regions.map((region) => [region.id, region]));
    expect(map.source.layoutRevision).toBe(2);
    expect(map.source.ground.defaultSprite).toBe('tile.city-lot');
    expect(regions.get('main-boulevard')).toMatchObject({ x: 0, y: 24, width: 64, height: 5, sprite: 'tile.dark-asphalt' });
    expect(regions.get('club-sidewalk')).toMatchObject({ x: 5, y: 5, width: 27, height: 19, sprite: 'tile.neon-paver' });
    expect(regions.get('arcade-sidewalk')).toMatchObject({ x: 37, y: 5, width: 27, height: 19, sprite: 'tile.neon-paver' });
    expect(regions.get('studio-sidewalk')).toMatchObject({ x: 3, y: 29, width: 28, height: 15, sprite: 'tile.neon-paver' });
    expect(regions.get('market-sidewalk')).toMatchObject({ x: 37, y: 29, width: 27, height: 15, sprite: 'tile.neon-paver' });

    expect(map.source.ground.regions.some(({ sprite }) => /^tile\.road-(?:crosswalk|center)-/u.test(sprite))).toBe(false);

    expect([...map.doorById.values()].map(({ id, sprite }) => ({ id, sprite })).sort((left, right) => left.id.localeCompare(right.id, 'en'))).toEqual([
      { id: 'arcade-door', sprite: 'tile.open-door-horizontal' },
      { id: 'club-door', sprite: 'tile.open-door-horizontal' },
      { id: 'club-service-door', sprite: 'tile.closed-door-vertical' },
      { id: 'market-door', sprite: 'tile.open-door-horizontal' },
      { id: 'studio-door', sprite: 'tile.open-door-horizontal' },
    ]);

    const cars = map.source.objects.filter(({ kind }) => kind === 'parked-car');
    expect(cars).toHaveLength(6);
    expect(cars.every(({ solidFootprints, renderParts }) => solidFootprints.length === 2 && renderParts.length === 2)).toBe(true);
    expect(cars.flatMap(({ renderParts }) => renderParts).every(({ sprite }) => /^tile\.parked-car-(?:cyan|coral)-(?:left|right)$/u.test(sprite))).toBe(true);

    const frontageParts = map.source.objects
      .filter(({ kind }) => kind === 'entrance-signage')
      .flatMap(({ renderParts }) => renderParts);
    expect(frontageParts.filter(({ sprite }) => sprite === 'tile.fixture-neon-lamp-cyan')).toHaveLength(7);
    expect(frontageParts.filter(({ sprite }) => sprite === 'tile.fixture-neon-lamp-magenta')).toHaveLength(7);
    expect(map.source.objects.find(({ id }) => id === 'club-strip-fixtures')).toBeUndefined();
    expect(map.source.objects.find(({ id }) => id === 'arcade-row-fixtures')).toBeUndefined();
    expect(map.source.objects.find(({ id }) => id === 'studio-row-fixtures')).toBeUndefined();
    expect(map.source.objects.find(({ id }) => id === 'night-market-fixtures')).toBeUndefined();
    expect(map.presentation.decals).toHaveLength(0);
    expect(map.presentation.decals.every(({ solid }) => !solid)).toBe(true);

    const clearSpines = [
      { x: 5, y: 21, width: 27, height: 3 },
      { x: 37, y: 21, width: 27, height: 3 },
      { x: 3, y: 42, width: 28, height: 2 },
      { x: 37, y: 42, width: 27, height: 2 },
    ];
    expect(clearSpines.flatMap(pointsInRect).every((tile) => !map.blockedKeys.has(tileKey(tile)))).toBe(true);
    expect(findPath({
      width: map.source.width,
      height: map.source.height,
      start: map.source.portals[0]!.tile,
      target: map.source.portals[1]!.tile,
      blockedKeys: map.blockedKeys,
    }).status).toBe('found');
  });
});

describe('southwest sunset-market layout', () => {
  test('binds the audited promenades, mosaic, market life, collision, and door contract', () => {
    const map = WORLD_MAP_CATALOG.southwest_commercial;
    const regions = new Map(map.source.ground.regions.map((region) => [region.id, region]));
    expect(map.source.displayName).toBe('Saffron Bazaar');
    expect(map.source.layoutRevision).toBe(2);
    expect(map.source.ground.defaultSprite).toBe('tile.sunset-cobble');
    expect(regions.get('east-west-promenade')).toMatchObject({ x: 0, y: 23, width: 64, height: 5, sprite: 'tile.sunset-promenade' });
    expect(regions.get('north-south-promenade')).toMatchObject({ x: 30, y: 0, width: 5, height: 48, sprite: 'tile.sunset-promenade' });
    expect(regions.get('central-market-mosaic')).toMatchObject({ x: 28, y: 21, width: 9, height: 9, sprite: 'tile.sunset-mosaic' });
    expect(regions.get('market-hall-floor')).toMatchObject({ x: 6, y: 7, width: 22, height: 14, sprite: 'tile.sunset-floor' });
    expect(regions.get('food-arcade-floor')).toMatchObject({ x: 39, y: 7, width: 21, height: 14, sprite: 'tile.sunset-floor' });
    expect(regions.get('restaurant-row-floor')).toMatchObject({ x: 39, y: 32, width: 21, height: 12, sprite: 'tile.sunset-floor' });
    expect(map.presentation.transitions.length).toBeGreaterThan(0);
    expect(map.presentation.transitions.every(({ sprite }) => sprite === null)).toBe(true);

    expect([...map.doorById.values()].map(({ id, sprite }) => ({ id, sprite })).sort((left, right) => left.id.localeCompare(right.id, 'en'))).toEqual([
      { id: 'food-arcade-door', sprite: 'tile.open-door-horizontal' },
      { id: 'market-hall-door', sprite: 'tile.open-door-horizontal' },
      { id: 'restaurant-row-door', sprite: 'tile.open-door-horizontal' },
    ]);
    expect(map.source.objects.filter(({ kind }) => kind === 'market-canopy').flatMap(({ solidFootprints }) => solidFootprints)).toHaveLength(4);
    expect(map.source.objects.filter(({ kind }) => kind === 'market-stall').flatMap(({ solidFootprints }) => solidFootprints)).toHaveLength(8);
    expect(map.source.objects.filter(({ kind }) => kind === 'market-fountain').flatMap(({ solidFootprints }) => solidFootprints)).toHaveLength(4);
    expect(map.source.objects
      .filter(({ kind, areaId }) => kind === 'flowering-planter' && areaId === 'sunset-courtyard')
      .flatMap(({ solidFootprints }) => solidFootprints)).toHaveLength(4);
    expect(map.source.objects
      .filter(({ kind, areaId }) => kind === 'market-bench' && areaId === 'sunset-courtyard')
      .flatMap(({ solidFootprints }) => solidFootprints)).toHaveLength(4);
    expect(map.source.objects.find(({ id }) => id === 'courtyard-authored-details')).toBeUndefined();
    expect(map.source.objects.find(({ id }) => id === 'courtyard-edge-fixtures')?.renderParts).toHaveLength(12);
    expect(map.source.objects.find(({ id }) => id === 'courtyard-dining-tables')?.solidFootprints).toHaveLength(4);
    expect(map.source.startComposition?.cameraAnchor).toEqual({ x: 17, y: 37 });
    expect(map.source.effects.some(({ kind }) => kind === 'water')).toBe(false);
    expect(map.presentation.decals).toHaveLength(0);
    expect(map.presentation.decals.every(({ solid }) => !solid)).toBe(true);

    const protectedRoutes = [
      { x: 30, y: 0, width: 5, height: 7 },
      { x: 57, y: 23, width: 7, height: 5 },
      { x: 16, y: 21, width: 3, height: 9 },
      { x: 48, y: 21, width: 3, height: 9 },
      { x: 48, y: 44, width: 3, height: 4 },
      { x: 27, y: 29, width: 3, height: 19 },
      { x: 4, y: 29, width: 26, height: 3 },
      { x: 60, y: 23, width: 4, height: 25 },
      { x: 48, y: 46, width: 16, height: 2 },
      { x: 28, y: 21, width: 9, height: 9 },
    ];
    expect(protectedRoutes.flatMap(pointsInRect).every((tile) => !map.blockedKeys.has(tileKey(tile)))).toBe(true);
    expect([map.source.spawns.sora_tan, map.source.spawns.rafael_cruz, map.source.spawns.linda,
      map.source.spawns['linda-shop'], map.source.spawns.generic_resident]
      .every((tile) => tile && !map.blockedKeys.has(tileKey(tile)))).toBe(true);
    expect(findPath({
      width: map.source.width,
      height: map.source.height,
      start: map.source.portals[0]!.tile,
      target: map.source.portals[1]!.tile,
      blockedKeys: map.blockedKeys,
    }).status).toBe('found');
  });
});

describe('southeast docks working-harbor layout', () => {
  test('binds the audited water, pier, route, collision, door, and harbor-life contract', () => {
    const map = WORLD_MAP_CATALOG.southeast_docks;
    const regions = new Map(map.source.ground.regions.map((region) => [region.id, region]));
    expect(map.source.ground.defaultSprite).toBe('tile.harbor-yard');
    expect(regions.get('main-service-road')).toMatchObject({ x: 0, y: 23, width: 52, height: 5, sprite: 'tile.dock-route' });
    expect(regions.get('north-south-service-road')).toMatchObject({ x: 30, y: 0, width: 5, height: 48, sprite: 'tile.dock-route' });
    expect(regions.get('harbor-water')).toMatchObject({ x: 52, y: 0, width: 12, height: 48, sprite: 'tile.harbor-water' });
    expect(regions.get('north-pier')).toMatchObject({ x: 50, y: 9, width: 12, height: 3, sprite: 'tile.dock-boardwalk' });
    expect(regions.get('ferry-pier')).toMatchObject({ x: 50, y: 33, width: 12, height: 3, sprite: 'tile.dock-boardwalk' });
    expect(map.source.ground.regions.some(({ sprite }) => /^tile\.dock-(?:crosswalk|center)-/u.test(sprite))).toBe(false);
    expect(map.presentation.transitions.length).toBeGreaterThan(0);
    expect(map.presentation.transitions.every(({ sprite }) => sprite === null)).toBe(true);

    expect(map.source.terrainSolids).toHaveLength(5);
    expect(map.source.terrainSolids.map(({ bounds }) => bounds)).toEqual([
      { x: 52, y: 0, width: 12, height: 9 },
      { x: 62, y: 9, width: 2, height: 3 },
      { x: 52, y: 12, width: 12, height: 21 },
      { x: 62, y: 33, width: 2, height: 3 },
      { x: 52, y: 36, width: 12, height: 12 },
    ]);
    for (const y of [10, 34]) {
      expect(Array.from({ length: 12 }, (_unused, offset) => ({ x: 50 + offset, y }))
        .every((tile) => !map.blockedKeys.has(tileKey(tile)))).toBe(true);
    }

    expect([...map.doorById.values()].map(({ id, sprite }) => ({ id, sprite })).sort((left, right) => left.id.localeCompare(right.id, 'en'))).toEqual([
      { id: 'ferry-boarding-door', sprite: 'tile.open-door-vertical' },
      { id: 'ferry-door', sprite: 'tile.open-door-horizontal' },
      { id: 'government-door', sprite: 'tile.open-door-horizontal' },
      { id: 'warehouse-door', sprite: 'tile.open-door-horizontal' },
    ]);
    expect(map.source.objects.filter(({ kind }) => kind === 'cargo-stack')).toHaveLength(6);
    expect(map.source.objects.filter(({ kind }) => kind === 'cargo-crane')).toHaveLength(1);
    expect(map.source.objects.filter(({ kind }) => kind === 'mooring-bollard')).toHaveLength(8);
    expect(map.source.objects.filter(({ kind }) => kind === 'warning-lamps').flatMap(({ solidFootprints }) => solidFootprints)).toHaveLength(2);
    expect(map.presentation.decals.every(({ solid }) => !solid)).toBe(true);

    expect(map.source.locationBindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ locationId: 'priya_clinic', areaIds: ['government-yard'] }),
      expect.objectContaining({ locationId: 'tomas_marina', areaIds: ['ferry-terminal'] }),
      expect.objectContaining({ locationId: 'ferry_terminal', areaIds: ['ferry-terminal'] }),
    ]));
    expect(map.blockedKeys.has(tileKey(map.source.spawns.priya_nair!))).toBe(false);
    expect(map.blockedKeys.has(tileKey(map.source.spawns.tomas_reed!))).toBe(false);

    const protectedRoutes = [
      { x: 30, y: 0, width: 5, height: 6 },
      { x: 0, y: 20, width: 7, height: 9 },
      { x: 16, y: 20, width: 3, height: 11 },
      { x: 43, y: 20, width: 3, height: 9 },
      { x: 44, y: 39, width: 1, height: 3 },
      { x: 30, y: 40, width: 13, height: 3 },
      { x: 28, y: 28, width: 2, height: 16 },
    ];
    expect(protectedRoutes.flatMap(pointsInRect).every((tile) => !map.blockedKeys.has(tileKey(tile)))).toBe(true);
    expect(findPath({
      width: map.source.width,
      height: map.source.height,
      start: map.source.portals[0]!.tile,
      target: map.source.portals[1]!.tile,
      blockedKeys: map.blockedKeys,
    }).status).toBe('found');
  });
});

describe('four-neighborhood v2 catalog', () => {
  test('compiles the reciprocal square, bindings, and eight generated routes', () => {
    expect(Object.keys(WORLD_MAP_CATALOG)).toEqual([
      'northwest_residential', 'northeast_downtown', 'southwest_commercial', 'southeast_docks',
      'west_office',
    ]);
    expect(Object.values(WORLD_MAP_CATALOG).map(({ source }) => source.portals.length)).toEqual([3, 2, 2, 2, 1]);
    expect(NEIGHBORHOOD_ROUTES).toHaveLength(10);
    expect([...WORLD_MAP_CATALOG.southeast_docks.objectPartById.values()])
      .toContainEqual(expect.objectContaining({ objectId: 'ferry-landmark' }));
  });

  test('rejects portal drift from generated route identities', () => {
    const drifted = structuredClone(northeastMapJson) as WorldMapV2;
    drifted.portals[0]!.tile.y = 23;
    expect(() => buildWorldMapV2Catalog({
      northwest_residential: northwestMapJson,
      northeast_downtown: drifted,
      southwest_commercial: southwestMapJson,
      southeast_docks: southeastMapJson,
      west_office: westMapJson,
    }, {
      locationNeighborhoodById: LOCATION_NEIGHBORHOODS,
      knownSprites: KNOWN_SPRITES,
      validateDensity: true,
    })).toThrow();
  });
});

/**
 * The office cubicle farm is derived from a grid in `build-map-v2.ts`, so it is checked against the
 * same grid here rather than against a hand-copied list of ninety-six part ids. A shared wall is
 * the thing that breaks: column n's east partition IS column n+1's west partition, and placing it
 * twice puts two boxes in one cell, which reads as one column of thicker wall and nothing else.
 */
describe('Ledger Annex cubicle farm', () => {
  const map = WORLD_MAP_CATALOG.west_office;
  const COLUMN_WEST = [8, 13, 18, 23];
  const ROW_NORTH = [8, 13, 18];

  test('places every shared partition exactly once', () => {
    const expected = new Set<string>();
    for (const north of ROW_NORTH) {
      for (const west of COLUMN_WEST) {
        for (let offset = 1; offset <= 4; offset += 1) expected.add(`${west + offset},${north}`);
        for (let offset = 1; offset <= 3; offset += 1) {
          expected.add(`${west},${north + offset}`);
          expected.add(`${west + 5},${north + offset}`);
        }
      }
    }
    const placed = [...map.objectPartById.values()]
      .filter(({ sprite }) => sprite.startsWith('tile.cubicle-partition'))
      .map(({ tile }) => `${tile.x},${tile.y}`);
    expect(new Set(placed)).toEqual(expected);
    // The set comparison alone would pass if a cell were placed twice, so count as well.
    expect(placed).toHaveLength(expected.size);
  });

  test('keeps every clerk stand tile walkable and reachable from the portal', () => {
    for (const north of ROW_NORTH) {
      for (const west of COLUMN_WEST) {
        const stand = { x: west + 2, y: north + 2 };
        expect(map.blockedKeys.has(tileKey(stand))).toBe(false);
        const route = findPath({
          width: map.source.width,
          height: map.source.height,
          start: { x: 62, y: 24 },
          target: stand,
          blockedKeys: map.blockedKeys,
        });
        expect(route.status).toBe('found');
      }
    }
  });

  test('gives every interior area furniture that clears its own density gate', () => {
    for (const areaId of ['cubicle-floor', 'annex-hall', 'manager-office', 'cooler-nook', 'annex-kitchen', 'annex-lobby']) {
      const metrics = map.densityByAreaId.get(areaId);
      expect(metrics?.profile).toBe('furnished-interior');
      expect(metrics!.objectSolidRatio).toBeGreaterThanOrEqual(0.08);
      expect(metrics!.detailRatio).toBeGreaterThanOrEqual(0.12);
    }
  });
});
