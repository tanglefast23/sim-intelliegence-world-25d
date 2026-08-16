import { buildBillboards } from '../billboards';
import { indoorFrame } from './fixtures';

describe('character billboards', () => {
  const frame = indoorFrame();

  test('the fixture actually has a character to place', () => {
    expect(frame.characters.length).toBeGreaterThan(0);
  });

  test('emits one billboard per character', () => {
    expect(buildBillboards(frame)).toHaveLength(frame.characters.length);
  });

  test('anchors at the contact point, not the quad corner', () => {
    const billboard = buildBillboards(frame)[0]!;
    const character = frame.characters[0]!;
    expect(billboard.x).toBeCloseTo(character.shadowWorldX / 32, 6);
    expect(billboard.z).toBeCloseTo(character.shadowWorldY / 32, 6);
    // The quad corner is a different point, so this is a real distinction and not a coincidence.
    expect(billboard.x).not.toBeCloseTo(character.worldX / 32, 6);
  });

  test('keeps the authored pixel aspect ratio', () => {
    for (const billboard of buildBillboards(frame)) {
      const source = billboard.source;
      expect(billboard.width / billboard.height).toBeCloseTo(source.width / source.height, 4);
    }
  });

  test('carries the character tint through', () => {
    const billboard = buildBillboards(frame)[0]!;
    expect(billboard.tint).toBe(frame.characters[0]!.color);
  });

  /**
   * Asserted at the descriptor level, not with `renderer.info.render.calls`: that needs a real
   * WebGL context and a completed render, and `jest.config.js` uses `testEnvironment: 'node'`.
   * That every character shares one atlas source is what makes a single batch possible; the batch
   * itself is asserted on the baked geometry in world-renderer-25.test.ts. The real draw-call
   * ceiling is measured in Task 20's packaged run.
   */
  test('every character shares one atlas source, so one batch can hold them all', () => {
    const many = {
      ...frame,
      characters: Array.from({ length: 20 }, (_, index) => ({
        ...frame.characters[0]!,
        id: `npc-${index}`,
      })),
    };
    expect(buildBillboards(many)).toHaveLength(20);
    expect(new Set(buildBillboards(many).map((billboard) => billboard.source.sourceId)).size)
      .toBeLessThanOrEqual(1);
  });
});
