import {
  bakeGeneratedLindaFrames,
  buildGeneratedLindaLayout,
  LINDA_KINDERGRIMM_RECIPE,
  LINDA_PART_IDS,
  LINDA_RIG_DATA,
  renderLindaWireframe,
} from '../generated-linda';
import { resolveLindaRigPose, type LindaRigJointId } from '../linda-rig';
import { KINDERGRIMM_UPSTREAM_COMMIT } from '../kindergrimm-recipe';
import { VAMPIRE_FACINGS } from '../pose';
import { VAMPIRE_SHEET_LENGTH } from '../pose';
import { PENCIL_HEIGHT, PENCIL_WIDTH } from '../vampire';

describe('KinderGrimm Linda review rig', () => {
  test('pins the recipe and bakes deterministic four-facing frames', () => {
    expect(LINDA_KINDERGRIMM_RECIPE).toMatchObject({
      status: 'shipping',
      visualId: 'linda',
      upstreamCommit: KINDERGRIMM_UPSTREAM_COMMIT,
      seed: 559,
      species: 'nightmare',
      base: 'biped',
      media: 'graphite',
    });
    expect(LINDA_PART_IDS).toEqual([
      'legs', 'far-arm', 'torso', 'buried-neck', 'head', 'mane', 'near-arm',
    ]);
    const first = bakeGeneratedLindaFrames();
    const second = bakeGeneratedLindaFrames();
    expect(first).toHaveLength(VAMPIRE_SHEET_LENGTH);
    expect(first[0]).toHaveLength(PENCIL_WIDTH * PENCIL_HEIGHT * 4);
    expect([...first[0]!]).toEqual([...second[0]!]);
    expect(VAMPIRE_FACINGS.map((_, index) => [...first[index * 9]!]))
      .toEqual(expect.arrayContaining([expect.any(Array)]));
  });

  test('wireframes every named joint and keeps both feet on the contact row', () => {
    const layout = buildGeneratedLindaLayout();
    const pose = { facing: 'front', gait: 0, moving: false } as const;
    const rig = resolveLindaRigPose(layout, pose, LINDA_RIG_DATA);
    const wired = new Set<LindaRigJointId>(LINDA_RIG_DATA.bones.flat());
    expect(wired).toEqual(new Set(Object.keys(rig.joints) as LindaRigJointId[]));
    expect(Math.abs(rig.joints.leftFoot.y - layout.B.floorY)).toBeLessThanOrEqual(2);
    expect(Math.abs(rig.joints.rightFoot.y - layout.B.floorY)).toBeLessThanOrEqual(2);
    expect(renderLindaWireframe(pose).some((alpha, index) => index % 4 === 3 && alpha > 0)).toBe(true);
  });

  test('profile candidate hides one arm without changing front art', () => {
    expect(LINDA_RIG_DATA.profileHiddenJoints).toEqual(['leftShoulder', 'leftElbow', 'leftHand']);
    const current = bakeGeneratedLindaFrames();
    const candidate = bakeGeneratedLindaFrames(true);
    expect([...candidate[0]!]).toEqual([...current[0]!]);
    expect(candidate[18]!.filter((_, index) => index % 4 === 3 && candidate[18]![index]! > 0).length)
      .toBeLessThan(current[18]!.filter((_, index) => index % 4 === 3 && current[18]![index]! > 0).length);
  });
});
