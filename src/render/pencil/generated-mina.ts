import recipeJson from './recipes/mina-park.json';
import { kinderGrimmPartParams, kinderGrimmRigData, validateKinderGrimmShippingRecipe } from './kindergrimm-recipe';
import { buildPencilLayout, type PencilPalette } from './layout';
import { resolveMinaRigPose, type MinaRigData, type MinaRigJointId } from './mina-rig';
import { drawRiggedWitch } from './parts/witch';
import { VAMPIRE_FACINGS, type VampirePose } from './pose';
import { hashSeed, Sketch } from './sketch';
import { BOIL_FRAMES, PENCIL_HEIGHT, PENCIL_WIDTH } from './vampire';

type SkullParams = Readonly<{ wf: number; press: number }>;
type TorsoParams = Readonly<{ wF: number; lean: number }>;
type ArmsParams = Readonly<{ len: number }>;
type LegsParams = Readonly<{ len: number }>;

const PART_IDS = ['skull', 'eyes', 'nose', 'mouth', 'hair', 'torso', 'arms', 'legs'] as const;

export const MINA_PENCIL_PALETTE = {
  pale: [128, 151, 96],
  ash: [101, 126, 78],
  hollow: [54, 67, 48],
  hair: [76, 72, 82],
  hairEdge: [45, 42, 51],
  cloak: [42, 34, 48],
  cloakLift: [73, 57, 79],
  shirt: [67, 51, 74],
  lining: [181, 142, 52],
  fang: [245, 238, 216],
  red: [181, 142, 52],
  white: [248, 244, 235],
} as const satisfies PencilPalette;

export const MINA_KINDERGRIMM_RECIPE = validateKinderGrimmShippingRecipe(recipeJson, {
  visualId: 'mina-park',
  species: 'human',
  base: 'biped',
  partIds: PART_IDS,
  requireRig: true,
});

export const MINA_RIG_DATA = kinderGrimmRigData<MinaRigData>(MINA_KINDERGRIMM_RECIPE);
export const MINA_PART_IDS = MINA_RIG_DATA.partOrder;

const skull = kinderGrimmPartParams<SkullParams>(MINA_KINDERGRIMM_RECIPE, 'skull');
const torso = kinderGrimmPartParams<TorsoParams>(MINA_KINDERGRIMM_RECIPE, 'torso');
const arms = kinderGrimmPartParams<ArmsParams>(MINA_KINDERGRIMM_RECIPE, 'arms');
const legs = kinderGrimmPartParams<LegsParams>(MINA_KINDERGRIMM_RECIPE, 'legs');

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildGeneratedMinaLayout() {
  return buildPencilLayout('drop', MINA_PENCIL_PALETTE, {
    headWidthScale: clamp(skull.wf / 0.75, 0.92, 1.1),
    bodyWidthScale: clamp(torso.wF / 0.5, 0.92, 1.1),
    bodyLean: torso.lean,
    linePressure: clamp(skull.press / 1.35, 0.9, 1.15),
  });
}

function minaRig(pose: VampirePose) {
  const layout = buildGeneratedMinaLayout();
  return resolveMinaRigPose(layout, pose, MINA_RIG_DATA, {
    armLengthScale: clamp(arms.len / 0.8, 0.94, 1.12),
    legLengthScale: clamp(legs.len / 0.44, 0.94, 1.08),
  });
}

export function renderGeneratedMinaFrame(pose: VampirePose, boil = 0, sideProfile = false): Uint8ClampedArray {
  const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
  sketch.boil(hashSeed('mina-park', MINA_KINDERGRIMM_RECIPE.seed, pose.facing, pose.moving ? pose.gait : 'idle', boil));
  drawGeneratedMina(sketch, pose, true, sideProfile);
  return sketch.data;
}

export function drawGeneratedMina(sketch: Sketch, pose: VampirePose, dressed = true, sideProfile = false): void {
  const layout = buildGeneratedMinaLayout();
  drawRiggedWitch(sketch, layout, pose, minaRig(pose), MINA_RIG_DATA.partOrder, { dressed, sideProfile });
}

export function bakeGeneratedMinaFrames(sideProfile = false): readonly Uint8ClampedArray[] {
  return VAMPIRE_FACINGS.flatMap((facing) => [false, true].flatMap((moving) => (
    (moving ? [0, 1] : [0]).flatMap((gait) => Array.from({ length: BOIL_FRAMES }, (_, boil) => (
      renderGeneratedMinaFrame({ facing, moving, gait: gait as 0 | 1 }, boil, sideProfile)
    )))
  )));
}

function dot(sketch: Sketch, point: Readonly<{ x: number; y: number }>, color: readonly [number, number, number], radius: number): void {
  sketch.fill(sketch.blobPts(point.x, point.y, radius, radius, 0, 0.05), color, 0.95);
}

export function renderMinaWireframe(pose: VampirePose, sideProfile = false): Uint8ClampedArray {
  const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
  sketch.boil(hashSeed('mina-park', 'wireframe', pose.facing, pose.moving ? pose.gait : 'idle'));
  const layout = buildGeneratedMinaLayout();
  const rig = minaRig(pose);
  const joints = rig.joints;

  sketch.broken(sketch.blobPts(joints.head.x, joints.head.y, 23, 31, 0, 0.05), 1.1);
  sketch.broken([
    layout.body(-29, 151), layout.body(28, 151), layout.body(43, 260), layout.body(-42, 260), layout.body(-29, 151),
  ], 1.1);
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const hidden = new Set(profile && sideProfile ? MINA_RIG_DATA.profileHiddenJoints : []);
  for (const [start, end] of MINA_RIG_DATA.bones) {
    if (!hidden.has(start) && !hidden.has(end)) sketch.stroke([joints[start], joints[end]], 1.2, 0.72);
  }

  const face = new Set<MinaRigJointId>(['head', 'hair', 'hat', 'nose', 'leftEye', 'rightEye']);
  const contacts = new Set<MinaRigJointId>(['leftFoot', 'rightFoot', 'broomBrush']);
  const grips = new Set<MinaRigJointId>(['leftHand', 'rightHand']);
  for (const id of Object.keys(joints) as MinaRigJointId[]) {
    if (hidden.has(id)) continue;
    const color = contacts.has(id) ? [75, 146, 88] as const
      : grips.has(id) ? [184, 70, 58] as const
        : face.has(id) ? [200, 145, 40] as const
          : [52, 112, 168] as const;
    dot(sketch, joints[id], color, ['head', 'hips', 'torso'].includes(id) ? 2.3 : 1.7);
  }
  sketch.stroke([{ x: 18, y: layout.B.floorY }, { x: 102, y: layout.B.floorY }], 1, 0.45);
  return sketch.data;
}
