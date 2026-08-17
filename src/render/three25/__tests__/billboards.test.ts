import { UNLIT_NIGHT_STRENGTH, buildBillboards, tintForLighting } from '../billboards';
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

  // Task 13 folds district lighting into this tint, so the descriptor carries the LIT colour.
  test('carries the character colour under the frame lighting, capped', () => {
    const billboard = buildBillboards(frame)[0]!;
    expect(billboard.tint)
      .toBe(tintForLighting(frame.characters[0]!.color, frame.lighting, UNLIT_NIGHT_STRENGTH));
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

describe('billboard tint', () => {
  const frame = indoorFrame();

  /**
   * At yaw 0 the camera shares the world axis the frame already picked the atlas cell against, so
   * facing selection needs no 2.5D branch at all. This asserts that rather than writing code.
   */
  test('facing needs no 2.5D branch at yaw 0', () => {
    const rear = indoorFrame('up');
    expect(buildBillboards(rear)[0]!.source).not.toEqual(buildBillboards(frame)[0]!.source);
  });

  const withElevation = (elevation: number) =>
    ({ ...frame.lighting, sun: { ...frame.lighting.sun, elevation } });

  test('darkens as the sun drops', () => {
    expect(tintForLighting('#ffffffff', withElevation(0)))
      .not.toBe(tintForLighting('#ffffffff', withElevation(1)));
  });

  test('is identity at solar noon', () => {
    expect(tintForLighting('#ffffffff', withElevation(1))).toBe('#ffffffff');
  });

  test('never returns a colour brighter than the input', () => {
    const tinted = tintForLighting('#808080ff', withElevation(0));
    expect(Number.parseInt(tinted.slice(1, 3), 16)).toBeLessThanOrEqual(0x80);
  });

  /**
   * `sun.shadowColor` is translucent. Mixing all four bytes would fade the cast out as the sun
   * sets rather than darkening it, which is a different and much more visible bug.
   */
  test('darkens without fading: alpha survives the mix', () => {
    expect(tintForLighting('#ffffffff', withElevation(0)).slice(7)).toBe('ff');
    expect(tintForLighting('#ffffff80', withElevation(0)).slice(7)).toBe('80');
    expect(tintForLighting('#ffffff', withElevation(0))).toHaveLength(7);
  });

  test('darkens monotonically as the sun falls', () => {
    const red = (elevation: number) =>
      Number.parseInt(tintForLighting('#ffffffff', withElevation(elevation)).slice(1, 3), 16);
    expect(red(0)).toBeLessThan(red(0.5));
    expect(red(0.5)).toBeLessThan(red(1));
  });

  test('the built billboards carry the lit tint, not the raw character colour', () => {
    const night = { ...frame, lighting: withElevation(0) };
    expect(buildBillboards(night)[0]!.tint)
      .toBe(tintForLighting(frame.characters[0]!.color, withElevation(0), UNLIT_NIGHT_STRENGTH));
  });

  /** A black silhouette after dusk is unusable: the player must always see their character. */
  test('a character stays visible at midnight', () => {
    const night = { ...frame, lighting: withElevation(0) };
    const tint = buildBillboards(night)[0]!.tint;
    const channel = (at: number) => Number.parseInt(tint.slice(at, at + 2), 16);
    expect(Math.max(channel(1), channel(3), channel(5))).toBeGreaterThan(0x80);
  });
});

describe('unlit surfaces darken less', () => {
  const frame = indoorFrame();
  const night = { ...frame.lighting, sun: { ...frame.lighting.sun, elevation: 0 } };

  /**
   * A lit surface gets lifted back up by the scene's own lights, so a full mix is right for it.
   * Flat-shaded furniture is unlit, so a full mix drove every piece to near-black and the room
   * lost its colour entirely.
   */
  test('a capped strength keeps more of the base colour than a full mix', () => {
    const full = tintForLighting('#5c9494', night);
    const capped = tintForLighting('#5c9494', night, UNLIT_NIGHT_STRENGTH);
    const green = (hex: string) => Number.parseInt(hex.slice(3, 5), 16);
    expect(green(capped)).toBeGreaterThan(green(full));
    expect(green(capped)).toBeGreaterThan(0x60);
  });

  test('strength still darkens, and is identity at solar noon', () => {
    const noon = { ...frame.lighting, sun: { ...frame.lighting.sun, elevation: 1 } };
    expect(tintForLighting('#5c9494', noon, UNLIT_NIGHT_STRENGTH)).toBe('#5c9494');
    expect(tintForLighting('#5c9494', night, UNLIT_NIGHT_STRENGTH)).not.toBe('#5c9494');
  });
});
