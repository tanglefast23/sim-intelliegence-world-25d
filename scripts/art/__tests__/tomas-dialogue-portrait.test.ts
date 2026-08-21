import { buildTomasDialoguePortrait } from '../write-tomas-dialogue-portraits';

describe('Tomas dialogue portraits', () => {
  test('use the vampire canvas and distinct mouthless block-pixel expressions', () => {
    const rest = buildTomasDialoguePortrait('rest');
    const joy = buildTomasDialoguePortrait('joy');
    const upset = buildTomasDialoguePortrait('upset');
    expect([rest.width, rest.height]).toEqual([754, 900]);
    expect(Buffer.compare(rest.data, joy.data)).not.toBe(0);
    expect(Buffer.compare(rest.data, upset.data)).not.toBe(0);
    expect(rest.data.some((value, offset) => offset % 4 === 3 && value > 0)).toBe(true);
  });
});
