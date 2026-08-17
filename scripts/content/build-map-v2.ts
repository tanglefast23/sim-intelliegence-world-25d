import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { ATLAS_INDEX } from '../../src/render/atlas';
import { buildWorldMapV2Catalog, type MapId } from '../../src/world/maps/catalog';
import type { TilePoint, WorldMapV2 } from '../../src/world/maps/schema';
import { deriveNeighborhoodRoutes } from '../../src/world/transfers/routes';

const LAYOUT_REVISIONS: Readonly<Record<MapId, number>> = {
  northwest_residential: 3,
  northeast_downtown: 2,
  southwest_commercial: 2,
  southeast_docks: 2,
  west_office: 1,
};

type MapObject = WorldMapV2['objects'][number];
type ObjectTile = Readonly<{ x: number; y: number; sprite: string; solid?: boolean }>;

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function objectFromTiles(input: Readonly<{
  id: string;
  kind: string;
  areaId: string;
  tiles: readonly ObjectTile[];
  interactions?: readonly Readonly<{
    id: string;
    kind: 'bed' | 'storage' | 'social' | 'decoration';
    approachTiles: readonly TilePoint[];
  }>[];
}>): MapObject {
  const anchor = input.tiles[0];
  if (!anchor) throw new Error(`Object ${input.id} needs at least one tile.`);
  return {
    id: input.id,
    kind: input.kind,
    areaId: input.areaId,
    anchor: { x: anchor.x, y: anchor.y },
    depthAnchorOffset: {
      x: (input.tiles.at(-1)?.x ?? anchor.x) - anchor.x,
      y: (input.tiles.at(-1)?.y ?? anchor.y) - anchor.y,
    },
    renderParts: input.tiles.map((tile, index) => ({
      id: `${input.id}-part-${String(index + 1).padStart(2, '0')}`,
      sprite: tile.sprite,
      offset: { x: tile.x - anchor.x, y: tile.y - anchor.y },
    })),
    solidFootprints: input.tiles.flatMap((tile, index) => tile.solid ? [{
      id: `${input.id}-solid-${String(index + 1).padStart(2, '0')}`,
      bounds: { x: tile.x - anchor.x, y: tile.y - anchor.y, width: 1, height: 1 },
    }] : []),
    interactions: (input.interactions ?? []).map((interaction) => ({
      id: interaction.id,
      kind: interaction.kind,
      approachOffsets: interaction.approachTiles.map((tile) => ({
        x: tile.x - anchor.x,
        y: tile.y - anchor.y,
      })),
    })),
  };
}

function clusteredTiles(
  first: TilePoint,
  second: TilePoint,
  count: number,
  solidCount: number,
  sprites: readonly string[],
): ObjectTile[] {
  const firstCount = Math.ceil(count / 2);
  return Array.from({ length: count }, (_, index) => {
    const localIndex = index < firstCount ? index : index - firstCount;
    const origin = index < firstCount ? first : second;
    return {
      x: origin.x + (localIndex % 4),
      y: origin.y + Math.floor(localIndex / 4),
      sprite: sprites[index % sprites.length]!,
      solid: index < solidCount,
    };
  });
}

function placeholderArea(input: Readonly<{
  id: string;
  material: string;
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
  locationIds: readonly string[];
  signSprite: string;
  fixtureSprites?: readonly string[];
}>): Readonly<{
  area: WorldMapV2['areas'][number];
  wallRuns: WorldMapV2['walls']['runs'];
  object: MapObject;
  bindings: WorldMapV2['locationBindings'];
}> {
  const { x, y, width, height } = input.bounds;
  const openingX = x + Math.floor(width / 2);
  const object = objectFromTiles({
    id: `${input.id}-fixtures`,
    kind: 'development-fixtures',
    areaId: input.id,
    tiles: clusteredTiles(
      { x: x + 2, y: y + 2 },
      { x: x + width - 6, y: y + height - 4 },
      8,
      6,
      input.fixtureSprites ?? [input.signSprite, 'tile.fixture-lamp', 'tile.fixture-planter', 'tile.counter-left'],
    ),
  });
  return {
    area: {
      id: input.id,
      bounds: { ...input.bounds },
      densityProfile: 'structural-placeholder',
      intentionalOpenAreas: [],
      entranceTiles: [{ x: openingX, y: y + height - 2 }],
      primaryRoutes: [],
      requiredPortalIds: [],
    },
    wallRuns: [
      { id: `${input.id}-north`, material: input.material, bounds: { x, y, width, height: 1 }, openings: [] },
      {
        id: `${input.id}-south`, material: input.material,
        bounds: { x, y: y + height - 1, width, height: 1 },
        openings: [{ id: `${input.id}-entrance`, tile: { x: openingX, y: y + height - 1 } }],
      },
      { id: `${input.id}-west`, material: input.material, bounds: { x, y: y + 1, width: 1, height: height - 2 }, openings: [] },
      { id: `${input.id}-east`, material: input.material, bounds: { x: x + width - 1, y: y + 1, width: 1, height: height - 2 }, openings: [] },
    ],
    object,
    bindings: input.locationIds.map((locationId) => ({
      locationId,
      areaIds: [input.id],
      preferredInteractionIds: [],
    })),
  };
}

function commonMap(input: Readonly<{
  id: MapId;
  displayName: string;
  defaultSprite: string;
  regions: WorldMapV2['ground']['regions'];
  areas: WorldMapV2['areas'];
  wallRuns: WorldMapV2['walls']['runs'];
  objects: WorldMapV2['objects'];
  bindings: WorldMapV2['locationBindings'];
  portals: WorldMapV2['portals'];
  stagingTiles: readonly TilePoint[];
  spawns: Readonly<Record<string, TilePoint>>;
  terrainSolids?: WorldMapV2['terrainSolids'];
  effects?: WorldMapV2['effects'];
}>): WorldMapV2 {
  return {
    schemaVersion: 2,
    layoutRevision: LAYOUT_REVISIONS[input.id],
    id: input.id,
    displayName: input.displayName,
    width: 64,
    height: 48,
    tileSize: 32,
    ground: { defaultSprite: input.defaultSprite, regions: input.regions },
    terrainSolids: input.terrainSolids ?? [],
    walls: { runs: input.wallRuns },
    doors: [],
    objects: input.objects,
    effects: input.effects ?? [],
    roofGroups: [],
    areas: input.areas,
    buildings: [],
    locationBindings: input.bindings,
    portals: input.portals,
    stagingTiles: [...input.stagingTiles],
    spawns: { ...input.spawns },
  };
}

function northwestMap(): WorldMapV2 {
  const spa = placeholderArea({
    id: 'shoreglass-spa', material: 'villa', bounds: { x: 28, y: 8, width: 8, height: 10 },
    locationIds: ['mina_spa'], signSprite: 'tile.sign-spa',
  });
  const bedroomObjects = [
    objectFromTiles({
      id: 'villa-bed', kind: 'bed', areaId: 'bedroom',
      tiles: [
        { x: 10, y: 9, sprite: 'tile.bed-head', solid: true },
        { x: 11, y: 9, sprite: 'tile.bed-foot', solid: true },
      ],
      interactions: [{ id: 'sleep-bed', kind: 'bed', approachTiles: [{ x: 10, y: 10 }] }],
    }),
    objectFromTiles({
      id: 'bedroom-storage', kind: 'storage', areaId: 'bedroom',
      tiles: [{ x: 13, y: 9, sprite: 'tile.counter-left', solid: true }],
    }),
    objectFromTiles({
      id: 'bedroom-details', kind: 'fixture', areaId: 'bedroom',
      tiles: [
        { x: 10, y: 12, sprite: 'tile.fixture-lamp' },
        { x: 13, y: 12, sprite: 'tile.fixture-planter' },
      ],
    }),
  ];
  const bathroomObjects = [
    objectFromTiles({
      id: 'bath-fixture', kind: 'bath', areaId: 'bathroom',
      tiles: [
        { x: 16, y: 9, sprite: 'tile.counter-left', solid: true },
        { x: 17, y: 9, sprite: 'tile.counter-right', solid: true },
      ],
    }),
    objectFromTiles({
      id: 'bathroom-lamp', kind: 'fixture', areaId: 'bathroom',
      tiles: [{ x: 18, y: 12, sprite: 'tile.fixture-lamp' }],
    }),
  ];
  const storageObjects = [
    objectFromTiles({
      id: 'villa-storage', kind: 'storage', areaId: 'storage',
      tiles: [
        { x: 21, y: 9, sprite: 'tile.counter-left', solid: true },
        { x: 22, y: 9, sprite: 'tile.counter-right', solid: true },
        { x: 23, y: 9, sprite: 'tile.counter-left', solid: true },
      ],
      interactions: [{ id: 'home-storage', kind: 'storage', approachTiles: [{ x: 22, y: 10 }] }],
    }),
    objectFromTiles({
      id: 'storage-details', kind: 'fixture', areaId: 'storage',
      tiles: [
        { x: 21, y: 12, sprite: 'tile.fixture-lamp' },
        { x: 23, y: 12, sprite: 'tile.fixture-planter' },
      ],
    }),
  ];
  const kitchenObjects = [
    objectFromTiles({
      id: 'kitchen-counter', kind: 'counter', areaId: 'kitchen',
      tiles: [10, 11, 12, 13].map((x, index) => ({
        x, y: 16, sprite: index % 2 === 0 ? 'tile.counter-left' : 'tile.counter-right', solid: true,
      })),
    }),
    objectFromTiles({
      id: 'kitchen-table', kind: 'table', areaId: 'kitchen',
      tiles: [
        { x: 10, y: 20, sprite: 'tile.table-left', solid: true },
        { x: 11, y: 20, sprite: 'tile.table-right', solid: true },
      ],
    }),
    objectFromTiles({
      id: 'kitchen-details', kind: 'fixture', areaId: 'kitchen',
      tiles: [
        { x: 13, y: 20, sprite: 'tile.fixture-lamp' },
        { x: 12, y: 22, sprite: 'tile.fixture-planter' },
      ],
    }),
  ];
  const socialObjects = [
    objectFromTiles({
      id: 'social-sofa', kind: 'sofa', areaId: 'social',
      tiles: [
        { x: 20, y: 18, sprite: 'tile.sofa-left', solid: true },
        { x: 21, y: 18, sprite: 'tile.sofa-right', solid: true },
      ],
      interactions: [{ id: 'social-seat', kind: 'social', approachTiles: [{ x: 19, y: 18 }] }],
    }),
    objectFromTiles({
      id: 'social-tables', kind: 'table', areaId: 'social',
      tiles: [
        { x: 20, y: 20, sprite: 'tile.table-left', solid: true },
        { x: 21, y: 20, sprite: 'tile.table-right', solid: true },
        { x: 22, y: 21, sprite: 'tile.table-left', solid: true },
        { x: 23, y: 21, sprite: 'tile.table-right', solid: true },
      ],
    }),
    objectFromTiles({
      id: 'social-counter', kind: 'counter', areaId: 'social',
      tiles: [
        { x: 17, y: 16, sprite: 'tile.counter-left', solid: true },
        { x: 18, y: 16, sprite: 'tile.counter-right', solid: true },
      ],
    }),
    objectFromTiles({
      id: 'social-details', kind: 'fixture', areaId: 'social',
      tiles: [
        { x: 22, y: 16, sprite: 'tile.fixture-lamp' },
        { x: 17, y: 22, sprite: 'tile.fixture-planter' },
        { x: 23, y: 22, sprite: 'tile.fixture-lamp' },
      ],
    }),
  ];
  const patio = objectFromTiles({
    id: 'sunward-patio-furniture', kind: 'patio-furniture', areaId: 'sunward-patio',
    tiles: [
      { x: 21, y: 29, sprite: 'tile.table-left', solid: true },
      { x: 22, y: 29, sprite: 'tile.table-right', solid: true },
      { x: 26, y: 29, sprite: 'tile.landmark-fountain-nw', solid: true },
      { x: 27, y: 29, sprite: 'tile.landmark-fountain-ne', solid: true },
      { x: 26, y: 30, sprite: 'tile.landmark-fountain-sw', solid: true },
      { x: 27, y: 30, sprite: 'tile.landmark-fountain-se', solid: true },
      { x: 31, y: 29, sprite: 'tile.sofa-left', solid: true },
      { x: 32, y: 29, sprite: 'tile.sofa-right', solid: true },
      { x: 23, y: 27, sprite: 'tile.fixture-lamp' },
      { x: 23, y: 32, sprite: 'tile.fixture-planter' },
      { x: 29, y: 27, sprite: 'tile.fixture-lamp' },
      { x: 33, y: 32, sprite: 'tile.fixture-planter' },
      { x: 34, y: 28, sprite: 'tile.fixture-lamp' },
    ],
  });
  const promenade = objectFromTiles({
    id: 'promenade-details', kind: 'street-furniture', areaId: 'villa-promenade',
    tiles: [
      { x: 38, y: 10, sprite: 'tile.plant-palm', solid: true },
      { x: 39, y: 10, sprite: 'tile.fixture-planter', solid: true },
      { x: 40, y: 10, sprite: 'tile.fixture-lamp' },
      { x: 41, y: 10, sprite: 'tile.sign-spa' },
      { x: 42, y: 10, sprite: 'tile.fixture-lamp' },
      { x: 43, y: 10, sprite: 'tile.fixture-planter', solid: true },
      { x: 50, y: 10, sprite: 'tile.fixture-planter', solid: true },
      { x: 51, y: 10, sprite: 'tile.fixture-lamp' },
      { x: 52, y: 10, sprite: 'tile.sign-spa' },
      { x: 53, y: 10, sprite: 'tile.fixture-lamp' },
      { x: 54, y: 10, sprite: 'tile.fixture-planter' },
      { x: 55, y: 10, sprite: 'tile.plant-palm', solid: true },
      { x: 38, y: 18, sprite: 'tile.fixture-planter' },
      { x: 39, y: 18, sprite: 'tile.fixture-lamp' },
      { x: 40, y: 18, sprite: 'tile.sign-spa' },
      { x: 41, y: 18, sprite: 'tile.fixture-lamp' },
      { x: 42, y: 18, sprite: 'tile.fixture-planter', solid: true },
      { x: 43, y: 18, sprite: 'tile.plant-palm' },
      { x: 50, y: 18, sprite: 'tile.plant-palm' },
      { x: 51, y: 18, sprite: 'tile.fixture-planter' },
      { x: 52, y: 18, sprite: 'tile.fixture-lamp' },
      { x: 53, y: 18, sprite: 'tile.sign-spa' },
      { x: 54, y: 18, sprite: 'tile.fixture-lamp' },
      { x: 55, y: 18, sprite: 'tile.fixture-planter' },
    ],
  });
  const market = objectFromTiles({
    id: 'beach-market-details', kind: 'market-stalls', areaId: 'beach-market',
    tiles: [
      { x: 38, y: 27, sprite: 'tile.sign-market' },
      { x: 39, y: 27, sprite: 'tile.counter-left', solid: true },
      { x: 40, y: 27, sprite: 'tile.counter-right', solid: true },
      { x: 41, y: 27, sprite: 'tile.fixture-lamp' },
      { x: 42, y: 27, sprite: 'tile.fixture-planter' },
      { x: 38, y: 32, sprite: 'tile.sign-market' },
      { x: 39, y: 32, sprite: 'tile.counter-left', solid: true },
      { x: 40, y: 32, sprite: 'tile.counter-right', solid: true },
      { x: 41, y: 32, sprite: 'tile.fixture-lamp' },
      { x: 42, y: 32, sprite: 'tile.fixture-planter' },
      { x: 51, y: 29, sprite: 'tile.fixture-planter' },
      { x: 52, y: 29, sprite: 'tile.counter-left', solid: true },
      { x: 53, y: 29, sprite: 'tile.counter-right', solid: true },
      { x: 54, y: 29, sprite: 'tile.sign-market' },
      { x: 55, y: 29, sprite: 'tile.fixture-lamp' },
      { x: 55, y: 33, sprite: 'tile.fixture-lamp' },
    ],
  });
  const beach = objectFromTiles({
    id: 'public-beach-details', kind: 'beach-furniture', areaId: 'public-beach',
    tiles: [
      { x: 37, y: 39, sprite: 'tile.plant-palm', solid: true },
      { x: 38, y: 39, sprite: 'tile.fixture-planter' },
      { x: 39, y: 39, sprite: 'tile.fixture-lamp' },
      { x: 42, y: 40, sprite: 'tile.table-left' },
      { x: 43, y: 40, sprite: 'tile.table-right' },
      { x: 51, y: 39, sprite: 'tile.fixture-lamp' },
      { x: 52, y: 39, sprite: 'tile.fixture-planter' },
      { x: 53, y: 39, sprite: 'tile.plant-palm', solid: true },
      { x: 56, y: 40, sprite: 'tile.table-left' },
      { x: 57, y: 40, sprite: 'tile.table-right' },
    ],
  });

  const map = commonMap({
    id: 'northwest_residential', displayName: 'Sunward Villas', defaultSprite: 'tile.warm-sand',
    regions: [
      { id: 'villa-floor', x: 9, y: 8, width: 16, height: 16, sprite: 'tile.villa-floor' },
      { id: 'villa-patio-route', x: 16, y: 24, width: 7, height: 3, sprite: 'tile.plaza-paver' },
      { id: 'sunward-patio-ground', x: 20, y: 25, width: 16, height: 10, sprite: 'tile.plaza-paver' },
      { id: 'patio-spa-route', x: 31, y: 17, width: 3, height: 8, sprite: 'tile.plaza-paver' },
      { id: 'promenade-ground', x: 37, y: 8, width: 20, height: 14, sprite: 'tile.plaza-paver' },
      { id: 'patio-promenade-route', x: 35, y: 27, width: 4, height: 3, sprite: 'tile.plaza-paver' },
      { id: 'promenade-market-route', x: 45, y: 20, width: 4, height: 8, sprite: 'tile.plaza-paver' },
      { id: 'market-ground', x: 37, y: 25, width: 20, height: 10, sprite: 'tile.boardwalk' },
      { id: 'market-beach-route', x: 45, y: 35, width: 4, height: 3, sprite: 'tile.boardwalk' },
      { id: 'beach-ground', x: 35, y: 38, width: 24, height: 4, sprite: 'tile.warm-sand' },
      { id: 'sunward-shallows', x: 35, y: 42, width: 24, height: 6, sprite: 'tile.shallow-water' },
    ],
    areas: [
      { id: 'bedroom', bounds: { x: 9, y: 8, width: 7, height: 6 }, densityProfile: 'furnished-interior', intentionalOpenAreas: [], entranceTiles: [{ x: 14, y: 12 }], primaryRoutes: [], requiredPortalIds: [] },
      { id: 'bathroom', bounds: { x: 15, y: 8, width: 5, height: 6 }, densityProfile: 'furnished-interior', intentionalOpenAreas: [], entranceTiles: [{ x: 16, y: 11 }], primaryRoutes: [], requiredPortalIds: [] },
      { id: 'storage', bounds: { x: 19, y: 8, width: 6, height: 6 }, densityProfile: 'furnished-interior', intentionalOpenAreas: [], entranceTiles: [{ x: 20, y: 11 }], primaryRoutes: [], requiredPortalIds: [] },
      { id: 'kitchen', bounds: { x: 9, y: 14, width: 7, height: 10 }, densityProfile: 'furnished-interior', intentionalOpenAreas: [], entranceTiles: [{ x: 14, y: 19 }], primaryRoutes: [], requiredPortalIds: [] },
      { id: 'social', bounds: { x: 15, y: 14, width: 10, height: 10 }, densityProfile: 'furnished-interior', intentionalOpenAreas: [], entranceTiles: [{ x: 16, y: 19 }], primaryRoutes: [], requiredPortalIds: [] },
      spa.area,
      { id: 'sunward-patio', bounds: { x: 20, y: 25, width: 16, height: 10 }, densityProfile: 'relaxation-natural', intentionalOpenAreas: [], entranceTiles: [{ x: 23, y: 28 }], primaryRoutes: [], requiredPortalIds: [] },
      { id: 'villa-promenade', bounds: { x: 37, y: 8, width: 20, height: 14 }, densityProfile: 'active-public', intentionalOpenAreas: [], entranceTiles: [{ x: 46, y: 20 }], primaryRoutes: [{ x: 46, y: 8, width: 2, height: 14 }], requiredPortalIds: [] },
      { id: 'beach-market', bounds: { x: 37, y: 25, width: 20, height: 10 }, densityProfile: 'active-public', intentionalOpenAreas: [], entranceTiles: [{ x: 46, y: 34 }], primaryRoutes: [{ x: 46, y: 25, width: 2, height: 10 }], requiredPortalIds: [] },
      { id: 'public-beach', bounds: { x: 35, y: 38, width: 24, height: 4 }, densityProfile: 'relaxation-natural', intentionalOpenAreas: [], entranceTiles: [{ x: 46, y: 38 }], primaryRoutes: [], requiredPortalIds: [] },
    ],
    wallRuns: [
      { id: 'villa-north', material: 'villa', bounds: { x: 8, y: 7, width: 18, height: 1 }, openings: [] },
      { id: 'villa-south', material: 'villa', bounds: { x: 8, y: 24, width: 18, height: 1 }, openings: [{ id: 'villa-front-opening', tile: { x: 17, y: 24 } }] },
      { id: 'villa-west', material: 'villa', bounds: { x: 8, y: 8, width: 1, height: 16 }, openings: [] },
      { id: 'villa-east', material: 'villa', bounds: { x: 25, y: 8, width: 1, height: 16 }, openings: [] },
      { id: 'villa-upper-divider', material: 'villa', bounds: { x: 9, y: 14, width: 16, height: 1 }, openings: [{ id: 'bedroom-opening', tile: { x: 16, y: 14 } }, { id: 'bathroom-hall-opening', tile: { x: 18, y: 14 } }] },
      { id: 'villa-bed-bath-divider', material: 'villa', bounds: { x: 15, y: 8, width: 1, height: 6 }, openings: [{ id: 'bathroom-left-opening', tile: { x: 15, y: 11 } }] },
      { id: 'villa-bath-storage-divider', material: 'villa', bounds: { x: 19, y: 8, width: 1, height: 6 }, openings: [{ id: 'bathroom-right-opening', tile: { x: 19, y: 11 } }] },
      { id: 'villa-lower-divider', material: 'villa', bounds: { x: 15, y: 15, width: 1, height: 9 }, openings: [{ id: 'social-opening', tile: { x: 15, y: 19 } }, { id: 'villa-entry-hall-opening', tile: { x: 15, y: 23 } }] },
      ...spa.wallRuns,
    ],
    objects: [
      ...bedroomObjects, ...bathroomObjects, ...storageObjects, ...kitchenObjects, ...socialObjects,
      spa.object, patio, promenade, market, beach,
    ],
    bindings: [
      { locationId: 'protagonist_villa', areaIds: ['bedroom', 'bathroom', 'storage', 'kitchen', 'social'], preferredInteractionIds: ['social-seat'] },
      { locationId: 'linda_villa', areaIds: ['sunward-patio'], preferredInteractionIds: [] },
      ...spa.bindings,
    ],
    portals: [
      { id: 'to-downtown', edge: 'east', tile: { x: 63, y: 24 }, destinationMapId: 'northeast_downtown', destinationEntranceId: 'from-residential' },
      { id: 'to-commercial', edge: 'south', tile: { x: 32, y: 47 }, destinationMapId: 'southwest_commercial', destinationEntranceId: 'from-residential' },
      { id: 'to-office', edge: 'west', tile: { x: 0, y: 24 }, destinationMapId: 'west_office', destinationEntranceId: 'from-residential' },
    ],
    terrainSolids: [
      { id: 'sunward-shallows', kind: 'water', bounds: { x: 35, y: 42, width: 24, height: 6 } },
    ],
    stagingTiles: [{ x: 62, y: 24 }, { x: 32, y: 46 }, { x: 16, y: 25 }, { x: 1, y: 24 }],
    spawns: {
      protagonist: { x: 18, y: 18 }, linda: { x: 23, y: 28 }, generic_resident: { x: 29, y: 33 },
      linda_boyfriend: { x: 25, y: 28 }, mina_park: { x: 34, y: 15 }, rafael_cruz: { x: 27, y: 5 },
      sora_tan: { x: 27, y: 20 }, devon_price: { x: 37, y: 23 }, priya_nair: { x: 33, y: 36 },
      tomas_reed: { x: 43, y: 36 }, elise_moreau: { x: 53, y: 36 },
      'linda-home': { x: 23, y: 28 }, 'linda-relax': { x: 28, y: 30 },
      'generic-home': { x: 29, y: 33 }, 'generic-work': { x: 27, y: 28 },
      'home-visit': { x: 19, y: 18 },
    },
    effects: [
      { id: 'patio-fire', kind: 'fire', tile: { x: 27, y: 32 } },
      { id: 'patio-leaves', kind: 'leaves', tile: { x: 30, y: 30 } },
      { id: 'patio-palm', kind: 'palm', tile: { x: 35, y: 31 } },
      { id: 'garden-insects', kind: 'insects', tile: { x: 31, y: 26 } },
      { id: 'shoreline-water-glint-west', kind: 'water', tile: { x: 42, y: 43 } },
      { id: 'shoreline-water-glint-center', kind: 'water', tile: { x: 50, y: 44 } },
      { id: 'shoreline-water-glint-east', kind: 'water', tile: { x: 57, y: 43 } },
      { id: 'beach-sparkle', kind: 'sparkle', tile: { x: 50, y: 40 } },
    ],
  });
  map.doors = [
    { id: 'villa-front-door', openingId: 'villa-front-opening', initialState: 'closed-unlocked', sprite: 'tile.closed-door', roofGroupId: 'protagonist-villa-roof', interaction: { id: 'villa-front-door-use', areaId: 'social', approachTiles: [{ x: 17, y: 23 }, { x: 17, y: 25 }] } },
    { id: 'bedroom-door', openingId: 'bedroom-opening', initialState: 'closed-unlocked', sprite: 'tile.closed-door', roofGroupId: 'protagonist-villa-roof' },
    { id: 'bathroom-hall-door', openingId: 'bathroom-hall-opening', initialState: 'closed-unlocked', sprite: 'tile.closed-door', roofGroupId: 'protagonist-villa-roof' },
    { id: 'bathroom-left-door', openingId: 'bathroom-left-opening', initialState: 'closed-unlocked', sprite: 'tile.closed-door', roofGroupId: 'protagonist-villa-roof' },
    { id: 'bathroom-right-door', openingId: 'bathroom-right-opening', initialState: 'closed-unlocked', sprite: 'tile.closed-door', roofGroupId: 'protagonist-villa-roof' },
    { id: 'social-door', openingId: 'social-opening', initialState: 'closed-unlocked', sprite: 'tile.closed-door', roofGroupId: 'protagonist-villa-roof' },
    { id: 'entry-hall-door', openingId: 'villa-entry-hall-opening', initialState: 'closed-unlocked', sprite: 'tile.closed-door', roofGroupId: 'protagonist-villa-roof' },
  ];
  map.roofGroups = [{
    id: 'protagonist-villa-roof',
    cells: [{ x: 8, y: 7, width: 18, height: 18 }],
    interiorCells: [{ x: 9, y: 8, width: 16, height: 16 }],
  }];
  map.buildings = [{
    id: 'protagonist-villa',
    areaIds: ['bedroom', 'bathroom', 'storage', 'kitchen', 'social'],
    outerWallRunIds: ['villa-north', 'villa-south', 'villa-west', 'villa-east'],
    entranceOpeningIds: ['villa-front-opening'],
    roofGroupId: 'protagonist-villa-roof',
  }];
  map.startComposition = {
    cameraAnchor: { x: 34, y: 31 },
    requiredActorIds: ['protagonist', 'linda', 'generic_resident'],
    requiredDetailPartIds: [
      'social-sofa-part-01', 'social-sofa-part-02', 'social-tables-part-01', 'social-tables-part-02',
      'social-tables-part-03', 'social-tables-part-04', 'social-details-part-01', 'social-details-part-02',
      'sunward-patio-furniture-part-01', 'sunward-patio-furniture-part-02',
      'sunward-patio-furniture-part-03', 'sunward-patio-furniture-part-04',
      'sunward-patio-furniture-part-05', 'sunward-patio-furniture-part-06',
      'sunward-patio-furniture-part-09', 'sunward-patio-furniture-part-10',
    ],
    landmarkAreaIds: ['social', 'sunward-patio'],
  };
  return map;
}

function northeastMap(): WorldMapV2 {
  const club = placeholderArea({
    id: 'club-strip', material: 'downtown', bounds: { x: 8, y: 7, width: 22, height: 13 },
    locationIds: ['devon_bar'], signSprite: 'tile.sign-neon',
    fixtureSprites: [
      'tile.sign-neon', 'tile.fixture-neon-lamp-cyan', 'tile.fixture-planter', 'tile.counter-left',
      'tile.sign-neon', 'tile.fixture-neon-lamp-magenta', 'tile.fixture-planter', 'tile.counter-left',
    ],
  });
  const arcade = placeholderArea({
    id: 'arcade-row', material: 'downtown', bounds: { x: 40, y: 7, width: 20, height: 13 },
    locationIds: [], signSprite: 'tile.sign-neon',
    fixtureSprites: [
      'tile.sign-neon', 'tile.fixture-neon-lamp-magenta', 'tile.fixture-planter', 'tile.counter-left',
      'tile.sign-neon', 'tile.fixture-neon-lamp-cyan', 'tile.fixture-planter', 'tile.counter-right',
    ],
  });
  const studio = placeholderArea({
    id: 'studio-row', material: 'downtown', bounds: { x: 7, y: 32, width: 20, height: 9 },
    locationIds: [], signSprite: 'tile.sign-market',
    fixtureSprites: [
      'tile.sign-market', 'tile.fixture-neon-lamp-cyan', 'tile.fixture-planter', 'tile.counter-left',
      'tile.sign-market', 'tile.fixture-neon-lamp-magenta', 'tile.fixture-planter', 'tile.counter-right',
    ],
  });
  const market = placeholderArea({
    id: 'night-market', material: 'downtown', bounds: { x: 39, y: 31, width: 18, height: 10 },
    locationIds: ['elise_studio'], signSprite: 'tile.sign-market',
    fixtureSprites: [
      'tile.sign-market', 'tile.fixture-neon-lamp-magenta', 'tile.fixture-planter', 'tile.counter-left',
      'tile.sign-market', 'tile.fixture-neon-lamp-cyan', 'tile.fixture-planter', 'tile.counter-left',
    ],
  });
  const clubWallRuns = club.wallRuns.map((run) => run.id === 'club-strip-east' ? {
    ...run,
    openings: [{ id: 'club-service-opening', tile: { x: 29, y: 12 } }],
  } : run);
  const clubArea: WorldMapV2['areas'][number] = {
    ...club.area,
    densityProfile: 'active-public',
    primaryRoutes: [{ x: 21, y: 9, width: 3, height: 9 }],
  };
  const carSpecs = [
    { id: 'boulevard-car-02', x: 24, y: 24, color: 'coral', areaId: 'club-strip' },
    { id: 'boulevard-car-03', x: 40, y: 24, color: 'cyan', areaId: 'arcade-row' },
    { id: 'boulevard-car-05', x: 9, y: 28, color: 'coral', areaId: 'studio-row' },
    { id: 'boulevard-car-06', x: 40, y: 28, color: 'cyan', areaId: 'night-market' },
    { id: 'market-street-car-02', x: 39, y: 44, color: 'coral', areaId: 'night-market' },
    { id: 'market-street-car-03', x: 54, y: 44, color: 'cyan', areaId: 'night-market' },
  ] as const;
  const cars = carSpecs.map(({ id, x, y, color, areaId }) => objectFromTiles({
    id,
    kind: 'parked-car',
    areaId,
    tiles: [
      { x, y, sprite: `tile.parked-car-${color}-left`, solid: true },
      { x: x + 1, y, sprite: `tile.parked-car-${color}-right`, solid: true },
    ],
  }));
  const map = commonMap({
    id: 'northeast_downtown', displayName: 'Neon Crescent', defaultSprite: 'tile.city-lot',
    regions: [
      { id: 'club-sidewalk', x: 5, y: 5, width: 27, height: 19, sprite: 'tile.neon-paver' },
      { id: 'arcade-sidewalk', x: 37, y: 5, width: 27, height: 19, sprite: 'tile.neon-paver' },
      { id: 'south-boulevard-walk', x: 0, y: 29, width: 32, height: 2, sprite: 'tile.neon-paver' },
      { id: 'studio-sidewalk', x: 3, y: 29, width: 28, height: 15, sprite: 'tile.neon-paver' },
      { id: 'market-sidewalk', x: 37, y: 29, width: 27, height: 15, sprite: 'tile.neon-paver' },
      { id: 'west-portal-walk', x: 0, y: 20, width: 8, height: 4, sprite: 'tile.neon-paver' },
      { id: 'north-street', x: 0, y: 0, width: 64, height: 5, sprite: 'tile.dark-asphalt' },
      { id: 'main-boulevard', x: 0, y: 24, width: 64, height: 5, sprite: 'tile.dark-asphalt' },
      { id: 'avenue', x: 32, y: 0, width: 5, height: 48, sprite: 'tile.dark-asphalt' },
      { id: 'market-street', x: 0, y: 44, width: 64, height: 4, sprite: 'tile.dark-asphalt' },
      { id: 'club-floor', x: 8, y: 7, width: 22, height: 13, sprite: 'tile.neon-floor' },
      { id: 'club-dance-floor', x: 15, y: 14, width: 9, height: 6, sprite: 'tile.neon-paver' },
      { id: 'arcade-floor', x: 40, y: 7, width: 20, height: 13, sprite: 'tile.neon-floor' },
      { id: 'studio-floor', x: 7, y: 32, width: 20, height: 9, sprite: 'tile.neon-floor' },
      { id: 'market-floor', x: 39, y: 31, width: 18, height: 10, sprite: 'tile.neon-floor' },
      { id: 'club-service-alley', x: 30, y: 7, width: 2, height: 13, sprite: 'tile.dark-asphalt' },
    ],
    areas: [clubArea, arcade.area, studio.area, market.area],
    wallRuns: [...clubWallRuns, ...arcade.wallRuns, ...studio.wallRuns, ...market.wallRuns],
    objects: [
      objectFromTiles({ id: 'club-bar', kind: 'bar-counter', areaId: 'club-strip', tiles: [
        { x: 10, y: 12, sprite: 'tile.counter-left', solid: true },
        { x: 11, y: 12, sprite: 'tile.counter-right', solid: true },
        { x: 12, y: 12, sprite: 'tile.counter-left', solid: true },
        { x: 13, y: 12, sprite: 'tile.counter-right', solid: true },
        { x: 14, y: 12, sprite: 'tile.counter-left', solid: true },
        { x: 15, y: 12, sprite: 'tile.counter-right', solid: true },
        { x: 16, y: 12, sprite: 'tile.counter-left', solid: true },
        { x: 17, y: 12, sprite: 'tile.counter-right', solid: true },
      ] }),
      objectFromTiles({ id: 'club-backbar', kind: 'bar-signage', areaId: 'club-strip', tiles: [
        { x: 10, y: 10, sprite: 'tile.fixture-neon-lamp-cyan' },
        { x: 12, y: 10, sprite: 'tile.sign-neon' },
        { x: 15, y: 10, sprite: 'tile.sign-neon' },
        { x: 17, y: 10, sprite: 'tile.fixture-neon-lamp-magenta' },
      ] }),
      objectFromTiles({ id: 'club-entrance-neon', kind: 'entrance-signage', areaId: 'club-strip', tiles: [
        { x: 16, y: 20, sprite: 'tile.fixture-neon-lamp-cyan', solid: true },
        { x: 18, y: 20, sprite: 'tile.sign-neon', solid: true },
        { x: 20, y: 20, sprite: 'tile.sign-neon', solid: true },
        { x: 22, y: 20, sprite: 'tile.fixture-neon-lamp-magenta', solid: true },
      ] }),
      objectFromTiles({ id: 'club-west-sofa', kind: 'lounge-sofa', areaId: 'club-strip', tiles: [
        { x: 10, y: 14, sprite: 'tile.sofa-left', solid: true },
        { x: 11, y: 14, sprite: 'tile.sofa-right', solid: true },
      ] }),
      objectFromTiles({ id: 'club-west-table', kind: 'lounge-table', areaId: 'club-strip', tiles: [
        { x: 10, y: 16, sprite: 'tile.table-left', solid: true },
        { x: 11, y: 16, sprite: 'tile.table-right', solid: true },
      ] }),
      objectFromTiles({ id: 'club-east-sofa', kind: 'lounge-sofa', areaId: 'club-strip', tiles: [
        { x: 25, y: 12, sprite: 'tile.sofa-left', solid: true },
        { x: 26, y: 12, sprite: 'tile.sofa-right', solid: true },
      ] }),
      objectFromTiles({ id: 'club-east-table', kind: 'lounge-table', areaId: 'club-strip', tiles: [
        { x: 25, y: 14, sprite: 'tile.table-left', solid: true },
        { x: 26, y: 14, sprite: 'tile.table-right', solid: true },
      ] }),
      objectFromTiles({ id: 'club-dance-lights', kind: 'dance-floor-lighting', areaId: 'club-strip', tiles: [
        { x: 15, y: 14, sprite: 'tile.fixture-neon-lamp-cyan' },
        { x: 23, y: 14, sprite: 'tile.fixture-neon-lamp-magenta' },
        { x: 15, y: 18, sprite: 'tile.fixture-neon-lamp-magenta' },
        { x: 23, y: 18, sprite: 'tile.fixture-neon-lamp-cyan' },
      ] }),
      objectFromTiles({ id: 'club-dj-booth', kind: 'dj-booth', areaId: 'club-strip', tiles: [
        { x: 17, y: 14, sprite: 'tile.counter-left', solid: true },
        { x: 18, y: 14, sprite: 'tile.counter-right', solid: true },
        { x: 19, y: 14, sprite: 'tile.counter-left', solid: true },
        { x: 20, y: 14, sprite: 'tile.counter-right', solid: true },
        { x: 18, y: 13, sprite: 'tile.sign-neon' },
        { x: 19, y: 13, sprite: 'tile.sign-neon' },
      ] }),
      objectFromTiles({ id: 'club-service-stack', kind: 'service-supplies', areaId: 'club-strip', tiles: [
        { x: 30, y: 8, sprite: 'tile.cargo-stack-left', solid: true },
        { x: 31, y: 8, sprite: 'tile.cargo-stack-right', solid: true },
      ] }),
      objectFromTiles({ id: 'arcade-machine-banks', kind: 'arcade-machines', areaId: 'arcade-row', tiles: [
        { x: 42, y: 10, sprite: 'tile.sign-neon', solid: true }, { x: 43, y: 10, sprite: 'tile.counter-right', solid: true },
        { x: 48, y: 10, sprite: 'tile.sign-neon', solid: true }, { x: 49, y: 10, sprite: 'tile.counter-right', solid: true },
        { x: 54, y: 10, sprite: 'tile.sign-neon', solid: true }, { x: 55, y: 10, sprite: 'tile.counter-right', solid: true },
        { x: 42, y: 16, sprite: 'tile.sign-neon', solid: true }, { x: 43, y: 16, sprite: 'tile.counter-right', solid: true },
        { x: 48, y: 16, sprite: 'tile.sign-neon', solid: true }, { x: 49, y: 16, sprite: 'tile.counter-right', solid: true },
        { x: 54, y: 16, sprite: 'tile.sign-neon', solid: true }, { x: 55, y: 16, sprite: 'tile.counter-right', solid: true },
      ] }),
      objectFromTiles({ id: 'arcade-entrance-neon', kind: 'entrance-signage', areaId: 'arcade-row', tiles: [
        { x: 41, y: 20, sprite: 'tile.fixture-neon-lamp-cyan', solid: true },
        { x: 45, y: 20, sprite: 'tile.fixture-neon-lamp-magenta', solid: true },
        { x: 48, y: 20, sprite: 'tile.sign-neon', solid: true },
        { x: 52, y: 20, sprite: 'tile.sign-neon', solid: true },
        { x: 55, y: 20, sprite: 'tile.fixture-neon-lamp-cyan', solid: true },
        { x: 59, y: 20, sprite: 'tile.fixture-neon-lamp-magenta', solid: true },
      ] }),
      objectFromTiles({ id: 'studio-worktables', kind: 'studio-worktables', areaId: 'studio-row', tiles: [
        { x: 9, y: 34, sprite: 'tile.table-left', solid: true }, { x: 10, y: 34, sprite: 'tile.table-right', solid: true },
        { x: 15, y: 34, sprite: 'tile.table-left', solid: true }, { x: 16, y: 34, sprite: 'tile.table-right', solid: true },
        { x: 21, y: 34, sprite: 'tile.table-left', solid: true }, { x: 22, y: 34, sprite: 'tile.table-right', solid: true },
        { x: 9, y: 38, sprite: 'tile.fixture-planter' }, { x: 15, y: 38, sprite: 'tile.fixture-planter' },
      ] }),
      objectFromTiles({ id: 'studio-entrance-neon', kind: 'entrance-signage', areaId: 'studio-row', tiles: [
        { x: 9, y: 41, sprite: 'tile.fixture-neon-lamp-cyan', solid: true },
        { x: 12, y: 41, sprite: 'tile.fixture-neon-lamp-magenta', solid: true },
        { x: 15, y: 41, sprite: 'tile.sign-market', solid: true },
        { x: 19, y: 41, sprite: 'tile.sign-market', solid: true },
        { x: 22, y: 41, sprite: 'tile.fixture-neon-lamp-cyan', solid: true },
        { x: 25, y: 41, sprite: 'tile.fixture-neon-lamp-magenta', solid: true },
      ] }),
      objectFromTiles({ id: 'night-market-canopies', kind: 'market-canopy', areaId: 'night-market', tiles: [
        { x: 41, y: 32, sprite: 'tile.market-canopy-nw', solid: true }, { x: 42, y: 32, sprite: 'tile.market-canopy-ne', solid: true },
        { x: 41, y: 33, sprite: 'tile.market-canopy-sw', solid: true }, { x: 42, y: 33, sprite: 'tile.market-canopy-se', solid: true },
        { x: 51, y: 36, sprite: 'tile.market-canopy-nw', solid: true }, { x: 52, y: 36, sprite: 'tile.market-canopy-ne', solid: true },
        { x: 51, y: 37, sprite: 'tile.market-canopy-sw', solid: true }, { x: 52, y: 37, sprite: 'tile.market-canopy-se', solid: true },
      ] }),
      objectFromTiles({ id: 'market-entrance-neon', kind: 'entrance-signage', areaId: 'night-market', tiles: [
        { x: 40, y: 41, sprite: 'tile.fixture-neon-lamp-cyan', solid: true },
        { x: 43, y: 41, sprite: 'tile.fixture-neon-lamp-magenta', solid: true },
        { x: 46, y: 41, sprite: 'tile.sign-market', solid: true },
        { x: 50, y: 41, sprite: 'tile.sign-market', solid: true },
        { x: 53, y: 41, sprite: 'tile.fixture-neon-lamp-cyan', solid: true },
        { x: 56, y: 41, sprite: 'tile.fixture-neon-lamp-magenta', solid: true },
      ] }),
      objectFromTiles({ id: 'market-west-counter', kind: 'market-counter', areaId: 'night-market', tiles: [
        { x: 41, y: 36, sprite: 'tile.counter-left', solid: true },
        { x: 42, y: 36, sprite: 'tile.counter-right', solid: true },
      ] }),
      objectFromTiles({ id: 'market-east-counter', kind: 'market-counter', areaId: 'night-market', tiles: [
        { x: 52, y: 34, sprite: 'tile.counter-left', solid: true },
        { x: 53, y: 34, sprite: 'tile.counter-right', solid: true },
      ] }),
      ...cars,
    ], bindings: [...club.bindings, ...arcade.bindings, ...studio.bindings, ...market.bindings],
    portals: [
      { id: 'from-residential', edge: 'west', tile: { x: 0, y: 24 }, destinationMapId: 'northwest_residential', destinationEntranceId: 'to-downtown' },
      { id: 'to-docks', edge: 'south', tile: { x: 32, y: 47 }, destinationMapId: 'southeast_docks', destinationEntranceId: 'from-downtown' },
    ],
    stagingTiles: [{ x: 1, y: 24 }, { x: 32, y: 46 }],
    spawns: {
      linda: { x: 18, y: 13 }, generic_resident: { x: 44, y: 34 }, devon_price: { x: 20, y: 13 },
      elise_moreau: { x: 46, y: 36 }, 'generic-meal': { x: 44, y: 34 }, 'generic-nightlife': { x: 18, y: 13 },
    },
    effects: [
      { id: 'club-neon-west', kind: 'neon', tile: { x: 16, y: 20 } },
      { id: 'club-neon-east', kind: 'neon', tile: { x: 22, y: 20 } },
    ],
  });
  map.doors = [
    { id: 'club-door', openingId: 'club-strip-entrance', initialState: 'open', sprite: 'tile.open-door' },
    { id: 'club-service-door', openingId: 'club-service-opening', initialState: 'closed-unlocked', sprite: 'tile.closed-door' },
    { id: 'arcade-door', openingId: 'arcade-row-entrance', initialState: 'open', sprite: 'tile.open-door' },
    { id: 'studio-door', openingId: 'studio-row-entrance', initialState: 'open', sprite: 'tile.open-door' },
    { id: 'market-door', openingId: 'night-market-entrance', initialState: 'open', sprite: 'tile.open-door' },
  ];
  map.startComposition = {
    cameraAnchor: { x: 19, y: 18 },
    requiredActorIds: ['linda', 'devon_price'],
    requiredDetailPartIds: [
      'club-west-sofa-part-01', 'club-west-sofa-part-02',
      'club-east-sofa-part-01', 'club-east-sofa-part-02',
      'club-entrance-neon-part-02', 'club-entrance-neon-part-03',
      'club-bar-part-01', 'club-bar-part-02',
      'club-dance-lights-part-01', 'club-dance-lights-part-02',
      'club-dance-lights-part-03', 'club-dance-lights-part-04',
      'club-dj-booth-part-01', 'club-dj-booth-part-02',
      'boulevard-car-02-part-01', 'boulevard-car-02-part-02',
    ],
    landmarkAreaIds: ['club-strip'],
  };
  return map;
}

function southwestMap(): WorldMapV2 {
  const hallShell = placeholderArea({
    id: 'market-hall', material: 'commercial', bounds: { x: 6, y: 7, width: 22, height: 14 },
    locationIds: ['sora_boutique'], signSprite: 'tile.sign-sunset-market',
  });
  const foodShell = placeholderArea({
    id: 'food-arcade', material: 'commercial', bounds: { x: 39, y: 7, width: 21, height: 14 },
    locationIds: [], signSprite: 'tile.sign-sunset-market',
  });
  const restaurantShell = placeholderArea({
    id: 'restaurant-row', material: 'commercial', bounds: { x: 39, y: 32, width: 21, height: 12 },
    locationIds: ['rafael_cafe'], signSprite: 'tile.sign-sunset-market',
  });
  const requiredPortalIds = ['from-residential', 'to-docks'] as const;
  const hallArea: WorldMapV2['areas'][number] = {
    ...hallShell.area,
    densityProfile: 'active-public',
    entranceTiles: [{ x: 17, y: 20 }],
    primaryRoutes: [{ x: 16, y: 9, width: 3, height: 11 }],
    requiredPortalIds: [...requiredPortalIds],
  };
  const foodArea: WorldMapV2['areas'][number] = {
    ...foodShell.area,
    densityProfile: 'active-public',
    entranceTiles: [{ x: 49, y: 20 }],
    primaryRoutes: [{ x: 48, y: 9, width: 3, height: 11 }],
    requiredPortalIds: [...requiredPortalIds],
  };
  const restaurantArea: WorldMapV2['areas'][number] = {
    ...restaurantShell.area,
    densityProfile: 'active-public',
    entranceTiles: [{ x: 49, y: 43 }],
    primaryRoutes: [{ x: 48, y: 33, width: 3, height: 10 }],
    requiredPortalIds: [...requiredPortalIds],
  };
  const courtyardArea: WorldMapV2['areas'][number] = {
    id: 'sunset-courtyard',
    bounds: { x: 4, y: 29, width: 26, height: 19 },
    densityProfile: 'active-public',
    intentionalOpenAreas: [],
    entranceTiles: [{ x: 28, y: 29 }],
    primaryRoutes: [
      { x: 27, y: 29, width: 3, height: 19 },
      { x: 4, y: 29, width: 26, height: 3 },
    ],
    requiredPortalIds: [...requiredPortalIds],
  };
  const solidRow = (
    id: string,
    kind: string,
    areaId: string,
    x: number,
    y: number,
    count: number,
    sprites: readonly string[],
  ): MapObject => objectFromTiles({
    id,
    kind,
    areaId,
    tiles: Array.from({ length: count }, (_unused, index) => ({
      x: x + index,
      y,
      sprite: sprites[index % sprites.length]!,
      solid: true,
    })),
  });
  const hallObjects = [
    solidRow('hall-counter-west', 'market-counter', 'market-hall', 8, 10, 6, ['tile.counter-left', 'tile.counter-right']),
    solidRow('hall-counter-east', 'market-counter', 'market-hall', 20, 10, 6, ['tile.counter-left', 'tile.counter-right']),
    solidRow('hall-display-west', 'produce-display', 'market-hall', 8, 15, 3, ['tile.produce-stall-left', 'tile.produce-stall-right']),
    solidRow('hall-display-east', 'produce-display', 'market-hall', 23, 15, 3, ['tile.produce-stall-left', 'tile.produce-stall-right']),
    solidRow('hall-bench-west', 'market-bench', 'market-hall', 10, 18, 3, ['tile.sunset-market-bench']),
    solidRow('hall-bench-east', 'market-bench', 'market-hall', 21, 18, 3, ['tile.sunset-market-bench']),
    objectFromTiles({ id: 'hall-flowering-planters', kind: 'flowering-planter', areaId: 'market-hall', tiles: [
      { x: 8, y: 12, sprite: 'tile.flowering-market-planter', solid: true },
      { x: 25, y: 12, sprite: 'tile.flowering-market-planter', solid: true },
      { x: 8, y: 17, sprite: 'tile.flowering-market-planter', solid: true },
      { x: 25, y: 17, sprite: 'tile.flowering-market-planter', solid: true },
    ] }),
  ];
  const foodObjects = [
    solidRow('food-counter-west', 'food-counter', 'food-arcade', 41, 10, 6, ['tile.counter-left', 'tile.counter-right']),
    solidRow('food-counter-east', 'food-counter', 'food-arcade', 52, 10, 6, ['tile.counter-left', 'tile.counter-right']),
    solidRow('food-stall-west', 'food-stall', 'food-arcade', 41, 15, 3, ['tile.food-stall-left', 'tile.food-stall-right']),
    solidRow('food-stall-east', 'food-stall', 'food-arcade', 54, 15, 3, ['tile.food-stall-left', 'tile.food-stall-right']),
    solidRow('food-bench-west', 'market-bench', 'food-arcade', 42, 18, 2, ['tile.sunset-market-bench']),
    solidRow('food-bench-east', 'market-bench', 'food-arcade', 55, 18, 2, ['tile.sunset-market-bench']),
    objectFromTiles({ id: 'food-flowering-planters', kind: 'flowering-planter', areaId: 'food-arcade', tiles: [
      { x: 41, y: 12, sprite: 'tile.flowering-market-planter', solid: true },
      { x: 57, y: 12, sprite: 'tile.flowering-market-planter', solid: true },
      { x: 41, y: 17, sprite: 'tile.flowering-market-planter', solid: true },
      { x: 57, y: 17, sprite: 'tile.flowering-market-planter', solid: true },
    ] }),
  ];
  const restaurantObjects = [
    solidRow('restaurant-counter-west', 'restaurant-counter', 'restaurant-row', 41, 35, 6, ['tile.counter-left', 'tile.counter-right']),
    solidRow('restaurant-counter-east', 'restaurant-counter', 'restaurant-row', 52, 35, 6, ['tile.counter-left', 'tile.counter-right']),
    solidRow('restaurant-table-west', 'restaurant-table', 'restaurant-row', 41, 39, 3, ['tile.table-left', 'tile.table-right']),
    solidRow('restaurant-table-east', 'restaurant-table', 'restaurant-row', 54, 39, 3, ['tile.table-left', 'tile.table-right']),
    solidRow('restaurant-bench-west', 'market-bench', 'restaurant-row', 42, 41, 1, ['tile.sunset-market-bench']),
    solidRow('restaurant-bench-east', 'market-bench', 'restaurant-row', 56, 41, 1, ['tile.sunset-market-bench']),
    objectFromTiles({ id: 'restaurant-flowering-planters', kind: 'flowering-planter', areaId: 'restaurant-row', tiles: [
      { x: 41, y: 37, sprite: 'tile.flowering-market-planter', solid: true },
      { x: 57, y: 37, sprite: 'tile.flowering-market-planter', solid: true },
    ] }),
  ];
  const courtyardObjects: MapObject[] = [
    objectFromTiles({ id: 'courtyard-canopy', kind: 'market-canopy', areaId: 'sunset-courtyard', tiles: [
      { x: 16, y: 32, sprite: 'tile.market-canopy-nw', solid: true },
      { x: 17, y: 32, sprite: 'tile.market-canopy-ne', solid: true },
      { x: 16, y: 33, sprite: 'tile.market-canopy-sw', solid: true },
      { x: 17, y: 33, sprite: 'tile.market-canopy-se', solid: true },
    ] }),
    ...[
      { id: 'courtyard-produce-west', x: 10, y: 34, sprites: ['tile.produce-stall-left', 'tile.produce-stall-right'] },
      { id: 'courtyard-produce-east', x: 13, y: 34, sprites: ['tile.produce-stall-left', 'tile.produce-stall-right'] },
      { id: 'courtyard-food-west', x: 10, y: 39, sprites: ['tile.food-stall-left', 'tile.food-stall-right'] },
      { id: 'courtyard-food-east', x: 13, y: 39, sprites: ['tile.food-stall-left', 'tile.food-stall-right'] },
    ].map(({ id, x, y, sprites }) => solidRow(id, 'market-stall', 'sunset-courtyard', x, y, 2, sprites)),
    objectFromTiles({ id: 'courtyard-fountain', kind: 'market-fountain', areaId: 'sunset-courtyard', tiles: [
      { x: 20, y: 34, sprite: 'tile.landmark-fountain-nw', solid: true },
      { x: 21, y: 34, sprite: 'tile.landmark-fountain-ne', solid: true },
      { x: 20, y: 35, sprite: 'tile.landmark-fountain-sw', solid: true },
      { x: 21, y: 35, sprite: 'tile.landmark-fountain-se', solid: true },
    ] }),
    objectFromTiles({ id: 'courtyard-planters', kind: 'flowering-planter', areaId: 'sunset-courtyard', tiles: [
      { x: 4, y: 32, sprite: 'tile.flowering-market-planter', solid: true },
      { x: 25, y: 35, sprite: 'tile.flowering-market-planter', solid: true },
      { x: 4, y: 43, sprite: 'tile.flowering-market-planter', solid: true },
      { x: 25, y: 44, sprite: 'tile.flowering-market-planter', solid: true },
    ] }),
    objectFromTiles({ id: 'courtyard-benches', kind: 'market-bench', areaId: 'sunset-courtyard', tiles: [
      { x: 19, y: 39, sprite: 'tile.sunset-market-bench', solid: true },
      { x: 23, y: 39, sprite: 'tile.sunset-market-bench', solid: true },
      { x: 19, y: 43, sprite: 'tile.sunset-market-bench', solid: true },
      { x: 23, y: 43, sprite: 'tile.sunset-market-bench', solid: true },
    ] }),
    objectFromTiles({ id: 'courtyard-dining-tables', kind: 'restaurant-table', areaId: 'sunset-courtyard', tiles: [
      { x: 20, y: 40, sprite: 'tile.table-left', solid: true },
      { x: 21, y: 40, sprite: 'tile.table-right', solid: true },
      { x: 20, y: 42, sprite: 'tile.table-left', solid: true },
      { x: 21, y: 42, sprite: 'tile.table-right', solid: true },
    ] }),
    objectFromTiles({ id: 'courtyard-edge-fixtures', kind: 'market-lights', areaId: 'sunset-courtyard', tiles: [
      { x: 8, y: 32, sprite: 'tile.fixture-lamp' }, { x: 12, y: 32, sprite: 'tile.fixture-lamp' },
      { x: 20, y: 32, sprite: 'tile.fixture-lamp' }, { x: 24, y: 32, sprite: 'tile.fixture-lamp' },
      { x: 8, y: 44, sprite: 'tile.fixture-lamp' }, { x: 12, y: 44, sprite: 'tile.fixture-lamp' },
      { x: 20, y: 44, sprite: 'tile.fixture-lamp' }, { x: 24, y: 44, sprite: 'tile.fixture-lamp' },
      { x: 8, y: 35, sprite: 'tile.flowering-market-planter' }, { x: 8, y: 41, sprite: 'tile.flowering-market-planter' },
      { x: 24, y: 35, sprite: 'tile.flowering-market-planter' }, { x: 24, y: 41, sprite: 'tile.flowering-market-planter' },
    ] }),
  ];
  const frontageObjects: MapObject[] = [
    objectFromTiles({ id: 'sunset-frontage-signs', kind: 'market-signage', areaId: 'market-hall', tiles: [
      { x: 16, y: 20, sprite: 'tile.sign-sunset-market' }, { x: 18, y: 20, sprite: 'tile.sign-sunset-market' },
      { x: 48, y: 20, sprite: 'tile.sign-sunset-market' }, { x: 50, y: 20, sprite: 'tile.sign-sunset-market' },
      { x: 48, y: 43, sprite: 'tile.sign-sunset-market' }, { x: 50, y: 43, sprite: 'tile.sign-sunset-market' },
    ] }),
    objectFromTiles({ id: 'sunset-doorway-lanterns', kind: 'festival-lantern', areaId: 'market-hall', tiles: [
      { x: 14, y: 21, sprite: 'tile.fixture-festival-lantern', solid: true },
      { x: 20, y: 21, sprite: 'tile.fixture-festival-lantern', solid: true },
      { x: 46, y: 21, sprite: 'tile.fixture-festival-lantern', solid: true },
      { x: 52, y: 21, sprite: 'tile.fixture-festival-lantern', solid: true },
      { x: 46, y: 44, sprite: 'tile.fixture-festival-lantern', solid: true },
      { x: 52, y: 44, sprite: 'tile.fixture-festival-lantern', solid: true },
    ] }),
    objectFromTiles({ id: 'sunset-promenade-lanterns', kind: 'festival-lantern', areaId: 'sunset-courtyard', tiles: [
      { x: 28, y: 6, sprite: 'tile.fixture-festival-lantern', solid: true },
      { x: 35, y: 6, sprite: 'tile.fixture-festival-lantern', solid: true },
      { x: 28, y: 18, sprite: 'tile.fixture-festival-lantern', solid: true },
      { x: 35, y: 18, sprite: 'tile.fixture-festival-lantern', solid: true },
      { x: 12, y: 22, sprite: 'tile.fixture-festival-lantern', solid: true },
      { x: 22, y: 22, sprite: 'tile.fixture-festival-lantern', solid: true },
      { x: 42, y: 22, sprite: 'tile.fixture-festival-lantern', solid: true },
      { x: 54, y: 22, sprite: 'tile.fixture-festival-lantern', solid: true },
      { x: 12, y: 28, sprite: 'tile.fixture-festival-lantern', solid: true },
      { x: 22, y: 28, sprite: 'tile.fixture-festival-lantern', solid: true },
      { x: 42, y: 28, sprite: 'tile.fixture-festival-lantern', solid: true },
      { x: 54, y: 28, sprite: 'tile.fixture-festival-lantern', solid: true },
    ] }),
    objectFromTiles({ id: 'sunset-flowering-palms', kind: 'large-flowering-palm', areaId: 'market-hall', tiles: [
      { x: 4, y: 5, sprite: 'tile.plant-palm', solid: true },
      { x: 28, y: 5, sprite: 'tile.plant-palm', solid: true },
      { x: 36, y: 5, sprite: 'tile.plant-palm', solid: true },
      { x: 62, y: 5, sprite: 'tile.plant-palm', solid: true },
    ] }),
  ];
  const map = commonMap({
    id: 'southwest_commercial', displayName: 'Saffron Bazaar', defaultSprite: 'tile.sunset-cobble',
    regions: [
      { id: 'northwest-market-apron', x: 3, y: 4, width: 27, height: 19, sprite: 'tile.sunset-paver' },
      { id: 'northeast-food-apron', x: 35, y: 4, width: 29, height: 19, sprite: 'tile.sunset-paver' },
      { id: 'southwest-courtyard-apron', x: 3, y: 28, width: 27, height: 20, sprite: 'tile.sunset-paver' },
      { id: 'southeast-restaurant-apron', x: 35, y: 28, width: 29, height: 20, sprite: 'tile.sunset-paver' },
      { id: 'east-west-promenade', x: 0, y: 23, width: 64, height: 5, sprite: 'tile.sunset-promenade' },
      { id: 'north-south-promenade', x: 30, y: 0, width: 5, height: 48, sprite: 'tile.sunset-promenade' },
      { id: 'central-market-mosaic', x: 28, y: 21, width: 9, height: 9, sprite: 'tile.sunset-mosaic' },
      { id: 'courtyard-market-rug', x: 7, y: 31, width: 19, height: 14, sprite: 'tile.sunset-mosaic' },
      { id: 'courtyard-customer-lane', x: 8, y: 36, width: 17, height: 3, sprite: 'tile.sunset-promenade' },
      { id: 'market-hall-floor', x: 6, y: 7, width: 22, height: 14, sprite: 'tile.sunset-floor' },
      { id: 'food-arcade-floor', x: 39, y: 7, width: 21, height: 14, sprite: 'tile.sunset-floor' },
      { id: 'restaurant-row-floor', x: 39, y: 32, width: 21, height: 12, sprite: 'tile.sunset-floor' },
    ],
    areas: [hallArea, foodArea, restaurantArea, courtyardArea],
    wallRuns: [...hallShell.wallRuns, ...foodShell.wallRuns, ...restaurantShell.wallRuns],
    objects: [...hallObjects, ...foodObjects, ...restaurantObjects, ...courtyardObjects, ...frontageObjects],
    bindings: [...hallShell.bindings, ...restaurantShell.bindings],
    portals: [
      { id: 'from-residential', edge: 'north', tile: { x: 32, y: 0 }, destinationMapId: 'northwest_residential', destinationEntranceId: 'to-commercial' },
      { id: 'to-docks', edge: 'east', tile: { x: 63, y: 24 }, destinationMapId: 'southeast_docks', destinationEntranceId: 'from-commercial' },
    ],
    stagingTiles: [{ x: 32, y: 1 }, { x: 62, y: 24 }],
    spawns: {
      linda: { x: 17, y: 16 }, generic_resident: { x: 44, y: 34 }, sora_tan: { x: 14, y: 14 },
      rafael_cruz: { x: 44, y: 36 }, 'linda-shop': { x: 17, y: 17 },
    },
    effects: [
      { id: 'courtyard-steam-west', kind: 'steam', tile: { x: 11, y: 34 } },
      { id: 'courtyard-steam-east', kind: 'steam', tile: { x: 14, y: 39 } },
      { id: 'courtyard-insects', kind: 'insects', tile: { x: 25, y: 35 } },
    ],
  });
  map.doors = [
    { id: 'market-hall-door', openingId: 'market-hall-entrance', initialState: 'open', sprite: 'tile.open-door' },
    { id: 'food-arcade-door', openingId: 'food-arcade-entrance', initialState: 'open', sprite: 'tile.open-door' },
    { id: 'restaurant-row-door', openingId: 'restaurant-row-entrance', initialState: 'open', sprite: 'tile.open-door' },
  ];
  map.startComposition = {
    cameraAnchor: { x: 17, y: 37 },
    requiredActorIds: ['linda', 'generic_resident'],
    requiredDetailPartIds: [
      'courtyard-canopy-part-01', 'courtyard-canopy-part-02',
      'courtyard-canopy-part-03', 'courtyard-canopy-part-04',
      'courtyard-fountain-part-01', 'courtyard-fountain-part-02',
      'courtyard-fountain-part-03', 'courtyard-fountain-part-04',
    ],
    landmarkAreaIds: ['market-hall', 'sunset-courtyard'],
  };
  return map;
}

function southeastMap(): WorldMapV2 {
  const government = placeholderArea({
    id: 'government-yard', material: 'civic', bounds: { x: 7, y: 7, width: 20, height: 13 },
    locationIds: ['priya_clinic'], signSprite: 'tile.sign-harbor',
  });
  const warehouse = placeholderArea({
    id: 'cargo-warehouse', material: 'civic', bounds: { x: 38, y: 7, width: 12, height: 13 },
    locationIds: [], signSprite: 'tile.sign-harbor',
  });
  const ferry = placeholderArea({
    id: 'ferry-terminal', material: 'civic', bounds: { x: 38, y: 30, width: 12, height: 10 },
    locationIds: ['ferry_terminal'], signSprite: 'tile.sign-harbor',
  });
  const ferryWallRuns = ferry.wallRuns.map((run) => run.id === 'ferry-terminal-east' ? {
    ...run,
    openings: [{ id: 'ferry-boarding-opening', tile: { x: 49, y: 34 } }],
  } : run);
  const solidRow = (x: number, y: number, count: number, sprites: readonly string[]): ObjectTile[] => (
    Array.from({ length: count }, (_unused, offset) => ({
      x: x + offset,
      y,
      sprite: sprites[offset % sprites.length]!,
      solid: true,
    }))
  );
  const cargoStacks = [
    { id: 'cargo-stack-01', x: 5, y: 31, areaId: 'cargo-yard' },
    { id: 'cargo-stack-02', x: 10, y: 35, areaId: 'cargo-yard' },
    { id: 'cargo-stack-03', x: 5, y: 39, areaId: 'cargo-yard' },
    { id: 'cargo-stack-04', x: 23, y: 37, areaId: 'cargo-yard' },
    { id: 'cargo-stack-05', x: 38, y: 3, areaId: 'cargo-warehouse' },
    { id: 'cargo-stack-06', x: 47, y: 22, areaId: 'cargo-warehouse' },
  ].map(({ id, x, y, areaId }) => objectFromTiles({
    id,
    kind: 'cargo-stack',
    areaId,
    tiles: [
      { x, y, sprite: 'tile.cargo-stack-left', solid: true },
      { x: x + 1, y, sprite: 'tile.cargo-stack-right', solid: true },
    ],
  }));
  const bollards = [
    { x: 51, y: 9 }, { x: 51, y: 11 }, { x: 59, y: 9 }, { x: 59, y: 11 },
    { x: 51, y: 33 }, { x: 51, y: 35 }, { x: 59, y: 33 }, { x: 59, y: 35 },
  ].map((tile, index) => objectFromTiles({
    id: `mooring-bollard-${String(index + 1).padStart(2, '0')}`,
    kind: 'mooring-bollard',
    areaId: 'ferry-terminal',
    tiles: [{ ...tile, sprite: 'tile.mooring-bollard', solid: true }],
  }));
  const map = commonMap({
    id: 'southeast_docks', displayName: 'Greywake Harbor', defaultSprite: 'tile.harbor-yard',
    regions: [
      { id: 'government-apron', x: 4, y: 5, width: 26, height: 18, sprite: 'tile.harbor-concrete' },
      { id: 'quay-apron', x: 35, y: 0, width: 17, height: 48, sprite: 'tile.harbor-quay' },
      { id: 'west-portal-walk', x: 0, y: 20, width: 7, height: 3, sprite: 'tile.harbor-concrete' },
      { id: 'main-service-road', x: 0, y: 23, width: 52, height: 5, sprite: 'tile.dock-route' },
      { id: 'north-south-service-road', x: 30, y: 0, width: 5, height: 48, sprite: 'tile.dock-route' },
      { id: 'harbor-water', x: 52, y: 0, width: 12, height: 48, sprite: 'tile.harbor-water' },
      { id: 'north-pier', x: 50, y: 9, width: 12, height: 3, sprite: 'tile.dock-boardwalk' },
      { id: 'ferry-pier', x: 50, y: 33, width: 12, height: 3, sprite: 'tile.dock-boardwalk' },
      { id: 'government-floor', x: 7, y: 7, width: 20, height: 13, sprite: 'tile.dock-floor' },
      { id: 'warehouse-floor', x: 38, y: 7, width: 12, height: 13, sprite: 'tile.dock-floor' },
      { id: 'ferry-floor', x: 38, y: 30, width: 12, height: 10, sprite: 'tile.dock-floor' },
      { id: 'ferry-ticketing-zone', x: 39, y: 36, width: 5, height: 3, sprite: 'tile.harbor-concrete' },
      { id: 'ferry-boarding-lane', x: 45, y: 31, width: 4, height: 8, sprite: 'tile.harbor-concrete' },
      { id: 'cargo-work-pad', x: 10, y: 29, width: 18, height: 13, sprite: 'tile.harbor-concrete' },
    ],
    terrainSolids: [
      { id: 'deep-harbor-north', kind: 'water', bounds: { x: 52, y: 0, width: 12, height: 9 } },
      { id: 'deep-harbor-north-edge', kind: 'water', bounds: { x: 62, y: 9, width: 2, height: 3 } },
      { id: 'deep-harbor-middle', kind: 'water', bounds: { x: 52, y: 12, width: 12, height: 21 } },
      { id: 'deep-harbor-ferry-edge', kind: 'water', bounds: { x: 62, y: 33, width: 2, height: 3 } },
      { id: 'deep-harbor-south', kind: 'water', bounds: { x: 52, y: 36, width: 12, height: 12 } },
    ],
    areas: [
      {
        ...government.area,
        densityProfile: 'active-public',
        entranceTiles: [{ x: 17, y: 19 }],
        primaryRoutes: [{ x: 16, y: 9, width: 3, height: 10 }],
        requiredPortalIds: ['from-downtown', 'from-commercial'],
      },
      {
        ...warehouse.area,
        densityProfile: 'service-docks',
        entranceTiles: [{ x: 44, y: 19 }],
        primaryRoutes: [{ x: 43, y: 9, width: 3, height: 10 }],
        requiredPortalIds: ['from-downtown', 'from-commercial'],
      },
      {
        ...ferry.area,
        densityProfile: 'active-public',
        entranceTiles: [{ x: 44, y: 39 }],
        primaryRoutes: [{ x: 43, y: 31, width: 3, height: 8 }],
        requiredPortalIds: ['from-downtown', 'from-commercial'],
      },
      {
        id: 'cargo-yard',
        bounds: { x: 3, y: 28, width: 27, height: 16 },
        densityProfile: 'service-docks',
        intentionalOpenAreas: [],
        entranceTiles: [{ x: 28, y: 28 }],
        primaryRoutes: [
          { x: 28, y: 28, width: 2, height: 16 },
          { x: 16, y: 28, width: 14, height: 3 },
        ],
        requiredPortalIds: ['from-downtown', 'from-commercial'],
      },
    ],
    wallRuns: [...government.wallRuns, ...warehouse.wallRuns, ...ferryWallRuns],
    objects: [
      objectFromTiles({ id: 'government-west-counter', kind: 'office-counter', areaId: 'government-yard', tiles: solidRow(9, 10, 6, ['tile.counter-left', 'tile.counter-right']) }),
      objectFromTiles({ id: 'government-east-counter', kind: 'office-counter', areaId: 'government-yard', tiles: solidRow(19, 10, 6, ['tile.counter-left', 'tile.counter-right']) }),
      objectFromTiles({ id: 'government-west-desk', kind: 'office-desk', areaId: 'government-yard', tiles: solidRow(9, 15, 2, ['tile.table-left', 'tile.table-right']) }),
      objectFromTiles({ id: 'government-east-desk', kind: 'office-desk', areaId: 'government-yard', tiles: solidRow(23, 15, 2, ['tile.table-left', 'tile.table-right']) }),
      objectFromTiles({ id: 'government-waiting-bench', kind: 'waiting-bench', areaId: 'government-yard', tiles: solidRow(11, 17, 2, ['tile.dock-bench']) }),
      objectFromTiles({ id: 'government-east-bench', kind: 'waiting-bench', areaId: 'government-yard', tiles: solidRow(21, 17, 3, ['tile.dock-bench']) }),
      objectFromTiles({ id: 'government-frontage', kind: 'harbor-frontage', areaId: 'government-yard', tiles: [
        { x: 16, y: 19, sprite: 'tile.sign-harbor' },
        { x: 18, y: 19, sprite: 'tile.sign-harbor' },
        { x: 14, y: 20, sprite: 'tile.fixture-dock-lamp-cold', solid: true },
        { x: 20, y: 20, sprite: 'tile.fixture-dock-lamp-cold', solid: true },
      ] }),
      objectFromTiles({ id: 'warehouse-northwest-cargo', kind: 'warehouse-cargo', areaId: 'cargo-warehouse', tiles: solidRow(39, 9, 3, ['tile.cargo-stack-left', 'tile.cargo-stack-right']) }),
      objectFromTiles({ id: 'warehouse-northeast-cargo', kind: 'warehouse-cargo', areaId: 'cargo-warehouse', tiles: solidRow(46, 9, 3, ['tile.cargo-stack-left', 'tile.cargo-stack-right']) }),
      objectFromTiles({ id: 'warehouse-southwest-cargo', kind: 'warehouse-cargo', areaId: 'cargo-warehouse', tiles: solidRow(39, 14, 3, ['tile.cargo-stack-left', 'tile.cargo-stack-right']) }),
      objectFromTiles({ id: 'warehouse-southeast-cargo', kind: 'warehouse-cargo', areaId: 'cargo-warehouse', tiles: solidRow(46, 14, 3, ['tile.cargo-stack-left', 'tile.cargo-stack-right']) }),
      objectFromTiles({ id: 'warehouse-west-lockers', kind: 'warehouse-lockers', areaId: 'cargo-warehouse', tiles: solidRow(39, 17, 2, ['tile.counter-left', 'tile.counter-right']) }),
      objectFromTiles({ id: 'warehouse-east-lockers', kind: 'warehouse-lockers', areaId: 'cargo-warehouse', tiles: solidRow(47, 17, 2, ['tile.counter-left', 'tile.counter-right']) }),
      objectFromTiles({ id: 'warehouse-frontage', kind: 'harbor-frontage', areaId: 'cargo-warehouse', tiles: [
        { x: 43, y: 19, sprite: 'tile.sign-harbor' },
        { x: 45, y: 19, sprite: 'tile.sign-harbor' },
        { x: 41, y: 20, sprite: 'tile.fixture-dock-lamp-cold', solid: true },
        { x: 47, y: 20, sprite: 'tile.fixture-dock-lamp-cold', solid: true },
      ] }),
      objectFromTiles({ id: 'ferry-west-bench', kind: 'waiting-bench', areaId: 'ferry-terminal', tiles: solidRow(39, 32, 2, ['tile.dock-bench']) }),
      objectFromTiles({ id: 'ferry-east-bench', kind: 'waiting-bench', areaId: 'ferry-terminal', tiles: solidRow(46, 32, 2, ['tile.dock-bench']) }),
      objectFromTiles({ id: 'ferry-south-bench', kind: 'waiting-bench', areaId: 'ferry-terminal', tiles: solidRow(39, 35, 2, ['tile.dock-bench']) }),
      objectFromTiles({ id: 'ferry-counter', kind: 'ticket-counter', areaId: 'ferry-terminal', tiles: solidRow(39, 37, 3, ['tile.counter-left', 'tile.counter-right']) }),
      objectFromTiles({ id: 'ferry-kiosk', kind: 'ticket-kiosk', areaId: 'ferry-terminal', tiles: [{ x: 48, y: 37, sprite: 'tile.sign-harbor' }] }),
      objectFromTiles({ id: 'ferry-frontage', kind: 'harbor-frontage', areaId: 'ferry-terminal', tiles: [
        { x: 43, y: 39, sprite: 'tile.sign-harbor' },
        { x: 45, y: 39, sprite: 'tile.sign-harbor' },
        { x: 47, y: 40, sprite: 'tile.fixture-dock-lamp-cold', solid: true },
        { x: 49, y: 40, sprite: 'tile.fixture-dock-lamp-cold', solid: true },
      ] }),
      objectFromTiles({ id: 'ferry-boarding-gate', kind: 'boarding-gate', areaId: 'ferry-terminal', tiles: [
        { x: 47, y: 33, sprite: 'tile.sign-harbor' },
        { x: 48, y: 33, sprite: 'tile.fixture-dock-lamp-cold' },
        { x: 47, y: 35, sprite: 'tile.sign-harbor' },
        { x: 48, y: 35, sprite: 'tile.fixture-dock-lamp-cold' },
      ] }),
      objectFromTiles({ id: 'cargo-crane', kind: 'cargo-crane', areaId: 'cargo-yard', tiles: [
        { x: 20, y: 32, sprite: 'tile.cargo-crane-nw', solid: true },
        { x: 21, y: 32, sprite: 'tile.cargo-crane-ne', solid: true },
        { x: 20, y: 33, sprite: 'tile.cargo-crane-sw', solid: true },
        { x: 21, y: 33, sprite: 'tile.cargo-crane-se', solid: true },
      ] }),
      ...cargoStacks,
      objectFromTiles({ id: 'pallet-rack-west', kind: 'pallet-rack', areaId: 'cargo-yard', tiles: [
        { x: 13, y: 31, sprite: 'tile.pallet-rack-nw', solid: true },
        { x: 14, y: 31, sprite: 'tile.pallet-rack-ne', solid: true },
        { x: 13, y: 32, sprite: 'tile.pallet-rack-sw', solid: true },
        { x: 14, y: 32, sprite: 'tile.pallet-rack-se', solid: true },
      ] }),
      objectFromTiles({ id: 'pallet-rack-south', kind: 'pallet-rack', areaId: 'cargo-yard', tiles: [
        { x: 16, y: 38, sprite: 'tile.pallet-rack-nw', solid: true },
        { x: 17, y: 38, sprite: 'tile.pallet-rack-ne', solid: true },
        { x: 16, y: 39, sprite: 'tile.pallet-rack-sw', solid: true },
        { x: 17, y: 39, sprite: 'tile.pallet-rack-se', solid: true },
      ] }),
      objectFromTiles({ id: 'yard-supplies-northwest', kind: 'yard-supplies', areaId: 'cargo-yard', tiles: solidRow(9, 32, 2, ['tile.cargo-stack-left', 'tile.cargo-stack-right']) }),
      objectFromTiles({ id: 'yard-supplies-south', kind: 'yard-supplies', areaId: 'cargo-yard', tiles: solidRow(20, 39, 2, ['tile.cargo-stack-left', 'tile.cargo-stack-right']) }),
      objectFromTiles({ id: 'yard-supplies-west', kind: 'yard-supplies', areaId: 'cargo-yard', tiles: solidRow(8, 42, 2, ['tile.cargo-stack-left', 'tile.cargo-stack-right']) }),
      objectFromTiles({ id: 'cargo-warning-lamps', kind: 'warning-lamps', areaId: 'cargo-yard', tiles: [
        { x: 27, y: 32, sprite: 'tile.fixture-dock-lamp-amber', solid: true },
        { x: 27, y: 40, sprite: 'tile.fixture-dock-lamp-amber', solid: true },
      ] }),
      objectFromTiles({ id: 'cargo-route-lamps', kind: 'route-lamps', areaId: 'cargo-yard', tiles: [
        { x: 4, y: 31, sprite: 'tile.fixture-dock-lamp-amber' },
        { x: 4, y: 34, sprite: 'tile.fixture-dock-lamp-amber' },
        { x: 4, y: 38, sprite: 'tile.fixture-dock-lamp-amber' },
        { x: 4, y: 42, sprite: 'tile.fixture-dock-lamp-amber' },
        { x: 26, y: 31, sprite: 'tile.fixture-dock-lamp-amber' },
        { x: 26, y: 34, sprite: 'tile.fixture-dock-lamp-amber' },
        { x: 26, y: 37, sprite: 'tile.fixture-dock-lamp-amber' },
        { x: 26, y: 42, sprite: 'tile.fixture-dock-lamp-amber' },
      ] }),
      ...bollards,
      objectFromTiles({ id: 'quay-cold-lamps', kind: 'dock-lamps', areaId: 'ferry-terminal', tiles: [
        { x: 50, y: 4, sprite: 'tile.fixture-dock-lamp-cold', solid: true },
        { x: 50, y: 16, sprite: 'tile.fixture-dock-lamp-cold', solid: true },
        { x: 50, y: 29, sprite: 'tile.fixture-dock-lamp-cold', solid: true },
        { x: 50, y: 42, sprite: 'tile.fixture-dock-lamp-cold', solid: true },
      ] }),
      objectFromTiles({ id: 'quay-north-supplies', kind: 'quay-supplies', areaId: 'cargo-warehouse', tiles: solidRow(43, 3, 2, ['tile.cargo-stack-left', 'tile.cargo-stack-right']) }),
      objectFromTiles({ id: 'quay-south-supplies', kind: 'quay-supplies', areaId: 'ferry-terminal', tiles: solidRow(38, 45, 4, ['tile.cargo-stack-left', 'tile.cargo-stack-right']) }),
      objectFromTiles({ id: 'ferry-landmark', kind: 'ferry', areaId: 'ferry-terminal', tiles: [
        { x: 54, y: 36, sprite: 'tile.landmark-ferry-left' },
        { x: 55, y: 36, sprite: 'tile.landmark-ferry-left' },
        { x: 56, y: 36, sprite: 'tile.landmark-ferry-right' },
        { x: 57, y: 36, sprite: 'tile.landmark-ferry-right' },
      ] }),
    ],
    bindings: [
      ...government.bindings,
      ...ferry.bindings,
      { locationId: 'tomas_marina', areaIds: ['ferry-terminal'], preferredInteractionIds: [] },
    ],
    portals: [
      { id: 'from-downtown', edge: 'north', tile: { x: 32, y: 0 }, destinationMapId: 'northeast_downtown', destinationEntranceId: 'to-docks' },
      { id: 'from-commercial', edge: 'west', tile: { x: 0, y: 24 }, destinationMapId: 'southwest_commercial', destinationEntranceId: 'to-docks' },
    ],
    stagingTiles: [{ x: 32, y: 1 }, { x: 1, y: 24 }],
    spawns: {
      linda: { x: 12, y: 14 }, generic_resident: { x: 39, y: 34 }, priya_nair: { x: 12, y: 12 },
      tomas_reed: { x: 41, y: 34 },
    },
    effects: [
      { id: 'yard-steam', kind: 'steam', tile: { x: 21, y: 32 } },
      { id: 'harbor-water-glint-north', kind: 'water', tile: { x: 55, y: 30 } },
      { id: 'harbor-water-glint-south', kind: 'water', tile: { x: 53, y: 40 } },
    ],
  });
  map.doors = [
    { id: 'government-door', openingId: 'government-yard-entrance', initialState: 'open', sprite: 'tile.open-door' },
    { id: 'warehouse-door', openingId: 'cargo-warehouse-entrance', initialState: 'open', sprite: 'tile.open-door' },
    { id: 'ferry-door', openingId: 'ferry-terminal-entrance', initialState: 'open', sprite: 'tile.open-door' },
    { id: 'ferry-boarding-door', openingId: 'ferry-boarding-opening', initialState: 'open', sprite: 'tile.open-door' },
  ];
  map.startComposition = {
    cameraAnchor: { x: 48, y: 34 },
    requiredActorIds: ['generic_resident', 'tomas_reed'],
    requiredDetailPartIds: [
      'ferry-boarding-gate-part-01', 'ferry-boarding-gate-part-02',
      'ferry-boarding-gate-part-03', 'ferry-boarding-gate-part-04',
      'ferry-landmark-part-01', 'ferry-landmark-part-04',
      'ferry-east-bench-part-01', 'ferry-east-bench-part-02',
    ],
    landmarkAreaIds: ['ferry-terminal'],
  };
  return map;
}
/**
 * The twelve cubicle modules, derived from the grid rather than hand-listed.
 *
 * A module is 6 wide by 4 deep. East partitions are SHARED: column n's east wall at `west + 5` is
 * column n+1's west wall, so it is placed once by whichever module reaches it first. Hand-listing
 * ninety-six part ids in the builder and again in a test is how a shared wall silently becomes two
 * boxes stacked in one cell, which reads as a thicker wall on exactly one column.
 *
 * The south face is deliberately open. That is the aisle, and it is how a clerk walks in.
 */
const CUBICLE_COLUMN_WEST = [8, 13, 18, 23] as const;
const CUBICLE_ROW_NORTH = [8, 13, 18] as const;

type CubicleModule = Readonly<{
  id: string;
  standTile: TilePoint;
  objects: readonly MapObject[];
}>;

function cubicleModules(): readonly CubicleModule[] {
  const placedPartitions = new Set<string>();
  const modules: CubicleModule[] = [];
  for (const [rowIndex, north] of CUBICLE_ROW_NORTH.entries()) {
    for (const [columnIndex, west] of CUBICLE_COLUMN_WEST.entries()) {
      const id = `cubicle-r${rowIndex}c${columnIndex}`;
      const partitionTiles: ObjectTile[] = [];
      const claim = (x: number, y: number, sprite: string): void => {
        const key = `${x},${y}`;
        if (placedPartitions.has(key)) return;
        placedPartitions.add(key);
        partitionTiles.push({ x, y, sprite, solid: true });
      };
      for (let offset = 1; offset <= 4; offset += 1) {
        claim(west + offset, north, 'tile.cubicle-partition-h');
      }
      for (let offset = 1; offset <= 3; offset += 1) {
        claim(west, north + offset, 'tile.cubicle-partition-v');
        claim(west + 5, north + offset, 'tile.cubicle-partition-v');
      }
      modules.push({
        id,
        standTile: { x: west + 2, y: north + 2 },
        objects: [
          objectFromTiles({
            id: `${id}-north`, kind: 'cubicle-partition', areaId: 'cubicle-floor',
            tiles: partitionTiles,
          }),
          objectFromTiles({
            id: `${id}-desk`, kind: 'desk', areaId: 'cubicle-floor',
            tiles: [
              { x: west + 1, y: north + 1, sprite: 'tile.table-left', solid: true },
              { x: west + 2, y: north + 1, sprite: 'tile.table-right', solid: true },
            ],
          }),
          objectFromTiles({
            id: `${id}-filing`, kind: 'filing', areaId: 'cubicle-floor',
            tiles: [{ x: west + 4, y: north + 1, sprite: 'tile.counter-left', solid: true }],
          }),
          // The panel is NOT solid and deliberately shares the desk's cell. It is a ceiling
          // fixture: the desk owns the furniture, the panel owns the light above it.
          objectFromTiles({
            id: `${id}-ceiling`, kind: 'ceiling-fixture', areaId: 'cubicle-floor',
            tiles: [{ x: west + 2, y: north + 1, sprite: 'tile.fixture-ceiling-panel' }],
          }),
        ],
      });
    }
  }
  return modules;
}

/** Ceiling panels outside the cubicle farm. Spec 10.6, one object per area so density counts it. */
function ceilingPanels(
  id: string,
  areaId: string,
  tiles: readonly TilePoint[],
): MapObject {
  return objectFromTiles({
    id, kind: 'ceiling-fixture', areaId,
    tiles: tiles.map((tile) => ({ ...tile, sprite: 'tile.fixture-ceiling-panel' })),
  });
}

/**
 * The Ledger Annex: a parking strip on the east, one office building filling the west.
 *
 * Seven areas, one building. `measureAndValidateDensity` runs its whole gate PER AREA, so each of
 * the six interior areas has to clear `objectSolidRatio` 0.08-0.30 and `detailRatio` 0.12 on its
 * own bounds — the outer shell runs sit outside every one of them and count for nothing.
 *
 * Every large walkable rectangle is declared in `intentionalOpenAreas`. That is not a formality:
 * the aisles, the door-to-desk walk and the service corridor are all bigger than 6x6, and an
 * undeclared one fails the build rather than the eye.
 */
function westMap(): WorldMapV2 {
  const modules = cubicleModules();
  const lotFixtures = objectFromTiles({
    id: 'annex-lot-fixtures', kind: 'lot-fixtures', areaId: 'annex-lot',
    tiles: [
      { x: 56, y: 10, sprite: 'tile.parked-car-cyan-left', solid: true },
      { x: 57, y: 10, sprite: 'tile.parked-car-cyan-right', solid: true },
      { x: 56, y: 36, sprite: 'tile.parked-car-coral-left', solid: true },
      { x: 57, y: 36, sprite: 'tile.parked-car-coral-right', solid: true },
      { x: 58, y: 22, sprite: 'tile.sign-civic', solid: true },
      { x: 55, y: 20, sprite: 'tile.fixture-planter', solid: true },
      { x: 55, y: 28, sprite: 'tile.fixture-planter' },
      // The spec's lot is seven cells; the placeholder gate wants eight. This is the eighth.
      { x: 58, y: 30, sprite: 'tile.fixture-lamp' },
    ],
  });
  // Aisle troffers, between the module rows rather than inside them.
  //
  // Twelve panels one-per-cubicle light the desks and leave the walkways between them dark, which
  // measures as pooling 2.04 against a 1.9 ceiling. The spec's own instruction for that reading is
  // to add a panel rather than lift the hemisphere, and the aisles are exactly where the light is
  // missing. Not solid, so they do not narrow the walkway they light.
  const aisleCeiling = ceilingPanels('annex-ceiling-aisles', 'cubicle-floor', [
    { x: 10, y: 12 }, { x: 16, y: 12 }, { x: 22, y: 12 },
    { x: 10, y: 17 }, { x: 16, y: 17 }, { x: 22, y: 17 },
  ]);
  const corridorFixtures = [
    objectFromTiles({
      id: 'annex-copier', kind: 'copier', areaId: 'cubicle-floor',
      tiles: [
        { x: 36, y: 9, sprite: 'tile.counter-left', solid: true },
        { x: 37, y: 9, sprite: 'tile.counter-right', solid: true },
      ],
    }),
    objectFromTiles({
      id: 'annex-corridor-planter', kind: 'planter', areaId: 'cubicle-floor',
      tiles: [{ x: 32, y: 9, sprite: 'tile.fixture-planter', solid: true }],
    }),
    objectFromTiles({
      id: 'annex-corridor-sign', kind: 'sign', areaId: 'cubicle-floor',
      tiles: [{ x: 40, y: 10, sprite: 'tile.sign-civic', solid: true }],
    }),
  ];
  // The hall is 37x5, and `furnished-interior` wants a solid-object ratio of at least 0.08 on
  // those 185 cells. A bare corridor scores 0.016. Six bench pairs along the north wall and five
  // planters carry it without closing the spine: y = 24 stays clear end to end, and y = 26 stays
  // clear at x = 24, which is the only route south to the lower rooms.
  const hallFixtures = [
    objectFromTiles({
      id: 'annex-hall-benches', kind: 'bench', areaId: 'annex-hall',
      tiles: [10, 16, 22, 28, 34, 40].flatMap((west) => [
        { x: west, y: 22, sprite: 'tile.counter-left', solid: true },
        { x: west + 1, y: 22, sprite: 'tile.counter-right', solid: true },
      ]),
    }),
    objectFromTiles({
      id: 'annex-hall-planters', kind: 'planter', areaId: 'annex-hall',
      tiles: [
        { x: 12, y: 23, sprite: 'tile.fixture-planter', solid: true },
        { x: 30, y: 23, sprite: 'tile.fixture-planter', solid: true },
        { x: 42, y: 23, sprite: 'tile.fixture-planter', solid: true },
        { x: 8, y: 25, sprite: 'tile.fixture-planter', solid: true },
        { x: 36, y: 25, sprite: 'tile.fixture-planter', solid: true },
      ],
    }),
    ceilingPanels('annex-ceiling-hall', 'annex-hall', [
      { x: 18, y: 23 }, { x: 28, y: 23 }, { x: 38, y: 23 },
      { x: 13, y: 25 }, { x: 21, y: 25 }, { x: 33, y: 25 }, { x: 41, y: 25 },
      { x: 9, y: 23 }, { x: 24, y: 23 },
    ]),
  ];
  const managerFixtures = [
    objectFromTiles({
      id: 'manager-desk', kind: 'desk', areaId: 'manager-office',
      tiles: [
        { x: 11, y: 30, sprite: 'tile.table-left', solid: true },
        { x: 12, y: 30, sprite: 'tile.table-right', solid: true },
      ],
    }),
    objectFromTiles({
      id: 'manager-filing', kind: 'filing', areaId: 'manager-office',
      tiles: [
        { x: 8, y: 29, sprite: 'tile.counter-left', solid: true },
        { x: 9, y: 29, sprite: 'tile.counter-right', solid: true },
        { x: 10, y: 29, sprite: 'tile.counter-left', solid: true },
      ],
    }),
    objectFromTiles({
      id: 'manager-sofa', kind: 'sofa', areaId: 'manager-office',
      tiles: [
        { x: 14, y: 37, sprite: 'tile.sofa-left', solid: true },
        { x: 15, y: 37, sprite: 'tile.sofa-right', solid: true },
      ],
      interactions: [{ id: 'manager-sofa-seat', kind: 'social', approachTiles: [{ x: 14, y: 38 }] }],
    }),
    objectFromTiles({
      id: 'manager-meeting-table', kind: 'table', areaId: 'manager-office',
      tiles: [
        { x: 15, y: 34, sprite: 'tile.table-left', solid: true },
        { x: 16, y: 34, sprite: 'tile.table-right', solid: true },
      ],
      interactions: [{ id: 'manager-meeting-seat', kind: 'social', approachTiles: [{ x: 15, y: 35 }] }],
    }),
    objectFromTiles({
      id: 'manager-shelves', kind: 'filing', areaId: 'manager-office',
      tiles: [
        { x: 17, y: 35, sprite: 'tile.counter-left', solid: true },
        { x: 17, y: 36, sprite: 'tile.counter-right', solid: true },
        { x: 17, y: 37, sprite: 'tile.counter-left', solid: true },
      ],
    }),
    objectFromTiles({
      id: 'manager-planter', kind: 'planter', areaId: 'manager-office',
      tiles: [
        { x: 17, y: 29, sprite: 'tile.fixture-planter', solid: true },
        { x: 8, y: 39, sprite: 'tile.fixture-planter', solid: true },
        { x: 18, y: 39, sprite: 'tile.fixture-planter', solid: true },
        { x: 11, y: 39, sprite: 'tile.fixture-planter', solid: true },
      ],
    }),
    ceilingPanels('annex-ceiling-manager', 'manager-office', [
      { x: 13, y: 33 }, { x: 9, y: 36 }, { x: 17, y: 33 },
      { x: 11, y: 35 }, { x: 15, y: 31 }, { x: 9, y: 32 },
    ]),
  ];
  const coolerFixtures = [
    objectFromTiles({
      id: 'cooler-station', kind: 'cooler', areaId: 'cooler-nook',
      tiles: [{ x: 24, y: 30, sprite: 'tile.water-cooler', solid: true }],
    }),
    objectFromTiles({
      id: 'cooler-planters', kind: 'planter', areaId: 'cooler-nook',
      tiles: [
        { x: 22, y: 28, sprite: 'tile.fixture-planter', solid: true },
        { x: 26, y: 28, sprite: 'tile.fixture-planter', solid: true },
        { x: 22, y: 33, sprite: 'tile.fixture-planter', solid: true },
        { x: 27, y: 37, sprite: 'tile.fixture-planter', solid: true },
        { x: 22, y: 39, sprite: 'tile.fixture-planter', solid: true },
        { x: 27, y: 31, sprite: 'tile.fixture-planter', solid: true },
        { x: 23, y: 39, sprite: 'tile.fixture-planter', solid: true },
      ],
    }),
    objectFromTiles({
      id: 'cooler-storage', kind: 'counter', areaId: 'cooler-nook',
      tiles: [
        { x: 25, y: 37, sprite: 'tile.counter-left', solid: true },
        { x: 26, y: 37, sprite: 'tile.counter-right', solid: true },
      ],
    }),
    ceilingPanels('annex-ceiling-cooler', 'cooler-nook', [
      { x: 24, y: 31 }, { x: 26, y: 33 }, { x: 24, y: 38 }, { x: 22, y: 35 }, { x: 27, y: 29 },
    ]),
  ];
  const kitchenFixtures = [
    objectFromTiles({
      id: 'kitchen-counter', kind: 'counter', areaId: 'annex-kitchen',
      tiles: [
        { x: 31, y: 28, sprite: 'tile.counter-left', solid: true },
        { x: 32, y: 28, sprite: 'tile.counter-right', solid: true },
        { x: 33, y: 28, sprite: 'tile.counter-left', solid: true },
        { x: 34, y: 28, sprite: 'tile.counter-right', solid: true },
      ],
    }),
    objectFromTiles({
      id: 'kitchen-table', kind: 'table', areaId: 'annex-kitchen',
      tiles: [
        { x: 34, y: 33, sprite: 'tile.table-left', solid: true },
        { x: 35, y: 33, sprite: 'tile.table-right', solid: true },
      ],
      interactions: [{ id: 'kitchen-table-seat', kind: 'social', approachTiles: [{ x: 34, y: 34 }] }],
    }),
    objectFromTiles({
      id: 'kitchen-planters', kind: 'planter', areaId: 'annex-kitchen',
      tiles: [
        { x: 31, y: 36, sprite: 'tile.fixture-planter', solid: true },
        { x: 40, y: 36, sprite: 'tile.fixture-planter', solid: true },
        { x: 40, y: 28, sprite: 'tile.fixture-planter', solid: true },
        { x: 34, y: 39, sprite: 'tile.fixture-planter', solid: true },
        { x: 42, y: 33, sprite: 'tile.fixture-planter', solid: true },
      ],
    }),
    objectFromTiles({
      id: 'kitchen-appliances', kind: 'counter', areaId: 'annex-kitchen',
      tiles: [
        { x: 37, y: 28, sprite: 'tile.counter-left', solid: true },
        { x: 38, y: 28, sprite: 'tile.counter-right', solid: true },
        { x: 39, y: 28, sprite: 'tile.counter-left', solid: true },
      ],
    }),
    objectFromTiles({
      id: 'kitchen-second-table', kind: 'table', areaId: 'annex-kitchen',
      tiles: [
        { x: 37, y: 36, sprite: 'tile.table-left', solid: true },
        { x: 38, y: 36, sprite: 'tile.table-right', solid: true },
      ],
      interactions: [{ id: 'kitchen-second-seat', kind: 'social', approachTiles: [{ x: 37, y: 37 }] }],
    }),
    ceilingPanels('annex-ceiling-kitchen', 'annex-kitchen', [
      { x: 33, y: 31 }, { x: 39, y: 35 }, { x: 37, y: 31 },
      { x: 31, y: 33 }, { x: 35, y: 38 }, { x: 41, y: 30 }, { x: 38, y: 33 },
    ]),
  ];
  const lobbyFixtures = [
    objectFromTiles({
      id: 'lobby-reception', kind: 'counter', areaId: 'annex-lobby',
      tiles: [
        { x: 46, y: 22, sprite: 'tile.counter-left', solid: true },
        { x: 46, y: 23, sprite: 'tile.counter-right', solid: true },
        { x: 46, y: 24, sprite: 'tile.counter-left', solid: true },
      ],
    }),
    objectFromTiles({
      id: 'lobby-sofa', kind: 'sofa', areaId: 'annex-lobby',
      tiles: [
        { x: 46, y: 14, sprite: 'tile.sofa-left', solid: true },
        { x: 47, y: 14, sprite: 'tile.sofa-right', solid: true },
      ],
      interactions: [{ id: 'lobby-sofa-seat', kind: 'social', approachTiles: [{ x: 46, y: 15 }] }],
    }),
    objectFromTiles({
      id: 'lobby-planters', kind: 'planter', areaId: 'annex-lobby',
      tiles: [
        { x: 45, y: 9, sprite: 'tile.fixture-planter', solid: true },
        { x: 50, y: 9, sprite: 'tile.fixture-planter', solid: true },
        { x: 45, y: 37, sprite: 'tile.fixture-planter', solid: true },
        { x: 50, y: 37, sprite: 'tile.fixture-planter', solid: true },
        { x: 45, y: 17, sprite: 'tile.fixture-planter', solid: true },
        { x: 50, y: 30, sprite: 'tile.fixture-planter', solid: true },
        { x: 48, y: 10, sprite: 'tile.fixture-planter', solid: true },
        { x: 52, y: 15, sprite: 'tile.fixture-planter', solid: true },
        { x: 52, y: 33, sprite: 'tile.fixture-planter', solid: true },
        { x: 46, y: 39, sprite: 'tile.fixture-planter', solid: true },
        { x: 45, y: 33, sprite: 'tile.fixture-planter', solid: true },
        { x: 51, y: 8, sprite: 'tile.fixture-planter', solid: true },
        { x: 46, y: 30, sprite: 'tile.fixture-planter', solid: true },
        { x: 51, y: 39, sprite: 'tile.fixture-planter', solid: true },
      ],
    }),
    objectFromTiles({
      id: 'lobby-waiting-sofa', kind: 'sofa', areaId: 'annex-lobby',
      tiles: [
        { x: 49, y: 14, sprite: 'tile.sofa-left', solid: true },
        { x: 50, y: 14, sprite: 'tile.sofa-right', solid: true },
      ],
      interactions: [{ id: 'lobby-waiting-seat', kind: 'social', approachTiles: [{ x: 49, y: 15 }] }],
    }),
    objectFromTiles({
      id: 'lobby-mail-counter', kind: 'counter', areaId: 'annex-lobby',
      tiles: [
        { x: 45, y: 27, sprite: 'tile.counter-left', solid: true },
        { x: 45, y: 28, sprite: 'tile.counter-right', solid: true },
        { x: 45, y: 29, sprite: 'tile.counter-left', solid: true },
      ],
    }),
    objectFromTiles({
      id: 'lobby-sign', kind: 'sign', areaId: 'annex-lobby',
      tiles: [{ x: 48, y: 20, sprite: 'tile.sign-civic', solid: true }],
    }),
    ceilingPanels('annex-ceiling-lobby', 'annex-lobby', [
      { x: 47, y: 12 }, { x: 47, y: 24 }, { x: 47, y: 36 }, { x: 47, y: 18 }, { x: 47, y: 30 },
      { x: 47, y: 8 }, { x: 47, y: 15 }, { x: 47, y: 21 }, { x: 47, y: 27 }, { x: 47, y: 33 },
      { x: 47, y: 39 },
    ]),
  ];
  const map = commonMap({
    id: 'west_office',
    displayName: 'Ledger Annex',
    defaultSprite: 'tile.pale-concrete',
    regions: [
      { id: 'annex-carpet', x: 7, y: 7, width: 37, height: 34, sprite: 'tile.dock-floor' },
      { id: 'annex-kitchen-floor', x: 30, y: 28, width: 13, height: 13, sprite: 'tile.sunset-floor' },
      { id: 'annex-approach', x: 54, y: 23, width: 10, height: 3, sprite: 'tile.plaza-paver' },
    ],
    areas: [
      {
        id: 'cubicle-floor', bounds: { x: 7, y: 7, width: 37, height: 15 },
        densityProfile: 'furnished-interior',
        intentionalOpenAreas: [
          { x: 8, y: 12, width: 21, height: 1 },
          { x: 8, y: 17, width: 21, height: 1 },
          { x: 7, y: 21, width: 37, height: 1 },
          { x: 29, y: 7, width: 15, height: 15 },
          { x: 7, y: 7, width: 1, height: 15 },
        ],
        // The spec calls y = 21 a buffer, but a 4-deep module at row north 18 occupies
        // y = 18..21, so the only lanes that cross the farm unblocked are the two aisles.
        entranceTiles: [{ x: 20, y: 21 }],
        primaryRoutes: [{ x: 8, y: 12, width: 21, height: 1 }, { x: 8, y: 17, width: 21, height: 1 }],
        requiredPortalIds: [],
      },
      {
        id: 'annex-hall', bounds: { x: 7, y: 22, width: 37, height: 5 },
        densityProfile: 'furnished-interior',
        intentionalOpenAreas: [{ x: 7, y: 22, width: 37, height: 5 }],
        entranceTiles: [{ x: 43, y: 23 }, { x: 20, y: 22 }, { x: 24, y: 25 }],
        primaryRoutes: [{ x: 7, y: 24, width: 37, height: 1 }],
        requiredPortalIds: [],
      },
      {
        id: 'manager-office', bounds: { x: 7, y: 27, width: 14, height: 14 },
        densityProfile: 'furnished-interior',
        intentionalOpenAreas: [
          { x: 10, y: 33, width: 8, height: 3 },
          { x: 7, y: 27, width: 14, height: 2 },
          { x: 7, y: 30, width: 4, height: 11 },
          { x: 11, y: 36, width: 10, height: 5 },
          { x: 13, y: 28, width: 8, height: 5 },
        ],
        entranceTiles: [{ x: 20, y: 33 }], primaryRoutes: [{ x: 12, y: 33, width: 8, height: 1 }],
        requiredPortalIds: [],
      },
      {
        id: 'cooler-nook', bounds: { x: 21, y: 27, width: 8, height: 14 },
        densityProfile: 'furnished-interior',
        intentionalOpenAreas: [
          { x: 21, y: 29, width: 8, height: 4 },
          { x: 21, y: 35, width: 8, height: 6 },
        ],
        entranceTiles: [{ x: 24, y: 27 }], primaryRoutes: [{ x: 25, y: 28, width: 1, height: 6 }],
        requiredPortalIds: [],
      },
      {
        id: 'annex-kitchen', bounds: { x: 29, y: 27, width: 15, height: 14 },
        densityProfile: 'furnished-interior',
        intentionalOpenAreas: [
          { x: 29, y: 29, width: 15, height: 4 },
          { x: 29, y: 34, width: 15, height: 7 },
          { x: 35, y: 27, width: 9, height: 2 },
        ],
        entranceTiles: [{ x: 29, y: 33 }], primaryRoutes: [{ x: 30, y: 30, width: 13, height: 1 }],
        requiredPortalIds: [],
      },
      {
        id: 'annex-lobby', bounds: { x: 44, y: 7, width: 9, height: 34 },
        densityProfile: 'furnished-interior',
        intentionalOpenAreas: [
          { x: 48, y: 20, width: 5, height: 9 },
          { x: 44, y: 7, width: 9, height: 7 },
          { x: 44, y: 25, width: 4, height: 12 },
          { x: 44, y: 15, width: 9, height: 5 },
          { x: 44, y: 38, width: 9, height: 3 },
          { x: 48, y: 29, width: 5, height: 8 },
        ],
        entranceTiles: [{ x: 52, y: 24 }, { x: 44, y: 23 }],
        primaryRoutes: [{ x: 48, y: 24, width: 5, height: 1 }],
        requiredPortalIds: [],
      },
      {
        id: 'annex-lot', bounds: { x: 54, y: 0, width: 10, height: 48 },
        densityProfile: 'structural-placeholder', intentionalOpenAreas: [],
        entranceTiles: [{ x: 62, y: 24 }], primaryRoutes: [],
        requiredPortalIds: ['from-residential'],
      },
    ],
    wallRuns: [
      { id: 'annex-north', material: 'civic', bounds: { x: 6, y: 6, width: 48, height: 1 }, openings: [] },
      { id: 'annex-south', material: 'civic', bounds: { x: 6, y: 41, width: 48, height: 1 }, openings: [] },
      { id: 'annex-west', material: 'civic', bounds: { x: 6, y: 7, width: 1, height: 34 }, openings: [] },
      { id: 'annex-east', material: 'civic', bounds: { x: 53, y: 7, width: 1, height: 34 }, openings: [{ id: 'annex-front-opening', tile: { x: 53, y: 24 } }] },
      // The lower rooms hang off the water-cooler nook, and the nook's north side is deliberately
      // open — that gap at y = 27 IS the hallway's route south, and walling it would seal three
      // rooms behind a hallway with no way in.
      //
      // The spec's `cooler-east` run is dropped. It put an opening at (28,30) whose east side is
      // `kitchen-west` at x = 29, so the doorway opened onto a solid wall and the compiler's
      // reachability check rejected it. The nook and the kitchen already share `kitchen-west`.
      { id: 'mgr-north', material: 'civic', bounds: { x: 7, y: 27, width: 13, height: 1 }, openings: [] },
      { id: 'mgr-east', material: 'civic', bounds: { x: 20, y: 27, width: 1, height: 14 }, openings: [{ id: 'mgr-door', tile: { x: 20, y: 33 } }] },
      { id: 'kitchen-west', material: 'civic', bounds: { x: 29, y: 27, width: 1, height: 14 }, openings: [{ id: 'kitchen-door', tile: { x: 29, y: 33 } }] },
      { id: 'kitchen-north', material: 'civic', bounds: { x: 30, y: 27, width: 13, height: 1 }, openings: [] },
      { id: 'lobby-west', material: 'civic', bounds: { x: 44, y: 7, width: 1, height: 16 }, openings: [] },
      { id: 'lobby-west-south', material: 'civic', bounds: { x: 44, y: 24, width: 1, height: 17 }, openings: [] },
    ],
    objects: [
      ...modules.flatMap(({ objects }) => objects),
      aisleCeiling, ...corridorFixtures, ...hallFixtures, ...managerFixtures,
      ...coolerFixtures, ...kitchenFixtures, ...lobbyFixtures,
      lotFixtures,
    ],
    bindings: [
      { locationId: 'west_office', areaIds: ['annex-lot'], preferredInteractionIds: [] },
      {
        locationId: 'ledger_annex',
        areaIds: ['annex-lobby', 'annex-hall', 'cubicle-floor', 'manager-office', 'cooler-nook', 'annex-kitchen'],
        preferredInteractionIds: ['lobby-sofa-seat'],
      },
    ],
    portals: [
      { id: 'from-residential', edge: 'east', tile: { x: 63, y: 24 }, destinationMapId: 'northwest_residential', destinationEntranceId: 'to-office' },
    ],
    stagingTiles: [{ x: 62, y: 24 }, { x: 50, y: 24 }],
    spawns: {
      'annex-entry': { x: 50, y: 24 },
      office_manager: { x: 12, y: 32 },
      ...Object.fromEntries(modules.map(({ standTile }, index) => [
        `clerk_${String(index + 1).padStart(2, '0')}`, standTile,
      ])),
    },
    effects: [
      { id: 'office-kettle-steam', kind: 'steam', tile: { x: 31, y: 28 } },
      { id: 'office-cooler-steam', kind: 'steam', tile: { x: 24, y: 30 } },
    ],
  });
  map.doors = [
    {
      id: 'annex-front-door', openingId: 'annex-front-opening', initialState: 'closed-unlocked',
      sprite: 'tile.closed-door', roofGroupId: 'annex-roof',
      interaction: { id: 'annex-front-door-use', areaId: 'annex-lobby', approachTiles: [{ x: 52, y: 24 }, { x: 54, y: 24 }] },
    },
    { id: 'annex-manager-door', openingId: 'mgr-door', initialState: 'closed-unlocked', sprite: 'tile.closed-door', roofGroupId: 'annex-roof' },
    { id: 'annex-kitchen-door', openingId: 'kitchen-door', initialState: 'closed-unlocked', sprite: 'tile.closed-door', roofGroupId: 'annex-roof' },
  ];
  map.roofGroups = [{
    id: 'annex-roof',
    cells: [{ x: 6, y: 6, width: 48, height: 36 }],
    interiorCells: [{ x: 7, y: 7, width: 46, height: 34 }],
  }];
  map.buildings = [{
    id: 'ledger-annex',
    areaIds: ['annex-lobby', 'annex-hall', 'cubicle-floor', 'manager-office', 'cooler-nook', 'annex-kitchen'],
    outerWallRunIds: ['annex-north', 'annex-south', 'annex-west', 'annex-east'],
    entranceOpeningIds: ['annex-front-opening'],
    roofGroupId: 'annex-roof',
  }];
  return map;
}

const LOCATION_NEIGHBORHOODS = new Map<string, string>([
  ['northwest_residential', 'northwest_residential'], ['northeast_downtown', 'northeast_downtown'],
  ['southwest_commercial', 'southwest_commercial'], ['southeast_docks', 'southeast_docks'],
  ['west_office', 'west_office'], ['ledger_annex', 'west_office'],
  ['protagonist_villa', 'northwest_residential'], ['linda_villa', 'northwest_residential'],
  ['mina_spa', 'northwest_residential'], ['devon_bar', 'northeast_downtown'],
  ['elise_studio', 'northeast_downtown'], ['rafael_cafe', 'southwest_commercial'],
  ['sora_boutique', 'southwest_commercial'], ['priya_clinic', 'southeast_docks'],
  ['tomas_marina', 'southeast_docks'], ['ferry_terminal', 'southeast_docks'],
]);

function sourceModule(valueName: string, value: unknown): string {
  return `/* Generated by scripts/content/build-map-v2.ts. */\nexport const ${valueName} = ${JSON.stringify(value, null, 2)} as const;\n`;
}

function spawn(catalog: ReturnType<typeof buildWorldMapV2Catalog>, mapId: MapId, id: string): TilePoint {
  const tile = catalog[mapId].source.spawns[id];
  if (!tile) throw new Error(`Generated layout has no ${mapId}/${id} spawn.`);
  return tile;
}

export async function buildProductionMaps(rootPath = process.cwd()): Promise<void> {
  const maps = {
    northwest_residential: northwestMap(),
    northeast_downtown: northeastMap(),
    southwest_commercial: southwestMap(),
    southeast_docks: southeastMap(),
    west_office: westMap(),
  } as const;
  const catalog = buildWorldMapV2Catalog(maps, {
    locationNeighborhoodById: LOCATION_NEIGHBORHOODS,
    knownSprites: new Set(ATLAS_INDEX.tiles),
    validateDensity: true,
  });
  const names: Readonly<Record<MapId, string>> = {
    northwest_residential: 'northwest.json', northeast_downtown: 'northeast.json',
    southwest_commercial: 'southwest.json', southeast_docks: 'southeast.json',
    west_office: 'west.json',
  };
  await Promise.all((Object.keys(maps) as MapId[]).map((mapId) => writeFile(
    resolve(rootPath, 'content', 'maps', names[mapId]),
    `${JSON.stringify(maps[mapId], null, 2)}\n`,
  )));

  const actorLocationIds: Readonly<Record<string, string>> = {
    protagonist: 'protagonist_villa',
    linda: 'linda_villa',
    linda_boyfriend: 'linda_villa',
  };
  const actorTiles = Object.fromEntries([
    'protagonist', 'linda', 'generic_resident', 'linda_boyfriend', 'mina_park', 'rafael_cruz',
    'sora_tan', 'devon_price', 'priya_nair', 'tomas_reed', 'elise_moreau',
  ].map((id) => [id, {
    mapId: 'northwest_residential',
    locationId: actorLocationIds[id] ?? 'northwest_residential',
    ...spawn(catalog, 'northwest_residential', id),
  }]));
  const generatedLayout = {
    layoutRevisions: Object.fromEntries((Object.keys(catalog) as MapId[]).sort(compareAscii).map((mapId) => [
      mapId, catalog[mapId].source.layoutRevision,
    ])),
    actorTiles,
    scheduleTiles: {
      linda_home: { mapId: 'northwest_residential', locationId: 'linda_villa', ...spawn(catalog, 'northwest_residential', 'linda-home') },
      linda_relax: { mapId: 'northwest_residential', locationId: 'northwest_residential', ...spawn(catalog, 'northwest_residential', 'linda-relax') },
      linda_shop: { mapId: 'southwest_commercial', locationId: 'southwest_commercial', ...spawn(catalog, 'southwest_commercial', 'linda-shop') },
      generic_home: { mapId: 'northwest_residential', locationId: 'northwest_residential', ...spawn(catalog, 'northwest_residential', 'generic-home') },
      generic_work: { mapId: 'northwest_residential', locationId: 'northwest_residential', ...spawn(catalog, 'northwest_residential', 'generic-work') },
      generic_meal: { mapId: 'northeast_downtown', locationId: 'northeast_downtown', ...spawn(catalog, 'northeast_downtown', 'generic-meal') },
      generic_nightlife: { mapId: 'northeast_downtown', locationId: 'northeast_downtown', ...spawn(catalog, 'northeast_downtown', 'generic-nightlife') },
    },
    workTiles: {
      mina_park: { mapId: 'northwest_residential', locationId: 'mina_spa', ...spawn(catalog, 'northwest_residential', 'mina_park') },
      rafael_cruz: { mapId: 'southwest_commercial', locationId: 'rafael_cafe', ...spawn(catalog, 'southwest_commercial', 'rafael_cruz') },
      sora_tan: { mapId: 'southwest_commercial', locationId: 'sora_boutique', ...spawn(catalog, 'southwest_commercial', 'sora_tan') },
      devon_price: { mapId: 'northeast_downtown', locationId: 'devon_bar', ...spawn(catalog, 'northeast_downtown', 'devon_price') },
      priya_nair: { mapId: 'southeast_docks', locationId: 'priya_clinic', ...spawn(catalog, 'southeast_docks', 'priya_nair') },
      tomas_reed: { mapId: 'southeast_docks', locationId: 'tomas_marina', ...spawn(catalog, 'southeast_docks', 'tomas_reed') },
      elise_moreau: { mapId: 'northeast_downtown', locationId: 'elise_studio', ...spawn(catalog, 'northeast_downtown', 'elise_moreau') },
    },
    homeVisitTile: { mapId: 'northwest_residential', locationId: 'protagonist_villa', ...spawn(catalog, 'northwest_residential', 'home-visit') },
  };
  await writeFile(
    resolve(rootPath, 'src', 'domain', 'state', 'generated-layout.ts'),
    sourceModule('GENERATED_LAYOUT', generatedLayout),
  );
  await writeFile(
    resolve(rootPath, 'src', 'world', 'transfers', 'generated-routes.ts'),
    sourceModule('GENERATED_NEIGHBORHOOD_ROUTES', deriveNeighborhoodRoutes(catalog)),
  );
}
