import {
  bakeMajorCharacterCandidateFrames,
  buildMajorCharacterLayout,
  MAJOR_CHARACTER_IDS,
  majorCharacterRecipe,
  majorCharacterRigData,
  renderMajorCharacterWireframe,
  resolveMajorCharacterRigPose,
  type MajorCharacterId,
} from '../generated-major-characters';
import { PENCIL_CHARACTER_RECIPES } from '../characters';
import { KINDERGRIMM_UPSTREAM_COMMIT } from '../kindergrimm-recipe';
import { buildPencilLayout, type PencilLayout } from '../layout';
import { drawLiteralAlien } from '../parts/alien';
import { drawClassicSheetGhost } from '../parts/ghost';
import { drawLiteralGhoul } from '../parts/ghoul';
import { drawLiteralGoblin } from '../parts/goblin';
import { drawLiteralOrc } from '../parts/orc';
import { drawLiteralRobot } from '../parts/robot';
import { drawPriyaSkeleton } from '../parts/skeleton';
import { drawConstructedCorpse } from '../parts/constructed-corpse';
import { drawLiteralWerewolf } from '../parts/werewolf';
import { VAMPIRE_SHEET_LENGTH, type VampireFacing, type VampirePose } from '../pose';
import { hashSeed, Sketch } from '../sketch';
import { PENCIL_HEIGHT, PENCIL_WIDTH } from '../vampire';

const EXPECTED: Readonly<Record<MajorCharacterId, Readonly<{ seed: number; species: string }>>> = {
  'devon-price': { seed: 3121, species: 'human' },
  'rafael-cruz': { seed: 4441, species: 'nightmare' },
  'linda-boyfriend': { seed: 5873, species: 'nightmare' },
  'tomas-reed': { seed: 6181, species: 'nightmare' },
  'priya-nair': { seed: 7603, species: 'nightmare' },
  'sora-tan': { seed: 8243, species: 'nightmare' },
  'elise-moreau': { seed: 9371, species: 'nightmare' },
  'resident-01': { seed: 10501, species: 'human' },
};

describe.each(MAJOR_CHARACTER_IDS)('KinderGrimm rig %s', (id) => {
  test('stores a complete deterministic rig and four-facing candidate', () => {
    const recipe = majorCharacterRecipe(id);
    const expected = EXPECTED[id];
    expect(recipe).toMatchObject({
      status: 'shipping',
      visualId: id,
      upstreamCommit: KINDERGRIMM_UPSTREAM_COMMIT,
      seed: expected.seed,
      species: expected.species,
      base: 'biped',
      media: 'graphite',
    });

    const rig = majorCharacterRigData(id);
    const pose = { facing: 'front', gait: 0, moving: false } as const;
    const joints = resolveMajorCharacterRigPose(id, pose);
    expect(new Set(rig.bones.flat())).toEqual(new Set(Object.keys(joints)));
    expect(new Set(Object.keys(rig.anchors.profile))).toEqual(new Set(Object.keys(joints)));
    expect(rig.partOrder.length).toBeGreaterThan(0);

    const first = bakeMajorCharacterCandidateFrames(id);
    const second = bakeMajorCharacterCandidateFrames(id);
    expect(first).toHaveLength(VAMPIRE_SHEET_LENGTH);
    expect(first[0]).toHaveLength(PENCIL_WIDTH * PENCIL_HEIGHT * 4);
    expect([...first[0]!]).toEqual([...second[0]!]);
    expect(renderMajorCharacterWireframe(id, pose).some((value, index) => index % 4 === 3 && value > 0)).toBe(true);

    const floor = buildMajorCharacterLayout(id).B.floorY;
    for (const joint of rig.contactJoints) {
      if (id === 'tomas-reed') expect(joints[joint]!.y).toBeLessThan(floor - 2);
      else expect(Math.abs(joints[joint]!.y - floor)).toBeLessThanOrEqual(2);
    }
  });
});

test('Rafael owns the ladle with his right hand and no empty hand owns an attachment', () => {
  const rig = majorCharacterRigData('rafael-cruz');
  expect(rig.bones.filter(([start]) => start === 'rightHand')).toEqual([['rightHand', 'ladleGrip']]);
  expect(rig.bones.filter(([start]) => start === 'leftHand')).toEqual([]);
});

test('Tomas uses a hover contact and no human hand or foot joints', () => {
  const rig = majorCharacterRigData('tomas-reed');
  const joints = Object.keys(rig.anchors.front);
  expect(rig.contactJoints).toEqual(['hoverContact']);
  expect(joints.some((joint) => /Hand|Foot/u.test(joint))).toBe(false);
});

test.each(['devon-price', 'rafael-cruz', 'linda-boyfriend', 'priya-nair', 'sora-tan', 'elise-moreau', 'resident-01'] as const)(
  '%s profile hides one complete arm chain',
  (id) => expect(majorCharacterRigData(id).profileHiddenJoints).toEqual(['leftShoulder', 'leftElbow', 'leftHand']),
);

type ProfileCase = Readonly<{
  id: MajorCharacterId | 'resident-02';
  change: 'narrower' | 'wider';
  draw: (sketch: Sketch, layout: PencilLayout, pose: VampirePose, revised: boolean) => void;
}>;

const PROFILE_CASES: readonly ProfileCase[] = [
  {
    id: 'devon-price', change: 'narrower',
    draw: (sketch, layout, pose, revised) => drawLiteralAlien(sketch, layout, pose, { dressed: true, sideProfile: revised }),
  },
  {
    id: 'rafael-cruz', change: 'narrower',
    draw: (sketch, layout, pose, revised) => drawLiteralOrc(sketch, layout, pose, { dressed: true, sideProfile: revised }),
  },
  {
    id: 'linda-boyfriend', change: 'narrower',
    draw: (sketch, layout, pose, revised) => drawLiteralWerewolf(sketch, layout, pose, { dressed: true, sideProfile: revised }),
  },
  {
    id: 'sora-tan', change: 'narrower',
    draw: (sketch, layout, pose, revised) => drawLiteralGhoul(sketch, layout, pose, { dressed: true, sideProfile: revised }),
  },
  {
    id: 'priya-nair', change: 'narrower',
    draw: (sketch, layout, pose, revised) => drawPriyaSkeleton(sketch, layout, pose, { dressed: true, sideProfile: revised }),
  },
  {
    id: 'elise-moreau', change: 'narrower',
    draw: (sketch, layout, pose, revised) => drawConstructedCorpse(sketch, layout, pose, { dressed: true, sideProfile: revised }),
  },
  {
    id: 'resident-01', change: 'narrower',
    draw: (sketch, layout, pose, revised) => drawLiteralRobot(sketch, layout, pose, { adorned: true, sideProfile: revised }),
  },
  {
    id: 'resident-02', change: 'narrower',
    draw: (sketch, layout, pose, revised) => drawLiteralGoblin(sketch, layout, pose, { dressed: true, sideProfile: revised }),
  },
  {
    id: 'tomas-reed', change: 'wider',
    draw: (sketch, layout, pose, revised) => drawClassicSheetGhost(sketch, layout, pose, { adorned: true, flaredProfile: revised }),
  },
];

function renderProfileCase(entry: ProfileCase, facing: VampireFacing, revised: boolean): Uint8ClampedArray {
  const source = PENCIL_CHARACTER_RECIPES[entry.id];
  const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
  sketch.boil(hashSeed(entry.id, 'profile-revision-check', facing));
  entry.draw(sketch, buildPencilLayout(source.shape, source.palette), { facing, gait: 0, moving: false }, revised);
  return sketch.data;
}

function alphaPixels(frame: Uint8ClampedArray): number {
  let count = 0;
  for (let index = 3; index < frame.length; index += 4) if (frame[index]! > 0) count += 1;
  return count;
}

test.each(PROFILE_CASES)('$id profile revision is candidate-only and visibly $change', (entry) => {
  expect([...renderProfileCase(entry, 'front', true)]).toEqual([...renderProfileCase(entry, 'front', false)]);
  const revised = alphaPixels(renderProfileCase(entry, 'left', true));
  const legacy = alphaPixels(renderProfileCase(entry, 'left', false));
  if (entry.change === 'narrower') expect(revised).toBeLessThan(legacy);
  else expect(revised).toBeGreaterThan(legacy);
});
