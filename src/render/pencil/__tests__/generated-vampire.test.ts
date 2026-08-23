import { legacyVampirePencilFrames, vampirePencilFrames } from '../billboard';
import { bakeGeneratedVampireFrames, VAMPIRE_KINDERGRIMM_RECIPE } from '../generated-vampire';
import { KINDERGRIMM_UPSTREAM_COMMIT, kinderGrimmPartParams } from '../kindergrimm-recipe';
import { VAMPIRE_FACINGS, vampireSheetIndex } from '../pose';
import { BOIL_FRAMES, PENCIL_HEIGHT, PENCIL_WIDTH, VAMPIRE_SHEET_FRAMES } from '../vampire';

describe('KinderGrimm vampire recipe', () => {
  test('pins the reviewed upstream casting and approved overrides', () => {
    expect(VAMPIRE_KINDERGRIMM_RECIPE).toMatchObject({
      upstreamCommit: KINDERGRIMM_UPSTREAM_COMMIT,
      seed: 737,
      species: 'nightmare',
      base: 'biped',
      media: 'graphite',
    });
    expect(kinderGrimmPartParams(VAMPIRE_KINDERGRIMM_RECIPE, 'skull')).toMatchObject({
      shape: 'tall', turn: 0, shroud: false, muzzle: 0, hollows: true,
    });
  });

  test('bakes the existing sheet contract deterministically', () => {
    const first = bakeGeneratedVampireFrames();
    const second = bakeGeneratedVampireFrames();
    expect(first).toHaveLength(VAMPIRE_SHEET_FRAMES);
    expect(first).toHaveLength(VAMPIRE_FACINGS.length * 3 * BOIL_FRAMES);
    expect(first[0]).toHaveLength(PENCIL_WIDTH * PENCIL_HEIGHT * 4);
    expect([...first[0]!]).toEqual([...second[0]!]);
    expect([...first[0]!]).not.toEqual([...legacyVampirePencilFrames()[0]!]);
    expect(vampirePencilFrames()).toBe(vampirePencilFrames());

    const front = vampireSheetIndex({ facing: 'front', gait: 0, moving: false }, 0);
    const rear = vampireSheetIndex({ facing: 'rear', gait: 0, moving: false }, 0);
    const step = vampireSheetIndex({ facing: 'front', gait: 1, moving: true }, 0);
    expect([...first[front]!]).not.toEqual([...first[rear]!]);
    expect([...first[front]!]).not.toEqual([...first[step]!]);
  });
});
