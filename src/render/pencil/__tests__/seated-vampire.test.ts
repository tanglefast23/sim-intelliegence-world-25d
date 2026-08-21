import { bakeSeatedVampireFrames, VAMPIRE_SEATED_BONE_IDS } from '../seated-vampire';
import { PENCIL_CONTACT_ROW, PENCIL_HEIGHT, PENCIL_WIDTH } from '../vampire';

describe('seated vampire rig', () => {
  test('keeps deterministic part bones, all facings, and floor contact', () => {
    const first = bakeSeatedVampireFrames();
    const second = bakeSeatedVampireFrames();

    expect(new Set(VAMPIRE_SEATED_BONE_IDS).size).toBe(VAMPIRE_SEATED_BONE_IDS.length);
    expect(first).toHaveLength(12);
    expect(Buffer.from(first[0]!)).toEqual(Buffer.from(second[0]!));

    for (const frameIndex of [0, 3, 6, 9]) {
      let bottom = 0;
      for (let y = 0; y < PENCIL_HEIGHT; y += 1) {
        for (let x = 0; x < PENCIL_WIDTH; x += 1) {
          if (first[frameIndex]![(y * PENCIL_WIDTH + x) * 4 + 3]! > 0) bottom = y;
        }
      }
      expect(bottom).toBeGreaterThanOrEqual(PENCIL_CONTACT_ROW - 5);
      expect(bottom).toBeLessThanOrEqual(PENCIL_CONTACT_ROW);
    }
  });
});
