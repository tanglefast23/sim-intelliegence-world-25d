import type { WorldFrameState } from '../../world-frame';
import { declaredVfxBounds } from '../../vfx/procedural-effects';
import { VFX_KINDS } from '../../vfx/types';
import { WALL_HEIGHT_TILES } from '../recipes';
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

/** The tile the probe emitter above sits on: `frameWithEffect` centres it at world (320, 640). */
const PROBE_TILE = { x: 10, y: 20 } as const;

/**
 * The same frame with one prop standing on the probe emitter's tile, so the plume has a source.
 *
 * `roofedCells` is cleared as well. The fixture map's villa interior is x9 y8 w16 h16 and the probe
 * tile is (10,20), so the probe is INSIDE it by default - which silently put every "outdoor" steam
 * assertion on the indoor path.
 */
function withPropUnderEmitter(frame: WorldFrameState, sprite: string): WorldFrameState {
  return {
    ...frame,
    roofedCells: [],
    shelterCells: [],
    props: [{ id: 'probe-prop', sprite, tile: { ...PROBE_TILE }, source: { x: 0, y: 0, width: 32, height: 32 }, color: '#ffffff' }],
  } as unknown as WorldFrameState;
}

/**
 * A roofed frame carrying one steam wisp at animation step `rise`, with a kettle under it.
 *
 * The rect mirrors `procedural-effects.ts` exactly - `center.y - 9 - rise`, two by six - and the
 * bounds come from `declaredVfxBounds`, because the indoor scale is measured against that declared
 * envelope rather than against the rects of whichever step is being drawn.
 */
function indoorSteamFrame(rise: number): WorldFrameState {
  const base = withPropUnderEmitter(
    frameWithEffect('steam', 'steam-primary', '#fff0d6a6', 2),
    'tile.kitchen-kettle',
  );
  const tileCentreY = 640;
  // The steam extents from `declaredVfxBounds`, placed on the fixture's own emitter centre rather
  // than on a tile centre — `frameWithEffect` anchors at (320, 640), which is the tile ORIGIN.
  const steam = declaredVfxBounds({ kind: 'steam', tile: { x: 0, y: 0 } });
  const centre = { x: 16, y: 16 };
  return {
    ...base,
    roofedCells: [{ x: PROBE_TILE.x - 2, y: PROBE_TILE.y - 2, width: 5, height: 5 }],
    effects: base.effects.map((effect) => ({
      ...effect,
      bounds: {
        left: 320 - (centre.x - steam.left),
        right: 320 + (steam.right - centre.x),
        top: tileCentreY - (centre.y - steam.top),
        bottom: tileCentreY + (steam.bottom - centre.y),
      },
      rects: [{ role: 'steam-primary', x: 319, y: tileCentreY - 9 - rise, width: 2, height: 6 }],
    })),
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

  /**
   * A dark rect under a bright one is a 2D compositing trick, and most of them the lit scene does
   * not need. Steam and water are the exception, measured: pale-on-pale is not a contrast, and a
   * cream wisp over ground at luminance 93 needs the backer that carried it in 2D.
   */
  test('compositing-only shadow roles are dropped', () => {
    const quads = vfxQuads(frameWithEffect('leaves', 'leaves-shadow', '#392c2259', 8));
    expect(quads.additive).toHaveLength(0);
    expect(quads.alpha).toHaveLength(0);
  });

  test('a steam backer is kept, alpha blended, and wider than the wisp it sits behind', () => {
    const backer = vfxQuads(frameWithEffect('steam', 'steam-shadow', '#3f342c4d', 2));
    const primary = vfxQuads(frameWithEffect('steam', 'steam-primary', '#fff0d6a6', 2));
    expect(backer.additive).toHaveLength(0);
    expect(backer.alpha).toHaveLength(1);
    expect(backer.alpha[0]!.width).toBeGreaterThan(primary.alpha[0]!.width);
  });

  /**
   * A steam plume comes off a food stall, and its emitter is authored ON the stall tile. Without a
   * base height the wisps render inside a 1.35-tile counter and the effect is invisible - and
   * widening them makes it worse, because a wider quad falls further inside the box.
   *
   * The base is the top of the prop the emitter STANDS ON, read per emitter. It used to be a flat
   * `steam: 1.55`, sized for the tallest stall in the game and applied everywhere; indoors that put
   * the office kettle's plume above the 1.45 wall top and through the roof lid, so it drew on top
   * of the annex roof.
   */
  test('steam rises from the top of the prop it stands on, not from the floor', () => {
    // The fixture map has its own furniture on the probe tile, so "no prop" has to be explicit.
    const bare = vfxQuads({
      ...frameWithEffect('steam', 'steam-primary', '#fff0d6a6', 2),
      props: [],
    } as unknown as WorldFrameState).alpha[0];
    const onStall = vfxQuads(withPropUnderEmitter(
      frameWithEffect('steam', 'steam-primary', '#fff0d6a6', 2),
      'tile.food-stall-left',
    )).alpha[0];
    expect(bare!.y).toBeLessThan(0.5);
    // `tile.food-stall-left` tops out at 1.45, so the plume starts a stall's height higher.
    expect(onStall!.y).toBeGreaterThan(1.4);
  });

  /**
   * A flat clamp at the ceiling is the obvious fix and the wrong one: every step of the four-step
   * cycle lands on the same value and the plume freezes into a still column. The climb is scaled
   * into the headroom instead, so the steps stay distinct AND stay under the lid.
   */
  test('an indoor plume stays under the ceiling and still climbs', () => {
    const heights = [0, 6].map((rise) => {
      const frame = indoorSteamFrame(rise);
      const [wisp] = vfxQuads(frame).alpha;
      return wisp!.y + wisp!.height / 2;
    });
    for (const top of heights) expect(top).toBeLessThan(WALL_HEIGHT_TILES);
    expect(heights[1]!).toBeGreaterThan(heights[0]!);
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

/**
 * `BOUNDS_BOTTOM_EXTENT` is a hand copy of the extent table in `procedural-effects.ts`. A copy with
 * no guard is a copy that drifts, and a drifted extent silently mis-anchors every effect of that
 * kind — it does not throw, it just puts the steam in the wrong place.
 */
describe('the bounds extent table does not drift', () => {
  test('every kind anchors at its own tile centre, whatever its cull box is', () => {
    for (const kind of VFX_KINDS) {
      const tile = { x: 10, y: 20 };
      const bounds = declaredVfxBounds({ kind, tile });
      const centreY = tile.y * 32 + 16;
      const frame = {
        ...outdoorFrame(),
        effectRoleColors: { [`${kind}-primary`]: '#ffffffff' },
        effects: [{
          emitterId: 'probe',
          kind,
          recipeId: `${kind}-v1`,
          ageStep: 0,
          bounds,
          // A rect sitting exactly ON the tile centre: a correctly anchored `rise` kind puts it at
          // the floor, and a correctly anchored `spread` kind puts it at the emitter's own depth.
          rects: [{ role: `${kind}-primary`, x: tile.x * 32 + 15, y: centreY - 1, width: 2, height: 2 }],
        }],
      } as unknown as WorldFrameState;
      const [quad] = [...vfxQuads(frame).additive, ...vfxQuads(frame).alpha];
      expect(quad).toBeDefined();
      expect(quad!.z).toBeCloseTo(centreY / 32, 5);
    }
  });
});
