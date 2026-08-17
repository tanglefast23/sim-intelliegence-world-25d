import { WORLD_MAP_CATALOG } from '../../application/runtime/map-catalog';
import { createInitialState } from '../../domain/state/initial-state';
import { WorldStateSchema, type WorldState } from '../../domain/state/schema';
import type { WorldMapV2Catalog } from '../maps/catalog';
import type { CompiledMapV2 } from '../maps/compiled-v2';
import { LayoutMigrationError, recoverWorldLayout } from '../maps/layout-recovery';
import { tileKey } from '../maps/schema';

const ALL_MAP_IDS = [
  'northeast_downtown',
  'northwest_residential',
  'southeast_docks',
  'southwest_commercial',
  'west_office',
] as const;

function stale(candidate: WorldState): WorldState {
  return WorldStateSchema.parse({
    ...candidate,
    layoutRevisions: Object.fromEntries(ALL_MAP_IDS.map((mapId) => [mapId, 0])),
    layoutMigrationEvidence: [],
  });
}

function withNorthwest(map: CompiledMapV2): WorldMapV2Catalog {
  return { ...WORLD_MAP_CATALOG, northwest_residential: map };
}

describe('deterministic layout recovery', () => {
  test('keeps a valid actor unchanged and updates all revisions only after success', () => {
    const source = stale(createInitialState());
    const before = source.protagonist.worldPosition;
    const result = recoverWorldLayout(source, WORLD_MAP_CATALOG);
    expect(result.migratedMapIds).toEqual(ALL_MAP_IDS);
    expect(result.state.protagonist.worldPosition).toEqual(before);
    expect(result.state.layoutRevisions).toEqual(createInitialState().layoutRevisions);
    expect(result.state.layoutMigrationEvidence).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ recordId: 'protagonist', field: 'world_position' }),
    ]));
  });

  test('moves a stale Sunward actor out of the new shallows deterministically', () => {
    const initial = createInitialState();
    const source = WorldStateSchema.parse({
      ...initial,
      layoutRevisions: { ...initial.layoutRevisions, northwest_residential: 1 },
      protagonist: {
        ...initial.protagonist,
        locationId: 'northwest_residential',
        worldPosition: { mapId: 'northwest_residential', tileX: 40, tileY: 44 },
      },
    });
    const first = recoverWorldLayout(source, WORLD_MAP_CATALOG);
    const second = recoverWorldLayout(source, WORLD_MAP_CATALOG);
    expect(first).toEqual(second);
    expect(first.migratedMapIds).toEqual(['northwest_residential']);
    expect(first.state.protagonist.worldPosition).not.toEqual(source.protagonist.worldPosition);
    expect(WORLD_MAP_CATALOG.northwest_residential.blockedKeys.has(
      `${first.state.protagonist.worldPosition.tileX},${first.state.protagonist.worldPosition.tileY}`,
    )).toBe(false);
  });

  test('moves active and inactive actors within Linda villa without claiming one tile twice', () => {
    const initial = createInitialState();
    const source = stale(WorldStateSchema.parse({
      ...initial,
      npcs: {
        ...initial.npcs,
        linda: {
          ...initial.npcs.linda,
          presence: {
            kind: 'active_local', mapId: 'northwest_residential', locationId: 'linda_villa',
            tileX: 21, tileY: 26,
          },
        },
        linda_boyfriend: {
          ...initial.npcs.linda_boyfriend,
          presence: {
            kind: 'inactive', mapId: 'northwest_residential', locationId: 'linda_villa',
            tileX: 21, tileY: 26,
          },
        },
      },
    }));
    const result = recoverWorldLayout(source, WORLD_MAP_CATALOG).state;
    const linda = result.npcs.linda!.presence;
    const boyfriend = result.npcs.linda_boyfriend!.presence;
    if (linda.kind === 'in_transit' || boyfriend.kind === 'in_transit') throw new Error('Expected local actors.');
    const binding = WORLD_MAP_CATALOG.northwest_residential.locationBindingById.get('linda_villa')!;
    const candidates = new Set(binding.candidateTiles.map(tileKey));
    expect(candidates.has(`${linda.tileX},${linda.tileY}`)).toBe(true);
    expect(candidates.has(`${boyfriend.tileX},${boyfriend.tileY}`)).toBe(true);
    expect({ x: linda.tileX, y: linda.tileY }).not.toEqual({ x: boyfriend.tileX, y: boyfriend.tileY });
    expect(result.layoutMigrationEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ recordId: 'linda_boyfriend', reason: 'claimed_actor' }),
    ]));
  });

  test('rejects interaction, staging, and portal cells for an ordinary actor', () => {
    const reservedTiles = [
      { x: 19, y: 18 },
      { x: 16, y: 25 },
      { x: 63, y: 24 },
    ];
    for (const tile of reservedTiles) {
      const initial = createInitialState();
      const source = stale(WorldStateSchema.parse({
        ...initial,
        protagonist: {
          ...initial.protagonist,
          worldPosition: { mapId: 'northwest_residential', tileX: tile.x, tileY: tile.y },
        },
      }));
      const result = recoverWorldLayout(source, WORLD_MAP_CATALOG).state;
      expect(result.protagonist.worldPosition).not.toEqual({
        mapId: 'northwest_residential', tileX: tile.x, tileY: tile.y,
      });
      expect(result.layoutMigrationEvidence).toEqual(expect.arrayContaining([
        expect.objectContaining({ recordId: 'protagonist', reason: 'reserved_role' }),
      ]));
    }
  });

  test('recovers destination and origin portal coordinates from stable portal identities', () => {
    const initial = createInitialState();
    const destination = WORLD_MAP_CATALOG.northeast_downtown.portalById.get('from-residential')!;
    const source = stale(WorldStateSchema.parse({
      ...initial,
      npcs: {
        ...initial.npcs,
        generic_resident: {
          ...initial.npcs.generic_resident,
          scheduleGoal: {
            mapId: 'northwest_residential', locationId: 'northwest_residential', activityId: 'travel',
            tileX: 62, tileY: 24, scheduledMinute: initial.clock.absoluteMinute,
          },
        },
      },
      transfers: {
        transfer_fixture: {
          id: 'transfer_fixture', status: 'approaching_exit', npcId: 'generic_resident',
          originMapId: 'northwest_residential', destinationMapId: 'northeast_downtown',
          edgePortalId: 'to-downtown', departureMinute: 500, arrivalMinute: 510,
          destinationEntranceId: 'from-residential', destinationEntranceTileX: 1, destinationEntranceTileY: 24,
          destinationLocationId: 'northeast_downtown', destinationActivityId: 'travel',
          destinationGoalTileX: destination.tile.x, destinationGoalTileY: destination.tile.y,
        },
      },
    }));
    const result = recoverWorldLayout(source, WORLD_MAP_CATALOG).state;
    expect(result.transfers.transfer_fixture).toEqual(expect.objectContaining({
      destinationEntranceTileX: destination.tile.x,
      destinationEntranceTileY: destination.tile.y,
    }));
    expect(result.npcs.generic_resident?.scheduleGoal).toEqual(expect.objectContaining({ tileX: 63, tileY: 24 }));
    expect(result.layoutMigrationEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'destination_entrance', reason: 'portal_moved' }),
      expect.objectContaining({ field: 'schedule_goal.travel_portal', reason: 'portal_moved' }),
    ]));
  });

  test('a missing stable portal ID fails without modifying any source field or revision', () => {
    const initial = createInitialState();
    const source = stale(WorldStateSchema.parse({
      ...initial,
      npcs: {
        ...initial.npcs,
        generic_resident: {
          ...initial.npcs.generic_resident,
          scheduleGoal: {
            mapId: 'northwest_residential', locationId: 'northwest_residential', activityId: 'travel',
            tileX: 63, tileY: 24, scheduledMinute: initial.clock.absoluteMinute,
          },
        },
      },
      transfers: {
        transfer_fixture: {
          id: 'transfer_fixture', status: 'approaching_exit', npcId: 'generic_resident',
          originMapId: 'northwest_residential', destinationMapId: 'northeast_downtown',
          edgePortalId: 'to-downtown', departureMinute: 500, arrivalMinute: 510,
          destinationEntranceId: 'missing-entrance', destinationEntranceTileX: 0, destinationEntranceTileY: 24,
          destinationLocationId: 'northeast_downtown', destinationActivityId: 'travel',
          destinationGoalTileX: 0, destinationGoalTileY: 24,
        },
      },
    }));
    const before = JSON.stringify(source);
    expect(() => recoverWorldLayout(source, WORLD_MAP_CATALOG)).toThrow(LayoutMigrationError);
    expect(JSON.stringify(source)).toBe(before);
  });

  test('no valid binding tile fails as one transaction and leaves the source byte-identical', () => {
    const northwest = WORLD_MAP_CATALOG.northwest_residential;
    const bindings = new Map(northwest.locationBindingById);
    bindings.set('protagonist_villa', {
      ...bindings.get('protagonist_villa')!,
      candidateTiles: [{ x: 20, y: 18 }],
      preferredApproachTiles: [],
    });
    const catalog = withNorthwest({ ...northwest, locationBindingById: bindings });
    const initial = createInitialState();
    const source = stale(WorldStateSchema.parse({
      ...initial,
      protagonist: {
        ...initial.protagonist,
        worldPosition: { mapId: 'northwest_residential', tileX: 20, tileY: 18 },
      },
    }));
    const before = JSON.stringify(source);
    expect(() => recoverWorldLayout(source, catalog)).toThrow('No valid protagonist_villa actor tile');
    expect(JSON.stringify(source)).toBe(before);
  });
});
