import { buildWorldMapV2Catalog } from '../maps/catalog';
import { compileWorldMapV2, selectInteractionApproach, selectOwnerInteractionApproach } from '../maps/compiler';
import { resolveClickTarget, worldClickCandidates } from '../maps/hit-testing';
import { findMaximalEmptyRectangles } from '../maps/density';
import { tileKey, type TileOffset, type TilePoint, type WorldMapV2 } from '../maps/schema';
import { selectAutomaticWorldZoom, validateStartComposition } from '../maps/start-composition';
import { deriveNeighborhoodRoutes } from '../transfers/routes';

const MAP_ID = 'northwest_residential';
const KNOWN_LOCATIONS = new Set([MAP_ID, 'test_location']);

function baseMap(): WorldMapV2 {
  return {
    schemaVersion: 2,
    layoutRevision: 1,
    id: MAP_ID,
    displayName: 'Compiler Test Map',
    width: 64,
    height: 48,
    tileSize: 32,
    ground: { defaultSprite: 'tile.warm-sand', regions: [] },
    terrainSolids: [],
    walls: {
      runs: [{
        id: 'test-wall',
        material: 'villa',
        bounds: { x: 10, y: 10, width: 11, height: 1 },
        openings: [{ id: 'test-opening', tile: { x: 15, y: 10 } }],
      }],
    },
    doors: [{
      id: 'test-door',
      openingId: 'test-opening',
      initialState: 'open',
      sprite: 'tile.open-door',
    }],
    objects: [{
      id: 'test-object',
      kind: 'furniture',
      areaId: 'test-area',
      anchor: { x: 12, y: 12 },
      depthAnchorOffset: { x: 0, y: 0 },
      renderParts: [{ id: 'test-part', sprite: 'tile.test-object', offset: { x: 0, y: 0 } }],
      solidFootprints: [{ id: 'test-solid', bounds: { x: 0, y: 0, width: 1, height: 1 } }],
      interactions: [{ id: 'test-use', kind: 'storage', approachOffsets: [{ x: -1, y: 0 }] }],
    }],
    effects: [],
    roofGroups: [],
    areas: [{
      id: 'test-area',
      bounds: { x: 4, y: 4, width: 40, height: 30 },
      densityProfile: 'structural-placeholder',
      intentionalOpenAreas: [],
      entranceTiles: [{ x: 5, y: 5 }],
      primaryRoutes: [],
      requiredPortalIds: [],
    }],
    buildings: [],
    locationBindings: [{
      locationId: 'test_location',
      areaIds: ['test-area'],
      preferredInteractionIds: ['test-use'],
    }],
    portals: [],
    stagingTiles: [{ x: 5, y: 5 }],
    spawns: { protagonist: { x: 11, y: 12 } },
    startComposition: {
      cameraAnchor: { x: 12, y: 12 },
      requiredActorIds: ['protagonist'],
      requiredDetailPartIds: ['test-part'],
      landmarkAreaIds: ['test-area'],
    },
  };
}

function compile(map: WorldMapV2, validateDensity = false) {
  return compileWorldMapV2(map, { knownLocationIds: KNOWN_LOCATIONS, validateDensity });
}

function oneCellRun(id: string, tile: TilePoint): WorldMapV2['walls']['runs'][number] {
  return { id, material: 'villa', bounds: { ...tile, width: 1, height: 1 }, openings: [] };
}

function objectAt(input: Readonly<{
  id: string;
  kind: string;
  anchor: TilePoint;
  partOffsets: readonly TileOffset[];
  solidOffsets: readonly TileOffset[];
}>): WorldMapV2['objects'][number] {
  return {
    id: input.id,
    kind: input.kind,
    areaId: 'density-area',
    anchor: input.anchor,
    depthAnchorOffset: { x: 0, y: 0 },
    renderParts: input.partOffsets.map((offset, index) => ({
      id: `${input.id}-part-${index}`,
      sprite: 'tile.test-object',
      offset,
    })),
    solidFootprints: input.solidOffsets.map((offset, index) => ({
      id: `${input.id}-solid-${index}`,
      bounds: { ...offset, width: 1, height: 1 },
    })),
    interactions: [],
  };
}

function densityMap(
  profile: WorldMapV2['areas'][number]['densityProfile'],
  objects: readonly WorldMapV2['objects'][number][],
): WorldMapV2 {
  const map = baseMap();
  map.walls.runs = [];
  map.doors = [];
  map.objects = [...objects];
  map.areas = [{
    id: 'density-area',
    bounds: { x: 5, y: 5, width: 10, height: 10 },
    densityProfile: profile,
    intentionalOpenAreas: profile === 'furnished-interior' ? [{ x: 5, y: 5, width: 10, height: 10 }] : [],
    entranceTiles: [{ x: 14, y: 14 }],
    primaryRoutes: profile === 'active-public' || profile === 'service-docks'
      ? [{ x: 5, y: 13, width: 10, height: 2 }]
      : [],
    requiredPortalIds: [],
  }];
  map.locationBindings = [{ locationId: 'test_location', areaIds: ['density-area'], preferredInteractionIds: [] }];
  map.stagingTiles = [{ x: 14, y: 14 }];
  map.spawns = { protagonist: { x: 14, y: 14 } };
  map.startComposition = undefined;
  return map;
}

describe('map v2 compiler authority', () => {
  test('derives blocked keys only from visible static owners', () => {
    const map = compile(baseMap());
    expect(map.staticSolidOwnerByTile.get('10,10')).toEqual({ kind: 'wall', id: 'test-wall' });
    expect(map.staticSolidOwnerByTile.get('12,12')).toEqual({ kind: 'object', id: 'test-object' });
    expect(map.staticSolidOwnerByTile.has('15,10')).toBe(false);
    expect(new Set(map.staticSolidOwnerByTile.keys())).toEqual(map.blockedKeys);
    expect(map.partOwnersByTile.get('12,12')).toEqual(['test-object']);
    expect(map.locationBindingById.get('test_location')?.preferredApproachTiles).toEqual([{ x: 11, y: 12 }]);
  });

  test('rejects duplicate owners, outside openings, invisible solids, and blocked approaches', () => {
    const duplicate = baseMap();
    duplicate.terrainSolids = [{ id: 'bad-overlap', kind: 'other', bounds: { x: 10, y: 10, width: 1, height: 1 } }];
    expect(() => compile(duplicate)).toThrow('overlaps');

    const outside = baseMap();
    outside.walls.runs[0]!.openings[0]!.tile = { x: 9, y: 10 };
    expect(() => compile(outside)).toThrow('outside run');

    const invisible = baseMap();
    invisible.objects[0]!.solidFootprints[0]!.bounds = { x: 1, y: 0, width: 1, height: 1 };
    expect(() => compile(invisible)).toThrow('invisible solid cell');

    const blockedApproach = baseMap();
    blockedApproach.terrainSolids = [{ id: 'blocked-approach', kind: 'other', bounds: { x: 11, y: 12, width: 1, height: 1 } }];
    blockedApproach.spawns.protagonist = { x: 5, y: 5 };
    blockedApproach.startComposition = undefined;
    expect(() => compile(blockedApproach)).toThrow('approach is blocked');

    const partlyBlocked = baseMap();
    partlyBlocked.objects[0]!.interactions[0]!.approachOffsets.push({ x: 1, y: 0 });
    partlyBlocked.terrainSolids = [{ id: 'one-blocked-approach', kind: 'other', bounds: { x: 11, y: 12, width: 1, height: 1 } }];
    partlyBlocked.spawns.protagonist = { x: 5, y: 5 };
    partlyBlocked.startComposition = undefined;
    expect(() => compile(partlyBlocked)).toThrow('approach is blocked at 11,12');
  });

  test('rejects doors that touch along a tile edge', () => {
    const map = baseMap();
    map.walls.runs[0]!.openings.push({ id: 'touching-opening', tile: { x: 16, y: 10 } });
    map.doors.push({
      id: 'touching-door',
      openingId: 'touching-opening',
      initialState: 'open',
      sprite: 'tile.open-door',
    });
    expect(() => compile(map)).toThrow('cannot touch along a tile edge');
  });

  test('derives every orthogonal wall mask from neighboring cells', () => {
    const map = baseMap();
    map.walls.runs = [];
    map.doors = [];
    map.spawns.protagonist = { x: 40, y: 40 };
    map.startComposition = undefined;
    map.objects[0]!.interactions = [];
    map.locationBindings[0]!.preferredInteractionIds = [];
    const centers: TilePoint[] = [];
    for (let mask = 0; mask < 16; mask += 1) {
      const center = { x: 3 + (mask % 4) * 8, y: 3 + Math.floor(mask / 4) * 8 };
      centers.push(center);
      map.walls.runs.push(oneCellRun(`mask-${mask}-center`, center));
      if ((mask & 1) !== 0) map.walls.runs.push(oneCellRun(`mask-${mask}-north`, { x: center.x, y: center.y - 1 }));
      if ((mask & 2) !== 0) map.walls.runs.push(oneCellRun(`mask-${mask}-east`, { x: center.x + 1, y: center.y }));
      if ((mask & 4) !== 0) map.walls.runs.push(oneCellRun(`mask-${mask}-south`, { x: center.x, y: center.y + 1 }));
      if ((mask & 8) !== 0) map.walls.runs.push(oneCellRun(`mask-${mask}-west`, { x: center.x - 1, y: center.y }));
    }
    const compiled = compile(map);
    expect(centers.map((tile) => compiled.wallTiles.find((cell) => tileKey(cell.tile) === tileKey(tile))?.adjacencyMask))
      .toEqual(Array.from({ length: 16 }, (_, mask) => mask));
  });

  test('uses stable object-part order under authored array shuffles', () => {
    const first = baseMap();
    const secondObject = objectAt({
      id: 'second-object',
      kind: 'decoration',
      anchor: { x: 20, y: 12 },
      partOffsets: [{ x: 1, y: 0 }, { x: 0, y: 0 }],
      solidOffsets: [],
    });
    secondObject.areaId = 'test-area';
    first.objects.push(secondObject);
    const second = structuredClone(first);
    second.objects.reverse();
    second.objects.forEach((object) => object.renderParts.reverse());
    expect([...compile(first).objectPartById.values()].map(({ id }) => id))
      .toEqual([...compile(second).objectPartById.values()].map(({ id }) => id));
    expect([...compile(first).partOwnersByTile]).toEqual([...compile(second).partOwnersByTile]);
  });

  test('rejects unknown location and preferred-interaction bindings', () => {
    const unknownLocation = baseMap();
    unknownLocation.locationBindings[0]!.locationId = 'not_registered';
    expect(() => compile(unknownLocation)).toThrow('unknown location binding');

    const unknownInteraction = baseMap();
    unknownInteraction.locationBindings[0]!.preferredInteractionIds = ['not-an-interaction'];
    expect(() => compile(unknownInteraction)).toThrow('unknown interaction');
  });

  test('selects the shortest reachable approach and breaks ties by stable tile order', () => {
    const source = baseMap();
    source.objects[0]!.interactions[0]!.approachOffsets = [{ x: -1, y: 0 }, { x: 1, y: 0 }];
    const map = compile(source);
    expect(selectInteractionApproach(map, 'test-use', { x: 12, y: 14 })).toEqual({ x: 11, y: 12 });
    expect(selectInteractionApproach(map, 'test-use', { x: 12, y: 14 }, new Set(['11,12'])))
      .toEqual({ x: 13, y: 12 });
  });

  test('selects the nearest interaction when one object owns more than one', () => {
    const source = baseMap();
    source.objects[0]!.interactions.push({
      id: 'test-use-east', kind: 'social', approachOffsets: [{ x: 1, y: 0 }],
    });
    const map = compile(source);
    expect(selectOwnerInteractionApproach(map, 'test-object', { x: 14, y: 12 })).toEqual({
      interactionId: 'test-use-east', tile: { x: 13, y: 12 },
    });
    expect(selectOwnerInteractionApproach(map, 'test-object', { x: 12, y: 14 })).toEqual({
      interactionId: 'test-use', tile: { x: 11, y: 12 },
    });
  });

  test('uses one click authority for NPCs, multipart objects, open doors, and floor', () => {
    const map = compile(baseMap());
    expect(resolveClickTarget(worldClickCandidates(map, {
      z_actor: { x: 12, y: 12 },
      a_actor: { x: 12, y: 12 },
    }, { x: 12, y: 12 }))).toEqual({ id: 'a_actor', kind: 'npc', tile: { x: 12, y: 12 } });
    expect(resolveClickTarget(worldClickCandidates(map, {}, { x: 12, y: 12 })))
      .toEqual({ id: 'test-object', kind: 'object', tile: { x: 12, y: 12 } });
    expect(resolveClickTarget(worldClickCandidates(map, {}, { x: 15, y: 10 })))
      .toEqual({ id: 'test-door', kind: 'object', tile: { x: 15, y: 10 } });
    expect(resolveClickTarget(worldClickCandidates(map, {}, { x: 5, y: 5 })))
      .toEqual({ id: 'floor-5,5', kind: 'floor', tile: { x: 5, y: 5 } });
  });
});

describe('map v2 building and roof validation', () => {
  function buildingMap(): WorldMapV2 {
    const map = baseMap();
    map.walls.runs = [
      { id: 'outer-top', material: 'villa', bounds: { x: 10, y: 10, width: 11, height: 1 }, openings: [] },
      { id: 'outer-bottom', material: 'villa', bounds: { x: 10, y: 20, width: 11, height: 1 }, openings: [{ id: 'front-opening', tile: { x: 15, y: 20 } }] },
      { id: 'outer-left', material: 'villa', bounds: { x: 10, y: 11, width: 1, height: 9 }, openings: [] },
      { id: 'outer-right', material: 'villa', bounds: { x: 20, y: 11, width: 1, height: 9 }, openings: [] },
    ];
    map.doors = [{ id: 'front-door', openingId: 'front-opening', initialState: 'open', sprite: 'tile.open-door', roofGroupId: 'villa-roof' }];
    map.objects = [];
    map.roofGroups = [{
      id: 'villa-roof',
      cells: [
        { x: 10, y: 10, width: 11, height: 6 },
        { x: 10, y: 16, width: 6, height: 5 },
      ],
      interiorCells: [
        { x: 11, y: 11, width: 9, height: 4 },
        { x: 11, y: 15, width: 4, height: 5 },
      ],
    }];
    map.areas = [{
      id: 'villa-area',
      bounds: { x: 11, y: 11, width: 9, height: 9 },
      densityProfile: 'structural-placeholder',
      intentionalOpenAreas: [],
      entranceTiles: [{ x: 15, y: 19 }],
      primaryRoutes: [],
      requiredPortalIds: [],
    }];
    map.buildings = [{
      id: 'villa',
      areaIds: ['villa-area'],
      outerWallRunIds: ['outer-top', 'outer-bottom', 'outer-left', 'outer-right'],
      entranceOpeningIds: ['front-opening'],
      roofGroupId: 'villa-roof',
    }];
    map.locationBindings = [{ locationId: 'test_location', areaIds: ['villa-area'], preferredInteractionIds: [] }];
    map.stagingTiles = [{ x: 15, y: 22 }];
    map.spawns = { protagonist: { x: 15, y: 19 } };
    map.startComposition = undefined;
    return map;
  }

  test('accepts a nonrectangular roof mask and a closed outer shell', () => {
    const map = compile(buildingMap());
    expect(map.roofGroupById.get('villa-roof')?.cellKeys.has('19,14')).toBe(true);
    expect(map.roofGroupById.get('villa-roof')?.cellKeys.has('19,18')).toBe(false);
  });

  test('does not treat a closed entrance door as a reachable building route', () => {
    const source = buildingMap();
    source.doors[0]!.initialState = 'closed-locked';
    expect(() => compile(source)).toThrow('no reachable entrance');
  });

  test('rejects an unowned outer-wall gap', () => {
    const map = buildingMap();
    map.walls.runs[0]!.openings.push({ id: 'bad-gap', tile: { x: 12, y: 10 } });
    expect(() => compile(map)).toThrow('unintended outer-shell gap');
  });

  test('uses the roof interior mask as the shell target', () => {
    const map = buildingMap();
    map.areas[0]!.bounds = { x: 11, y: 11, width: 4, height: 9 };
    map.areas[0]!.entranceTiles = [{ x: 14, y: 19 }];
    expect(() => compile(map)).toThrow('roof interior 15,11 is not assigned');
  });

  test('rejects an axisless opening and an unreachable required entrance side', () => {
    const axisless = baseMap();
    axisless.walls.runs = [{
      id: 'axisless', material: 'villa', bounds: { x: 20, y: 20, width: 1, height: 1 },
      openings: [{ id: 'axisless-opening', tile: { x: 20, y: 20 } }],
    }];
    axisless.doors = [];
    expect(() => compile(axisless)).toThrow('axis is undefined');

    const unreachable = baseMap();
    unreachable.objects[0]!.interactions = [];
    unreachable.locationBindings[0]!.preferredInteractionIds = [];
    unreachable.startComposition = undefined;
    unreachable.spawns.protagonist = { x: 5, y: 5 };
    unreachable.terrainSolids = [
      { id: 'cage-north', kind: 'other', bounds: { x: 5, y: 4, width: 1, height: 1 } },
      { id: 'cage-west', kind: 'other', bounds: { x: 4, y: 5, width: 1, height: 1 } },
      { id: 'cage-east', kind: 'other', bounds: { x: 6, y: 5, width: 1, height: 1 } },
      { id: 'cage-south', kind: 'other', bounds: { x: 5, y: 6, width: 1, height: 1 } },
    ];
    expect(() => compile(unreachable)).toThrow('not reachable from its required entrance side');
  });
});

describe('map v2 density algorithms', () => {
  const row = (y: number, startX: number, count: number): TileOffset[] => (
    Array.from({ length: count }, (_, index) => ({ x: startX + index, y }))
  );

  test.each([
    ['furnished-interior', [
      objectAt({ id: 'chair', kind: 'seat', anchor: { x: 5, y: 5 }, partOffsets: row(0, 0, 4), solidOffsets: row(0, 0, 4) }),
      objectAt({ id: 'table', kind: 'table', anchor: { x: 5, y: 5 }, partOffsets: row(1, 0, 4), solidOffsets: row(1, 0, 4) }),
      objectAt({ id: 'decor', kind: 'decor', anchor: { x: 5, y: 5 }, partOffsets: row(2, 0, 4), solidOffsets: [] }),
    ]],
    ['active-public', [
      objectAt({ id: 'cluster-a', kind: 'stall', anchor: { x: 5, y: 5 }, partOffsets: row(0, 0, 4), solidOffsets: [{ x: 0, y: 0 }] }),
      objectAt({ id: 'cluster-b', kind: 'bench', anchor: { x: 5, y: 5 }, partOffsets: row(6, 6, 4), solidOffsets: [{ x: 6, y: 6 }] }),
    ]],
    ['relaxation-natural', [
      objectAt({ id: 'garden', kind: 'plant', anchor: { x: 5, y: 5 }, partOffsets: row(0, 0, 5), solidOffsets: [{ x: 0, y: 0 }] }),
    ]],
    ['service-docks', [
      objectAt({ id: 'cargo', kind: 'crate', anchor: { x: 5, y: 5 }, partOffsets: [...row(0, 0, 4), ...row(1, 0, 4)], solidOffsets: [...row(0, 0, 4), { x: 0, y: 1 }] }),
    ]],
    ['structural-placeholder', [
      objectAt({ id: 'shell', kind: 'shell', anchor: { x: 5, y: 5 }, partOffsets: [...row(0, 0, 4), ...row(1, 0, 4)], solidOffsets: [...row(0, 0, 4), ...row(1, 0, 2)] }),
    ]],
  ] as const)('accepts the %s boundary profile', (profile, objects) => {
    const map = compile(densityMap(profile, structuredClone(objects)), true);
    expect(map.densityByAreaId.get('density-area')?.profile).toBe(profile);
  });

  test('finds deterministic maximal empty rectangles and requires an explicit marker', () => {
    const empty = new Set<string>();
    for (let y = 2; y < 10; y += 1) for (let x = 3; x < 12; x += 1) empty.add(`${x},${y}`);
    expect(findMaximalEmptyRectangles(empty, { x: 0, y: 0, width: 16, height: 16 }))
      .toEqual([{ x: 3, y: 2, width: 9, height: 8 }]);

    const map = densityMap('furnished-interior', [
      objectAt({ id: 'chair', kind: 'seat', anchor: { x: 5, y: 5 }, partOffsets: row(0, 0, 4), solidOffsets: row(0, 0, 4) }),
      objectAt({ id: 'table', kind: 'table', anchor: { x: 5, y: 5 }, partOffsets: row(1, 0, 4), solidOffsets: row(1, 0, 4) }),
      objectAt({ id: 'decor', kind: 'decor', anchor: { x: 5, y: 5 }, partOffsets: row(2, 0, 4), solidOffsets: [] }),
    ]);
    map.areas[0]!.intentionalOpenAreas = [];
    expect(() => compile(map, true)).toThrow('unmarked empty rectangle');
    map.areas[0]!.intentionalOpenAreas = [{ x: 10, y: 10, width: 1, height: 1 }];
    expect(() => compile(map, true)).toThrow('unmarked empty rectangle');
  });
});

describe('start composition and v2 catalog', () => {
  test('proves declared details at targets that select both 1x and 2x', () => {
    const map = compile(baseMap());
    expect(selectAutomaticWorldZoom(1280, 704)).toBe(1);
    expect(selectAutomaticWorldZoom(2560, 1408)).toBe(2);
    expect(validateStartComposition(map, [
      { id: 'one-x', surfaceWidth: 1280, surfaceHeight: 704 },
      { id: 'two-x', surfaceWidth: 2560, surfaceHeight: 1408 },
    ], new Set([1, 2])).map(({ zoom }) => zoom)).toEqual([1, 2]);
  });

  function catalogMap(id: string, portals: WorldMapV2['portals']): WorldMapV2 {
    const map = baseMap();
    map.id = id;
    map.displayName = id;
    map.portals = portals;
    map.locationBindings = [{ locationId: id, areaIds: ['test-area'], preferredInteractionIds: [] }];
    map.startComposition = undefined;
    return map;
  }

  function catalogCandidates() {
    return {
      northwest_residential: catalogMap('northwest_residential', [
        { id: 'to-downtown', edge: 'east', tile: { x: 63, y: 24 }, destinationMapId: 'northeast_downtown', destinationEntranceId: 'from-residential' },
        { id: 'to-commercial', edge: 'south', tile: { x: 32, y: 47 }, destinationMapId: 'southwest_commercial', destinationEntranceId: 'from-residential' },
        { id: 'to-office', edge: 'west', tile: { x: 0, y: 24 }, destinationMapId: 'west_office', destinationEntranceId: 'from-residential' },
      ]),
      northeast_downtown: catalogMap('northeast_downtown', [
        { id: 'from-residential', edge: 'west', tile: { x: 0, y: 24 }, destinationMapId: 'northwest_residential', destinationEntranceId: 'to-downtown' },
        { id: 'to-docks', edge: 'south', tile: { x: 32, y: 47 }, destinationMapId: 'southeast_docks', destinationEntranceId: 'from-downtown' },
      ]),
      southwest_commercial: catalogMap('southwest_commercial', [
        { id: 'from-residential', edge: 'north', tile: { x: 32, y: 0 }, destinationMapId: 'northwest_residential', destinationEntranceId: 'to-commercial' },
        { id: 'to-docks', edge: 'east', tile: { x: 63, y: 24 }, destinationMapId: 'southeast_docks', destinationEntranceId: 'from-commercial' },
      ]),
      southeast_docks: catalogMap('southeast_docks', [
        { id: 'from-downtown', edge: 'north', tile: { x: 32, y: 0 }, destinationMapId: 'northeast_downtown', destinationEntranceId: 'to-docks' },
        { id: 'from-commercial', edge: 'west', tile: { x: 0, y: 24 }, destinationMapId: 'southwest_commercial', destinationEntranceId: 'to-docks' },
      ]),
      west_office: catalogMap('west_office', [
        { id: 'from-residential', edge: 'east', tile: { x: 63, y: 24 }, destinationMapId: 'northwest_residential', destinationEntranceId: 'to-office' },
      ]),
    };
  }

  test('derives ten routes from reciprocal portal identities and checks location neighborhoods', () => {
    const candidates = catalogCandidates();
    candidates.northwest_residential.locationBindings.push({
      locationId: 'linda_villa',
      areaIds: ['test-area'],
      preferredInteractionIds: [],
    });
    const locations = new Map([
      ['northwest_residential', 'northwest_residential'],
      ['northeast_downtown', 'northeast_downtown'],
      ['southwest_commercial', 'southwest_commercial'],
      ['southeast_docks', 'southeast_docks'],
      ['west_office', 'west_office'],
      ['linda_villa', 'northwest_residential'],
    ]);
    const catalog = buildWorldMapV2Catalog(candidates, {
      locationNeighborhoodById: locations,
      validateDensity: false,
    });
    expect(deriveNeighborhoodRoutes(catalog)).toHaveLength(10);

    const drifted = catalogCandidates();
    drifted.northeast_downtown.portals[0]!.tile.y = 23;
    expect(() => buildWorldMapV2Catalog(drifted, {
      locationNeighborhoodById: new Map([...locations].filter(([id]) => id !== 'linda_villa')),
      validateDensity: false,
    })).toThrow('not aligned');

    const compatibilityDrift = catalogCandidates();
    compatibilityDrift.northwest_residential.portals[0]!.tile.y = 23;
    compatibilityDrift.northeast_downtown.portals[0]!.tile.y = 23;
    expect(() => buildWorldMapV2Catalog(compatibilityDrift, {
      locationNeighborhoodById: new Map([...locations].filter(([id]) => id !== 'linda_villa')),
      validateDensity: false,
    })).toThrow('compatibility route table');

    const wrongBinding = catalogCandidates();
    wrongBinding.northwest_residential.locationBindings.push({ locationId: 'linda_villa', areaIds: ['test-area'], preferredInteractionIds: [] });
    wrongBinding.northeast_downtown.locationBindings.push({ locationId: 'linda_villa', areaIds: ['test-area'], preferredInteractionIds: [] });
    expect(() => buildWorldMapV2Catalog(wrongBinding, {
      locationNeighborhoodById: locations,
      validateDensity: false,
    })).toThrow('wrong neighborhood');
  });
});
