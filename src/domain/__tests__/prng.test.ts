import { createPrng } from '../prng';
import { resolveActionCheck, rollTwoDice, successesOutOf36 } from '../action-check';

function take(count: number, seed = 0x51_57_0a_1d): number[] {
  const prng = createPrng(seed);
  return Array.from({ length: count }, () => prng.nextUint32());
}

describe('deterministic PRNG', () => {
  test('the same seed creates byte-identical output', () => {
    const first = JSON.stringify(take(128));
    const second = JSON.stringify(take(128));

    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  test('a saved cursor resumes the exact sequence', () => {
    const original = createPrng(42);
    Array.from({ length: 17 }, () => original.nextUint32());
    const saved = original.snapshot();
    const expected = Array.from({ length: 20 }, () => original.nextUint32());

    const restored = createPrng(JSON.parse(JSON.stringify(saved)));
    const actual = Array.from({ length: 20 }, () => restored.nextUint32());

    expect(actual).toEqual(expected);
  });

  test('integer samples remain inside the requested range', () => {
    const prng = createPrng(7);
    const samples = Array.from({ length: 1_000 }, () => prng.nextInt(9));

    expect(samples.every((sample) => sample >= 0 && sample < 9)).toBe(true);
  });

  test('invalid saved state fails explicitly', () => {
    expect(() => createPrng({ version: 'mulberry32-v1', cursor: -1 })).toThrow(
      'unsigned 32-bit integer',
    );
  });

  test('Action Checks draw two saved values and use exact 2d6 odds', () => {
    const prng = createPrng(0x51_57_01);
    const result = resolveActionCheck(prng.snapshot(), 4, 9);

    expect(result.result).toEqual({ dice: [3, 5], modifier: 4, target: 9, total: 12, success: true });
    expect(result.prng.cursor).toBe(3_668_462_315);
    expect(successesOutOf36(0, 9)).toBe(10);
    expect(successesOutOf36(1, 9)).toBe(15);
    expect(successesOutOf36(2, 9)).toBe(21);
    expect(successesOutOf36(3, 9)).toBe(26);
    expect(successesOutOf36(4, 9)).toBe(30);

    const next = resolveActionCheck(result.prng, 4, 9);
    expect(next.prng.cursor).not.toBe(result.prng.cursor);
    expect(next.result.dice.every((face) => face >= 1 && face <= 6)).toBe(true);
  });

  test('the intro roll advances the same two PRNG draws as an Action Check', () => {
    const prng = createPrng(0x51_57_01).snapshot();
    const roll = rollTwoDice(prng);
    const actionCheck = resolveActionCheck(prng, 0, 9);

    expect(roll).toEqual({ dice: [3, 5], total: 8, prng: actionCheck.prng });
  });
});
