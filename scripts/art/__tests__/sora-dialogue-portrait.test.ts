import { buildSoraCinematicPortrait, buildSoraDialoguePortrait } from '../write-sora-dialogue-portraits';

describe('Sora dialogue portraits', () => {
  test('builds distinct ghoul expressions and separate cinematic art', () => {
    const portraits = ['rest', 'joy', 'upset'].map((expression) => (
      buildSoraDialoguePortrait(expression as 'rest' | 'joy' | 'upset')
    ));
    const cinematic = buildSoraCinematicPortrait();
    expect(new Set(portraits.map(({ data }) => Buffer.from(data).toString('base64'))).size).toBe(3);
    expect([cinematic.width, cinematic.height]).toEqual([754, 900]);
    expect(Buffer.from(cinematic.data).equals(Buffer.from(portraits[0]!.data))).toBe(false);
    for (const portrait of [...portraits, cinematic]) {
      expect([portrait.width, portrait.height]).toEqual([754, 900]);
      expect(portrait.data.some((value, index) => index % 4 === 1 && value === 184)).toBe(true);
    }
  });
});
