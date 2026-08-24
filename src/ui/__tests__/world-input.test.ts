import { worldInputKeyAction } from '../WorldInput';

describe('WorldInput keyboard recovery controls', () => {
  test('keeps Escape and Q live while world input is disabled', () => {
    expect(worldInputKeyAction({ disabled: true, key: 'Escape', modified: false, repeat: false, typing: false })).toBe('cancel');
    expect(worldInputKeyAction({ disabled: true, key: 'q', modified: false, repeat: false, typing: false })).toBe('quests');
    expect(worldInputKeyAction({ disabled: true, key: 'f', modified: false, repeat: false, typing: false })).toBe('ignore');
  });

  test('does not turn typed or modified Q into a quest command', () => {
    expect(worldInputKeyAction({ disabled: true, key: 'q', modified: false, repeat: false, typing: true })).toBe('ignore');
    expect(worldInputKeyAction({ disabled: true, key: 'q', modified: true, repeat: false, typing: false })).toBe('ignore');
  });
});
