import { buildMinaCinematicPortrait, buildMinaDialoguePortrait } from '../write-mina-dialogue-portraits';

describe('Mina dialogue portraits', () => {
  test('keeps the tall hat, green face, and three distinct expressions', () => {
    const portraits = ['rest', 'joy', 'upset'].map((expression) => (
      buildMinaDialoguePortrait(expression as 'rest' | 'joy' | 'upset')
    ));
    expect(portraits.every(({ width, height }) => width === 754 && height === 900)).toBe(true);
    expect(new Set(portraits.map(({ data }) => Buffer.from(data).toString('base64'))).size).toBe(3);
    expect(portraits[0]!.data.some((value, index) => index % 4 === 1 && value === 151)).toBe(true);
  });

  test('builds separate detailed art for the cinematic portrait', () => {
    const dialogue = buildMinaDialoguePortrait('rest');
    const cinematic = buildMinaCinematicPortrait();
    expect([cinematic.width, cinematic.height]).toEqual([754, 900]);
    expect(Buffer.from(cinematic.data).equals(Buffer.from(dialogue.data))).toBe(false);
  });
});
