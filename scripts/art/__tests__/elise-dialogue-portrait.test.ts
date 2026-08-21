import { buildEliseDialoguePortrait } from '../write-elise-dialogue-portraits';

describe('Elise dialogue portraits', () => {
  test('use the vampire canvas and distinct block-pixel expressions', () => {
    const rest = buildEliseDialoguePortrait('rest');
    const joy = buildEliseDialoguePortrait('joy');
    const upset = buildEliseDialoguePortrait('upset');
    expect([rest.width, rest.height]).toEqual([754, 900]);
    expect(Buffer.compare(rest.data, joy.data)).not.toBe(0);
    expect(Buffer.compare(rest.data, upset.data)).not.toBe(0);
    expect(rest.data.some((value, offset) => offset % 4 === 3 && value > 0)).toBe(true);
  });
});
