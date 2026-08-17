import { WORLD_MAP_CATALOG } from '../../application/runtime/map-catalog';
import {
  LINDA_QUEST,
  planLindaQuestStart,
  planLindaVillaDiscovery,
} from '../../domain/quests/quest-machine';
import { createInitialState } from '../../domain/state/initial-state';
import { parseWorldState, type WorldState } from '../../domain/state/schema';
import type { MapId } from '../../world/maps/catalog';
import { simulateWorldInterval } from '../../world/schedules/simulation';

export const DEV_HARNESS_MAP_IDS = [
  'northwest_residential',
  'northeast_downtown',
  'southwest_commercial',
  'southeast_docks',
] as const satisfies readonly MapId[];

export type DevHarnessQuestStage = 'locked' | 'active' | 'discovered';

function paused(state: WorldState): WorldState {
  return parseWorldState({
    ...state,
    clock: { ...state.clock, selectedSpeed: 0 },
  });
}

function representativeTile(mapId: MapId): Readonly<{ x: number; y: number }> {
  if (mapId === 'northwest_residential') {
    const initial = createInitialState().protagonist.worldPosition;
    return { x: initial.tileX, y: initial.tileY };
  }
  const map = WORLD_MAP_CATALOG[mapId];
  const tile = map.source.areas[0]?.entranceTiles[0] ?? map.source.stagingTiles[0];
  if (!tile || map.blockedKeys.has(`${tile.x},${tile.y}`)) {
    throw new Error(`Dev harness map ${mapId} has no usable representative tile.`);
  }
  return tile;
}

export function devHarnessLocationState(
  mapId: MapId,
  displayName = 'DEV PLAYER',
): WorldState {
  const state = createInitialState(displayName);
  const tile = representativeTile(mapId);
  return paused(parseWorldState({
    ...state,
    protagonist: {
      ...state.protagonist,
      locationId: mapId,
      worldPosition: { mapId, tileX: tile.x, tileY: tile.y },
    },
    maps: Object.fromEntries(Object.entries(state.maps).map(([id, map]) => [
      id,
      { ...map, active: id === mapId },
    ])),
  }));
}

export function devHarnessGoldenHourState(mapId: MapId = 'northwest_residential'): WorldState {
  const state = devHarnessLocationState(mapId);
  return paused(simulateWorldInterval({
    state,
    toAbsoluteMinute: 17 * 60 + 30,
    toSubMinuteMilliseconds: 0,
    awake: false,
    frameMovement: false,
  }).state);
}

export function devHarnessHeroSceneState(mapId: MapId): WorldState {
  const state = devHarnessGoldenHourState(mapId);
  const composition = WORLD_MAP_CATALOG[mapId].source.startComposition;
  if (!composition) throw new Error(`Dev harness map ${mapId} has no hero composition.`);
  if (WORLD_MAP_CATALOG[mapId].blockedKeys.has(`${composition.cameraAnchor.x},${composition.cameraAnchor.y}`)) {
    throw new Error(`Dev harness hero anchor ${mapId} is blocked.`);
  }
  const stagedIds = composition.requiredActorIds.filter((id) => id !== 'protagonist');
  const localNpcs = Object.fromEntries(Object.entries(state.npcs).map(([id, npc]) => {
    const index = stagedIds.indexOf(id);
    if (index < 0) return [id, npc];
    const tile = [3, 4, 2].map((distance) => ({
      x: composition.cameraAnchor.x + (index === 0 ? -distance : distance),
      y: composition.cameraAnchor.y + 2,
    })).find((candidate) => !WORLD_MAP_CATALOG[mapId].blockedKeys.has(`${candidate.x},${candidate.y}`));
    if (!tile) {
      throw new Error(`Dev harness hero actor tile ${mapId}/${id} is blocked.`);
    }
    return [id, {
      ...npc,
      presence: { kind: 'active_local', mapId, locationId: mapId, tileX: tile.x, tileY: tile.y },
    }];
  }));
  return parseWorldState({
    ...state,
    protagonist: {
      ...state.protagonist,
      locationId: mapId,
      worldPosition: {
        mapId,
        tileX: composition.cameraAnchor.x,
        tileY: composition.cameraAnchor.y,
      },
    },
    npcs: localNpcs,
  });
}

const GROUNDING_TILES: Readonly<Record<MapId, Readonly<{ x: number; y: number }>>> = {
  northwest_residential: { x: 13, y: 11 },
  northeast_downtown: { x: 26, y: 15 },
  southwest_commercial: { x: 8, y: 11 },
  southeast_docks: { x: 20, y: 31 },
  west_office: { x: 50, y: 24 },
};

export function devHarnessGroundingState(mapId: MapId): WorldState {
  const state = devHarnessGoldenHourState(mapId);
  const tile = GROUNDING_TILES[mapId];
  if (WORLD_MAP_CATALOG[mapId].blockedKeys.has(`${tile.x},${tile.y}`)) {
    throw new Error(`Dev harness grounding tile ${mapId}/${tile.x},${tile.y} is blocked.`);
  }
  return parseWorldState({
    ...state,
    protagonist: {
      ...state.protagonist,
      worldPosition: { mapId, tileX: tile.x, tileY: tile.y },
    },
  });
}

export function devHarnessVfxState(mapId: MapId, effectId: string): WorldState {
  const map = WORLD_MAP_CATALOG[mapId];
  const effect = map.source.effects.find(({ id }) => id === effectId);
  if (!effect) throw new Error(`Dev harness VFX ${mapId}/${effectId} does not exist.`);
  const nearbyTile = [
    { x: effect.tile.x, y: effect.tile.y + 3 },
    { x: effect.tile.x + 3, y: effect.tile.y },
    { x: effect.tile.x, y: effect.tile.y - 3 },
    { x: effect.tile.x - 3, y: effect.tile.y },
  ].find((tile) => (
    tile.x >= 0 && tile.x < map.source.width &&
    tile.y >= 0 && tile.y < map.source.height &&
    !map.blockedKeys.has(`${tile.x},${tile.y}`)
  ));
  if (!nearbyTile) throw new Error(`Dev harness VFX ${mapId}/${effectId} has no nearby player tile.`);
  const state = devHarnessLocationState(mapId);
  return parseWorldState({
    ...state,
    clock: { ...state.clock, selectedSpeed: 1 },
    protagonist: {
      ...state.protagonist,
      locationId: mapId,
      worldPosition: { mapId, tileX: nearbyTile.x, tileY: nearbyTile.y },
    },
  });
}

function nearLinda(state: WorldState): WorldState {
  const presence = state.npcs.linda?.presence;
  if (!presence || presence.kind !== 'active_local') {
    throw new Error('The dev harness requires Linda to be active locally.');
  }
  return parseWorldState({
    ...state,
    protagonist: {
      ...state.protagonist,
      locationId: presence.locationId,
      worldPosition: {
        mapId: presence.mapId,
        tileX: presence.tileX - 1,
        tileY: presence.tileY,
      },
    },
  });
}

export function devHarnessQuestState(stage: DevHarnessQuestStage): WorldState {
  const initial = paused(createInitialState('DEV PLAYER'));
  if (stage === 'locked') return initial;
  const active = planLindaQuestStart(nearLinda(initial), 'linda').state;
  if (stage === 'active') return paused(active);
  const atVilla = parseWorldState({
    ...active,
    protagonist: {
      ...active.protagonist,
      locationId: LINDA_QUEST.targetLocationId,
      worldPosition: {
        mapId: LINDA_QUEST.targetMapId,
        tileX: LINDA_QUEST.targetTile.x,
        tileY: LINDA_QUEST.targetTile.y,
      },
    },
  });
  return paused(planLindaVillaDiscovery(atVilla).state);
}

export function devHarnessDistrictPanelState(mapId: MapId): WorldState {
  const world = devHarnessHeroSceneState(mapId);
  const quest = devHarnessQuestState('discovered');
  return parseWorldState({
    ...world,
    evidence: quest.evidence,
    factions: quest.factions,
    invitations: quest.invitations,
    journal: quest.journal,
    quests: quest.quests,
    relationships: quest.relationships,
  });
}
