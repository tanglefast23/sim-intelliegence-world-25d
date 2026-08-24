import {
  bakeGeneratedMinaFrames,
  buildGeneratedMinaLayout,
  MINA_KINDERGRIMM_RECIPE,
  MINA_PART_IDS,
  MINA_RIG_DATA,
  renderMinaWireframe,
} from '../generated-mina';
import { KINDERGRIMM_UPSTREAM_COMMIT } from '../kindergrimm-recipe';
import { resolveMinaRigPose, type MinaRigJointId } from '../mina-rig';
import { VAMPIRE_SHEET_LENGTH } from '../pose';
import { PENCIL_HEIGHT, PENCIL_WIDTH } from '../vampire';

describe('KinderGrimm Mina review rig', () => {
  test('pins the recipe and bakes deterministic four-facing frames', () => {
    expect(MINA_KINDERGRIMM_RECIPE).toMatchObject({
      status: 'shipping',
      visualId: 'mina-park',
      upstreamCommit: KINDERGRIMM_UPSTREAM_COMMIT,
      seed: 2026,
      species: 'human',
      base: 'biped',
      media: 'graphite',
    });
    expect(MINA_PART_IDS).toEqual([
      'legs', 'broom', 'far-arm', 'neck', 'hair', 'torso', 'robe', 'head', 'rear-hair-cap', 'hat', 'near-arm',
    ]);
    const first = bakeGeneratedMinaFrames();
    const second = bakeGeneratedMinaFrames();
    expect(first).toHaveLength(VAMPIRE_SHEET_LENGTH);
    expect(first[0]).toHaveLength(PENCIL_WIDTH * PENCIL_HEIGHT * 4);
    expect([...first[0]!]).toEqual([...second[0]!]);
  });

  test('wireframes every named joint and keeps feet and broom on the contact row', () => {
    const layout = buildGeneratedMinaLayout();
    const pose = { facing: 'front', gait: 0, moving: false } as const;
    const rig = resolveMinaRigPose(layout, pose, MINA_RIG_DATA);
    const wired = new Set<MinaRigJointId>(MINA_RIG_DATA.bones.flat());
    expect(wired).toEqual(new Set(Object.keys(rig.joints) as MinaRigJointId[]));
    expect(MINA_RIG_DATA.bones.filter(([start]) => start === 'leftHand')).toEqual([]);
    expect(MINA_RIG_DATA.bones.filter(([start]) => start === 'rightHand')).toEqual([['rightHand', 'broomBrush']]);
    expect(Math.abs(rig.joints.leftFoot.y - layout.B.floorY)).toBeLessThanOrEqual(2);
    expect(Math.abs(rig.joints.rightFoot.y - layout.B.floorY)).toBeLessThanOrEqual(2);
    expect(Math.abs(rig.joints.broomBrush.y - layout.B.floorY)).toBeLessThanOrEqual(2);
    expect(renderMinaWireframe(pose).some((alpha, index) => index % 4 === 3 && alpha > 0)).toBe(true);
  });

  test('profile candidate keeps the broom arm and hides the other arm', () => {
    expect(MINA_RIG_DATA.profileHiddenJoints).toEqual(['leftShoulder', 'leftElbow', 'leftHand']);
    const current = bakeGeneratedMinaFrames();
    const candidate = bakeGeneratedMinaFrames(true);
    expect([...candidate[0]!]).toEqual([...current[0]!]);
    expect(candidate[18]!.filter((_, index) => index % 4 === 3 && candidate[18]![index]! > 0).length)
      .toBeLessThan(current[18]!.filter((_, index) => index % 4 === 3 && current[18]![index]! > 0).length);
  });
});
