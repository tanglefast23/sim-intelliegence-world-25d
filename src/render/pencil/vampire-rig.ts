import type { CharacterPose, PencilRigHand, PencilRigIntent } from '../world-frame';
import type { VampireLayout } from './layout';
import { screenSideForAttachment, type VampireFacing, type VampirePose } from './pose';
import type { Point } from './sketch';

export type VampireRigJointId =
  | 'hips' | 'head' | 'hair'
  | 'leftShoulder' | 'leftElbow' | 'leftHand'
  | 'rightShoulder' | 'rightElbow' | 'rightHand'
  | 'leftHip' | 'leftKnee' | 'leftFoot'
  | 'rightHip' | 'rightKnee' | 'rightFoot';

export type VampireRigPose = Readonly<{
  facing: VampireFacing;
  joints: Readonly<Record<VampireRigJointId, Point>>;
  hairOffset: Point;
  held?: Readonly<{
    hand: PencilRigHand;
    point: Point;
    angleRadians: number;
  }>;
}>;

export type VampireRigInput = Readonly<{
  pose: VampirePose;
  characterPose?: CharacterPose;
  boil?: number;
  reducedMotion?: boolean;
  intent?: PencilRigIntent;
}>;

type MutableJoints = Record<VampireRigJointId, Point>;

const FRAME_MARGIN = 3;
const LANTERN_RADIUS = 7;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mix(a: Point, b: Point, weight: number): Point {
  return { x: a.x + (b.x - a.x) * weight, y: a.y + (b.y - a.y) * weight };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function sideX(hand: PencilRigHand, facing: VampireFacing): -1 | 1 {
  return screenSideForAttachment(hand, facing, hand === 'left' ? 'leading' : 'trailing');
}

function joint(hand: PencilRigHand, name: 'Shoulder' | 'Elbow' | 'Hand' | 'Hip' | 'Knee' | 'Foot'): VampireRigJointId {
  return `${hand}${name}` as VampireRigJointId;
}

function mappedStandingJoints(F: VampireLayout, pose: VampirePose): MutableJoints {
  const moving = pose.moving;
  const gaitSign = pose.gait === 0 ? 1 : -1;
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const points = {} as MutableJoints;
  points.hips = F.body(0, 198);
  points.head = F.head(0, 68);
  points.hair = F.head(0, 44);

  for (const hand of ['left', 'right'] as const) {
    const sx = sideX(hand, pose.facing);
    const phase = hand === 'left' ? gaitSign : -gaitSign;
    const armSwing = moving ? phase * 16 : 0;
    const hipX = profile ? sx * 3 : sx * 5;
    const footX = profile
      ? sx * (moving ? (pose.gait === 0 ? 14 : hand === 'left' ? 5 : -2) : 5)
      : sx * (moving ? (phase > 0 ? 4 : -6) : 6);
    const footLift = moving && phase < 0 ? (profile ? 12 : 20) : 0;

    points[joint(hand, 'Shoulder')] = F.body(sx * (profile ? 7 : 15), 140);
    points[joint(hand, 'Elbow')] = F.body(sx * (profile ? 20 : 38) - armSwing * 0.12, 178 + armSwing * 0.15);
    points[joint(hand, 'Hand')] = F.body(sx * (profile ? 24 : 31) - armSwing * 0.25, 218 + armSwing * 0.22);
    points[joint(hand, 'Hip')] = F.body(hipX, 198);
    points[joint(hand, 'Knee')] = F.body((hipX + footX) * 0.5, 242 - footLift * 0.45);
    points[joint(hand, 'Foot')] = F.body(footX, 302 - footLift);
  }
  return points;
}

function mappedSeatedJoints(F: VampireLayout, facing: VampireFacing): MutableJoints {
  const points = {} as MutableJoints;
  points.hips = F.body(0, 220);
  points.head = F.head(0, 68);
  points.hair = F.head(0, 44);
  for (const hand of ['left', 'right'] as const) {
    const sx = sideX(hand, facing);
    if (facing === 'left' || facing === 'right') {
      const dir = facing === 'right' ? 1 : -1;
      const near = sx === dir;
      points[joint(hand, 'Hip')] = F.body(dir * (near ? 4 : -2), 220);
      points[joint(hand, 'Knee')] = F.body(dir * (near ? 66 : 50), near ? 220 : 224);
      points[joint(hand, 'Foot')] = F.body(dir * (near ? 62 : 46), near ? 282 : 278);
      points[joint(hand, 'Shoulder')] = F.body(dir * (near ? 7 : -1), 148);
      points[joint(hand, 'Elbow')] = F.body(dir * (near ? 31 : 21), near ? 181 : 177);
      points[joint(hand, 'Hand')] = F.body(dir * (near ? 46 : 36), near ? 204 : 209);
    } else {
      points[joint(hand, 'Hip')] = F.body(sx * 8, 220);
      points[joint(hand, 'Knee')] = F.body(sx * 28, 220);
      points[joint(hand, 'Foot')] = F.body(sx * 28, 282);
      points[joint(hand, 'Shoulder')] = F.body(sx * 16, 148);
      points[joint(hand, 'Elbow')] = F.body(sx * 36, 176);
      points[joint(hand, 'Hand')] = F.body(sx * 40, 204);
    }
  }
  return points;
}

function solveArm(shoulder: Point, baseElbow: Point, baseHand: Point, requested: Point): Readonly<{ elbow: Point; hand: Point }> {
  const upper = distance(shoulder, baseElbow);
  const lower = distance(baseElbow, baseHand);
  const dx = requested.x - shoulder.x;
  const dy = requested.y - shoulder.y;
  const requestedDistance = Math.hypot(dx, dy);
  if (!(upper > 0.1 && lower > 0.1 && requestedDistance > 0.1)) return { elbow: baseElbow, hand: baseHand };
  const targetDistance = clamp(requestedDistance, Math.abs(upper - lower) + 0.2, upper + lower - 0.2);
  const hand = {
    x: shoulder.x + dx / requestedDistance * targetDistance,
    y: shoulder.y + dy / requestedDistance * targetDistance,
  };
  const targetAngle = Math.atan2(hand.y - shoulder.y, hand.x - shoulder.x);
  const shoulderOffset = Math.acos(clamp((upper * upper + targetDistance * targetDistance - lower * lower) / (2 * upper * targetDistance), -1, 1));
  const cross = (baseHand.x - shoulder.x) * (baseElbow.y - shoulder.y)
    - (baseHand.y - shoulder.y) * (baseElbow.x - shoulder.x);
  const bend = cross >= 0 ? 1 : -1;
  const elbowAngle = targetAngle + bend * shoulderOffset;
  return {
    elbow: { x: shoulder.x + Math.cos(elbowAngle) * upper, y: shoulder.y + Math.sin(elbowAngle) * upper },
    hand,
  };
}

function projectEllipse(point: Point, center: Point, radiusX: number, radiusY: number, fallbackX: number): Point {
  const nx = (point.x - center.x) / radiusX;
  const ny = (point.y - center.y) / radiusY;
  const length = Math.hypot(nx, ny);
  if (length >= 1) return point;
  const ux = length > 0.001 ? nx / length : fallbackX;
  const uy = length > 0.001 ? ny / length : 0;
  return { x: center.x + ux * (radiusX + 1), y: center.y + uy * (radiusY + 1) };
}

function projectCapsule(point: Point, start: Point, end: Point, radius: number, fallbackX: number): Point {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const lengthSquared = vx * vx + vy * vy;
  const progress = lengthSquared === 0 ? 0 : clamp(((point.x - start.x) * vx + (point.y - start.y) * vy) / lengthSquared, 0, 1);
  const nearest = { x: start.x + vx * progress, y: start.y + vy * progress };
  const dx = point.x - nearest.x;
  const dy = point.y - nearest.y;
  const length = Math.hypot(dx, dy);
  if (length >= radius) return point;
  const ux = length > 0.001 ? dx / length : fallbackX;
  const uy = length > 0.001 ? dy / length : 0;
  return { x: nearest.x + ux * (radius + 1), y: nearest.y + uy * (radius + 1) };
}

function projectBody(point: Point, F: VampireLayout, hand: PencilRigHand, extra = 0): Point {
  const fallbackX = hand === 'left' ? -1 : 1;
  const outsideHead = projectEllipse(point, F.head(0, 68), 18 + extra, 25 + extra, fallbackX);
  return projectCapsule(outsideHead, F.body(0, 150), F.body(0, 215), 13 + extra, fallbackX);
}

function inBody(point: Point, F: VampireLayout, extra = 0): boolean {
  const projected = projectBody(point, F, 'right', extra);
  return distance(projected, point) > 0.01;
}

function safePoint(point: Point): Point {
  return {
    x: clamp(point.x, FRAME_MARGIN, 120 - FRAME_MARGIN),
    y: clamp(point.y, FRAME_MARGIN, 180 - FRAME_MARGIN),
  };
}

function carryTarget(F: VampireLayout, facing: VampireFacing, hand: PencilRigHand): Point {
  const sx = sideX(hand, facing);
  return F.body(sx * (facing === 'left' || facing === 'right' ? 28 : 31), 188);
}

function lanternPoint(hand: Point, facing: VampireFacing, selected: PencilRigHand): Point {
  const sx = sideX(selected, facing);
  return { x: hand.x + sx * 2, y: hand.y + 11 };
}

export function resolveVampireRigPose(F: VampireLayout, input: VampireRigInput): VampireRigPose {
  const seated = input.characterPose === 'seated';
  const moving = input.reducedMotion ? false : input.pose.moving;
  const pose = { ...input.pose, moving };
  const joints = seated ? mappedSeatedJoints(F, pose.facing) : mappedStandingJoints(F, pose);
  const intent = seated ? undefined : input.intent;
  const reach = intent?.reach;
  const validReach = reach && Number.isFinite(reach.target.x) && Number.isFinite(reach.target.y) ? reach : undefined;
  const selected = validReach?.hand ?? intent?.heldItem?.hand;

  if (selected) {
    const shoulderId = joint(selected, 'Shoulder');
    const elbowId = joint(selected, 'Elbow');
    const handId = joint(selected, 'Hand');
    const baseElbow = joints[elbowId];
    const baseHand = joints[handId];
    const requested = validReach
      ? mix(baseHand, validReach.target, clamp(Number.isFinite(validReach.weight) ? validReach.weight! : 1, 0, 1))
      : carryTarget(F, pose.facing, selected);
    let solved = solveArm(joints[shoulderId], baseElbow, baseHand, safePoint(requested));
    let handPoint = solved.hand;

    if (intent?.heldItem) {
      const itemBefore = lanternPoint(handPoint, pose.facing, selected);
      const itemAfter = projectBody(itemBefore, F, selected, LANTERN_RADIUS);
      handPoint = { x: handPoint.x + itemAfter.x - itemBefore.x, y: handPoint.y + itemAfter.y - itemBefore.y };
      solved = solveArm(joints[shoulderId], baseElbow, baseHand, safePoint(handPoint));
      handPoint = solved.hand;
    }

    handPoint = safePoint(projectBody(handPoint, F, selected));
    solved = solveArm(joints[shoulderId], baseElbow, baseHand, handPoint);
    const finalItem = intent?.heldItem ? lanternPoint(solved.hand, pose.facing, selected) : undefined;
    if (!inBody(solved.hand, F) && (!finalItem || !inBody(finalItem, F, LANTERN_RADIUS))) {
      joints[elbowId] = solved.elbow;
      joints[handId] = solved.hand;
    }
  }

  const heldHand = intent?.heldItem?.hand;
  const heldPoint = heldHand ? lanternPoint(joints[joint(heldHand, 'Hand')], pose.facing, heldHand) : undefined;
  const hairPhase = moving ? (input.pose.gait === 0 ? -1 : 1) : 0;
  const facingDirection = pose.facing === 'left' ? -1 : pose.facing === 'right' ? 1 : 0.65;
  return {
    facing: pose.facing,
    joints,
    hairOffset: input.reducedMotion ? { x: 0, y: 0 } : { x: hairPhase * facingDirection * 1.5, y: Math.abs(hairPhase) * 0.4 },
    ...(heldHand && heldPoint ? {
      held: {
        hand: heldHand,
        point: heldPoint,
        angleRadians: Math.atan2(
          joints[joint(heldHand, 'Hand')].y - joints[joint(heldHand, 'Elbow')].y,
          joints[joint(heldHand, 'Hand')].x - joints[joint(heldHand, 'Elbow')].x,
        ),
      },
    } : {}),
  };
}

export function vampireRigSegmentLengths(pose: VampireRigPose, hand: PencilRigHand): Readonly<{ upper: number; lower: number }> {
  return {
    upper: distance(pose.joints[joint(hand, 'Shoulder')], pose.joints[joint(hand, 'Elbow')]),
    lower: distance(pose.joints[joint(hand, 'Elbow')], pose.joints[joint(hand, 'Hand')]),
  };
}
