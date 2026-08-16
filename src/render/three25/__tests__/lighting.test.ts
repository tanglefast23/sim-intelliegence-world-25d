import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DEFAULT_SHADOW_PATH,
  LAMP_SPRITE_IDS_25D,
  blobShadows,
  lampLights,
  shadowPathForEnvironment,
} from '../lighting';
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

  test('the default path is the deterministic fallback', () => {
    expect(DEFAULT_SHADOW_PATH).toBe('fallback');
  });

  describe('path selection is explicit', () => {
    const base = { hostname: 'localhost', search: '', smokeMode: false } as const;

    test('production always gets the default', () => {
      expect(shadowPathForEnvironment({ ...base, hostname: 'siworld.example' })).toBe('fallback');
      expect(shadowPathForEnvironment({ ...base, hostname: 'siworld.example', search: '?testShadowPath=lit' })).toBe('fallback');
    });

    test('honours the local development override', () => {
      expect(shadowPathForEnvironment({ ...base, search: '?testShadowPath=lit' })).toBe('lit');
      expect(shadowPathForEnvironment({ ...base, search: '?testShadowPath=fallback' })).toBe('fallback');
      expect(shadowPathForEnvironment({ ...base, search: '?testShadowPath=bogus' })).toBe('fallback');
    });

    test('honours the packaged smoke override only in smoke mode', () => {
      expect(shadowPathForEnvironment({ ...base, hostname: 'siworld.example', smokeMode: true, smokeShadowPath: 'lit' })).toBe('lit');
      expect(shadowPathForEnvironment({ ...base, hostname: 'siworld.example', smokeShadowPath: 'lit' })).toBe('fallback');
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
