import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DEFAULT_SHADOW_PATH,
  LAMP_KEY_THRESHOLD,
  LAMP_SPRITE_IDS_25D,
  blobCastOffset,
  blobShadows,
  lampFlicker,
  lampPools,
  nightKeyOrigin,
  lampLights,
  propContactShadows,
  shadowPathForEnvironment,
} from '../lighting';
import { LAMP_GLOW_COLORS } from '../recipes';
import { indoorFrame, outdoorFrame } from './fixtures';

describe('2.5D lighting', () => {
  const frame = indoorFrame();

  test('lamp lights come from lamp props, not district pools', () => {
    const outdoors = outdoorFrame();
    const lampProps = outdoors.props.filter((prop) => LAMP_SPRITE_IDS_25D.has(prop.sprite));
    expect(lampProps.length).toBeGreaterThan(0);
    expect(lampLights(outdoors)).toHaveLength(lampProps.length);
    // District pools are a different count entirely; a light per pool would be the wrong list.
    expect(lampLights(outdoors).length).not.toBe(outdoors.lighting.pools.length);
  });

  test('places each light on its lamp tile', () => {
    const outdoors = outdoorFrame();
    const lamp = outdoors.props.find((prop) => LAMP_SPRITE_IDS_25D.has(prop.sprite))!;
    const light = lampLights(outdoors).find((candidate) => candidate.id === `lamp-${lamp.id}`)!;
    expect(light.x).toBeCloseTo(lamp.tile.x + 0.5, 6);
    expect(light.z).toBeCloseTo(lamp.tile.y + 0.5, 6);
  });

  test('lamps brighten as the sun goes down', () => {
    const outdoors = outdoorFrame();
    const at = (lampMix: number) => lampLights({
      ...outdoors,
      lighting: { ...outdoors.lighting, sun: { ...outdoors.lighting.sun, lampMix } },
    })[0]!.intensity;
    expect(at(1)).toBeGreaterThan(at(0));
    expect(at(0)).toBeGreaterThan(0);
  });

  test('blob shadows exist for every character in both paths', () => {
    expect(blobShadows(frame)).toHaveLength(frame.characterShadows.length);
    expect(blobShadows(frame).length).toBeGreaterThan(0);
  });

  test('a blob sits at the contact point plus the frame cast offset', () => {
    const shadow = frame.characterShadows[0]!;
    const blob = blobShadows(frame)[0]!;
    expect(blob.x).toBeCloseTo((shadow.worldX + shadow.castX) / 32, 6);
    expect(blob.z).toBeCloseTo((shadow.worldY + shadow.castY) / 32, 6);
    expect(blob.tint).toBe(shadow.color);
  });

  test('the default path is the lit path', () => {
    // Chosen from the Stage 4 yaw comparison. The fallback is still one query parameter away, so
    // this is reversible if a frame-rate measurement ever says otherwise.
    expect(DEFAULT_SHADOW_PATH).toBe('lit');
  });

  describe('path selection is explicit', () => {
    const base = { hostname: 'localhost', search: '', smokeMode: false } as const;

    test('production always gets the default', () => {
      expect(shadowPathForEnvironment({ ...base, hostname: 'siworld.example' })).toBe('lit');
      // A production host ignores the query entirely, including one asking for the non-default.
      expect(shadowPathForEnvironment({ ...base, hostname: 'siworld.example', search: '?testShadowPath=fallback' })).toBe('lit');
    });

    test('honours the local development override', () => {
      expect(shadowPathForEnvironment({ ...base, search: '?testShadowPath=lit' })).toBe('lit');
      expect(shadowPathForEnvironment({ ...base, search: '?testShadowPath=fallback' })).toBe('fallback');
      expect(shadowPathForEnvironment({ ...base, search: '?testShadowPath=bogus' })).toBe('lit');
    });

    test('honours the packaged smoke override only in smoke mode', () => {
      expect(shadowPathForEnvironment({ ...base, hostname: 'siworld.example', smokeMode: true, smokeShadowPath: 'lit' })).toBe('lit');
      expect(shadowPathForEnvironment({ ...base, hostname: 'siworld.example', smokeShadowPath: 'fallback' })).toBe('lit');
    });
  });

  /**
   * Drift guard. `LAMP_SPRITE_IDS` cannot be exported from the 2D renderer - that file is frozen
   * and the Stage 4 closeout gates on its diff being empty - so this asserts the copy still
   * matches. The COUNT is what catches a lamp added there and not here.
   */
  test('the 2.5D lamp set matches the 2D renderer source', () => {
    const source = readFileSync(resolve('src/render/three/world-renderer.ts'), 'utf8');
    for (const id of LAMP_SPRITE_IDS_25D) {
      expect(source).toContain(`'${id}'`);
    }
    const declared = source.match(/const LAMP_SPRITE_IDS[\s\S]*?\]\)/u)?.[0] ?? '';
    const count = (declared.match(/'tile\.[a-z0-9-]+'/gu) ?? []).length;
    expect(count).toBeGreaterThan(0);
    expect(LAMP_SPRITE_IDS_25D.size).toBe(count);
  });

  test('the preload exposes the shadow-path flag only in smoke mode', () => {
    const preload = readFileSync(resolve('electron/preload/index.ts'), 'utf8');
    expect(preload).toContain("smokeShadowPath === 'lit'");
    expect(preload).toContain("smokeShadowPath === 'fallback'");
    expect(preload).toContain("--si-world-shadow-path=");
  });
});

/**
 * A lamp must cast the colour it glows. Taking the frame's district accent instead had an amber
 * dock lamp throwing a teal pool, which read as one cold monochrome with warm dots floating in it.
 */
describe('a lamp casts its own colour', () => {
  const frame = outdoorFrame();

  test('the fixture actually places lamps to test', () => {
    expect(lampLights(frame).length).toBeGreaterThan(0);
  });

  test('every lamp light takes the glow tint from its own recipe', () => {
    const lampsBySprite = new Map(frame.props
      .filter((prop) => LAMP_SPRITE_IDS_25D.has(prop.sprite))
      .map((prop) => [`lamp-${prop.id}`, prop.sprite]));
    for (const light of lampLights(frame)) {
      const sprite = lampsBySprite.get(light.id);
      expect(sprite).toBeDefined();
      expect(light.color).toBe(LAMP_GLOW_COLORS[sprite!]);
    }
  });

  test('and not the district accent, which is a different colour', () => {
    const accents = new Set(lampLights(frame).map((light) => light.color));
    expect(accents.has(frame.lighting.accent)).toBe(false);
  });

  /** Every lamp sprite must have a glow box, or its light silently falls back to the accent. */
  test('every lamp sprite has a recipe glow colour', () => {
    for (const sprite of LAMP_SPRITE_IDS_25D) expect(LAMP_GLOW_COLORS[sprite]).toBeDefined();
  });
});

/**
 * Props floated. The 2.5D path never read `frame.propShadows`, so a sofa, a crate stack and a lamp
 * post all sat a hair above their own tile — the single most visible amateur tell in the frames.
 */
describe('prop contact shadows', () => {
  const frame = outdoorFrame();

  test('the fixture actually places props that cast', () => {
    expect(frame.propShadows.length).toBeGreaterThan(0);
    expect(propContactShadows(frame)).toHaveLength(frame.propShadows.length);
  });

  /**
   * `worldX` is the cluster's LEFT EDGE and `worldY` is its base pushed 25px south, because the 2D
   * renderer draws this record as a strip anchored under a sprite. Reading either as a centre put
   * every stain low and to the right of its object, detached, which is how it shipped once.
   */
  test('centres on the prop rather than on the 2D strip anchor', () => {
    for (const contact of propContactShadows(frame)) {
      const shadow = frame.propShadows.find((one) => contact.id === `contact-${one.id}`)!;
      expect(contact.x).toBeCloseTo((shadow.worldX + shadow.width / 2) / 32, 6);
      expect(contact.z).toBeCloseTo((shadow.worldY - 25) / 32, 6);
      // And specifically NOT the raw record, which is the bug this test exists to catch.
      expect(contact.z).toBeLessThan(shadow.worldY / 32);
    }
  });

  /** A stain wider than the object reads as a cast shadow from a light that is not there. */
  test('is narrower than the prop it belongs to, and flatter than it is wide', () => {
    for (const contact of propContactShadows(frame)) {
      const shadow = frame.propShadows.find((one) => contact.id === `contact-${one.id}`)!;
      expect(contact.width).toBeLessThan(shadow.width / 32);
      expect(contact.depth).toBeLessThan(contact.width);
    }
  });
});

/**
 * After dusk the lamps light the scene, so the lamps must own its shadows. The one directional was
 * left on the day cycle's vector at 0.15 intensity, so objects sat in a warm pool with a hard
 * shadow pointing away from a light that was not lighting them, or with no shadow at all.
 */
describe('the night key light', () => {
  const outdoor = outdoorFrame();
  const atLampMix = (lampMix: number, frame = outdoor) =>
    ({ ...frame, lighting: { ...frame.lighting, sun: { ...frame.lighting.sun, lampMix } } });

  test('stays with the sun while the sun still owns the scene', () => {
    expect(nightKeyOrigin(atLampMix(0))).toBeUndefined();
    expect(nightKeyOrigin(atLampMix(LAMP_KEY_THRESHOLD - 0.01))).toBeUndefined();
  });

  test('moves to the lamps once they own it', () => {
    expect(nightKeyOrigin(atLampMix(1))).toBeDefined();
  });

  /**
   * The CENTROID, not the nearest lamp. A centroid moves smoothly as the window pans; a
   * nearest-lamp pick jumps every shadow in the scene the moment the ranking changes.
   */
  test('sits at the centroid of the lamps in frame', () => {
    const frame = atLampMix(1);
    const lamps = lampLights(frame);
    const key = nightKeyOrigin(frame)!;
    expect(key.x).toBeCloseTo(lamps.reduce((sum, one) => sum + one.x, 0) / lamps.length, 6);
    expect(key.z).toBeCloseTo(lamps.reduce((sum, one) => sum + one.z, 0) / lamps.length, 6);
  });

  test('a frame with no lamps keeps the sun, however dark it is', () => {
    expect(nightKeyOrigin(atLampMix(1, { ...outdoor, props: [] }))).toBeUndefined();
  });
});

/**
 * A required companion of the night key, not an alternative to it: if box shadows radiate from the
 * lamps while every character blob still points along the dead sun vector, the frame contradicts
 * itself more loudly than either error does alone.
 */
describe('character blobs follow the light that is on', () => {
  const outdoor = outdoorFrame();
  const atLampMix = (lampMix: number) =>
    ({ ...outdoor, lighting: { ...outdoor.lighting, sun: { ...outdoor.lighting.sun, lampMix } } });

  test('keeps the frame cast by day', () => {
    const shadow = outdoor.characterShadows[0]!;
    expect(blobCastOffset(atLampMix(0), shadow, false))
      .toEqual({ x: shadow.castX, y: shadow.castY });
  });

  test('points AWAY from the nearest lamp at night', () => {
    const frame = atLampMix(1);
    const shadow = frame.characterShadows[0]!;
    const cast = blobCastOffset(frame, shadow, false);
    const lamps = lampLights(frame);
    const nearest = lamps.reduce((best, lamp) => {
      const here = (lamp.x - shadow.worldX / 32) ** 2 + (lamp.z - shadow.worldY / 32) ** 2;
      const there = (best.x - shadow.worldX / 32) ** 2 + (best.z - shadow.worldY / 32) ** 2;
      return here < there ? lamp : best;
    });
    const awayX = shadow.worldX / 32 - nearest.x;
    const awayZ = shadow.worldY / 32 - nearest.z;
    // Same sign on both axes as the vector from the lamp to the character: it points away.
    expect(Math.sign(cast.x)).toBe(Math.sign(awayX));
    expect(Math.sign(cast.y)).toBe(Math.sign(awayZ));
  });

  /** A room is lit from a fixture overhead, which rakes nothing. The short indoor blob is right. */
  test('indoors keeps the frame cast even at full lamp mix', () => {
    const frame = atLampMix(1);
    const shadow = frame.characterShadows[0]!;
    expect(blobCastOffset(frame, shadow, true)).toEqual({ x: shadow.castX, y: shadow.castY });
  });
});

/**
 * A still night scene reads as a render rather than a place, and a lamp that never varies is the
 * largest single reason why.
 */
describe('lamp flicker', () => {
  test('is deterministic: the same lamp at the same step always gives the same value', () => {
    expect(lampFlicker('lamp-a', 7)).toBe(lampFlicker('lamp-a', 7));
  });

  test('varies across steps and across lamps, so a street does not blink in unison', () => {
    const steps = new Set([0, 1, 2, 3, 4].map((step) => lampFlicker('lamp-a', step)));
    expect(steps.size).toBeGreaterThan(1);
    const lamps = new Set(['a', 'b', 'c', 'd'].map((id) => lampFlicker(`lamp-${id}`, 3)));
    expect(lamps.size).toBeGreaterThan(1);
  });

  /**
   * Hard enough to notice, soft enough not to read as a fault in the lamp, and CENTRED on 1 so the
   * swing averages out. A one-sided flicker is not an animation, it is a brightness cut - the
   * first version only dimmed and cost every district 1-2.5 mean luminance.
   */
  test('swings both ways by no more than a sixteenth, and averages to no change', () => {
    let total = 0;
    let count = 0;
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
      for (let step = 0; step < 60; step += 1) {
        const value = lampFlicker(`lamp-${id}`, step);
        expect(value).toBeGreaterThanOrEqual(0.94);
        expect(value).toBeLessThanOrEqual(1.06);
        total += value;
        count += 1;
      }
    }
    expect(total / count).toBeCloseTo(1, 2);
  });

  test('the light and its floor pool flicker together, not apart', () => {
    const frame = outdoorFrame();
    const night = { ...frame, lighting: { ...frame.lighting, sun: { ...frame.lighting.sun, lampMix: 1 } } };
    const lights = new Map(lampLights(night).map((light) => [light.id, light]));
    for (const pool of lampPools(night)) {
      const light = lights.get(pool.id.replace(/^pool-/u, ''))!;
      expect(light).toBeDefined();
      // Both scale by the same factor, so the ratio between them is the steady-state ratio.
      expect(pool.opacity / light.intensity).toBeCloseTo(
        (0.5 * night.lighting.sun.lampMix) / (0.2 + night.lighting.sun.lampMix * 11),
        6,
      );
    }
  });
});
