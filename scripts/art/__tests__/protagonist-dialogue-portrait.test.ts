import { buildProtagonistDialoguePortrait } from '../write-protagonist-dialogue-portrait';

describe('protagonist dialogue portrait', () => {
  test('scales the vampire atlas portrait onto a transparent 754x900 canvas', () => {
    const portrait = buildProtagonistDialoguePortrait();
    expect(portrait.width).toBe(754);
    expect(portrait.height).toBe(900);
    expect(portrait.data[3]).toBe(0);
    const centerAlpha = portrait.data[((450 * portrait.width + 377) * 4) + 3];
    expect(centerAlpha).toBeGreaterThan(0);
  });
});
