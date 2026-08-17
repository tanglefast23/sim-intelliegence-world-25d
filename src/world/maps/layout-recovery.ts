import { WorldStateSchema, type WorldState } from '../../domain/state/schema';
import type { CompiledMapV2, CompiledLocationBindingV2 } from './compiled-v2';
import type { MapId, WorldMapV2Catalog } from './catalog';
import { tileKey, type TilePoint } from './schema';

const CARDINALS = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
] as const;

type EvidenceReason = WorldState['layoutMigrationEvidence'][number]['reason'];

export class LayoutMigrationError extends Error {
  readonly code = 'layout_migration_failed';
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameTile(left: TilePoint, right: TilePoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function mapFor(catalog: WorldMapV2Catalog, mapId: string): CompiledMapV2 {
  const map = catalog[mapId as MapId];
  if (!map) throw new LayoutMigrationError(`Layout recovery references unknown map ${mapId}.`);
  return map;
}

function bindingFor(map: CompiledMapV2, locationId: string): CompiledLocationBindingV2 {
  const binding = map.locationBindingById.get(locationId);
  if (!binding) {
    throw new LayoutMigrationError(`Map ${map.source.id} has no location binding ${locationId}.`);
  }
  return binding;
}

function mapForLocation(catalog: WorldMapV2Catalog, locationId: string): CompiledMapV2 {
  const matches = Object.values(catalog).filter((map) => map.locationBindingById.has(locationId));
  if (matches.length !== 1) {
    throw new LayoutMigrationError(`Location ${locationId} must have one compiled map binding.`);
  }
  return matches[0]!;
}

function reservedActorKeys(map: CompiledMapV2): ReadonlySet<string> {
  return new Set([
    ...map.source.portals.map(({ tile }) => tileKey(tile)),
    ...map.source.stagingTiles.map(tileKey),
    ...[...map.interactionById.values()].flatMap(({ approachTiles }) => approachTiles.map(tileKey)),
  ]);
}

function reasonForActorTile(
  map: CompiledMapV2,
  binding: CompiledLocationBindingV2,
  tile: TilePoint,
  reserved: ReadonlySet<string>,
  claimed: ReadonlySet<string>,
): EvidenceReason | undefined {
  const key = tileKey(tile);
  if (map.blockedKeys.has(key)) return 'static_solid';
  if (claimed.has(key)) return 'claimed_actor';
  if (reserved.has(key)) return 'reserved_role';
  if (!binding.candidateTiles.some((candidate) => sameTile(candidate, tile))) return 'location_binding';
  return undefined;
}

function nearestTile(input: Readonly<{
  map: CompiledMapV2;
  start: TilePoint;
  candidates: readonly TilePoint[];
  rejectedKeys?: ReadonlySet<string>;
}>): TilePoint | undefined {
  const candidateKeys = new Set(input.candidates.map(tileKey));
  const visited = new Set<string>();
  const queue: TilePoint[] = [{ ...input.start }];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const tile = queue[cursor]!;
    const key = tileKey(tile);
    if (visited.has(key)) continue;
    visited.add(key);
    if (candidateKeys.has(key) && !input.map.blockedKeys.has(key) && !input.rejectedKeys?.has(key)) {
      return tile;
    }
    for (const offset of CARDINALS) {
      const next = { x: tile.x + offset.x, y: tile.y + offset.y };
      if (next.x < 0 || next.y < 0 || next.x >= input.map.source.width || next.y >= input.map.source.height) continue;
      if (!visited.has(tileKey(next))) queue.push(next);
    }
  }
  return undefined;
}

function destinationCandidates(binding: CompiledLocationBindingV2): readonly TilePoint[] {
  return binding.preferredApproachTiles.length > 0
    ? binding.preferredApproachTiles
    : binding.candidateTiles;
}

export type LayoutRecoveryResult = Readonly<{
  state: WorldState;
  migratedMapIds: readonly MapId[];
}>;

export function recoverWorldLayout(
  source: WorldState,
  catalog: WorldMapV2Catalog,
): LayoutRecoveryResult {
  const original = WorldStateSchema.parse(source);
  const staleMapIds = (Object.keys(catalog) as MapId[]).filter((mapId) => {
    const saved = original.layoutRevisions[mapId] ?? 0;
    const current = catalog[mapId].source.layoutRevision;
    if (saved > current) {
      throw new LayoutMigrationError(`Save layout ${mapId}@${saved} is newer than this build at ${current}.`);
    }
    return saved < current;
  }).sort(compareAscii);
  if (staleMapIds.length === 0) return { state: original, migratedMapIds: [] };

  const draft = structuredClone(original);

  /**
   * A save written before a map existed carries no record for it, and `maps` is an open record so
   * nothing rejects that at parse time. The failure surfaces much later and looks unrelated: the
   * `transition-protagonist` reducer throws "does not match the active source map" the first time
   * the player walks through the new portal, on a save that loaded cleanly.
   *
   * This is the right place to close it rather than a schema bump. Recovery already runs on every
   * load whatever the envelope version, already treats a missing `layoutRevisions` entry as 0 and
   * therefore already lists the new map in `migratedMapIds`, and already forces a re-save.
   *
   * `discoveredEntranceIds` starts EMPTY on purpose. A fresh game seeds a couple of entrances as
   * authored player knowledge, and a returning player has not been to the new map, so seeding them
   * here would hand out knowledge the save never earned.
   */
  for (const mapId of staleMapIds) {
    if (draft.maps[mapId]) continue;
    draft.maps[mapId] = { id: mapId, active: false, unlocked: true, discoveredEntranceIds: [] };
  }

  const evidence = [...draft.layoutMigrationEvidence];
  const claimedByMap = new Map<MapId, Set<string>>(staleMapIds.map((mapId) => [mapId, new Set()]));

  const addEvidence = (input: Readonly<{
    recordId: string;
    field: string;
    mapId: MapId;
    oldTile: TilePoint;
    newTile: TilePoint;
    reason: EvidenceReason;
  }>): void => {
    if (sameTile(input.oldTile, input.newTile)) return;
    evidence.push({
      recordId: input.recordId,
      field: input.field,
      mapId: input.mapId,
      oldTile: input.oldTile,
      newTile: input.newTile,
      reason: input.reason,
      oldLayoutRevision: original.layoutRevisions[input.mapId] ?? 0,
      newLayoutRevision: catalog[input.mapId].source.layoutRevision,
    });
  };

  const recoverActor = (input: Readonly<{
    recordId: string;
    field: string;
    mapId: string;
    locationId: string;
    tile: TilePoint;
    write: (tile: TilePoint) => void;
  }>): void => {
    if (!staleMapIds.includes(input.mapId as MapId)) return;
    const mapId = input.mapId as MapId;
    const map = mapFor(catalog, mapId);
    const binding = bindingFor(map, input.locationId);
    const claimed = claimedByMap.get(mapId)!;
    const reserved = reservedActorKeys(map);
    const reason = reasonForActorTile(map, binding, input.tile, reserved, claimed);
    if (!reason) {
      claimed.add(tileKey(input.tile));
      return;
    }
    const rejected = new Set([...claimed, ...reserved]);
    const replacement = nearestTile({ map, start: input.tile, candidates: binding.candidateTiles, rejectedKeys: rejected });
    if (!replacement) {
      throw new LayoutMigrationError(`No valid ${input.locationId} actor tile exists for ${input.recordId}/${input.field}.`);
    }
    input.write(replacement);
    claimed.add(tileKey(replacement));
    addEvidence({ ...input, mapId, oldTile: input.tile, newTile: replacement, reason });
  };

  const recoverDestination = (input: Readonly<{
    recordId: string;
    field: string;
    mapId: string;
    locationId: string;
    tile: TilePoint;
    write: (tile: TilePoint) => void;
  }>): void => {
    if (!staleMapIds.includes(input.mapId as MapId)) return;
    const mapId = input.mapId as MapId;
    const map = mapFor(catalog, mapId);
    const binding = bindingFor(map, input.locationId);
    const candidates = destinationCandidates(binding);
    if (candidates.some((candidate) => sameTile(candidate, input.tile)) && !map.blockedKeys.has(tileKey(input.tile))) return;
    const replacement = nearestTile({ map, start: input.tile, candidates });
    if (!replacement) {
      throw new LayoutMigrationError(`No valid ${input.locationId} destination exists for ${input.recordId}/${input.field}.`);
    }
    input.write(replacement);
    addEvidence({
      ...input,
      mapId,
      oldTile: input.tile,
      newTile: replacement,
      reason: map.blockedKeys.has(tileKey(input.tile)) ? 'static_solid' : 'location_binding',
    });
  };

  const protagonistPosition = draft.protagonist.worldPosition;
  recoverActor({
    recordId: draft.protagonist.id,
    field: 'world_position',
    mapId: protagonistPosition.mapId,
    locationId: draft.protagonist.locationId,
    tile: { x: protagonistPosition.tileX, y: protagonistPosition.tileY },
    write: (tile) => { protagonistPosition.tileX = tile.x; protagonistPosition.tileY = tile.y; },
  });

  for (const npcId of Object.keys(draft.npcs).sort(compareAscii)) {
    const npc = draft.npcs[npcId]!;
    if (npc.presence.kind !== 'in_transit') {
      const presence = npc.presence;
      recoverActor({
        recordId: npcId,
        field: 'presence',
        mapId: presence.mapId,
        locationId: presence.locationId,
        tile: { x: presence.tileX, y: presence.tileY },
        write: (tile) => { presence.tileX = tile.x; presence.tileY = tile.y; },
      });
    }
    const approachingTransfer = Object.values(draft.transfers).find((transfer) => (
      transfer.npcId === npcId && transfer.status === 'approaching_exit'
    ));
    if (npc.scheduleGoal && !approachingTransfer) {
      const goal = npc.scheduleGoal;
      recoverDestination({
        recordId: npcId,
        field: 'schedule_goal',
        mapId: goal.mapId,
        locationId: goal.locationId,
        tile: { x: goal.tileX, y: goal.tileY },
        write: (tile) => { goal.tileX = tile.x; goal.tileY = tile.y; },
      });
    }
  }

  for (const invitationId of Object.keys(draft.invitations).sort(compareAscii)) {
    const invitation = draft.invitations[invitationId]!;
    const map = mapFor(catalog, invitation.destinationMapId);
    bindingFor(map, invitation.destinationLocationId);
  }

  for (const transferId of Object.keys(draft.transfers).sort(compareAscii)) {
    const transfer = draft.transfers[transferId]!;
    const destinationMap = mapFor(catalog, transfer.destinationMapId);
    const destinationEntrance = destinationMap.portalById.get(transfer.destinationEntranceId);
    if (!destinationEntrance) {
      throw new LayoutMigrationError(`Transfer ${transferId} lost destination entrance ${transfer.destinationEntranceId}.`);
    }
    const oldEntrance = { x: transfer.destinationEntranceTileX, y: transfer.destinationEntranceTileY };
    if (!sameTile(oldEntrance, destinationEntrance.tile)) {
      if (!staleMapIds.includes(transfer.destinationMapId as MapId)) {
        throw new LayoutMigrationError(`Transfer ${transferId} entrance coordinates drifted on a current layout.`);
      }
      transfer.destinationEntranceTileX = destinationEntrance.tile.x;
      transfer.destinationEntranceTileY = destinationEntrance.tile.y;
      addEvidence({
        recordId: transferId,
        field: 'destination_entrance',
        mapId: transfer.destinationMapId as MapId,
        oldTile: oldEntrance,
        newTile: destinationEntrance.tile,
        reason: 'portal_moved',
      });
    }
    recoverDestination({
      recordId: transferId,
      field: 'destination_goal',
      mapId: transfer.destinationMapId,
      locationId: transfer.destinationLocationId,
      tile: { x: transfer.destinationGoalTileX, y: transfer.destinationGoalTileY },
      write: (tile) => { transfer.destinationGoalTileX = tile.x; transfer.destinationGoalTileY = tile.y; },
    });
    if (transfer.status === 'approaching_exit') {
      const originMap = mapFor(catalog, transfer.originMapId);
      const exit = originMap.portalById.get(transfer.edgePortalId);
      const npc = draft.npcs[transfer.npcId];
      const goal = npc?.scheduleGoal;
      if (!exit || !npc || !goal || goal.activityId !== 'travel' || goal.mapId !== transfer.originMapId) {
        throw new LayoutMigrationError(`Transfer ${transferId} lost its exact origin portal travel goal.`);
      }
      const oldExit = { x: goal.tileX, y: goal.tileY };
      if (!sameTile(oldExit, exit.tile)) {
        if (!staleMapIds.includes(transfer.originMapId as MapId)) {
          throw new LayoutMigrationError(`Transfer ${transferId} origin coordinates drifted on a current layout.`);
        }
        goal.tileX = exit.tile.x;
        goal.tileY = exit.tile.y;
        addEvidence({
          recordId: transfer.npcId,
          field: 'schedule_goal.travel_portal',
          mapId: transfer.originMapId as MapId,
          oldTile: oldExit,
          newTile: exit.tile,
          reason: 'portal_moved',
        });
      }
    }
  }

  for (const scheduleId of Object.keys(draft.schedules).sort(compareAscii)) {
    const schedule = draft.schedules[scheduleId]!;
    schedule.blocks.forEach((block, index) => recoverDestination({
      recordId: scheduleId,
      field: `blocks.${index}`,
      mapId: block.mapId,
      locationId: block.locationId,
      tile: { x: block.tileX, y: block.tileY },
      write: (tile) => { block.tileX = tile.x; block.tileY = tile.y; },
    }));
  }

  for (const entry of Object.values(draft.journal)) {
    if (entry.locationId) mapForLocation(catalog, entry.locationId);
  }
  for (const item of Object.values(draft.evidence)) mapForLocation(catalog, item.locationId);
  for (const mapState of Object.values(draft.maps)) {
    const map = mapFor(catalog, mapState.id);
    for (const entranceId of mapState.discoveredEntranceIds) {
      if (!map.portalById.has(entranceId) && !map.locationBindingById.has(entranceId)) {
        throw new LayoutMigrationError(`Map ${mapState.id} lost discovered entrance ${entranceId}.`);
      }
    }
  }

  for (const mapId of staleMapIds) {
    draft.layoutRevisions[mapId] = catalog[mapId].source.layoutRevision;
  }
  draft.layoutMigrationEvidence = evidence.slice(-512);
  return { state: WorldStateSchema.parse(draft), migratedMapIds: staleMapIds };
}
