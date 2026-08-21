import { buildDevonCinematicPortrait, buildDevonDialoguePortrait } from '../write-devon-dialogue-portraits';

describe('Devon dialogue portraits', () => {
  test('builds blue-grey alien expressions and separate cinematic art', () => {
    const portraits = ['rest', 'joy', 'upset'].map((expression) => (
      buildDevonDialoguePortrait(expression as 'rest' | 'joy' | 'upset')
    ));
    const cinematic = buildDevonCinematicPortrait();
    expect(new Set(portraits.map(({ data }) => Buffer.from(data).toString('base64'))).size).toBe(3);
    expect([cinematic.width, cinematic.height]).toEqual([754, 900]);
    expect(Buffer.from(cinematic.data).equals(Buffer.from(portraits[0]!.data))).toBe(false);
    for (const portrait of [...portraits, cinematic]) {
      expect([portrait.width, portrait.height]).toEqual([754, 900]);
      expect(portrait.data.some((value, index) => index % 4 === 0 && value === 132)).toBe(true);
      expect(portrait.data.some((value, index) => index % 4 === 0 && value === 105)).toBe(true);
    }
  });
});
