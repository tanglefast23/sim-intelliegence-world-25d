import {
  bakeVegetationFrame,
  blitVegetationFrame,
  VEGETATION_HEIGHT,
  VEGETATION_IDS,
  VEGETATION_RECIPE,
  VEGETATION_WIDTH,
  vegetationContactShadows,
  vegetationIdForSprite,
} from '../vegetation';
import {
  PENCIL_TEXTURE_HEIGHT,
  PENCIL_TEXTURE_WIDTH,
  vegetationBillboards,
  vegetationSource,
} from '../billboard';
import { FIXTURE_MAP, outdoorFrame } from '../../three25/__tests__/fixtures';
import { buildDecalBoxes } from '../../three25/scene-builder';

describe('KinderGrimm vegetation recipe', () => {
  test('pins the reviewed source and keeps every active vegetation family', () => {
    expect(VEGETATION_RECIPE).toMatchObject({
      status: 'integrated',
      upstreamCommit: 'de339ad739d8cbd28ff2dd4a940af38c0ede86c8',
      medium: 'graphite-and-charcoal',
    });
    expect(Object.keys(VEGETATION_RECIPE.assets)).toEqual(VEGETATION_IDS);
  });

  test.each(VEGETATION_IDS)('%s regenerates deterministic front and side frames', (id) => {
    for (const view of ['front', 'side'] as const) {
      const first = bakeVegetationFrame(id, view);
      const second = bakeVegetationFrame(id, view);
      expect(first).toHaveLength(VEGETATION_WIDTH * VEGETATION_HEIGHT * 4);
      expect([...first]).toEqual([...second]);
      expect(first.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
      const { transparentBounds, groundContact } = VEGETATION_RECIPE.assets[id].views[view];
      let minimumX = VEGETATION_WIDTH;
      let minimumY = VEGETATION_HEIGHT;
      let maximumX = -1;
      let maximumY = -1;
      let transparentRgbClean = true;
      for (let y = 0; y < VEGETATION_HEIGHT; y += 1) {
        for (let x = 0; x < VEGETATION_WIDTH; x += 1) {
          const offset = (y * VEGETATION_WIDTH + x) * 4;
          if (first[offset + 3] === 0) {
            transparentRgbClean &&= first[offset] === 0 && first[offset + 1] === 0 && first[offset + 2] === 0;
            continue;
          }
          minimumX = Math.min(minimumX, x);
          minimumY = Math.min(minimumY, y);
          maximumX = Math.max(maximumX, x);
          maximumY = Math.max(maximumY, y);
        }
      }
      expect(transparentRgbClean).toBe(true);
      expect(transparentBounds).toEqual({
        x: minimumX,
        y: minimumY,
        width: maximumX - minimumX + 1,
        height: maximumY - minimumY + 1,
      });
      expect(groundContact.x).toBeGreaterThanOrEqual(transparentBounds.x);
      expect(groundContact.x).toBeLessThan(transparentBounds.x + transparentBounds.width);
      expect(groundContact.y).toBeGreaterThanOrEqual(transparentBounds.y);
      expect(groundContact.y).toBeLessThan(transparentBounds.y + transparentBounds.height);
    }
  });

  test('uses the pencil batch once, at the existing world contact and scale', () => {
    const frame = outdoorFrame();
    const details = frame.groundDetails.filter((detail) => vegetationIdForSprite(detail.sprite));
    const billboards = vegetationBillboards(frame);
    expect(details.length).toBeGreaterThan(0);
    expect(billboards).toHaveLength(details.length);
    expect(buildDecalBoxes(frame).some(({ sprite }) => vegetationIdForSprite(sprite))).toBe(false);
    for (const detail of details) {
      const id = vegetationIdForSprite(detail.sprite)!;
      const recipe = VEGETATION_RECIPE.assets[id];
      const billboard = billboards.find(({ id: billboardId }) => billboardId === `pencil-${detail.id}`)!;
      expect(billboard.source).toEqual(vegetationSource(id));
      expect(billboard.x).toBe(detail.tile.x + 0.5);
      expect(billboard.z).toBe(detail.tile.y + 0.5);
      expect(billboard.width).toBe(recipe.world.width);
      expect(billboard.height).toBe(recipe.world.height);
      expect(billboard.depthBias).toBeUndefined();
      expect(billboard.lift).toBeCloseTo(
        -((VEGETATION_HEIGHT - recipe.views.front.groundContact.y) / VEGETATION_HEIGHT)
          * recipe.world.height,
      );
    }
  });

  test('keeps collision and adds one attached contact shadow per visible plant', () => {
    const frame = outdoorFrame();
    const details = frame.groundDetails.filter((detail) => vegetationIdForSprite(detail.sprite));
    const shadows = vegetationContactShadows(frame);
    expect(FIXTURE_MAP.presentation.decals
      .filter(({ sprite }) => vegetationIdForSprite(sprite))
      .every(({ solid }) => solid)).toBe(true);
    expect(shadows).toHaveLength(details.length);
    for (const detail of details) {
      const id = vegetationIdForSprite(detail.sprite)!;
      const expected = VEGETATION_RECIPE.assets[id].world.contactShadow;
      const shadow = shadows.find(({ id: shadowId }) => shadowId === `vegetation-contact-${detail.id}`)!;
      expect(shadow.x).toBe(detail.tile.x + 0.5 + expected.x);
      expect(shadow.z).toBe(detail.tile.y + 0.5 + expected.z);
      expect(shadow.width).toBe(expected.width);
      expect(shadow.depth).toBe(expected.depth);
    }
  });

  test('blits every front view into a unique shared-texture slot', () => {
    const target = new Uint8ClampedArray(PENCIL_TEXTURE_WIDTH * PENCIL_TEXTURE_HEIGHT * 4);
    for (const id of VEGETATION_IDS) {
      const source = vegetationSource(id);
      blitVegetationFrame(target, id, 'front', PENCIL_TEXTURE_WIDTH, source.x);
      const expected = bakeVegetationFrame(id, 'front');
      const sourceOffset = expected.findIndex((value, index) => index % 4 === 3 && value > 0) - 3;
      const pixel = sourceOffset / 4;
      const targetOffset = (Math.floor(pixel / VEGETATION_WIDTH) * PENCIL_TEXTURE_WIDTH
        + source.x + pixel % VEGETATION_WIDTH) * 4;
      expect(target.slice(targetOffset, targetOffset + 4)).toEqual(expected.slice(sourceOffset, sourceOffset + 4));
      expect(source.width).toBe(VEGETATION_WIDTH);
      expect(source.height).toBe(VEGETATION_HEIGHT);
    }
    expect(new Set(VEGETATION_IDS.map((id) => vegetationSource(id).x)).size).toBe(VEGETATION_IDS.length);
  });
});
