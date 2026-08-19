import {
  devHarnessGroups,
  formatDevHarnessHash,
  parseDevHarnessHash,
  resolveDevHarnessRoute,
} from '../route';

const ENTRIES = [
  { id: 'world', group: 'Game', cases: [{ id: 'start' }, { id: 'docks' }] },
  { id: 'people', group: 'Game', cases: [{ id: 'linda' }] },
  { id: 'empty', group: 'Other', cases: [] },
] as const;

describe('dev harness routes', () => {
  test('round-trips stable entry and case hashes', () => {
    const route = { entryId: 'world', caseId: 'docks' };
    expect(parseDevHarnessHash(formatDevHarnessHash(route))).toEqual(route);
    expect(parseDevHarnessHash('#/dev')).toEqual({});
    expect(parseDevHarnessHash('#not-dev')).toEqual({});
  });

  test('uses the first case and rejects stale addresses', () => {
    expect(resolveDevHarnessRoute(ENTRIES, { entryId: 'world' })).toEqual({
      kind: 'entry', entryId: 'world', caseId: 'start',
    });
    expect(resolveDevHarnessRoute(ENTRIES, { entryId: 'world', caseId: 'missing' })).toEqual({ kind: 'menu' });
    expect(resolveDevHarnessRoute(ENTRIES, { entryId: 'empty' })).toEqual({ kind: 'menu' });
    expect(resolveDevHarnessRoute(ENTRIES, {})).toEqual({ kind: 'menu' });
    expect(resolveDevHarnessRoute([{ id: 'conversations', group: 'People', cases: [{ id: 'vampire-01' }] }], {})).toEqual({
      kind: 'entry', entryId: 'conversations', caseId: 'vampire-01',
    });
  });

  test('keeps group and registry order', () => {
    expect(devHarnessGroups(ENTRIES).map((group) => ({
      name: group.name,
      ids: group.entries.map((entry) => entry.id),
    }))).toEqual([
      { name: 'Game', ids: ['world', 'people'] },
      { name: 'Other', ids: ['empty'] },
    ]);
  });
});
