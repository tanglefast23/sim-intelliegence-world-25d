import recipeJson from './recipes/vampire-01.json';
import { buildPencilLayout, SHEET_HEIGHT, SHEET_WIDTH, VAMPIRE_COLORS } from './layout';
import { kinderGrimmPartParams, validateKinderGrimmShippingRecipe } from './kindergrimm-recipe';
import { drawArms } from './parts/arms';
import { drawRiggedArm } from './parts/arms';
import { drawCloak, drawCollar } from './parts/cloak';
import { drawEars } from './parts/ears';
import { drawEyes } from './parts/eyes';
import { drawFangs } from './parts/fangs';
import { drawHair } from './parts/hair';
import { drawLegs, drawRiggedLeg } from './parts/legs';
import { drawBrassLantern } from './parts/lantern';
import { drawNose } from './parts/nose';
import { drawSkull } from './parts/skull';
import { screenSideForAttachment, VAMPIRE_FACINGS, vampireSheetIndex, type VampirePose } from './pose';
import { hashSeed, Sketch } from './sketch';
import { BOIL_FRAMES } from './vampire';
import type { CharacterPose, PencilRigHand, PencilRigIntent } from '../world-frame';
import { resolveVampireRigPose, type VampireRigJointId } from './vampire-rig';

type SkullParams = Readonly<{ wf: number; round: number; press: number; hollows: boolean }>;
type EyeParams = Readonly<{ scale: number; scaleR: number; sx: number; fierce: number }>;
type NoseParams = Readonly<{ size: number }>;
type MouthParams = Readonly<{ wF: number }>;
type HairParams = Readonly<{ flare: number; fall: number }>;
type TorsoParams = Readonly<{ wF: number; lean: number }>;

export const VAMPIRE_KINDERGRIMM_RECIPE = validateKinderGrimmShippingRecipe(recipeJson);

const skull = kinderGrimmPartParams<SkullParams>(VAMPIRE_KINDERGRIMM_RECIPE, 'skull');
const eyes = kinderGrimmPartParams<EyeParams>(VAMPIRE_KINDERGRIMM_RECIPE, 'eyes');
const nose = kinderGrimmPartParams<NoseParams>(VAMPIRE_KINDERGRIMM_RECIPE, 'nose');
const mouth = kinderGrimmPartParams<MouthParams>(VAMPIRE_KINDERGRIMM_RECIPE, 'mouth');
const hair = kinderGrimmPartParams<HairParams>(VAMPIRE_KINDERGRIMM_RECIPE, 'hair');
const torso = kinderGrimmPartParams<TorsoParams>(VAMPIRE_KINDERGRIMM_RECIPE, 'torso');

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildGeneratedVampireLayout() {
  return buildPencilLayout('tall', VAMPIRE_COLORS, {
    headWidthScale: clamp(skull.wf / 0.9, 0.88, 1.1),
    bodyWidthScale: clamp(torso.wF / 0.5, 0.82, 1.08),
    bodyLean: torso.lean,
    linePressure: clamp(skull.press / 1.1, 0.9, 1.18),
  });
}

export function drawGeneratedVampire(sketch: Sketch, pose: VampirePose): void {
  const F = buildGeneratedVampireLayout();
  drawCloak(sketch, F, pose);
  drawLegs(sketch, F, pose);
  drawArms(sketch, F, pose);
  drawSkull(sketch, F, pose, skull);
  drawCollar(sketch, F, pose, { asymmetric: true });
  drawEars(sketch, F, pose);
  drawHair(sketch, F, pose, hair);
  drawEyes(sketch, F, pose, {
    scale: clamp(eyes.scale / 1.3, 0.85, 1.15),
    rightScale: clamp(eyes.scaleR, 0.85, 1.18),
    spacing: clamp(eyes.sx / 0.48, 0.88, 1.12),
    fierce: clamp(eyes.fierce, 0, 0.6),
  });
  drawNose(sketch, F, pose, { size: clamp(nose.size, 0.85, 1.18) });
  drawFangs(sketch, F, pose, { width: clamp(mouth.wF / 1.35, 0.85, 1.12) });
}

function nearHand(hand: PencilRigHand, pose: VampirePose): boolean {
  return screenSideForAttachment(hand, pose.facing, hand === 'left' ? 'leading' : 'trailing') === 1;
}

function rigJoint(hand: PencilRigHand, suffix: 'Hip' | 'Knee' | 'Foot' | 'Shoulder' | 'Elbow' | 'Hand'): VampireRigJointId {
  return `${hand}${suffix}` as VampireRigJointId;
}

export function drawGeneratedVampireHead(
  sketch: Sketch,
  pose: VampirePose,
  hairOffset = { x: 0, y: 0 },
): void {
  const F = buildGeneratedVampireLayout();
  drawSkull(sketch, F, pose, skull);
  drawEars(sketch, F, pose);
  drawHair(sketch, F, pose, { ...hair, offset: hairOffset });
  drawEyes(sketch, F, pose, {
    scale: clamp(eyes.scale / 1.3, 0.85, 1.15),
    rightScale: clamp(eyes.scaleR, 0.85, 1.18),
    spacing: clamp(eyes.sx / 0.48, 0.88, 1.12),
    fierce: clamp(eyes.fierce, 0, 0.6),
  });
  drawNose(sketch, F, pose, { size: clamp(nose.size, 0.85, 1.18) });
  drawFangs(sketch, F, pose, { width: clamp(mouth.wF / 1.35, 0.85, 1.12) });
}

export function drawRiggedGeneratedVampire(
  sketch: Sketch,
  pose: VampirePose,
  options: Readonly<{
    boil?: number;
    characterPose?: CharacterPose;
    reducedMotion?: boolean;
    intent?: PencilRigIntent;
  }> = {},
): void {
  const F = buildGeneratedVampireLayout();
  const rig = resolveVampireRigPose(F, {
    pose,
    characterPose: options.characterPose,
    boil: options.boil,
    reducedMotion: options.reducedMotion,
    intent: options.intent,
  });
  drawRiggedLower(sketch, F, pose, rig);
  drawRiggedArms(sketch, F, pose, rig, options.intent);
  drawRiggedUpper(sketch, F, pose, rig.hairOffset);
}

function sortedHands(pose: VampirePose): PencilRigHand[] {
  return (['left', 'right'] as PencilRigHand[])
    .sort((left, right) => Number(nearHand(left, pose)) - Number(nearHand(right, pose)));
}

function drawRiggedLower(
  sketch: Sketch,
  F: ReturnType<typeof buildGeneratedVampireLayout>,
  pose: VampirePose,
  rig: ReturnType<typeof resolveVampireRigPose>,
): void {
  drawCloak(sketch, F, pose);
  for (const hand of sortedHands(pose)) {
    drawRiggedLeg(sketch, F, {
      hip: rig.joints[rigJoint(hand, 'Hip')],
      knee: rig.joints[rigJoint(hand, 'Knee')],
      foot: rig.joints[rigJoint(hand, 'Foot')],
    }, { near: nearHand(hand, pose), rear: pose.facing === 'rear' });
  }
}

function drawRiggedArms(
  sketch: Sketch,
  F: ReturnType<typeof buildGeneratedVampireLayout>,
  pose: VampirePose,
  rig: ReturnType<typeof resolveVampireRigPose>,
  intent?: PencilRigIntent,
): void {
  for (const hand of sortedHands(pose)) {
    const active = intent?.reach?.hand === hand || intent?.heldItem?.hand === hand;
    drawRiggedArm(sketch, F, {
      shoulder: rig.joints[rigJoint(hand, 'Shoulder')],
      elbow: rig.joints[rigJoint(hand, 'Elbow')],
      hand: rig.joints[rigJoint(hand, 'Hand')],
    }, { near: nearHand(hand, pose), showHand: pose.facing !== 'rear' || active });
    const held = rig.held;
    if (held?.hand === hand) drawBrassLantern(sketch, F, held.point, held.angleRadians);
  }
}

function drawRiggedUpper(
  sketch: Sketch,
  F: ReturnType<typeof buildGeneratedVampireLayout>,
  pose: VampirePose,
  hairOffset: Readonly<{ x: number; y: number }>,
): void {
  drawSkull(sketch, F, pose, skull);
  drawCollar(sketch, F, pose, { asymmetric: true });
  drawEars(sketch, F, pose);
  drawHair(sketch, F, pose, { ...hair, offset: hairOffset });
  drawEyes(sketch, F, pose, {
    scale: clamp(eyes.scale / 1.3, 0.85, 1.15),
    rightScale: clamp(eyes.scaleR, 0.85, 1.18),
    spacing: clamp(eyes.sx / 0.48, 0.88, 1.12),
    fierce: clamp(eyes.fierce, 0, 0.6),
  });
  drawNose(sketch, F, pose, { size: clamp(nose.size, 0.85, 1.18) });
  drawFangs(sketch, F, pose, { width: clamp(mouth.wF / 1.35, 0.85, 1.12) });
}

type RigStaticLayers = Readonly<{
  lower: Uint8ClampedArray;
  upper: Uint8ClampedArray;
  upperOffsets: Uint32Array;
}>;

const rigStaticLayers: (RigStaticLayers | undefined)[] = [];

function staticRigLayers(pose: VampirePose, boil: number, reducedMotion: boolean): RigStaticLayers {
  const stablePose = reducedMotion ? { ...pose, moving: false } : pose;
  const index = vampireSheetIndex(stablePose, boil);
  const cached = rigStaticLayers[index];
  if (cached) return cached;

  const F = buildGeneratedVampireLayout();
  const rig = resolveVampireRigPose(F, { pose, boil, reducedMotion });
  const lower = new Sketch(SHEET_WIDTH, SHEET_HEIGHT);
  lower.boil(hashSeed('vampire-01', 'kindergrimm-rig-layer-lower', VAMPIRE_KINDERGRIMM_RECIPE.seed, stablePose.facing, stablePose.gait, boil));
  drawRiggedLower(lower, F, stablePose, rig);
  const upper = new Sketch(SHEET_WIDTH, SHEET_HEIGHT);
  upper.boil(hashSeed('vampire-01', 'kindergrimm-rig-layer-upper', VAMPIRE_KINDERGRIMM_RECIPE.seed, stablePose.facing, stablePose.gait, boil));
  drawRiggedUpper(upper, F, stablePose, rig.hairOffset);
  const upperOffsets: number[] = [];
  for (let offset = 0; offset < upper.data.length; offset += 4) {
    if (upper.data[offset + 3] !== 0) upperOffsets.push(offset);
  }
  const layers = { lower: lower.data, upper: upper.data, upperOffsets: Uint32Array.from(upperOffsets) };
  rigStaticLayers[index] = layers;
  return layers;
}

function compositeLayer(target: Uint8ClampedArray, source: Uint8ClampedArray, offsets: Uint32Array): void {
  for (const offset of offsets) {
    const sourceAlpha = source[offset + 3]!;
    const targetAlpha = target[offset + 3]!;
    if (sourceAlpha === 255 || targetAlpha === 0) {
      target[offset] = source[offset]!;
      target[offset + 1] = source[offset + 1]!;
      target[offset + 2] = source[offset + 2]!;
      target[offset + 3] = sourceAlpha;
      continue;
    }
    const sourceA = sourceAlpha / 255;
    const targetA = targetAlpha / 255;
    const outA = sourceA + targetA * (1 - sourceA);
    target[offset] = Math.round((source[offset]! * sourceA + target[offset]! * targetA * (1 - sourceA)) / outA);
    target[offset + 1] = Math.round((source[offset + 1]! * sourceA + target[offset + 1]! * targetA * (1 - sourceA)) / outA);
    target[offset + 2] = Math.round((source[offset + 2]! * sourceA + target[offset + 2]! * targetA * (1 - sourceA)) / outA);
    target[offset + 3] = Math.round(outA * 255);
  }
}

export function bakeGeneratedVampireFrames(): readonly Uint8ClampedArray[] {
  const frames: Uint8ClampedArray[] = [];
  for (const facing of VAMPIRE_FACINGS) {
    for (const moving of [false, true] as const) {
      for (const gait of moving ? [0, 1] as const : [0] as const) {
        for (let boil = 0; boil < BOIL_FRAMES; boil += 1) {
          const sketch = new Sketch(SHEET_WIDTH, SHEET_HEIGHT);
          sketch.boil(hashSeed('vampire-01', 'kindergrimm', VAMPIRE_KINDERGRIMM_RECIPE.seed, facing, moving ? gait : 'idle', boil));
          drawGeneratedVampire(sketch, { facing, gait, moving });
          frames.push(sketch.data);
        }
      }
    }
  }
  return frames;
}

export function bakeRiggedGeneratedVampireFrames(): readonly Uint8ClampedArray[] {
  const frames: Uint8ClampedArray[] = [];
  for (const facing of VAMPIRE_FACINGS) {
    for (const moving of [false, true] as const) {
      for (const gait of moving ? [0, 1] as const : [0] as const) {
        for (let boil = 0; boil < BOIL_FRAMES; boil += 1) {
          const sketch = new Sketch(SHEET_WIDTH, SHEET_HEIGHT);
          sketch.boil(hashSeed('vampire-01', 'kindergrimm-rig', VAMPIRE_KINDERGRIMM_RECIPE.seed, facing, moving ? gait : 'idle', boil));
          drawRiggedGeneratedVampire(sketch, { facing, gait, moving }, { boil });
          frames.push(sketch.data);
        }
      }
    }
  }
  return frames;
}

export function renderRiggedGeneratedVampireFrame(
  pose: VampirePose,
  boil: number,
  reducedMotion: boolean,
  intent?: PencilRigIntent,
): Uint8ClampedArray {
  const layers = staticRigLayers(pose, boil, reducedMotion);
  const sketch = new Sketch(SHEET_WIDTH, SHEET_HEIGHT);
  sketch.data.set(layers.lower);
  sketch.boil(hashSeed('vampire-01', 'kindergrimm-rig-dynamic-arms', VAMPIRE_KINDERGRIMM_RECIPE.seed, pose.facing, pose.gait, boil));
  const F = buildGeneratedVampireLayout();
  const rig = resolveVampireRigPose(F, { pose, boil, reducedMotion, intent });
  drawRiggedArms(sketch, F, pose, rig, intent);
  compositeLayer(sketch.data, layers.upper, layers.upperOffsets);
  return sketch.data;
}
