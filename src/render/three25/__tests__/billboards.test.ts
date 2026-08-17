import {
  BLINK_PERIOD_MILLISECONDS,
  UNLIT_NIGHT_STRENGTH,
  buildBillboards,
  isBlinking,
  isStandingDecal,
  readableTint,
  tintForLighting,
} from '../billboards';
import { closedBlinkTimestamp, indoorFrame, openBlinkTimestamp } from './fixtures';

describe('character billboards', () => {
  // Pinned to a closed blink window. The fixture faces `down`, so its sprite is `front-1` and
  // it is eligible to blink; leaving the timestamp at 0 would make every exact count below
  // depend on a hash rather than on the code under test.
  const frame = { ...indoorFrame(), animationTimestampMilliseconds: closedBlinkTimestamp('protagonist') };

  test('the fixture actually has a character to place', () => {
    expect(frame.characters.length).toBeGreaterThan(0);
  });

  /** Characters, plus any vegetation decal that has to stand up rather than lie on the grass. */
  test('emits one billboard per character, plus the standing decals', () => {
    const standing = frame.groundDetails.filter((detail) => isStandingDecal(detail.sprite)).length;
    expect(buildBillboards(frame)).toHaveLength(frame.characters.length + standing);
    expect(buildBillboards(frame).filter((one) => one.id.startsWith('decal-'))).toHaveLength(standing);
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
      groundDetails: [],
      characters: Array.from({ length: 20 }, (_, index) => ({
        ...frame.characters[0]!,
        id: `npc-${index}`,
      })),
    };
    expect(buildBillboards(many)).toHaveLength(20);
    expect(new Set(buildBillboards(many).map((billboard) => billboard.source.sourceId)).size)
      .toBeLessThanOrEqual(1);
  });

  /**
   * A tree authored as a ground decal reads fine from directly overhead and lies down like a felled
   * log under a corner camera. Vegetation stands up; sand ripples and leaf litter do not.
   */
  test('vegetation stands up and ground marks stay flat', () => {
    expect(isStandingDecal('tile.decal-canopy-tree')).toBe(true);
    expect(isStandingDecal('tile.decal-young-palm')).toBe(true);
    expect(isStandingDecal('tile.decal-sapling')).toBe(true);
    expect(isStandingDecal('tile.decal-flowering-shrub')).toBe(true);
    expect(isStandingDecal('tile.decal-sand-ripple')).toBe(false);
    expect(isStandingDecal('tile.decal-leaf-litter')).toBe(false);
    expect(isStandingDecal('tile.decal-sand-pebbles')).toBe(false);
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
    // The gentle curve keeps most of the base green rather than mixing it away.
    expect(green(capped)).toBeGreaterThan(0x78);
  });

  test('strength still darkens, and is identity at solar noon', () => {
    const noon = { ...frame.lighting, sun: { ...frame.lighting.sun, elevation: 1 } };
    expect(tintForLighting('#5c9494', noon, UNLIT_NIGHT_STRENGTH)).toBe('#5c9494');
    expect(tintForLighting('#5c9494', night, UNLIT_NIGHT_STRENGTH)).not.toBe('#5c9494');
  });
});

describe('unlit surfaces stay readable', () => {
  /**
   * Flat furniture carries no light, and ACES crushes the low end hard, so a sprite's true paint
   * at luminance 80 lands as a near-black slab. That is survivable in the villa, where lamps light
   * the walls behind the furniture; it is why market stalls and cargo stacks read as featureless
   * blocks in districts with fewer lamps.
   */
  test('lifts a dark colour to the readable floor', () => {
    const lifted = readableTint('#1c2424');
    const luminance = (hex: string) =>
      ([1, 3, 5].reduce((total, at) => total + Number.parseInt(hex.slice(at, at + 2), 16), 0)) / 3;
    expect(luminance(lifted)).toBeGreaterThanOrEqual(180);
    expect(luminance('#1c2424')).toBeLessThan(180);
  });

  test('keeps the hue: it scales rather than adding grey', () => {
    const lifted = readableTint('#2c4c34');
    const channel = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
    // Green was the dominant channel and still is, by the same ordering.
    expect(channel(lifted, 3)).toBeGreaterThan(channel(lifted, 1));
    expect(channel(lifted, 3)).toBeGreaterThan(channel(lifted, 5));
  });

  test('leaves an already-readable colour alone', () => {
    expect(readableTint('#f0e8dc')).toBe('#f0e8dc');
  });

  test('never overflows a channel', () => {
    const lifted = readableTint('#0f0102', 200);
    for (const at of [1, 3, 5]) {
      expect(Number.parseInt(lifted.slice(at, at + 2), 16)).toBeLessThanOrEqual(255);
    }
  });

  test('survives pure black without dividing by zero', () => {
    expect(readableTint('#000000')).toBe('#000000');
  });
});

describe('blink overlay', () => {
  const visualId = 'protagonist';
  const blinkFrame = (overrides: Partial<ReturnType<typeof indoorFrame>> = {}) => ({
    ...indoorFrame(),
    animationTimestampMilliseconds: openBlinkTimestamp(visualId),
    ...overrides,
  });
  const hasBand = (candidate: ReturnType<typeof indoorFrame>): boolean =>
    buildBillboards(candidate).some(({ id }) => id.endsWith(':eyes'));

  test('adds an eye band for a front-facing character inside the blink window', () => {
    expect(hasBand(blinkFrame())).toBe(true);
  });

  test('never adds an eye band on rear or lateral facings', () => {
    for (const facing of ['up', 'left', 'right'] as const) {
      expect(hasBand({
        ...indoorFrame(facing),
        animationTimestampMilliseconds: openBlinkTimestamp(visualId),
      })).toBe(false);
    }
  });

  test('never adds an eye band when reduced motion is on', () => {
    expect(hasBand(blinkFrame({ reducedMotion: true }))).toBe(false);
  });

  test('closes for well under half the period, so it reads as a blink not a squint', () => {
    const closed = Array.from({ length: BLINK_PERIOD_MILLISECONDS }, (_unused, ms) =>
      isBlinking(visualId, ms)).filter(Boolean).length;
    expect(closed).toBe(290);
  });

  test('does not blink every character at the same moment', () => {
    const ids = ['protagonist', 'linda', 'mina-park', 'tomas-reed', 'sora-tan'];
    expect(new Set(ids.map((id) => openBlinkTimestamp(id))).size).toBeGreaterThan(1);
  });

  test('stands the band above the contact point rather than on the shoes', () => {
    const billboards = buildBillboards(blinkFrame());
    const body = billboards.find(({ id }) => !id.endsWith(':eyes'))!;
    const band = billboards.find(({ id }) => id.endsWith(':eyes'))!;
    // 29 - 14 sprite rows, at the placement's own scale. CHARACTER_SCALE is 7/6, not 1.
    const scale = indoorFrame().characters[0]!.scale;
    expect(band.lift).toBeCloseTo((15 * scale) / 32, 6);
    expect(body.lift).toBe(0);
    expect(band.x).toBeCloseTo(body.x, 6);
    expect(band.z).toBeCloseTo(body.z, 6);
    // Baked after the body, so it wins under LessEqual depth in the same geometry.
    expect(billboards.indexOf(band)).toBeGreaterThan(billboards.indexOf(body));
  });

  test('is a pure function of the frame timestamp', () => {
    const at = (ms: number) => buildBillboards({
      ...indoorFrame(),
      animationTimestampMilliseconds: ms,
    });
    expect(at(4_000)).toEqual(at(4_000));
    expect(isBlinking(visualId, 4_000)).toBe(isBlinking(visualId, 4_000));
  });
});
