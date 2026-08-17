import { createInitialState } from '../../../domain/state/initial-state';
import { parseWorldState } from '../../../domain/state/schema';
import { WORLD_MAP_CATALOG } from '../map-catalog';
import { canStartPortalTransition, transitionNeighborhood } from '../transitions';
import { autosaveStableState } from '../autosave';
import type { MapId } from '../../../world/maps/catalog';
import { portalZoneTiles } from '../../../world/transfers/portal-zone';

function atPortal(mapId: MapId, portalId: string) {
  const portal = WORLD_MAP_CATALOG[mapId].source.portals.find(({ id }) => id === portalId)!;
  return atTile(mapId, portal.tile);
}

function atTile(mapId: MapId, tile: Readonly<{ x: number; y: number }>) {
  return parseWorldState({
    ...createInitialState(),
    protagonist: {
      ...createInitialState().protagonist,
      locationId: mapId,
      worldPosition: { mapId, tileX: tile.x, tileY: tile.y },
    },
    maps: Object.fromEntries(Object.entries(createInitialState().maps).map(([id, map]) => [id, {
      ...map,
      active: id === mapId,
    }])),
    npcs: Object.fromEntries(Object.entries(createInitialState().npcs).map(([id, npc]) => [id, {
      ...npc,
      presence: npc.presence.kind === 'in_transit' ? npc.presence : {
        ...npc.presence,
        kind: npc.presence.mapId === mapId ? 'active_local' : 'inactive',
      },
    }])),
  });
}

const loadMap = async (mapId: MapId) => WORLD_MAP_CATALOG[mapId];

describe('atomic neighborhood transitions', () => {
  test('does not auto-start travel under dialogue, panels, transition, or arrival lock', () => {
    const clear = {
      arrivalLocked: false, transitioning: false,
      conversationOpen: false, panelOpen: false,
    };
    expect(canStartPortalTransition(clear)).toBe(true);
    for (const blocked of [
      { arrivalLocked: true }, { transitioning: true },
      { conversationOpen: true }, { panelOpen: true },
    ]) {
      expect(canStartPortalTransition({ ...clear, ...blocked })).toBe(false);
    }
  });

  test.each([
    ['northwest_residential', 'to-downtown', 'northeast_downtown'],
    ['northeast_downtown', 'to-docks', 'southeast_docks'],
    ['southeast_docks', 'from-commercial', 'southwest_commercial'],
    ['southwest_commercial', 'from-residential', 'northwest_residential'],
  ] as const)('moves through the square from %s through %s', async (origin, portalId, destination) => {
    const pausedStates: unknown[] = [];
    const result = await transitionNeighborhood({
      state: atPortal(origin, portalId),
      catalog: WORLD_MAP_CATALOG,
      sourcePortalId: portalId,
      loadMap,
      onPaused: (state) => pausedStates.push(state),
    });
    expect(result.completed).toBe(true);
    expect(result.state.protagonist.worldPosition.mapId).toBe(destination);
    expect(result.state.maps[destination]?.active).toBe(true);
    expect(result.state.clock.pauseTokens).toEqual([]);
    expect(pausedStates).toHaveLength(1);
  });

  test('rolls spatial state back after a destination load failure', async () => {
    const source = atPortal('northwest_residential', 'to-downtown');
    const result = await transitionNeighborhood({
      state: source,
      catalog: WORLD_MAP_CATALOG,
      sourcePortalId: 'to-downtown',
      loadMap: async () => { throw new Error('Map bundle unavailable.'); },
    });
    expect(result.completed).toBe(false);
    expect(result.feedback).toBe('Map bundle unavailable.');
    expect(result.state.protagonist).toEqual(source.protagonist);
    expect(result.state.maps).toEqual(source.maps);
    expect(result.state.clock.pauseTokens).toEqual([]);
  });

  test('uses the first free staging tile when the entrance is occupied', async () => {
    const result = await transitionNeighborhood({
      state: atPortal('northwest_residential', 'to-downtown'),
      catalog: WORLD_MAP_CATALOG,
      sourcePortalId: 'to-downtown',
      loadMap,
      destinationBlockers: new Set(['0,24']),
    });
    expect(result.state.protagonist.worldPosition).toEqual({
      mapId: 'northeast_downtown', tileX: 1, tileY: 24,
    });
    expect(result.feedback).toContain('staging tile');
  });

  test('rejects activation away from the portal zone without changing state', async () => {
    await expect(transitionNeighborhood({
      state: createInitialState(),
      catalog: WORLD_MAP_CATALOG,
      sourcePortalId: 'to-downtown',
      loadMap,
    })).rejects.toThrow('source portal zone');
  });

  test('travels from any tile of the portal zone', async () => {
    const zone = portalZoneTiles(
      WORLD_MAP_CATALOG.northwest_residential,
      WORLD_MAP_CATALOG.northwest_residential.portalById.get('to-downtown')!,
    );
    const corner = zone.at(0)!;
    expect(corner).not.toEqual({ x: 63, y: 24 });
    const result = await transitionNeighborhood({
      state: atTile('northwest_residential', corner),
      catalog: WORLD_MAP_CATALOG,
      sourcePortalId: 'to-downtown',
      loadMap,
    });
    expect(result.completed).toBe(true);
    expect(result.state.protagonist.worldPosition.mapId).toBe('northeast_downtown');
  });

  /**
   * The office is the only map reached from a WEST edge, and the only one that is a leaf rather
   * than a grid cell. This walks it in both directions, because a portal that opens and cannot be
   * left is a trap the reciprocal-portal check alone does not catch — that check compares authored
   * ids, not whether the arrival tile is walkable.
   */
  test('walks into the office through the west portal and back out again', async () => {
    const entering = await transitionNeighborhood({
      state: atPortal('northwest_residential', 'to-office'),
      catalog: WORLD_MAP_CATALOG,
      sourcePortalId: 'to-office',
      loadMap,
    });
    expect(entering.completed).toBe(true);
    expect(entering.state.protagonist.worldPosition.mapId).toBe('west_office');
    expect(WORLD_MAP_CATALOG.west_office.blockedKeys.has(
      `${entering.state.protagonist.worldPosition.tileX},${entering.state.protagonist.worldPosition.tileY}`,
    )).toBe(false);

    const leaving = await transitionNeighborhood({
      state: atPortal('west_office', 'from-residential'),
      catalog: WORLD_MAP_CATALOG,
      sourcePortalId: 'from-residential',
      loadMap,
    });
    expect(leaving.completed).toBe(true);
    expect(leaving.state.protagonist.worldPosition.mapId).toBe('northwest_residential');
  });
});

describe('stable-boundary autosaves', () => {
  test('saves only the final unpaused state', async () => {
    const requestSave = jest.fn(async () => ({
      status: 'saved' as const,
      slotId: 'slot-001' as const,
      saveGeneration: 4,
      checksum: 'a'.repeat(64),
      maintenanceWarnings: [],
    }));
    const state = createInitialState();
    await autosaveStableState({ persistence: { requestSave }, state, trigger: 'travel', expectedSaveGeneration: 3 });
    expect(requestSave).toHaveBeenCalledWith(expect.objectContaining({ state, trigger: 'travel' }));
    await autosaveStableState({
      persistence: { requestSave }, state, trigger: 'major_quest', expectedSaveGeneration: 4,
    });
    expect(requestSave).toHaveBeenLastCalledWith(expect.objectContaining({ state, trigger: 'major_quest' }));

    const paused = parseWorldState({ ...state, clock: { ...state.clock, pauseTokens: ['pause:transition:test'] } });
    await expect(autosaveStableState({
      persistence: { requestSave }, state: paused, trigger: 'travel', expectedSaveGeneration: 4,
    })).rejects.toThrow('stable world');
    expect(requestSave).toHaveBeenCalledTimes(2);
  });
});
