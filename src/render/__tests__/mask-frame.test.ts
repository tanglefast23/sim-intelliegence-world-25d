import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PNG } from 'pngjs';

import { integerRect, maskFootprint, rendererMask, type MaskFrameInput } from '../mask-frame';

/**
 * The restored emitter must reproduce the frozen corpus exactly.
 *
 * These masks are the instrument every readability number is measured with. An emitter that looked
 * correct but filled the native outlines would leave the comparator passing while silently changing
 * what contrast retention and readable coverage mean.
 *
 * The inputs are committed rather than read from a packaged capture, so this check runs without a
 * build and cannot quietly stop running.
 */
const inputs = (JSON.parse(readFileSync(
  resolve('tests/fixtures/rendering/mask-emitter-inputs-v1.json'), 'utf8',
) as string) as { inputs: readonly MaskFrameInput[] }).inputs;

const atlas = PNG.sync.read(readFileSync(resolve('assets/generated/world-atlas.png')));
const alphaAt = (source: MaskFrameInput['source']) => (x: number, y: number): boolean =>
  atlas.data[((source.y + y) * atlas.width + source.x + x) * 4 + 3] !== 0;

describe('renderer mask emitter', () => {
  test('reproduces every frozen mask in the live corpus', () => {
    expect(inputs).toHaveLength(19);
    for (const input of inputs) {
      const frozen = JSON.parse(readFileSync(
        resolve(`artifacts/visual-polish/baseline/${input.fixtureId}-baseline-mask.json`), 'utf8',
      )) as { masks: readonly unknown[] };
      // Parsed structures, not file bytes. JSON key order is not part of the contract, and a
      // formatting difference failing this check would teach people to ignore it.
      expect(rendererMask(input, alphaAt(input.source))).toEqual(frozen.masks[0]);
    }
  });

  test('covers all four footprint families, including the native outlines', () => {
    // The sizes are the authored character scale of 7/6 applied to a 24x30 sprite: 28x35, then
    // its whole-number expansions at zoom 2 and 3. Before technique 4b these were 24x30, 48x60
    // and 72x90 — the counts move with the scale, which is the emitter tracking the renderer
    // rather than drifting from it.
    const families = new Map<string, number>();
    for (const input of inputs) {
      const mask = rendererMask(input, alphaAt(input.source));
      const cells = mask.alphaFootprint.reduce((total, row) => total + [...row].filter((c) => c === '1').length, 0);
      const key = `${mask.logicalBounds.width}x${mask.logicalBounds.height}:${cells}`;
      families.set(key, (families.get(key) ?? 0) + 1);
    }
    // The native family is an outline. Higher-DPR families use the filled authored silhouette.
    expect(Object.fromEntries(families)).toEqual({
      '28x35:90': 4,
      '28x35:670': 5,
      '56x70:2721': 5,
      '84x105:6104': 5,
    });
  });

  test('sets only edge texels at native raster, and every texel elsewhere', () => {
    // A 3x3 block of solid alpha: at native raster its centre is interior and must stay unset.
    const solid = () => true;
    const base: MaskFrameInput = {
      fixtureId: 'synthetic', sprite: 'x', source: { x: 0, y: 0, width: 3, height: 3 },
      worldX: 0, worldY: 0, camera: { x: 0, y: 0 },
      viewport: { width: 10, height: 10 }, captureLogical: { width: 10, height: 10 },
      devicePixelRatio: 1, zoom: 1, scale: 1,
    };
    expect(maskFootprint(base, solid, integerRect(0, 0, 3, 3))).toEqual(['111', '101', '111']);
    // Raise the device pixel ratio and the same block fills, because the outline rule is native-only.
    expect(maskFootprint({ ...base, devicePixelRatio: 1.5 }, solid, integerRect(0, 0, 3, 3)))
      .toEqual(['111', '111', '111']);
  });

  test('sizes the grid from the rounded bounds under a fractional scale', () => {
    // 30 x 1.22 is 36.6. The recovered builder used that product directly and would emit 36 rows
    // against bounds rounded to 37, which the mask schema rejects outright. The grid must follow
    // the bounds, or technique 4b emits an invalid mask.
    const scaled: MaskFrameInput = {
      fixtureId: 'scaled', sprite: 'x', source: { x: 0, y: 0, width: 24, height: 30 },
      worldX: 0, worldY: 0, camera: { x: 0, y: 0 },
      viewport: { width: 200, height: 200 }, captureLogical: { width: 200, height: 200 },
      devicePixelRatio: 2, zoom: 1, scale: 1.22,
    };
    const mask = rendererMask(scaled, () => true);
    expect(mask.logicalBounds.width).toBe(29);
    expect(mask.logicalBounds.height).toBe(37);
    expect(mask.alphaFootprint).toHaveLength(mask.logicalBounds.height);
    expect(mask.alphaFootprint[0]).toHaveLength(mask.logicalBounds.width);
  });

  test('derives hit bounds from the rounded logical bounds', () => {
    const mask = rendererMask(inputs[0]!, alphaAt(inputs[0]!.source));
    expect(mask.hitBounds).toEqual(integerRect(
      mask.logicalBounds.x - 4 * inputs[0]!.zoom,
      mask.logicalBounds.y - 2 * inputs[0]!.zoom,
      32 * inputs[0]!.zoom,
      32 * inputs[0]!.zoom,
    ));
  });
});
