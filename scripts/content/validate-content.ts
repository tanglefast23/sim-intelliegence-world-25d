import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  buildContentCatalog,
  buildVerbalMissionCatalog,
  type ContentBundleInput,
} from '../../src/content/registries/catalog';
import { parseVerbalMissionContentFile } from '../../src/content/verbal-missions/catalog';
import { GoalContractSchema } from '../../src/content/schemas/verbal-mission';
import { FileCharacterWritingStore } from '../../src/ai/registry/file-writing-store';
import { REGISTRY_NAMES, type RegistryName } from '../../src/content/schemas/registry';
import { SocialContentSchema } from '../../src/content/schemas/social';
import { EconomyPolicySchema } from '../../src/domain/economy/economy';
import { PROTOTYPE_ECONOMY_POLICY } from '../../src/domain/economy/economy';
import { createInitialState } from '../../src/domain/state/initial-state';
import { ScheduleStateSchema } from '../../src/domain/state/models';
import { SOCIAL_PURCHASES } from '../../src/domain/quests/purchases';
import { LINDA_QUEST, resolveLindaQuestDefinition } from '../../src/domain/quests/quest-machine';
import { ATLAS_INDEX } from '../../src/render/atlas';
import { buildWorldMapV2Catalog, MAP_IDS, type MapId } from '../../src/world/maps/catalog';
import type { WorldState } from '../../src/domain/state/schema';
import {
  PLAYER_KNOWLEDGE_AUTHORITIES,
  VERBAL_MISSION_AUTHORITIES,
} from '../../src/domain/verbal-missions/goal-planners';
import { tileKey, type TilePoint } from '../../src/world/maps/schema';
import { z } from 'zod';

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function buildLocationNeighborhoodIndex(
  locations: readonly Readonly<{ id: string; neighborhoodId: string }>[],
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  const mapIds = new Set<string>(MAP_IDS);
  for (const location of [...locations].sort((left, right) => compareAscii(left.id, right.id))) {
    if (result.has(location.id)) throw new Error(`Duplicate world location ID: ${location.id}`);
    if (!mapIds.has(location.neighborhoodId)) {
      throw new Error(`Location ${location.id} references unknown neighborhood ${location.neighborhoodId}.`);
    }
    result.set(location.id, location.neighborhoodId);
  }
  for (const mapId of MAP_IDS) {
    if (result.get(mapId) !== mapId) throw new Error(`Neighborhood ${mapId} must be a self-bound world location.`);
  }
  return result;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function readJsonDirectory(path: string): Promise<unknown[]> {
  const names = (await readdir(path)).filter((name) => name.endsWith('.json')).sort(compareAscii);
  if (names.length === 0) throw new Error(`No JSON fixtures found in ${path}`);
  const files = await Promise.all(names.map((name) => readJson(resolve(path, name))));
  return files.flatMap((candidate) => Array.isArray(candidate) ? candidate : [candidate]);
}

async function readCharacterRulesDirectory(path: string): Promise<unknown[]> {
  const entries = (await readdir(path, { withFileTypes: true }))
    .sort((left, right) => compareAscii(left.name, right.name));
  const invalidEntries = entries.filter((entry) => !entry.isDirectory());
  if (invalidEntries.length > 0) {
    throw new Error(`Character content must use */rules.json directories: ${invalidEntries.map(({ name }) => name).join(', ')}`);
  }
  if (entries.length === 0) throw new Error(`No character directories found in ${path}`);
  return Promise.all(entries.map((entry) => readJson(resolve(path, entry.name, 'rules.json'))));
}

function assertBoundTile(
  maps: ReturnType<typeof buildWorldMapV2Catalog>,
  locationNeighborhoodById: ReadonlyMap<string, string>,
  recordId: string,
  mapId: string,
  locationId: string,
  tile: TilePoint,
): void {
  const expectedMapId = locationNeighborhoodById.get(locationId);
  if (expectedMapId !== mapId) {
    throw new Error(`${recordId} uses ${mapId}, but location ${locationId} belongs to ${String(expectedMapId)}.`);
  }
  const map = maps[mapId as MapId];
  const binding = map?.locationBindingById.get(locationId);
  if (!map || !binding || !binding.candidateTiles.some((candidate) => tileKey(candidate) === tileKey(tile))) {
    throw new Error(`${recordId} has no compiled location-binding tile at ${mapId}/${locationId}/${tileKey(tile)}.`);
  }
}

function validateInitialWorldReferences(
  state: WorldState,
  maps: ReturnType<typeof buildWorldMapV2Catalog>,
  locationNeighborhoodById: ReadonlyMap<string, string>,
): void {
  assertBoundTile(
    maps, locationNeighborhoodById, 'protagonist.worldPosition',
    state.protagonist.worldPosition.mapId, state.protagonist.locationId,
    { x: state.protagonist.worldPosition.tileX, y: state.protagonist.worldPosition.tileY },
  );
  for (const npc of Object.values(state.npcs)) {
    if (npc.presence.kind !== 'in_transit') {
      assertBoundTile(
        maps, locationNeighborhoodById, `${npc.id}.presence`, npc.presence.mapId, npc.presence.locationId,
        { x: npc.presence.tileX, y: npc.presence.tileY },
      );
    }
    if (npc.scheduleGoal && npc.scheduleGoal.activityId !== 'travel') {
      assertBoundTile(
        maps, locationNeighborhoodById, `${npc.id}.scheduleGoal`, npc.scheduleGoal.mapId, npc.scheduleGoal.locationId,
        { x: npc.scheduleGoal.tileX, y: npc.scheduleGoal.tileY },
      );
    }
  }
  for (const schedule of Object.values(state.schedules)) {
    for (const [index, block] of schedule.blocks.entries()) {
      assertBoundTile(
        maps, locationNeighborhoodById, `${schedule.id}.blocks.${index}`, block.mapId, block.locationId,
        { x: block.tileX, y: block.tileY },
      );
    }
  }
  for (const invitation of Object.values(state.invitations)) {
    assertBoundTile(
      maps, locationNeighborhoodById, `${invitation.id}.destination`,
      invitation.destinationMapId, invitation.destinationLocationId,
      maps[invitation.destinationMapId as MapId].locationBindingById.get(invitation.destinationLocationId)!.candidateTiles[0]!,
    );
  }
  for (const transfer of Object.values(state.transfers)) {
    const destination = maps[transfer.destinationMapId as MapId];
    const entrance = destination?.portalById.get(transfer.destinationEntranceId);
    if (!entrance || entrance.tile.x !== transfer.destinationEntranceTileX || entrance.tile.y !== transfer.destinationEntranceTileY) {
      throw new Error(`${transfer.id} does not match its compiled destination entrance identity.`);
    }
    assertBoundTile(
      maps, locationNeighborhoodById, `${transfer.id}.destinationGoal`,
      transfer.destinationMapId, transfer.destinationLocationId,
      { x: transfer.destinationGoalTileX, y: transfer.destinationGoalTileY },
    );
  }
  for (const journal of Object.values(state.journal)) {
    if (journal.locationId && !locationNeighborhoodById.has(journal.locationId)) {
      throw new Error(`${journal.id} references unknown journal location ${journal.locationId}.`);
    }
  }
  for (const evidence of Object.values(state.evidence)) {
    if (!locationNeighborhoodById.has(evidence.locationId)) {
      throw new Error(`${evidence.id} references unknown evidence location ${evidence.locationId}.`);
    }
  }
  for (const mapState of Object.values(state.maps)) {
    const map = maps[mapState.id as MapId];
    for (const entranceId of mapState.discoveredEntranceIds) {
      if (!map.portalById.has(entranceId) && !map.locationBindingById.has(entranceId)) {
        throw new Error(`${mapState.id} references unknown discovered entrance ${entranceId}.`);
      }
    }
  }
  for (const map of Object.values(maps)) {
    for (const [spawnId, tile] of Object.entries(map.source.spawns)) {
      if (map.blockedKeys.has(tileKey(tile))) throw new Error(`${map.source.id} spawn ${spawnId} is blocked.`);
    }
    for (const [index, tile] of map.source.stagingTiles.entries()) {
      if (map.blockedKeys.has(tileKey(tile))) throw new Error(`${map.source.id} staging tile ${index} is blocked.`);
    }
  }
}

export async function loadContentBundle(rootPath: string): Promise<ContentBundleInput> {
  const contentPath = resolve(rootPath, 'content');
  const registryEntries = await Promise.all(
    REGISTRY_NAMES.map(async (name) => [name, await readJson(resolve(contentPath, 'registries', `${name}.json`))] as const),
  );
  const registries = Object.fromEntries(registryEntries) as Record<RegistryName, unknown>;
  return {
    registries,
    rules: await readCharacterRulesDirectory(resolve(contentPath, 'characters')),
    world: {
      locations: await readJsonDirectory(resolve(contentPath, 'world', 'locations')),
      factions: await readJsonDirectory(resolve(contentPath, 'world', 'factions')),
      characters: await readJsonDirectory(resolve(contentPath, 'world', 'characters')),
    },
    narrative: {
      setting: await readFile(resolve(contentPath, 'world', 'setting.md'), 'utf8'),
      history: await readFile(resolve(contentPath, 'world', 'history.md'), 'utf8'),
      socialRules: await readFile(resolve(contentPath, 'world', 'social-rules.md'), 'utf8'),
    },
  };
}

export async function validateContent(rootPath = process.cwd()): Promise<void> {
  const bundle = await loadContentBundle(rootPath);
  const catalog = buildContentCatalog(bundle);
  const locationNeighborhoodById = buildLocationNeighborhoodIndex(catalog.locations);
  const writingStore = new FileCharacterWritingStore(resolve(rootPath, 'content'));
  await Promise.all(catalog.rules.map(({ npcId }) => writingStore.get(npcId)));
  const mapFiles: Readonly<Record<MapId, string>> = {
    northwest_residential: 'northwest.json',
    northeast_downtown: 'northeast.json',
    southwest_commercial: 'southwest.json',
    southeast_docks: 'southeast.json',
    west_office: 'west.json',
  };
  const mapEntries = await Promise.all(MAP_IDS.map(async (mapId) => [
    mapId,
    await readJson(resolve(rootPath, 'content', 'maps', mapFiles[mapId])),
  ] as const));
  const maps = buildWorldMapV2Catalog(Object.fromEntries(mapEntries) as Record<MapId, unknown>, {
    locationNeighborhoodById,
    knownSprites: new Set(ATLAS_INDEX.tiles),
    validateDensity: true,
  });
  const economy = EconomyPolicySchema.parse(await readJson(resolve(rootPath, 'content', 'economy', 'prototype.json')));
  const schedules = z.array(ScheduleStateSchema).parse(
    await readJson(resolve(rootPath, 'content', 'schedules', 'prototype.json')),
  );
  const social = SocialContentSchema.parse(await readJson(resolve(rootPath, 'content', 'social', 'prototype.json')));
  const lindaQuest = resolveLindaQuestDefinition(
    await readJson(resolve(rootPath, 'content', 'quests', 'linda-boyfriend.json')),
  );
  const factionIds = new Set(catalog.factions.map(({ id }) => id));
  const questIds = new Set(catalog.registries.quests.items.map(({ id }) => id));
  const characterIds = new Set(catalog.characters.map(({ id }) => id));
  for (const gate of social.factionAccessGates) {
    if (!factionIds.has(gate.factionId)) throw new Error(`Unknown social faction gate faction: ${gate.factionId}`);
  }
  for (const purchase of social.purchases) {
    if (!questIds.has(purchase.questId)) throw new Error(`Unknown social purchase quest: ${purchase.questId}`);
  }
  if (JSON.stringify(social.purchases) !== JSON.stringify(Object.values(SOCIAL_PURCHASES))) {
    throw new Error('Social purchase content does not match the authoritative deterministic offers.');
  }
  if (!questIds.has(lindaQuest.id)) throw new Error(`Unknown Linda quest ID: ${lindaQuest.id}`);
  if (!characterIds.has(lindaQuest.requestNpcId) || !characterIds.has(lindaQuest.targetNpcId)) {
    throw new Error('Linda quest character references must exist in the world catalog.');
  }
  if (!factionIds.has('velvet_tide')) throw new Error('Linda quest requires the Velvet Tide faction.');
  if (JSON.stringify(lindaQuest) !== JSON.stringify(LINDA_QUEST)) {
    throw new Error('Linda quest content does not match the authoritative deterministic definition.');
  }
  if (JSON.stringify(economy) !== JSON.stringify(PROTOTYPE_ECONOMY_POLICY)) {
    throw new Error('The prototype economy fixture does not match the authoritative economy policy.');
  }
  const initialState = createInitialState();
  const verbalMissionFiles = (await readJsonDirectory(resolve(rootPath, 'content', 'verbal-missions')))
    .map(parseVerbalMissionContentFile);
  const verbalMissionCatalog = buildVerbalMissionCatalog(
    verbalMissionFiles.map(({ disposition }) => disposition),
    verbalMissionFiles.map(({ definition }) => definition),
    {
      npcIds: new Set(catalog.characters.map(({ id }) => id)),
      factIds: new Set(catalog.registries.facts.items.map(({ id }) => id)),
      reachableFactIds: new Set(Object.keys(PLAYER_KNOWLEDGE_AUTHORITIES)),
      actionIds: new Set(catalog.registries.actions.items.map(({ id }) => id)),
      locationIds: new Set(catalog.locations.map(({ id }) => id)),
      objectIds: new Set(Object.keys(initialState.worldObjects)),
      referentIds: new Set(verbalMissionFiles.flatMap(({ referents }) => referents.map(({ id }) => id))),
    },
  );
  for (const mission of verbalMissionCatalog.missions) {
    if (JSON.stringify(mission.goalContract) !== JSON.stringify(
      GoalContractSchema.parse(VERBAL_MISSION_AUTHORITIES[mission.missionId]?.contract),
    )) {
      throw new Error(`${mission.missionId} content contract does not match deterministic authority.`);
    }
  }
  validateInitialWorldReferences(initialState, maps, locationNeighborhoodById);
  assertBoundTile(
    maps, locationNeighborhoodById, `${lindaQuest.id}.target`,
    lindaQuest.targetMapId, lindaQuest.targetLocationId, lindaQuest.targetTile,
  );
  const initialSchedules = Object.values(initialState.schedules);
  if (JSON.stringify(schedules) !== JSON.stringify(initialSchedules)) {
    throw new Error('The prototype schedule fixture does not match the authoritative initial schedules.');
  }
  process.stdout.write(
    `Validated ${catalog.characters.length} characters, ${catalog.locations.length} locations, ${catalog.factions.length} factions, ${catalog.rules.length} rule files, ${Object.keys(maps).length} maps, ${schedules.length} schedules, ${verbalMissionCatalog.missions.length} Verbal Missions, ${social.factionAccessGates.length} faction gates, ${social.purchases.length} social purchase, and 1 Linda quest.\n`,
  );
}

if (require.main === module) {
  validateContent().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Content validation failed: ${message}\n`);
    process.exitCode = 1;
  });
}
