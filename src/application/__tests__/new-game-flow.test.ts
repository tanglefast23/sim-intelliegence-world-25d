import { normalizePlayerName } from '../new-game-name';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('new game flow', () => {
  test.each([
    ['  Mistake  ', 'Mistake'],
    ['Joe   Mac', 'Joe Mac'],
    ['\tIsland\nGuest\t', 'Island Guest'],
  ])('normalizes a player-facing name without changing the stable ID', (source, expected) => {
    expect(normalizePlayerName(source)).toBe(expected);
  });

  test('caps a name at the state contract limit', () => {
    expect(normalizePlayerName('A'.repeat(40))).toHaveLength(32);
  });

  test('matches the arrival card to the 07:00 initial state', () => {
    expect(readFileSync(join(process.cwd(), 'src/application/NewGameFlow.tsx'), 'utf8'))
      .toContain('DAY 1 · 07:00 · SUNWARD BAY');
  });
});
