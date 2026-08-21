import { buildLindaCinematicPortrait, buildLindaDialoguePortrait } from '../write-linda-dialogue-portraits';

describe('Linda dialogue portraits', () => {
  test('builds distinct Bigfoot expressions and separate cinematic art', () => {
    const portraits = ['rest', 'joy', 'upset'].map((expression) => (
      buildLindaDialoguePortrait(expression as 'rest' | 'joy' | 'upset')
    ));
    const cinematic = buildLindaCinematicPortrait();
    expect(portraits.every(({ width, height }) => width === 754 && height === 900)).toBe(true);
    expect(new Set(portraits.map(({ data }) => Buffer.from(data).toString('base64'))).size).toBe(3);
    expect([cinematic.width, cinematic.height]).toEqual([754, 900]);
    expect(Buffer.from(cinematic.data).equals(Buffer.from(portraits[0]!.data))).toBe(false);
    for (const portrait of [...portraits, cinematic]) {
      const hasSage = portrait.data.some((green, offset) => (
        offset % 4 === 1 && green > portrait.data[offset - 1]! + 5 && green > portrait.data[offset + 1]! + 8
      ));
      expect(hasSage).toBe(false);
    }
  });
});
