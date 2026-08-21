import { WORLD_MAP_CATALOG } from '../../../application/runtime/map-catalog';
import { createInitialState } from '../../../domain/state/initial-state';
import { buildWorldFrameState } from '../../world-frame';
import { pencilBillboards } from '../billboard';
import {
  bakePencilCharacterFrames,
  PENCIL_CHARACTER_RECIPES,
  PENCIL_RECIPE_VERSION,
  PENCIL_VISUAL_IDS,
} from '../characters';
import { buildPencilLayout } from '../layout';
import { drawPriyaSkeleton } from '../parts/skeleton';
import { Sketch } from '../sketch';
import { VAMPIRE_SHEET_LENGTH } from '../pose';
import { PENCIL_HEIGHT, PENCIL_WIDTH } from '../vampire';

describe('authored pencil character registry', () => {
  test('holds unique versioned recipes and several characters in one frame', () => {
    expect(PENCIL_VISUAL_IDS).toHaveLength(9);
    expect(new Set(PENCIL_VISUAL_IDS).size).toBe(PENCIL_VISUAL_IDS.length);
    expect(Object.values(PENCIL_CHARACTER_RECIPES).every(({ version }) => version === PENCIL_RECIPE_VERSION)).toBe(true);

    for (const recipe of Object.values(PENCIL_CHARACTER_RECIPES)) {
      expect(recipe.anatomy.base).not.toHaveLength(0);
      expect(recipe.anatomy.skullOrFace).not.toHaveLength(0);
      expect(recipe.anatomy.torso).not.toHaveLength(0);
      expect(recipe.anatomy.limbsAndContact).not.toHaveLength(0);
      expect(recipe.anatomy.surfaceOrMaterial).not.toHaveLength(0);
      expect(recipe.anatomy.canonicalFeatures.length).toBeGreaterThanOrEqual(3);
      expect(recipe.anatomy.absentHumanFeatures.length).toBeGreaterThanOrEqual(2);
    }

    const creaturePrototypes = PENCIL_VISUAL_IDS
      .filter((id) => id !== 'vampire-01')
      .map((id) => PENCIL_CHARACTER_RECIPES[id]);
    expect(creaturePrototypes.every(({ artStatus }) => (
      artStatus.worldBody === 'rejected-human-template' &&
      artStatus.dialoguePortrait === 'rejected-human-template'
    ))).toBe(true);

    expect(bakePencilCharacterFrames({
      ...PENCIL_CHARACTER_RECIPES['priya-nair'],
      artStatus: {
        ...PENCIL_CHARACTER_RECIPES['priya-nair'].artStatus,
        worldBody: 'approved-literal-anatomy',
      },
    })).toHaveLength(VAMPIRE_SHEET_LENGTH);

    const priya = PENCIL_CHARACTER_RECIPES['priya-nair'];
    expect(priya.anatomy.absentHumanFeatures).toContain('scalp');
    expect(priya.anatomy.absentHumanFeatures).not.toContain('hair');
    const dressed = bakePencilCharacterFrames(priya);
    const anatomyOnly = bakePencilCharacterFrames(priya, { hidePersonalLayers: true });
    expect(Buffer.from(dressed[0]!)).not.toEqual(Buffer.from(anatomyOnly[0]!));
    expect(anatomyOnly).toHaveLength(VAMPIRE_SHEET_LENGTH);

    for (const visualId of PENCIL_VISUAL_IDS.filter((id) => id !== 'vampire-01')) {
      expect(bakePencilCharacterFrames(PENCIL_CHARACTER_RECIPES[visualId])).toHaveLength(VAMPIRE_SHEET_LENGTH);
    }

    const frame = buildWorldFrameState(
      WORLD_MAP_CATALOG.northwest_residential,
      createInitialState(),
      {
        linda: { tile: { x: 18, y: 18 }, visualId: 'linda' },
        mina_park: { tile: { x: 19, y: 18 }, visualId: 'mina-park' },
      },
      'down',
      0,
    );
    const pencils = pencilBillboards(frame);
    expect(pencils.map(({ id }) => id)).toEqual(['pencil-linda', 'pencil-mina_park', 'pencil-protagonist']);
    expect(new Set(pencils.map(({ source }) => source.x)).size).toBe(3);
  });

  test('Priya keeps a closed rear top and visible far profile arms', () => {
    const recipe = PENCIL_CHARACTER_RECIPES['priya-nair'];
    const layout = buildPencilLayout(recipe.shape, recipe.palette);
    const render = (facing: 'front' | 'rear' | 'left' | 'right'): Sketch => {
      const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
      drawPriyaSkeleton(sketch, layout, { facing, gait: 0, moving: false });
      return sketch;
    };
    const pixel = (sketch: Sketch, x: number, y: number): readonly number[] => {
      const point = layout.body(x, y);
      const offset = (Math.round(point.y) * PENCIL_WIDTH + Math.round(point.x)) * 4;
      return [...sketch.data.slice(offset, offset + 4)];
    };

    const frontCentre = pixel(render('front'), 0, 170);
    const rearCentre = pixel(render('rear'), 0, 170);
    expect(rearCentre[1]! - rearCentre[0]!).toBeGreaterThan(30);
    expect(frontCentre[1]! - frontCentre[0]!).toBeLessThan(10);

    for (const facing of ['left', 'right'] as const) {
      const dir = facing === 'right' ? 1 : -1;
      const farSide = dir === 1 ? -1 : 1;
      const sketch = render(facing);
      const upper = layout.body(farSide * 12, 147);
      const lower = layout.body(farSide * 25, 184);
      let palePixels = 0;
      for (let y = Math.floor(upper.y); y <= Math.ceil(lower.y); y += 1) {
        for (let x = Math.floor(Math.min(upper.x, lower.x)); x <= Math.ceil(Math.max(upper.x, lower.x)); x += 1) {
          const offset = (y * PENCIL_WIDTH + x) * 4;
          if (sketch.data[offset]! > 150 && sketch.data[offset + 1]! > 140 && sketch.data[offset + 2]! > 120) palePixels += 1;
        }
      }
      expect(palePixels).toBeGreaterThan(5);
    }
  });

  test('Elise keeps her recorder on the same shoulder through every facing', () => {
    const recipe = PENCIL_CHARACTER_RECIPES['elise-moreau'];
    const dressed = bakePencilCharacterFrames(recipe);
    const anatomyOnly = bakePencilCharacterFrames(recipe, { hidePersonalLayers: true });
    expect(Buffer.from(dressed[0]!)).not.toEqual(Buffer.from(anatomyOnly[0]!));
    expect(recipe.palette.pale[1]).toBeGreaterThan(recipe.palette.pale[0]);

    const redCount = (frame: Uint8ClampedArray, half: 'left' | 'right'): number => {
      let count = 0;
      for (let y = 0; y < PENCIL_HEIGHT; y += 1) {
        const start = half === 'left' ? 0 : PENCIL_WIDTH / 2;
        const end = half === 'left' ? PENCIL_WIDTH / 2 : PENCIL_WIDTH;
        for (let x = start; x < end; x += 1) {
          const offset = (y * PENCIL_WIDTH + x) * 4;
          if (frame[offset]! > 100 && frame[offset]! > frame[offset + 1]! * 1.45) count += 1;
        }
      }
      return count;
    };

    for (let boil = 0; boil < 3; boil += 1) {
      expect(redCount(dressed[boil]!, 'right')).toBeGreaterThan(redCount(dressed[boil]!, 'left'));
      expect(redCount(dressed[9 + boil]!, 'left')).toBeGreaterThan(redCount(dressed[9 + boil]!, 'right'));
      expect(redCount(dressed[18 + boil]!, 'right')).toBeGreaterThan(redCount(dressed[27 + boil]!, 'left'));
    }

    const rear = dressed[9]!;
    const layout = buildPencilLayout(recipe.shape, recipe.palette);
    const browRow = Math.round(layout.head(0, 67).y);
    const opaqueXs: number[] = [];
    for (let x = 0; x < PENCIL_WIDTH; x += 1) {
      if (rear[(browRow * PENCIL_WIDTH + x) * 4 + 3]! > 0) opaqueXs.push(x);
    }
    expect(Math.max(...opaqueXs) - Math.min(...opaqueXs)).toBeGreaterThan(70);
  });

  test('Elise keeps her head connected to her neck in every facing', () => {
    const recipe = PENCIL_CHARACTER_RECIPES['elise-moreau'];
    const frames = bakePencilCharacterFrames(recipe, { hidePersonalLayers: true });
    const layout = buildPencilLayout(recipe.shape, recipe.palette);
    const top = Math.ceil(layout.head(0, 121).y);
    const bottom = Math.floor(layout.L.chinY);

    for (const frameIndex of [0, 9, 18, 27]) {
      for (let y = top; y <= bottom; y += 1) {
        let opaque = 0;
        for (let x = layout.cx - 6; x <= layout.cx + 6; x += 1) {
          if (frames[frameIndex]![(y * PENCIL_WIDTH + x) * 4 + 3]! > 0) opaque += 1;
        }
        expect(opaque).toBeGreaterThan(0);
      }
    }
  });
});
