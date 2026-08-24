import recipeJson from './recipes/linda.json';
import { kinderGrimmPartParams, kinderGrimmRigData, validateKinderGrimmShippingRecipe } from './kindergrimm-recipe';
import { buildPencilLayout, type PencilPalette } from './layout';
import { drawRiggedBigfoot } from './parts/bigfoot';
import { resolveLindaRigPose, type LindaRigData, type LindaRigJointId } from './linda-rig';
import { VAMPIRE_FACINGS, type VampirePose } from './pose';
import { hashSeed, Sketch } from './sketch';
import { BOIL_FRAMES, PENCIL_HEIGHT, PENCIL_WIDTH } from './vampire';

type SkullParams = Readonly<{ wf: number; press: number }>;
type EyeParams = Readonly<{ scale: number }>;
type NoseParams = Readonly<{ size: number; snoutLen: number }>;
type TorsoParams = Readonly<{ wF: number; lean: number }>;
type ArmsParams = Readonly<{ len: number }>;
type LegsParams = Readonly<{ len: number }>;

const PART_IDS = ['skull', 'eyes', 'nose', 'mouth', 'hair', 'torso', 'arms', 'legs'] as const;

export const LINDA_PENCIL_PALETTE = {
  pale: [132, 84, 56],
  ash: [153, 112, 78],
  hollow: [49, 32, 24],
  hair: [78, 50, 33],
  hairEdge: [78, 50, 33],
  cloak: [78, 50, 33],
  cloakLift: [105, 69, 45],
  shirt: [78, 50, 33],
  lining: [184, 166, 91],
  fang: [245, 238, 216],
  red: [184, 166, 91],
  white: [248, 244, 235],
} as const satisfies PencilPalette;

export const LINDA_KINDERGRIMM_RECIPE = validateKinderGrimmShippingRecipe(recipeJson, {
  visualId: 'linda',
  species: 'nightmare',
  base: 'biped',
  partIds: PART_IDS,
  requireRig: true,
});

export const LINDA_RIG_DATA = kinderGrimmRigData<LindaRigData>(LINDA_KINDERGRIMM_RECIPE);
export const LINDA_PART_IDS = LINDA_RIG_DATA.partOrder;

const skull = kinderGrimmPartParams<SkullParams>(LINDA_KINDERGRIMM_RECIPE, 'skull');
const eyes = kinderGrimmPartParams<EyeParams>(LINDA_KINDERGRIMM_RECIPE, 'eyes');
const nose = kinderGrimmPartParams<NoseParams>(LINDA_KINDERGRIMM_RECIPE, 'nose');
const torso = kinderGrimmPartParams<TorsoParams>(LINDA_KINDERGRIMM_RECIPE, 'torso');
const arms = kinderGrimmPartParams<ArmsParams>(LINDA_KINDERGRIMM_RECIPE, 'arms');
const legs = kinderGrimmPartParams<LegsParams>(LINDA_KINDERGRIMM_RECIPE, 'legs');

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildGeneratedLindaLayout() {
  return buildPencilLayout('lump', LINDA_PENCIL_PALETTE, {
    headWidthScale: clamp(skull.wf / 0.8, 0.92, 1.12),
    bodyWidthScale: clamp(torso.wF / 0.52, 0.92, 1.15),
    bodyLean: torso.lean,
    linePressure: clamp(skull.press / 1.2, 0.9, 1.16),
  });
}

function lindaRig(pose: VampirePose) {
  const layout = buildGeneratedLindaLayout();
  return resolveLindaRigPose(layout, pose, LINDA_RIG_DATA, {
    armLengthScale: clamp(arms.len / 1.05, 0.94, 1.14),
    legLengthScale: clamp(legs.len / 0.55, 0.94, 1.1),
  });
}

export function renderGeneratedLindaFrame(pose: VampirePose, boil = 0, sideProfile = false): Uint8ClampedArray {
  const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
  sketch.boil(hashSeed('linda', LINDA_KINDERGRIMM_RECIPE.seed, pose.facing, pose.moving ? pose.gait : 'idle', boil));
  drawGeneratedLinda(sketch, pose, sideProfile);
  return sketch.data;
}

export function drawGeneratedLinda(sketch: Sketch, pose: VampirePose, sideProfile = false): void {
  const layout = buildGeneratedLindaLayout();
  drawRiggedBigfoot(sketch, layout, pose, lindaRig(pose), LINDA_RIG_DATA.partOrder, {
    eyeScale: clamp(eyes.scale / 1.5, 0.9, 1.12),
    muzzleScale: clamp(nose.snoutLen / 1.2, 0.92, 1.16),
    noseScale: clamp(nose.size, 0.9, 1.12),
    sideProfile,
  });
}

export function bakeGeneratedLindaFrames(sideProfile = false): readonly Uint8ClampedArray[] {
  return VAMPIRE_FACINGS.flatMap((facing) => [false, true].flatMap((moving) => (
    (moving ? [0, 1] : [0]).flatMap((gait) => Array.from({ length: BOIL_FRAMES }, (_, boil) => (
      renderGeneratedLindaFrame({ facing, moving, gait: gait as 0 | 1 }, boil, sideProfile)
    )))
  )));
}

function dot(sketch: Sketch, point: Readonly<{ x: number; y: number }>, color: readonly [number, number, number], radius: number): void {
  sketch.fill(sketch.blobPts(point.x, point.y, radius, radius, 0, 0.05), color, 0.95);
}

export function renderLindaWireframe(pose: VampirePose, sideProfile = false): Uint8ClampedArray {
  const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
  sketch.boil(hashSeed('linda', 'wireframe', pose.facing, pose.moving ? pose.gait : 'idle'));
  const layout = buildGeneratedLindaLayout();
  const rig = lindaRig(pose);
  const joints = rig.joints;

  sketch.broken(sketch.blobPts(joints.head.x, joints.head.y, 24, 31, 0, 0.05), 1.1);
  sketch.broken([
    layout.body(-44, 148), layout.body(44, 148), layout.body(38, 230), layout.body(-38, 230), layout.body(-44, 148),
  ], 1.1);
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const hidden = new Set(profile && sideProfile ? LINDA_RIG_DATA.profileHiddenJoints : []);
  for (const [start, end] of LINDA_RIG_DATA.bones) {
    if (!hidden.has(start) && !hidden.has(end)) sketch.stroke([joints[start], joints[end]], 1.2, 0.72);
  }

  const face = new Set<LindaRigJointId>(['head', 'mane', 'muzzle', 'nose', 'leftEye', 'rightEye']);
  const contacts = new Set<LindaRigJointId>(['leftFoot', 'rightFoot']);
  const grips = new Set<LindaRigJointId>(['leftHand', 'rightHand']);
  for (const id of Object.keys(joints) as LindaRigJointId[]) {
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
