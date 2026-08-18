import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { WorldFrameState } from '../../world-frame';

import {
  DEFAULT_SHADOW_PATH,
  LAMP_KEY_THRESHOLD,
  CEILING_SPRITE_IDS_25D,
  LAMP_SPRITE_IDS_25D,
  indoorOverheadKeyOrigin,
  blobCastOffset,
  blobShadows,
  lampFlicker,
  lampPools,
  nightKeyOrigin,
  lampLights,
  propContactShadows,
  shadowPathForEnvironment,
  skyglowMix,
} from '../lighting';
import { LAMP_GLOW_COLORS } from '../recipes';
import { GROUND_LIGHTING_SPRITES } from '../scene-builder';
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

  /**
   * The blob still TOUCHES the feet. It leans toward the cast by half the offset and lengthens by
   * the rest, rather than translating: a full offset slides the whole ellipse off the character,
   * so at four tiles from a lamp they get a detached oval and nothing under them — worse than the
   * symmetric blob it replaced.
   */
  test('a blob leans toward the cast without leaving the feet', () => {
    const shadow = frame.characterShadows[0]!;
    const blob = blobShadows(frame)[0]!;
    expect(blob.tint).toBe(shadow.color);
    const leanX = blob.x - shadow.worldX / 32;
    const leanZ = blob.z - shadow.worldY / 32;
    // Same direction as the frame's cast, and no further than half of it.
    if (shadow.castX !== 0) {
      expect(Math.sign(leanX)).toBe(Math.sign(shadow.castX));
      expect(Math.abs(leanX)).toBeLessThanOrEqual(Math.abs(shadow.castX / 32) / 2 + 1e-6);
    }
    if (shadow.castY !== 0) {
      expect(Math.sign(leanZ)).toBe(Math.sign(shadow.castY));
      expect(Math.abs(leanZ)).toBeLessThanOrEqual(Math.abs(shadow.castY / 32) / 2 + 1e-6);
    }
    // The feet stay covered: the lean never exceeds the ellipse's own half-extent.
    expect(Math.abs(leanX)).toBeLessThan(blob.width / 2);
    expect(Math.abs(leanZ)).toBeLessThan(blob.depth / 2);
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
   * Asserted against the PROP, not against the formula.
   *
   * The previous version recomputed the same expression the code uses and compared it to itself,
   * so it passed while every stain sat half a tile north of its object — behind it at yaw 45,
   * where the box hides it. The visible symptom went away and the feature quietly stopped working.
   * A shadow test has to know where the object is.
   */
  test('lands on the prop it belongs to, not beside it', () => {
    const byObject = new Map<string, { x: number; y: number }[]>();
    for (const prop of frame.props) {
      const tiles = byObject.get(prop.objectId) ?? [];
      tiles.push(prop.tile);
      byObject.set(prop.objectId, tiles);
    }
    let checked = 0;
    for (const contact of propContactShadows(frame)) {
      // `propShadows` ids are `<objectId>-<clusterIndex>`.
      const objectId = contact.id.replace(/^contact-/u, '').replace(/-\d+$/u, '');
      const tiles = byObject.get(objectId);
      if (!tiles || tiles.length === 0) continue;
      checked += 1;
      // The centre must sit inside the object's own tile footprint, with half a tile of slack for
      // a cluster whose parts straddle a boundary.
      expect(contact.x).toBeGreaterThanOrEqual(Math.min(...tiles.map((tile) => tile.x)) - 0.5);
      expect(contact.x).toBeLessThanOrEqual(Math.max(...tiles.map((tile) => tile.x)) + 1.5);
      expect(contact.z).toBeGreaterThanOrEqual(Math.min(...tiles.map((tile) => tile.y)) - 0.5);
      expect(contact.z).toBeLessThanOrEqual(Math.max(...tiles.map((tile) => tile.y)) + 1.5);
    }
    expect(checked).toBeGreaterThan(0);
  });

  /** Specifically south of the tile's north boundary, which is what the raw record encodes. */
  test('sits at the tile centre, not on the boundary the 2D record points at', () => {
    for (const contact of propContactShadows(frame)) {
      const shadow = frame.propShadows.find((one) => contact.id === `contact-${one.id}`)!;
      expect(contact.z).toBeGreaterThan((shadow.worldY - 25) / 32);
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

/**
 * Two lists, one meaning. `GROUND_LIGHTING_SPRITES` decides which props carve the outdoor night
 * crush and `LAMP_SPRITE_IDS_25D` decides which get a point light and a floor pool. If they drift,
 * the renderer disagrees with itself about what a light is — which is exactly what flooded the
 * bazaar, where signs counted as lights for the crush while lighting nothing.
 */
describe('what counts as a light', () => {
  /**
   * GROUND is the UNION of the two light sets, and the union is the whole assertion.
   *
   * The two halves are kept apart for one reason: `LAMP_SPRITE_IDS_25D` is a verified copy of the
   * frozen 2D renderer's list, and putting a ceiling troffer in it would demand an edit to a file
   * the Stage 4 closeout gates on being unchanged. So the equality that matters is GROUND against
   * lamps-plus-ceiling, and separately that the lamp half still matches the 2D set — which the
   * copy-equality test above already holds.
   */
  test('the crush and the lights agree, exactly', () => {
    expect([...GROUND_LIGHTING_SPRITES].sort())
      .toEqual([...LAMP_SPRITE_IDS_25D, ...CEILING_SPRITE_IDS_25D].sort());
    // The ceiling set must stay OUT of the frozen-2D copy, or that file has to change.
    for (const sprite of CEILING_SPRITE_IDS_25D) {
      expect(LAMP_SPRITE_IDS_25D.has(sprite)).toBe(false);
    }
  });

  /** A sign glows but lights nothing, so it must never appear in either list. */
  test('a glowing sign is not a light', () => {
    expect(LAMP_GLOW_COLORS['tile.sign-neon']).toBeDefined();
    expect(LAMP_SPRITE_IDS_25D.has('tile.sign-neon')).toBe(false);
    expect(GROUND_LIGHTING_SPRITES.has('tile.sign-neon')).toBe(false);
  });
});

/**
 * An office is ceiling-lit, and the pooled-post night model is the wrong default for it.
 *
 * `nightKeyOrigin` puts the key nine tiles out at roughly 20 degrees so a lamp post throws a long
 * hard rake. Under fourteen troffers that same key turns a fluorescent room into a sunset and
 * throws a desk's shadow the length of the aisle, which is the single failure this rig exists to
 * prevent. These tests pin the two keys apart.
 */
describe('the office ceiling rig', () => {
  const withCeiling = (lampMix: number, sheltered: boolean): WorldFrameState => {
    const base = outdoorFrame();
    return {
      ...base,
      lighting: { ...base.lighting, sun: { ...base.lighting.sun, lampMix } },
      shelterCells: sheltered ? [{ x: 7, y: 7, width: 46, height: 34 }] : [],
      props: [
        { id: 'panel-a', sprite: 'tile.fixture-ceiling-panel', tile: { x: 18, y: 23 } },
        { id: 'panel-b', sprite: 'tile.fixture-ceiling-panel', tile: { x: 28, y: 23 } },
      ],
    } as unknown as WorldFrameState;
  };

  /**
   * TIGHTER than a lamp post, not wider, and correspondingly stronger.
   *
   * The first office round had it the other way round — reach 10 at decay 1.2, intensity 7.5 —
   * and that is what a flood looks like from the inside: every panel in the farm lit every tile
   * of it, so no panel owned its own cell and six extra fixtures had to be authored over the
   * walkways to fill holes the falloff should have covered. A ceiling grid needs each fixture to
   * carry its cell, which means a shorter reach and a harder falloff than a bollard, and enough
   * output to survive both.
   */
  test('a troffer is a cooler, higher, tighter light than a lamp post', () => {
    const [panel] = lampLights(withCeiling(1, true));
    expect(panel!.kind).toBe('ceiling');
    expect(panel!.y).toBeCloseTo(1.33, 5);
    expect(panel!.color).toBe('#d8e4f0');
    // Shorter reach and steeper falloff than the post's 11 at decay 1.4.
    expect(panel!.distance).toBeLessThan(11);
    expect(panel!.decay).toBeGreaterThan(1.4);
    // And stronger than the post, because it is lighting that cell on its own.
    expect(panel!.intensity).toBeGreaterThan(0.2 + 11);
    // The floor pool stays wider than the post's 3.2 and softer than its 0.5: the fixture is a
    // diffuser panel overhead, so what lands on the carpet is a broad even patch, not a hot disc.
    expect(panel!.poolRadius).toBeGreaterThan(3.2);
    expect(panel!.poolOpacity).toBeLessThan(0.5);
  });

  test('troffer flicker is a third of a lamp post s, so the office does not blink', () => {
    const swing = (step: number): number => lampLights(withCeiling(1, true))[0]!.intensity;
    const samples = [0, 7, 13, 29, 51].map(swing);
    const base = 0.6 + 14;
    for (const sample of samples) {
      expect(Math.abs(sample - base) / base).toBeLessThan(0.03);
    }
  });

  test('indoors under troffers the key comes straight down, not from nine tiles out', () => {
    const overhead = indoorOverheadKeyOrigin(withCeiling(1, true));
    expect(overhead).toEqual({ x: 23.5, z: 23.5 });
  });

  test('a ceiling panel never becomes the raking lamp key', () => {
    // Only troffers in frame, so the post-driven key must find nothing to aim from.
    expect(nightKeyOrigin(withCeiling(1, true))).toBeUndefined();
  });

  test('the villa at night keeps its own lamp key', () => {
    // Sheltered, but lit by floor lamps rather than troffers: the overhead branch must not fire.
    const base = outdoorFrame();
    const villaNight = {
      ...base,
      lighting: { ...base.lighting, sun: { ...base.lighting.sun, lampMix: 1 } },
      shelterCells: [{ x: 8, y: 7, width: 18, height: 18 }],
      props: [{ id: 'villa-lamp', sprite: 'tile.fixture-lamp', tile: { x: 17, y: 20 } }],
    } as unknown as WorldFrameState;
    expect(indoorOverheadKeyOrigin(villaNight)).toBeUndefined();
    expect(nightKeyOrigin(villaNight)).toEqual({ x: 17.5, z: 20.5 });
  });

  test('daylight fires neither key', () => {
    expect(indoorOverheadKeyOrigin(withCeiling(0, true))).toBeUndefined();
    expect(nightKeyOrigin(withCeiling(0, true))).toBeUndefined();
  });

  test('outdoors the overhead key never fires, whatever is in frame', () => {
    expect(indoorOverheadKeyOrigin(withCeiling(1, false))).toBeUndefined();
  });

  /**
   * A room has no sky, so it cannot have a skyglow. The office was taking one — and taking its
   * colour from `frame.props`, which is the whole map, so an interior was tinted by fixtures in
   * rooms it has no window onto.
   */
  describe('skyglow stops at the roof', () => {
    test('an outdoor night sky takes the lamp tint', () => {
      expect(skyglowMix(withCeiling(1, false))).toBeGreaterThan(0);
    });

    test('the same night indoors takes none of it', () => {
      expect(skyglowMix(withCeiling(1, true))).toBe(0);
    });

    test('and it fades in with the lamps rather than snapping on at dusk', () => {
      expect(skyglowMix(withCeiling(0, false))).toBe(0);
      expect(skyglowMix(withCeiling(0.5, false))).toBeLessThan(skyglowMix(withCeiling(1, false)));
    });
  });
});

/**
 * `frame.props` is the whole map's props, not a camera window, so the number of ceiling fixtures a
 * room contains is the number of point lights it would create. The office authors 56. The spec
 * budgeted fourteen, and it budgeted fourteen because downtown's neon already showed what a
 * lit-material recompile per light costs.
 *
 * The resolution is that content authors fixtures freely and the RENDERER caps the lights.
 */
describe('the ceiling light budget', () => {
  const withPanels = (count: number): WorldFrameState => {
    const base = outdoorFrame();
    return {
      ...base,
      lighting: { ...base.lighting, sun: { ...base.lighting.sun, lampMix: 1 } },
      shelterCells: [{ x: 0, y: 0, width: 64, height: 48 }],
      characters: [{ id: 'protagonist', tile: { x: 0, y: 0 } }],
      props: Array.from({ length: count }, (_unused, index) => ({
        id: `panel-${String(index).padStart(3, '0')}`,
        sprite: 'tile.fixture-ceiling-panel',
        tile: { x: index % 60, y: Math.floor(index / 60) },
      })),
    } as unknown as WorldFrameState;
  };

  test('caps the point lights however many fixtures a room contains', () => {
    const lights = lampLights(withPanels(56)).filter(({ kind }) => kind === 'ceiling');
    expect(lights.length).toBeLessThanOrEqual(24);
    expect(lights.length).toBeGreaterThan(0);
  });

  test('lights the fixtures NEAREST the subject, not the first ones in the array', () => {
    const lights = lampLights(withPanels(56)).filter(({ kind }) => kind === 'ceiling');
    // The subject is at tile 0,0 and panels run left to right, so the nearest are the low indices.
    const farthest = Math.max(...lights.map(({ x }) => x));
    expect(farthest).toBeLessThan(56);
  });

  test('a room inside the cap keeps every one of its fixtures lit', () => {
    expect(lampLights(withPanels(9)).filter(({ kind }) => kind === 'ceiling')).toHaveLength(9);
  });
});
