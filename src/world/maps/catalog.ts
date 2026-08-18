import { compileWorldMapV2 } from './compiler';
import type { CompiledMapV2 } from './compiled-v2';
import { compileWorldMap, type CompiledMap, type WorldMap } from './schema';
import type { VisualBounds } from '../presentation/recipes';
import { assertNeighborhoodRoutes, deriveNeighborhoodRoutes, NEIGHBORHOOD_ROUTES } from '../transfers/routes';

export const MAP_IDS = [
  'northwest_residential',
  'northeast_downtown',
  'southwest_commercial',
  'southeast_docks',
  'west_office',
] as const;
export type MapId = typeof MAP_IDS[number];

export type WorldMapCatalog = Readonly<Record<MapId, CompiledMap>>;
export type WorldMapV2Catalog = Readonly<Record<MapId, CompiledMapV2>>;

const OPPOSITE_EDGE: Readonly<Record<WorldMap['portals'][number]['edge'], WorldMap['portals'][number]['edge']>> = {
  north: 'south',
  east: 'west',
  south: 'north',
  west: 'east',
};

function assertReciprocalPortals(catalog: WorldMapCatalog): void {
  for (const map of Object.values(catalog)) {
    for (const portal of map.source.portals) {
      const destination = catalog[portal.destinationMapId as MapId];
      if (!destination) throw new Error(`Portal ${map.source.id}/${portal.id} references an unknown map.`);
      const entrance = destination.source.portals.find(({ id }) => id === portal.destinationEntranceId);
      if (!entrance) throw new Error(`Portal ${map.source.id}/${portal.id} references an unknown entrance.`);
      if (
        entrance.edge !== OPPOSITE_EDGE[portal.edge] ||
        entrance.destinationMapId !== map.source.id ||
        entrance.destinationEntranceId !== portal.id
      ) {
        throw new Error(`Portal ${map.source.id}/${portal.id} is not reciprocal.`);
      }
      if (
        ((portal.edge === 'east' || portal.edge === 'west') && portal.tile.y !== entrance.tile.y) ||
        ((portal.edge === 'north' || portal.edge === 'south') && portal.tile.x !== entrance.tile.x)
      ) {
        throw new Error(`Portal ${map.source.id}/${portal.id} is not aligned with its entrance.`);
      }
    }
  }
}

export function buildWorldMapCatalog(
  candidates: Readonly<Record<MapId, unknown>>,
  knownSprites: ReadonlySet<string>,
): WorldMapCatalog {
  const catalog = {
    northwest_residential: compileWorldMap(candidates.northwest_residential, knownSprites),
    northeast_downtown: compileWorldMap(candidates.northeast_downtown, knownSprites),
    southwest_commercial: compileWorldMap(candidates.southwest_commercial, knownSprites),
    southeast_docks: compileWorldMap(candidates.southeast_docks, knownSprites),
    west_office: compileWorldMap(candidates.west_office, knownSprites),
  } satisfies WorldMapCatalog;
  assertReciprocalPortals(catalog);
  assertNeighborhoodRoutes(catalog);
  const northwestAreas = new Set(catalog.northwest_residential.source.areas.map(({ id }) => id));
  for (const required of ['bedroom', 'bathroom', 'kitchen', 'storage', 'social']) {
    if (!northwestAreas.has(required)) throw new Error(`Northwest villa is missing ${required}.`);
  }
  const docks = catalog.southeast_docks.source;
  if (!docks.props.some(({ id }) => id === 'ferry-terminal') || docks.interactions.length !== 0) {
    throw new Error('The docks must show the ferry terminal without a usable interaction.');
  }
  return catalog;
}

function assertReciprocalV2Portals(catalog: WorldMapV2Catalog): void {
  for (const map of Object.values(catalog)) {
    for (const portal of map.source.portals) {
      const destination = catalog[portal.destinationMapId as MapId];
      if (!destination) throw new Error(`Portal ${map.source.id}/${portal.id} references an unknown map.`);
      const entrance = destination.portalById.get(portal.destinationEntranceId);
      if (!entrance) throw new Error(`Portal ${map.source.id}/${portal.id} references an unknown entrance.`);
      if (
        entrance.edge !== OPPOSITE_EDGE[portal.edge] ||
        entrance.destinationMapId !== map.source.id ||
        entrance.destinationEntranceId !== portal.id
      ) {
        throw new Error(`Portal ${map.source.id}/${portal.id} is not reciprocal.`);
      }
      if (
        ((portal.edge === 'east' || portal.edge === 'west') && portal.tile.y !== entrance.tile.y) ||
        ((portal.edge === 'north' || portal.edge === 'south') && portal.tile.x !== entrance.tile.x)
      ) {
        throw new Error(`Portal ${map.source.id}/${portal.id} is not aligned with its entrance.`);
      }
    }
  }
}

function assertV2CompatibilityRoutes(catalog: WorldMapV2Catalog): void {
  const routeOrder = (left: Readonly<{ originMapId: string; sourcePortalId: string }>, right: Readonly<{ originMapId: string; sourcePortalId: string }>) => (
    left.originMapId.localeCompare(right.originMapId, 'en') || left.sourcePortalId.localeCompare(right.sourcePortalId, 'en')
  );
  const derived = [...deriveNeighborhoodRoutes(catalog)].sort(routeOrder);
  const compatibility = [...NEIGHBORHOOD_ROUTES].sort(routeOrder);
  if (JSON.stringify(derived) !== JSON.stringify(compatibility)) {
    throw new Error('The v2 portal catalog does not match the active compatibility route table.');
  }
}

export function buildWorldMapV2Catalog(
  candidates: Readonly<Record<MapId, unknown>>,
  options: Readonly<{
    locationNeighborhoodById: ReadonlyMap<string, string>;
    knownSprites?: ReadonlySet<string>;
    visualBoundsBySprite?: Readonly<Record<string, VisualBounds>>;
    validateDensity?: boolean;
  }>,
): WorldMapV2Catalog {
  const knownLocationIds = new Set(options.locationNeighborhoodById.keys());
  const compile = (candidate: unknown): CompiledMapV2 => compileWorldMapV2(candidate, {
    knownLocationIds,
    knownSprites: options.knownSprites,
    visualBoundsBySprite: options.visualBoundsBySprite,
    validateDensity: options.validateDensity,
  });
  const catalog = {
    northwest_residential: compile(candidates.northwest_residential),
    northeast_downtown: compile(candidates.northeast_downtown),
    southwest_commercial: compile(candidates.southwest_commercial),
    southeast_docks: compile(candidates.southeast_docks),
    west_office: compile(candidates.west_office),
  } satisfies WorldMapV2Catalog;
  for (const mapId of MAP_IDS) {
    if (catalog[mapId].source.id !== mapId) {
      throw new Error(`Map catalog key ${mapId} does not match source ${catalog[mapId].source.id}.`);
    }
  }
  assertReciprocalV2Portals(catalog);
  assertV2CompatibilityRoutes(catalog);

  for (const [locationId, neighborhoodId] of options.locationNeighborhoodById) {
    const map = catalog[neighborhoodId as MapId];
    if (!map) throw new Error(`Location ${locationId} references unknown neighborhood ${neighborhoodId}.`);
    if (!map.locationBindingById.has(locationId)) {
      throw new Error(`Location ${locationId} has no binding on ${neighborhoodId}.`);
    }
    for (const otherMap of Object.values(catalog)) {
      if (otherMap.source.id !== neighborhoodId && otherMap.locationBindingById.has(locationId)) {
        throw new Error(`Location ${locationId} is bound on the wrong neighborhood ${otherMap.source.id}.`);
      }
    }
  }
  return catalog;
}
