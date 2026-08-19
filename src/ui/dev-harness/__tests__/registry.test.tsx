import { DEV_HARNESS_ENTRIES } from '../registry';

jest.mock('../../../render/WorldScene', () => ({ WorldScene: () => null }));

describe('dev harness registry', () => {
  test('keeps only the walkable vampire scene', () => {
    expect(DEV_HARNESS_ENTRIES.map((entry) => entry.id)).toEqual(['vampire-scene']);
    expect(DEV_HARNESS_ENTRIES[0]?.cases.map((entryCase) => entryCase.id)).toEqual(['walk']);
  });
});
