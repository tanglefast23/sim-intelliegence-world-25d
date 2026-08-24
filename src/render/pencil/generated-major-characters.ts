import devonRecipe from './recipes/devon-price.json';
import eliseRecipe from './recipes/elise-moreau.json';
import marcusRecipe from './recipes/linda-boyfriend.json';
import priyaRecipe from './recipes/priya-nair.json';
import rafaelRecipe from './recipes/rafael-cruz.json';
import calderRecipe from './recipes/resident-01.json';
import soraRecipe from './recipes/sora-tan.json';
import tomasRecipe from './recipes/tomas-reed.json';

import { PENCIL_CHARACTER_RECIPES } from './characters';
import {
  kinderGrimmPartParams,
  kinderGrimmRigData,
  validateKinderGrimmShippingRecipe,
  type KinderGrimmShippingRecipe,
} from './kindergrimm-recipe';
import { buildPencilLayout, type PencilLayout } from './layout';
import { drawLiteralAlien } from './parts/alien';
import { drawConstructedCorpse } from './parts/constructed-corpse';
import { drawClassicSheetGhost } from './parts/ghost';
import { drawLiteralGhoul } from './parts/ghoul';
import { drawLiteralOrc } from './parts/orc';
import { drawLiteralRobot } from './parts/robot';
import { drawPriyaSkeleton } from './parts/skeleton';
import { drawLiteralWerewolf } from './parts/werewolf';
import { VAMPIRE_FACINGS, type VampirePose } from './pose';
import { hashSeed, Sketch, type Point } from './sketch';
import { BOIL_FRAMES, PENCIL_HEIGHT, PENCIL_WIDTH } from './vampire';

export const MAJOR_CHARACTER_IDS = [
  'devon-price',
  'rafael-cruz',
  'linda-boyfriend',
  'tomas-reed',
  'priya-nair',
  'sora-tan',
  'elise-moreau',
  'resident-01',
] as const;

export type MajorCharacterId = typeof MAJOR_CHARACTER_IDS[number];
export type MajorRigJointId = string;
type RigAnchor = readonly ['head' | 'body', number, number];

export type MajorCharacterRigData = Readonly<{
  partOrder: readonly string[];
  profileHiddenJoints?: readonly MajorRigJointId[];
  anchors: Readonly<{
    front: Readonly<Record<MajorRigJointId, RigAnchor>>;
    profile: Readonly<Record<MajorRigJointId, RigAnchor>>;
  }>;
  bones: readonly (readonly [MajorRigJointId, MajorRigJointId])[];
  contactJoints: readonly MajorRigJointId[];
  handJoints: readonly MajorRigJointId[];
  faceJoints: readonly MajorRigJointId[];
  motion: Readonly<{
    gaitOffsets: Readonly<Record<MajorRigJointId, readonly [number, number]>>;
  }>;
}>;

type SkullParams = Readonly<{ wf: number; press: number }>;
type TorsoParams = Readonly<{ wF: number; lean: number }>;

const PART_IDS = ['skull', 'eyes', 'nose', 'mouth', 'hair', 'torso', 'arms', 'legs'] as const;
const RECIPE_JSON = {
  'devon-price': devonRecipe,
  'rafael-cruz': rafaelRecipe,
  'linda-boyfriend': marcusRecipe,
  'tomas-reed': tomasRecipe,
  'priya-nair': priyaRecipe,
  'sora-tan': soraRecipe,
  'elise-moreau': eliseRecipe,
  'resident-01': calderRecipe,
} as const;

const CASTING: Readonly<Record<MajorCharacterId, Readonly<{ species: string; base: string }>>> = {
  'devon-price': { species: 'human', base: 'biped' },
  'rafael-cruz': { species: 'nightmare', base: 'biped' },
  'linda-boyfriend': { species: 'nightmare', base: 'biped' },
  'tomas-reed': { species: 'nightmare', base: 'biped' },
  'priya-nair': { species: 'nightmare', base: 'biped' },
  'sora-tan': { species: 'nightmare', base: 'biped' },
  'elise-moreau': { species: 'nightmare', base: 'biped' },
  'resident-01': { species: 'human', base: 'biped' },
};

export const MAJOR_CHARACTER_KINDERGRIMM_RECIPES = Object.freeze(Object.fromEntries(
  MAJOR_CHARACTER_IDS.map((id) => [id, validateKinderGrimmShippingRecipe(RECIPE_JSON[id], {
    visualId: id,
    species: CASTING[id].species,
    base: CASTING[id].base,
    partIds: PART_IDS,
    requireRig: true,
  })]),
)) as Readonly<Record<MajorCharacterId, KinderGrimmShippingRecipe>>;

export function majorCharacterRecipe(id: MajorCharacterId): KinderGrimmShippingRecipe {
  return MAJOR_CHARACTER_KINDERGRIMM_RECIPES[id];
}

export function majorCharacterRigData(id: MajorCharacterId): MajorCharacterRigData {
  return kinderGrimmRigData<MajorCharacterRigData>(majorCharacterRecipe(id));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildMajorCharacterLayout(id: MajorCharacterId): PencilLayout {
  const recipe = majorCharacterRecipe(id);
  const source = PENCIL_CHARACTER_RECIPES[id];
  const skull = kinderGrimmPartParams<SkullParams>(recipe, 'skull');
  const torso = kinderGrimmPartParams<TorsoParams>(recipe, 'torso');
  return buildPencilLayout(source.shape, source.palette, {
    headWidthScale: clamp(skull.wf / 0.8, 0.97, 1.03),
    bodyWidthScale: clamp(torso.wF / 0.5, 0.97, 1.03),
    bodyLean: clamp(torso.lean, -0.02, 0.02),
    linePressure: clamp(skull.press / 1.2, 0.96, 1.04),
  });
}

function drawCharacter(
  id: MajorCharacterId,
  sketch: Sketch,
  layout: PencilLayout,
  pose: VampirePose,
  candidate = false,
): void {
  switch (id) {
    case 'devon-price': drawLiteralAlien(sketch, layout, pose, { dressed: true, sideProfile: candidate }); return;
    case 'rafael-cruz': drawLiteralOrc(sketch, layout, pose, { dressed: true, sideProfile: candidate }); return;
    case 'linda-boyfriend': drawLiteralWerewolf(sketch, layout, pose, { dressed: true, sideProfile: candidate }); return;
    case 'tomas-reed': drawClassicSheetGhost(sketch, layout, pose, { adorned: true, flaredProfile: candidate }); return;
    case 'priya-nair': drawPriyaSkeleton(sketch, layout, pose, { dressed: true, sideProfile: candidate }); return;
    case 'sora-tan': drawLiteralGhoul(sketch, layout, pose, { dressed: true, sideProfile: candidate }); return;
    case 'elise-moreau': drawConstructedCorpse(sketch, layout, pose, { dressed: true, sideProfile: candidate }); return;
    case 'resident-01': drawLiteralRobot(sketch, layout, pose, { adorned: true, sideProfile: candidate }); return;
  }
}

export function renderCurrentMajorCharacterFrame(
  id: MajorCharacterId,
  pose: VampirePose,
  boil = 0,
): Uint8ClampedArray {
  const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
  sketch.boil(hashSeed(id, pose.facing, pose.moving ? pose.gait : 'idle', boil));
  const source = PENCIL_CHARACTER_RECIPES[id];
  drawCharacter(id, sketch, buildPencilLayout(source.shape, source.palette), pose);
  return sketch.data;
}

export function renderMajorCharacterCandidateFrame(
  id: MajorCharacterId,
  pose: VampirePose,
  boil = 0,
): Uint8ClampedArray {
  const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
  sketch.boil(hashSeed(id, majorCharacterRecipe(id).seed, pose.facing, pose.moving ? pose.gait : 'idle', boil));
  drawCharacter(id, sketch, buildMajorCharacterLayout(id), pose, true);
  return sketch.data;
}

function bake(
  render: (pose: VampirePose, boil: number) => Uint8ClampedArray,
): readonly Uint8ClampedArray[] {
  return VAMPIRE_FACINGS.flatMap((facing) => [false, true].flatMap((moving) => (
    (moving ? [0, 1] as const : [0] as const).flatMap((gait) => (
      Array.from({ length: BOIL_FRAMES }, (_, boil) => render({ facing, moving, gait }, boil))
    ))
  )));
}

export function bakeCurrentMajorCharacterFrames(id: MajorCharacterId): readonly Uint8ClampedArray[] {
  return bake((pose, boil) => renderCurrentMajorCharacterFrame(id, pose, boil));
}

export function bakeMajorCharacterCandidateFrames(id: MajorCharacterId): readonly Uint8ClampedArray[] {
  return bake((pose, boil) => renderMajorCharacterCandidateFrame(id, pose, boil));
}

function mapAnchor(layout: PencilLayout, anchor: RigAnchor, profileDirection: -1 | 1): Point {
  const [space, x, y] = anchor;
  return layout[space](x * profileDirection, y);
}

export function resolveMajorCharacterRigPose(
  id: MajorCharacterId,
  pose: VampirePose,
): Readonly<Record<MajorRigJointId, Point>> {
  const layout = buildMajorCharacterLayout(id);
  const rig = majorCharacterRigData(id);
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const anchors = profile ? rig.anchors.profile : rig.anchors.front;
  const direction: -1 | 1 = profile && pose.facing === 'left' ? -1 : 1;
  const phase = pose.gait === 0 ? 1 : -1;
  return Object.fromEntries(Object.entries(anchors).map(([joint, anchor]) => {
    const point = mapAnchor(layout, anchor, direction);
    const offset = pose.moving ? rig.motion.gaitOffsets[joint] : undefined;
    return [joint, offset ? { x: point.x + offset[0] * phase, y: point.y + offset[1] * phase } : point];
  }));
}

function dot(
  sketch: Sketch,
  point: Point,
  color: readonly [number, number, number],
  radius: number,
): void {
  sketch.fill(sketch.blobPts(point.x, point.y, radius, radius, 0, 0.05), color, 0.95);
}

export function renderMajorCharacterWireframe(
  id: MajorCharacterId,
  pose: VampirePose,
): Uint8ClampedArray {
  const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
  sketch.boil(hashSeed(id, 'wireframe', pose.facing, pose.moving ? pose.gait : 'idle'));
  const layout = buildMajorCharacterLayout(id);
  const rig = majorCharacterRigData(id);
  const joints = resolveMajorCharacterRigPose(id, pose);
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const hidden = new Set(profile ? rig.profileHiddenJoints : []);
  for (const [start, end] of rig.bones) {
    if (!hidden.has(start) && !hidden.has(end)) sketch.stroke([joints[start]!, joints[end]!], 1.2, 0.72);
  }

  const contacts = new Set(rig.contactJoints);
  const hands = new Set(rig.handJoints);
  const face = new Set(rig.faceJoints);
  for (const [joint, point] of Object.entries(joints)) {
    if (hidden.has(joint)) continue;
    const color = contacts.has(joint) ? [75, 146, 88] as const
      : hands.has(joint) ? [184, 70, 58] as const
        : face.has(joint) ? [200, 145, 40] as const
          : [52, 112, 168] as const;
    dot(sketch, point, color, ['head', 'skull', 'torso', 'hips', 'shroudRoot'].includes(joint) ? 2.3 : 1.7);
  }
  sketch.stroke([{ x: 18, y: layout.B.floorY }, { x: 102, y: layout.B.floorY }], 1, 0.45);
  return sketch.data;
}
