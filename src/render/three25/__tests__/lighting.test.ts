import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DEFAULT_SHADOW_PATH,
  LAMP_SPRITE_IDS_25D,
  blobShadows,
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

  test('sits on the prop, not offset like a cast shadow', () => {
    for (const contact of propContactShadows(frame)) {
      const shadow = frame.propShadows.find((one) => contact.id === `contact-${one.id}`)!;
      expect(contact.x).toBeCloseTo(shadow.worldX / 32, 6);
      expect(contact.z).toBeCloseTo(shadow.worldY / 32, 6);
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
