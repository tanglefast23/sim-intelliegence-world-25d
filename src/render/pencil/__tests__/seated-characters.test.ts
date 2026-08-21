import { AUTHORED_SEATED_VISUAL_IDS } from '../billboard';
import {
  bakeSeatedPencilCharacterFrames,
  bakePencilCharacterFrames,
  PENCIL_CHARACTER_RECIPES,
  type PencilVisualId,
} from '../characters';
import { PENCIL_HEIGHT, PENCIL_WIDTH } from '../vampire';

const SEATED_CREATURES = [
  'linda-boyfriend', 'devon-price', 'rafael-cruz', 'tomas-reed', 'priya-nair',
  'sora-tan', 'resident-01', 'resident-02', 'elise-moreau',
] as const satisfies readonly PencilVisualId[];

describe('authored seated creature frames', () => {
  test('cover every assigned desk character with deterministic four-facing art', () => {
    expect([...AUTHORED_SEATED_VISUAL_IDS]).toEqual(['vampire-01', ...SEATED_CREATURES]);

    for (const visualId of SEATED_CREATURES) {
      const first = bakeSeatedPencilCharacterFrames(PENCIL_CHARACTER_RECIPES[visualId]);
      const second = bakeSeatedPencilCharacterFrames(PENCIL_CHARACTER_RECIPES[visualId]);
      const standing = bakePencilCharacterFrames(PENCIL_CHARACTER_RECIPES[visualId]);
      expect(first).toHaveLength(12);
      expect(Buffer.from(first[0]!)).toEqual(Buffer.from(second[0]!));

      for (const [facing, frameIndex] of [0, 3, 6, 9].entries()) {
        let opaque = 0;
        let bottom = 0;
        for (let y = 0; y < PENCIL_HEIGHT; y += 1) {
          for (let x = 0; x < PENCIL_WIDTH; x += 1) {
            if (first[frameIndex]![(y * PENCIL_WIDTH + x) * 4 + 3]! === 0) continue;
            opaque += 1;
            bottom = y;
          }
        }
        expect(opaque).toBeGreaterThan(250);
        let standingBottom = 0;
        const standingFrame = standing[facing * 9]!;
        for (let y = 0; y < PENCIL_HEIGHT; y += 1) {
          for (let x = 0; x < PENCIL_WIDTH; x += 1) {
            if (standingFrame[(y * PENCIL_WIDTH + x) * 4 + 3]! > 0) standingBottom = y;
          }
        }
        expect(bottom).toBeGreaterThanOrEqual(standingBottom);
      }
    }
  });
});
