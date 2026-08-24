import type { PencilLayout } from './layout';
import { screenSideForAttachment, type AnatomicalSide, type VampireFacing, type VampirePose } from './pose';
import type { Point } from './sketch';

export type LindaRigJointId =
  | 'hips' | 'torso' | 'neck' | 'head' | 'mane' | 'muzzle' | 'nose'
  | 'leftEye' | 'rightEye'
  | 'leftShoulder' | 'leftElbow' | 'leftHand'
  | 'rightShoulder' | 'rightElbow' | 'rightHand'
  | 'leftHip' | 'leftKnee' | 'leftFoot'
  | 'rightHip' | 'rightKnee' | 'rightFoot';

export type LindaRigPose = Readonly<{
  facing: VampireFacing;
  joints: Readonly<Record<LindaRigJointId, Point>>;
  maneOffset: Point;
}>;

export type LindaRigTuning = Readonly<{
  armLengthScale?: number;
  legLengthScale?: number;
}>;

type LindaRigAnchor = readonly ['head' | 'body', number, number];
type LindaRigFacingAnchors = Readonly<Record<
  'eye' | 'muzzle' | 'nose' | 'shoulder' | 'elbow' | 'hand' | 'hip' | 'knee' | 'foot',
  LindaRigAnchor
>>;

export type LindaRigData = Readonly<{
  partOrder: readonly string[];
  profileHiddenJoints?: readonly LindaRigJointId[];
  anchors: Readonly<{
    root: Readonly<Record<'hips' | 'torso' | 'neck' | 'head' | 'mane', LindaRigAnchor>>;
    front: LindaRigFacingAnchors;
    profile: LindaRigFacingAnchors;
  }>;
  bones: readonly (readonly [LindaRigJointId, LindaRigJointId])[];
  motion: Readonly<{
    gaitSwing: number;
    elbowSwingX: number;
    elbowSwingY: number;
    handSwingX: number;
    handSwingY: number;
    frontStride: number;
    profileLeadX: number;
    profileTrailX: number;
    frontLift: number;
    profileLift: number;
    kneeLiftShare: number;
    maneFollowX: number;
    maneFollowY: number;
    frontManeDirection: number;
  }>;
}>;

function joint(side: AnatomicalSide, name: 'Eye' | 'Shoulder' | 'Elbow' | 'Hand' | 'Hip' | 'Knee' | 'Foot'): LindaRigJointId {
  return `${side}${name}` as LindaRigJointId;
}

function sideX(side: AnatomicalSide, facing: VampireFacing): -1 | 1 {
  return screenSideForAttachment(side, facing, side === 'left' ? 'leading' : 'trailing');
}

function extend(origin: Point, point: Point, scale: number): Point {
  return {
    x: origin.x + (point.x - origin.x) * scale,
    y: origin.y + (point.y - origin.y) * scale,
  };
}

function mapAnchor(F: PencilLayout, anchor: LindaRigAnchor, xScale = 1, xOffset = 0, yOffset = 0): Point {
  const [space, x, y] = anchor;
  return F[space](x * xScale + xOffset, y + yOffset);
}

export function resolveLindaRigPose(
  F: PencilLayout,
  pose: VampirePose,
  data: LindaRigData,
  tuning: LindaRigTuning = {},
): LindaRigPose {
  const armLength = tuning.armLengthScale ?? 1;
  const legLength = tuning.legLengthScale ?? 1;
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const facingDirection = pose.facing === 'right' ? 1 : pose.facing === 'left' ? -1 : 0;
  const gaitSign = pose.gait === 0 ? 1 : -1;
  const points = {} as Record<LindaRigJointId, Point>;
  const anchors = profile ? data.anchors.profile : data.anchors.front;
  const motion = data.motion;

  points.hips = mapAnchor(F, data.anchors.root.hips);
  points.torso = mapAnchor(F, data.anchors.root.torso);
  points.neck = mapAnchor(F, data.anchors.root.neck);
  points.head = mapAnchor(F, data.anchors.root.head);
  points.mane = mapAnchor(F, data.anchors.root.mane);
  points.muzzle = mapAnchor(F, anchors.muzzle, profile ? facingDirection : 1);
  points.nose = mapAnchor(F, anchors.nose, profile ? facingDirection : 1);

  for (const side of ['left', 'right'] as const) {
    const sx = sideX(side, pose.facing);
    const phase = side === 'left' ? gaitSign : -gaitSign;
    const swing = pose.moving ? phase * motion.gaitSwing : 0;
    const shoulder = mapAnchor(F, anchors.shoulder, sx);
    const elbowBase = mapAnchor(F, anchors.elbow, sx, -sx * swing * motion.elbowSwingX, swing * motion.elbowSwingY);
    const handBase = mapAnchor(F, anchors.hand, sx, -sx * swing * motion.handSwingX, swing * motion.handSwingY);
    const hip = mapAnchor(F, anchors.hip, sx);
    const footX = profile
      ? sx * (pose.moving ? (phase > 0 ? motion.profileLeadX : motion.profileTrailX) : anchors.foot[1])
      : sx * anchors.foot[1] + (pose.moving ? phase * motion.frontStride : 0);
    const footLift = pose.moving && phase < 0 ? (profile ? motion.profileLift : motion.frontLift) : 0;
    const kneeX = (sx * anchors.knee[1] + footX) * 0.5;
    const kneeBase = mapAnchor(F, anchors.knee, 0, kneeX, -footLift * motion.kneeLiftShare);
    const footBase = mapAnchor(F, anchors.foot, 0, footX, -footLift);

    points[joint(side, 'Eye')] = mapAnchor(F, anchors.eye, profile ? facingDirection : sx);
    points[joint(side, 'Shoulder')] = shoulder;
    points[joint(side, 'Elbow')] = extend(shoulder, elbowBase, armLength);
    points[joint(side, 'Hand')] = extend(shoulder, handBase, armLength);
    points[joint(side, 'Hip')] = hip;
    points[joint(side, 'Knee')] = extend(hip, kneeBase, legLength);
    points[joint(side, 'Foot')] = extend(hip, footBase, legLength);
  }

  const manePhase = pose.moving ? (pose.gait === 0 ? -1 : 1) : 0;
  return {
    facing: pose.facing,
    joints: points,
    maneOffset: {
      x: manePhase * (facingDirection || motion.frontManeDirection) * motion.maneFollowX,
      y: Math.abs(manePhase) * motion.maneFollowY,
    },
  };
}
