import { buildCalderCinematicPortrait, buildCalderDialoguePortrait } from '../write-calder-dialogue-portraits';

describe('Calder dialogue portraits', () => {
  test('builds robot expressions and separate cinematic art', () => {
    const portraits = ['rest', 'joy', 'upset'].map((expression) => (
      buildCalderDialoguePortrait(expression as 'rest' | 'joy' | 'upset')
    ));
    const cinematic = buildCalderCinematicPortrait();
    expect(new Set(portraits.map(({ data }) => Buffer.from(data).toString('base64'))).size).toBe(3);
    expect(Buffer.from(cinematic.data).equals(Buffer.from(portraits[0]!.data))).toBe(false);
    for (const portrait of [...portraits, cinematic]) {
      expect([portrait.width, portrait.height]).toEqual([754, 900]);
      expect(portrait.data.some((value, index) => index % 4 === 0 && value === 220)).toBe(true);
      expect(portrait.data.some((value, index) => index % 4 === 0 && value === 64)).toBe(true);
      expect(portrait.data.some((value, index) => index % 4 === 0 && value === 174)).toBe(true);
    }
  });
});
