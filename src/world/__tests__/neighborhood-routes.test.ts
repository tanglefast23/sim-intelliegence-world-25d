import { NEIGHBORHOOD_ROUTES, routeBetween } from '../transfers/routes';

const MAP_IDS = ['northwest_residential', 'northeast_downtown', 'southwest_commercial', 'southeast_docks'] as const;

describe('routeBetween', () => {
  it('returns the direct route for a cardinal pair', () => {
    const route = routeBetween('northwest_residential', 'northeast_downtown');
    expect(route.originMapId).toBe('northwest_residential');
    expect(route.destinationMapId).toBe('northeast_downtown');
  });

  it('returns a first leg instead of throwing for a diagonal pair', () => {
    // The bug this locks: an NPC whose schedule goal sat on the opposite corner threw
    // "not cardinal neighbors" inside the schedule tick, and the uncaught error unmounted the
    // whole interface. Both diagonals must now hand back a walkable first leg.
    for (const [origin, destination] of [
      ['northwest_residential', 'southeast_docks'],
      ['southeast_docks', 'northwest_residential'],
      ['northeast_downtown', 'southwest_commercial'],
      ['southwest_commercial', 'northeast_downtown'],
    ] as const) {
      const leg = routeBetween(origin, destination);
      expect(leg.originMapId).toBe(origin);
      expect(leg.destinationMapId).not.toBe(destination);
      // The leg must actually make progress: its destination reaches the goal directly.
      expect(routeBetween(leg.destinationMapId, destination).destinationMapId).toBe(destination);
    }
  });

  it('reaches every map from every other map by walking legs', () => {
    for (const origin of MAP_IDS) {
      for (const destination of MAP_IDS) {
        if (origin === destination) continue;
        let current: string = origin;
        let hops = 0;
        while (current !== destination) {
          current = routeBetween(current, destination).destinationMapId;
          hops += 1;
          expect(hops).toBeLessThanOrEqual(MAP_IDS.length);
        }
        expect(current).toBe(destination);
      }
    }
  });

  it('is deterministic: the same pair always picks the same leg', () => {
    const first = routeBetween('northwest_residential', 'southeast_docks');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(routeBetween('northwest_residential', 'southeast_docks')).toEqual(first);
    }
  });

  /**
   * The office hangs off northwest by one portal, so it is a LEAF, not a fifth grid cell. It is
   * kept out of `MAP_IDS` above on purpose: the all-pairs walk asserts a hop bound of four, and
   * `routeBetween` only ever chains ONE intermediate leg. Office to docks is two intermediates.
   */
  it('reaches the office directly from northwest and back', () => {
    expect(routeBetween('northwest_residential', 'west_office').sourcePortalId).toBe('to-office');
    expect(routeBetween('west_office', 'northwest_residential').sourcePortalId).toBe('from-residential');
  });

  /**
   * Office to docks is three hops, and `routeBetween` only ever chains ONE intermediate leg, so it
   * throws. That is the current contract, recorded here rather than discovered by an NPC: nothing
   * on the office map has a schedule that leaves it, and widening the search is a separate change.
   */
  it('throws for the office to a map two legs away', () => {
    expect(() => routeBetween('west_office', 'southeast_docks')).toThrow('are not connected');
  });

  it('still throws when no path exists at all', () => {
    expect(() => routeBetween('northwest_residential', 'atlantis')).toThrow('are not connected');
  });

  it('leaves every authored cardinal route reachable directly', () => {
    for (const route of NEIGHBORHOOD_ROUTES) {
      expect(routeBetween(route.originMapId, route.destinationMapId).sourcePortalId)
        .toBe(route.sourcePortalId);
    }
  });
});
