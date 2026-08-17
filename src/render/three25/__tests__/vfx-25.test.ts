import type { WorldFrameState } from '../../world-frame';
import { vfxGlowPools, vfxQuads } from '../vfx-25';
import { outdoorFrame } from './fixtures';

/**
 * A frame carrying one emitter of `kind`, with a single primary rect one pixel ABOVE the emitter's
 * tile centre. One pixel is enough: the question every assertion here asks is what that offset
 * MEANS in three dimensions, and the answer differs by kind.
 */
function frameWithEffect(
  kind: string,
  role: string,
  color: string,
  bottomExtent: number,
): WorldFrameState {
  const base = outdoorFrame();
  const tileCentreX = 320;
  const tileCentreY = 640;
  return {
    ...base,
    effectRoleColors: { ...base.effectRoleColors, [role]: color },
    effects: [{
      emitterId: 'probe',
      kind,
      recipeId: `${kind}-v1`,
      ageStep: 0,
      bounds: {
        left: tileCentreX - 10,
        right: tileCentreX + 10,
        top: tileCentreY - 10,
        bottom: tileCentreY + bottomExtent,
      },
      rects: [{ role, x: tileCentreX - 1, y: tileCentreY - 9, width: 2, height: 8 }],
    }],
  } as unknown as WorldFrameState;
}

describe('vfx kind placement', () => {
  /**
   * `rise` kinds spend the authored vertical offset on HEIGHT. A flame goes up.
   */
  test('steam rises: the offset becomes height, and depth stays at the emitter', () => {
    const frame = frameWithEffect('steam', 'steam-primary', '#fff0d6a6', 2);
    const [quad] = vfxQuads(frame).alpha;
    expect(quad).toBeDefined();
    expect(quad!.upright).toBe(true);
    expect(quad!.y).toBeGreaterThan(0.1);
    expect(quad!.z).toBeCloseTo(640 / 32, 6);
  });

  /**
   * `spread` kinds spend it on DEPTH. Two glints one above the other in 2D are two glints a stride
   * apart on the water, not one hovering over the other — standing them up made the harbour's
   * shoreline a fence of light.
   */
  test('water spreads: the offset becomes depth, the quad lies flat, and height is a constant', () => {
    const frame = frameWithEffect('water', 'water-primary', '#a9e8ffcc', 4);
    const [quad] = vfxQuads(frame).additive;
    expect(quad).toBeDefined();
    expect(quad!.upright).toBe(false);
    expect(quad!.y).toBeLessThan(0.1);
    expect(quad!.z).toBeCloseTo((640 - 9 + 4) / 32, 6);
  });

  /** `fixed` kinds sit at the height of the thing they decorate, whatever the rect says. */
  test('neon sits at the sign panel, not at the foot of the post', () => {
    const frame = frameWithEffect('neon', 'neon-primary', '#ff67d9e6', 5);
    const [quad] = vfxQuads(frame).additive;
    expect(quad!.y).toBeCloseTo(1.01, 6);
  });

  test('a palm frond sits in the canopy', () => {
    const frame = frameWithEffect('palm', 'palm-primary', '#86a451d9', 7);
    expect(vfxQuads(frame).alpha[0]!.y).toBeCloseTo(1.65, 6);
  });

  /**
   * Matter goes in the alpha batch and light in the additive one. This is not a look preference:
   * a dark colour added to a lit floor contributes nothing, so blood and dust — which the spec
   * calls critical marks — were being deleted rather than dimmed.
   */
  test('matter blends with alpha and light blends additively', () => {
    expect(vfxQuads(frameWithEffect('steam', 'steam-primary', '#fff0d6a6', 2)).additive).toHaveLength(0);
    expect(vfxQuads(frameWithEffect('leaves', 'leaves-primary', '#e0a14ed9', 8)).additive).toHaveLength(0);
    expect(vfxQuads(frameWithEffect('fire', 'fire-core', '#ffd15c', 3)).alpha).toHaveLength(0);
    expect(vfxQuads(frameWithEffect('insects', 'insects-primary', '#ffe889e6', 8)).alpha).toHaveLength(0);
  });

  /** A dark rect drawn under a bright one is a 2D compositing trick the lit scene does not need. */
  test('the compositing-only shadow roles are dropped', () => {
    const frame = frameWithEffect('steam', 'steam-shadow', '#3f342c4d', 2);
    const quads = vfxQuads(frame);
    expect(quads.additive).toHaveLength(0);
    expect(quads.alpha).toHaveLength(0);
  });

  test('no effect is ever buried below the floor', () => {
    for (const kind of ['fire', 'steam', 'sparkle', 'insects', 'leaves', 'palm', 'neon', 'water']) {
      const frame = frameWithEffect(kind, `${kind}-primary`, '#ffffffff', 4);
      for (const quad of [...vfxQuads(frame).additive, ...vfxQuads(frame).alpha]) {
        expect(quad.y).toBeGreaterThan(0);
      }
    }
  });
});

describe('transient one-shots', () => {
  const withTransients = (): WorldFrameState => ({
    ...outdoorFrame(),
    transientEffects: [
      { layer: 'ground', x: 100, y: 200, width: 6, height: 2, color: '#5e1a18cc' },
      { layer: 'aerial', x: 100, y: 200, width: 3, height: 3, color: '#ffe49aff' },
    ],
  } as unknown as WorldFrameState);

  /** Additive would delete a blood stain outright: a dark colour adds nothing to a lit floor. */
  test('a ground mark is flat, low and alpha blended', () => {
    // The fixture already carries ambient emitters, so select the one-shot by id rather than index.
    const [mark] = vfxQuads(withTransients()).alpha.filter((quad) => quad.id.startsWith('transient#'));
    expect(mark!.upright).toBe(false);
    expect(mark!.y).toBeLessThan(0.05);
    expect(mark!.y).toBeGreaterThan(0);
  });

  /** A muzzle flash at the ankles is a different event from a muzzle flash. */
  test('an aerial one-shot is upright at chest height and additive', () => {
    const [flash] = vfxQuads(withTransients()).additive
      .filter((quad) => quad.id.startsWith('transient#'));
    expect(flash!.upright).toBe(true);
    expect(flash!.y).toBeCloseTo(0.5, 6);
  });
});

describe('transient glows', () => {
  test('become lamp pools, so the radial fan bake already handles them', () => {
    const frame = {
      ...outdoorFrame(),
      transientGlows: [{ worldX: 320, worldY: 640, radius: 48, color: '#ffd15c', opacity: 0.5 }],
    } as unknown as WorldFrameState;
    const [pool] = vfxGlowPools(frame);
    expect(pool!.x).toBeCloseTo(10, 6);
    expect(pool!.z).toBeCloseTo(20, 6);
    expect(pool!.width).toBeCloseTo(3, 6);
    expect(pool!.opacity).toBe(0.5);
  });

  test('a frame with no glows produces none', () => {
    expect(vfxGlowPools(outdoorFrame())).toHaveLength(0);
  });
});
