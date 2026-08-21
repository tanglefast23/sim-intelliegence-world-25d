import { WORLD_MAP_CATALOG } from '../../../application/runtime/map-catalog';
import { createInitialState } from '../../../domain/state/initial-state';
import { buildWorldFrameState } from '../../world-frame';
import { pencilBillboards, pencilWorldScale } from '../billboard';
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
    expect(PENCIL_VISUAL_IDS).toHaveLength(12);
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
      .filter((id) => !['vampire-01', 'devon-price', 'rafael-cruz', 'resident-01', 'sora-tan', 'tomas-reed'].includes(id))
      .map((id) => PENCIL_CHARACTER_RECIPES[id]);
    expect(creaturePrototypes.every(({ artStatus }) => (
      artStatus.worldBody === 'rejected-human-template' &&
      artStatus.dialoguePortrait === 'rejected-human-template'
    ))).toBe(true);
    expect(PENCIL_CHARACTER_RECIPES['rafael-cruz'].artStatus).toEqual({
      worldBody: 'approved-literal-anatomy',
      dialoguePortrait: 'approved-literal-anatomy',
    });
    expect(PENCIL_CHARACTER_RECIPES['sora-tan'].artStatus).toEqual({
      worldBody: 'approved-literal-anatomy',
      dialoguePortrait: 'approved-literal-anatomy',
    });
    expect(PENCIL_CHARACTER_RECIPES['devon-price'].artStatus).toEqual({
      worldBody: 'approved-literal-anatomy',
      dialoguePortrait: 'approved-literal-anatomy',
    });
    expect(PENCIL_CHARACTER_RECIPES['tomas-reed'].artStatus).toEqual({
      worldBody: 'approved-literal-anatomy',
      dialoguePortrait: 'approved-literal-anatomy',
    });
    expect(PENCIL_CHARACTER_RECIPES['resident-01'].artStatus).toEqual({
      worldBody: 'approved-literal-anatomy',
      dialoguePortrait: 'approved-literal-anatomy',
    });

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

  test('Tomas is a footless white sheet with facing-correct eye holes', () => {
    const recipe = PENCIL_CHARACTER_RECIPES['tomas-reed'];
    const dressed = bakePencilCharacterFrames(recipe);
    const anatomyOnly = bakePencilCharacterFrames(recipe, { hidePersonalLayers: true });
    expect(Buffer.from(dressed[0]!)).not.toEqual(Buffer.from(anatomyOnly[0]!));

    const darkHeadPixels = (frame: Uint8ClampedArray): number => {
      let count = 0;
      for (let y = 25; y < 75; y += 1) {
        for (let x = 20; x < 100; x += 1) {
          const offset = (y * PENCIL_WIDTH + x) * 4;
          if (frame[offset + 3]! > 0 && frame[offset]! < 80 && frame[offset + 1]! < 80) count += 1;
        }
      }
      return count;
    };
    expect(darkHeadPixels(anatomyOnly[0]!)).toBeGreaterThan(darkHeadPixels(anatomyOnly[9]!) + 40);
    expect(darkHeadPixels(anatomyOnly[18]!)).toBeGreaterThan(darkHeadPixels(anatomyOnly[9]!) + 15);
    expect(darkHeadPixels(anatomyOnly[27]!)).toBeGreaterThan(darkHeadPixels(anatomyOnly[9]!) + 15);

    const floor = Math.floor(buildPencilLayout(recipe.shape, recipe.palette).B.floorY);
    for (const frameIndex of [0, 9, 18, 27]) {
      for (let y = floor - 2; y < PENCIL_HEIGHT; y += 1) {
        for (let x = 0; x < PENCIL_WIDTH; x += 1) {
          expect(anatomyOnly[frameIndex]![(y * PENCIL_WIDTH + x) * 4 + 3]).toBe(0);
        }
      }
    }
  });

  test('Calder is a literal Robot with facing-correct display eyes and attached parts', () => {
    const recipe = PENCIL_CHARACTER_RECIPES['resident-01'];
    expect(recipe.archetype).toBe('robot');
    expect(recipe.anatomy.canonicalFeatures).toEqual(expect.arrayContaining([
      'metal box head', 'amber display eyes', 'filing drawer torso', 'clamp hands', 'jointed legs',
    ]));
    expect(recipe.anatomy.absentHumanFeatures).toEqual(expect.arrayContaining([
      'human skin', 'human hair', 'human face', 'human fingers', 'human clothing',
    ]));

    const dressed = bakePencilCharacterFrames(recipe);
    const anatomyOnly = bakePencilCharacterFrames(recipe, { hidePersonalLayers: true });
    expect(Buffer.from(dressed[0]!)).not.toEqual(Buffer.from(anatomyOnly[0]!));

    const amberEyes = (frame: Uint8ClampedArray): number => {
      let count = 0;
      for (let y = 20; y < 105; y += 1) {
        for (let x = 12; x < PENCIL_WIDTH - 12; x += 1) {
          const offset = (y * PENCIL_WIDTH + x) * 4;
          if (frame[offset]! > 150 && frame[offset + 1]! > 90 && frame[offset + 2]! < 110) count += 1;
        }
      }
      return count;
    };
    const frontEyes = amberEyes(anatomyOnly[0]!);
    expect(frontEyes).toBeGreaterThan(amberEyes(anatomyOnly[9]!) + 20);
    expect(amberEyes(anatomyOnly[18]!)).toBeGreaterThan(5);
    expect(amberEyes(anatomyOnly[27]!)).toBeGreaterThan(5);
    expect(amberEyes(anatomyOnly[18]!)).toBeLessThan(frontEyes);
    expect(amberEyes(anatomyOnly[27]!)).toBeLessThan(frontEyes);

    const layout = buildPencilLayout(recipe.shape, recipe.palette);
    for (const frameIndex of [0, 9, 18, 27]) {
      for (let y = Math.ceil(layout.head(0, 124).y); y <= Math.floor(layout.body(0, 151).y); y += 1) {
        let connected = false;
        for (let x = layout.cx - 6; x <= layout.cx + 6; x += 1) {
          connected ||= anatomyOnly[frameIndex]![(y * PENCIL_WIDTH + x) * 4 + 3]! > 0;
        }
        expect(connected).toBe(true);
      }
    }
  });

  test('Mina keeps her broom in her right hand through every facing', () => {
    const frames = bakePencilCharacterFrames(PENCIL_CHARACTER_RECIPES['mina-park']);
    const goldCount = (frame: Uint8ClampedArray, half: 'left' | 'right'): number => {
      let count = 0;
      const start = half === 'left' ? 0 : PENCIL_WIDTH / 2;
      const end = half === 'left' ? PENCIL_WIDTH / 2 : PENCIL_WIDTH;
      for (let y = 0; y < PENCIL_HEIGHT; y += 1) {
        for (let x = start; x < end; x += 1) {
          const offset = (y * PENCIL_WIDTH + x) * 4;
          if (frame[offset]! > 120 && frame[offset + 1]! > 80 && frame[offset + 2]! < 90) count += 1;
        }
      }
      return count;
    };

    expect(goldCount(frames[0]!, 'left')).toBeGreaterThan(goldCount(frames[0]!, 'right'));
    expect(goldCount(frames[9]!, 'right')).toBeGreaterThan(goldCount(frames[9]!, 'left'));
    expect(goldCount(frames[18]!, 'right')).toBeGreaterThan(goldCount(frames[18]!, 'left'));
    expect(goldCount(frames[27]!, 'left')).toBeGreaterThan(goldCount(frames[27]!, 'right'));
  });

  test('Linda stays a broad-footed, unclothed, all-shag Bigfoot', () => {
    const recipe = PENCIL_CHARACTER_RECIPES.linda;
    const dressed = bakePencilCharacterFrames(recipe);
    const anatomyOnly = bakePencilCharacterFrames(recipe, { hidePersonalLayers: true });
    expect(Buffer.from(dressed[0]!)).toEqual(Buffer.from(anatomyOnly[0]!));
    expect(recipe.palette.hairEdge).toEqual(recipe.palette.hair);
    expect(recipe.palette.hairEdge[0]).toBeGreaterThan(recipe.palette.hairEdge[1]);
    expect(recipe.palette.ash[0]).toBeGreaterThan(recipe.palette.ash[1]);

    for (const frameIndex of [0, 9, 18, 27]) {
      const opaqueXs = new Set<number>();
      for (let y = 135; y < PENCIL_HEIGHT; y += 1) {
        for (let x = 0; x < PENCIL_WIDTH; x += 1) {
          if (anatomyOnly[frameIndex]![(y * PENCIL_WIDTH + x) * 4 + 3]! > 0) opaqueXs.add(x);
        }
      }
      expect(Math.max(...opaqueXs) - Math.min(...opaqueXs)).toBeGreaterThan(28);
    }
  });

  test('Devon is a literal alien before clothing', () => {
    const recipe = PENCIL_CHARACTER_RECIPES['devon-price'];
    const dressed = bakePencilCharacterFrames(recipe);
    const anatomyOnly = bakePencilCharacterFrames(recipe, { hidePersonalLayers: true });
    expect(Buffer.from(dressed[0]!)).not.toEqual(Buffer.from(anatomyOnly[0]!));
    expect(recipe.archetype).toBe('alien');
    expect(recipe.anatomy.canonicalFeatures).toEqual(expect.arrayContaining([
      'huge cranium', 'black almond eyes', 'three-fingered hands',
    ]));
    expect(recipe.anatomy.absentHumanFeatures).toEqual(expect.arrayContaining([
      'human ears', 'human hair', 'human eye whites', 'five-fingered hands',
    ]));

    const darkHeadPixels = (frame: Uint8ClampedArray): number => {
      let count = 0;
      for (let y = 20; y < 90; y += 1) {
        for (let x = 20; x < 100; x += 1) {
          const offset = (y * PENCIL_WIDTH + x) * 4;
          if (frame[offset + 3]! > 0 && frame[offset]! < 65 && frame[offset + 1]! < 65) count += 1;
        }
      }
      return count;
    };
    expect(darkHeadPixels(anatomyOnly[0]!)).toBeGreaterThan(120);
    expect(darkHeadPixels(anatomyOnly[9]!)).toBeLessThan(darkHeadPixels(anatomyOnly[0]!) * 0.5);
    expect(darkHeadPixels(anatomyOnly[18]!)).toBeGreaterThan(50);
    expect(darkHeadPixels(anatomyOnly[27]!)).toBeGreaterThan(50);

    for (const frameIndex of [0, 9, 18, 27]) {
      const opaqueXs = new Set<number>();
      for (let y = 20; y < 90; y += 1) {
        for (let x = 0; x < PENCIL_WIDTH; x += 1) {
          if (anatomyOnly[frameIndex]![(y * PENCIL_WIDTH + x) * 4 + 3]! > 0) opaqueXs.add(x);
        }
      }
      expect(Math.max(...opaqueXs) - Math.min(...opaqueXs)).toBeGreaterThan(50);
    }
  });

  test('Rafael keeps literal orc anatomy and body-local details through every facing', () => {
    const recipe = PENCIL_CHARACTER_RECIPES['rafael-cruz'];
    const dressed = bakePencilCharacterFrames(recipe);
    const anatomyOnly = bakePencilCharacterFrames(recipe, { hidePersonalLayers: true });
    expect(Buffer.from(dressed[0]!)).not.toEqual(Buffer.from(anatomyOnly[0]!));
    expect(recipe.palette.pale[1]).toBeGreaterThan(recipe.palette.pale[0]);
    expect(recipe.anatomy.canonicalFeatures).toContain('rooted tusks');

    const count = (
      frame: Uint8ClampedArray,
      matches: (r: number, g: number, b: number, x: number, y: number) => boolean,
    ): number => {
      let total = 0;
      for (let y = 0; y < PENCIL_HEIGHT; y += 1) {
        for (let x = 0; x < PENCIL_WIDTH; x += 1) {
          const offset = (y * PENCIL_WIDTH + x) * 4;
          if (frame[offset + 3]! > 0 && matches(frame[offset]!, frame[offset + 1]!, frame[offset + 2]!, x, y)) total += 1;
        }
      }
      return total;
    };
    const tusks = (frame: Uint8ClampedArray): number => count(
      frame,
      (r, g, b, _x, y) => y < 100 && r > 180 && g > 170 && b > 150,
    );
    expect(tusks(dressed[0]!)).toBeGreaterThan(tusks(dressed[18]!) * 1.5);
    expect(tusks(dressed[0]!)).toBeGreaterThan(tusks(dressed[27]!) * 1.5);
    expect(tusks(dressed[9]!)).toBeLessThan(20);

    const metalByHalf = (frame: Uint8ClampedArray, half: 'left' | 'right'): number => count(
      frame,
      (r, g, b, x, y) => y < 150 && (half === 'left' ? x < 60 : x >= 60)
        && r > 110 && g > 110 && b > 105 && Math.max(r, g, b) - Math.min(r, g, b) < 25,
    );
    expect(metalByHalf(dressed[0]!, 'left')).toBeGreaterThan(metalByHalf(dressed[0]!, 'right'));
    expect(metalByHalf(dressed[9]!, 'right')).toBeGreaterThan(metalByHalf(dressed[9]!, 'left'));
    expect(metalByHalf(dressed[18]!, 'right')).toBeGreaterThan(metalByHalf(dressed[18]!, 'left'));
    expect(metalByHalf(dressed[27]!, 'left')).toBeGreaterThan(metalByHalf(dressed[27]!, 'right'));

    const layout = buildPencilLayout(recipe.shape, recipe.palette);
    const neckTop = Math.ceil(layout.head(0, 125).y);
    const neckBottom = Math.floor(layout.body(0, 155).y);
    for (const frameIndex of [0, 9, 18, 27]) {
      for (let y = neckTop; y <= neckBottom; y += 1) {
        let connected = false;
        for (let x = layout.cx - 8; x <= layout.cx + 8; x += 1) {
          if (anatomyOnly[frameIndex]![(y * PENCIL_WIDTH + x) * 4 + 3]! > 0) connected = true;
        }
        expect(connected).toBe(true);
      }
    }
  });

  test('Marcus is the largest literal werewolf and keeps body-local features', () => {
    const recipe = PENCIL_CHARACTER_RECIPES['linda-boyfriend'];
    const dressed = bakePencilCharacterFrames(recipe);
    const anatomyOnly = bakePencilCharacterFrames(recipe, { hidePersonalLayers: true });
    expect(Buffer.from(dressed[0]!)).not.toEqual(Buffer.from(anatomyOnly[0]!));
    expect(recipe.anatomy.canonicalFeatures).toContain('digitigrade legs');
    expect(recipe.anatomy.absentHumanFeatures).toContain('human face');
    expect(pencilWorldScale('linda-boyfriend')).toBe(1.25);
    expect(pencilWorldScale('rafael-cruz')).toBe(1);

    for (const frameIndex of [0, 9, 18, 27]) {
      const opaqueXs = new Set<number>();
      for (let y = 76; y < 146; y += 1) {
        for (let x = 0; x < PENCIL_WIDTH; x += 1) {
          if (anatomyOnly[frameIndex]![(y * PENCIL_WIDTH + x) * 4 + 3]! > 0) opaqueXs.add(x);
        }
      }
      expect(Math.max(...opaqueXs) - Math.min(...opaqueXs)).toBeGreaterThan(78);
    }
  });

  test('Sora is a literal ghoul before clothing is added', () => {
    const recipe = PENCIL_CHARACTER_RECIPES['sora-tan'];
    const dressed = bakePencilCharacterFrames(recipe);
    const anatomyOnly = bakePencilCharacterFrames(recipe, { hidePersonalLayers: true });
    expect(Buffer.from(dressed[0]!)).not.toEqual(Buffer.from(anatomyOnly[0]!));
    expect(recipe.anatomy.canonicalFeatures).toEqual(expect.arrayContaining([
      'oversized skull', 'hollow sockets', 'jagged maw', 'long arms', 'clawed hands', 'splayed feet',
    ]));
    expect(recipe.anatomy.absentHumanFeatures).toContain('healthy human face');

    const darkHeadPixels = (frame: Uint8ClampedArray): number => {
      let count = 0;
      for (let y = 20; y < 78; y += 1) {
        for (let x = 20; x < 100; x += 1) {
          const offset = (y * PENCIL_WIDTH + x) * 4;
          if (frame[offset + 3]! > 0 && frame[offset]! < 65 && frame[offset + 1]! < 65) count += 1;
        }
      }
      return count;
    };
    expect(darkHeadPixels(anatomyOnly[0]!)).toBeGreaterThan(darkHeadPixels(anatomyOnly[9]!) * 3);
    expect(darkHeadPixels(anatomyOnly[18]!)).toBeGreaterThan(30);
    expect(darkHeadPixels(anatomyOnly[27]!)).toBeGreaterThan(30);

    const layout = buildPencilLayout(recipe.shape, recipe.palette);
    const mouthTop = layout.head(-38, 109);
    const mouthBottom = layout.head(38, 130);
    let visibleGumPixels = 0;
    for (let y = Math.floor(mouthTop.y); y <= Math.ceil(mouthBottom.y); y += 1) {
      for (let x = Math.floor(mouthTop.x); x <= Math.ceil(mouthBottom.x); x += 1) {
        const offset = (y * PENCIL_WIDTH + x) * 4;
        if (dressed[0]![offset + 3]! > 0 && dressed[0]![offset + 1]! > dressed[0]![offset]! + 10) visibleGumPixels += 1;
      }
    }
    expect(visibleGumPixels).toBeGreaterThan(100);
  });
});
