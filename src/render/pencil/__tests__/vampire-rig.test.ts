import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import type { PencilRigHand, WorldCharacterPlacement } from '../../world-frame';
import {
  blitPencilFrame,
  resetVampireRigCacheForTests,
  vampireRigCompositionCountForTests,
} from '../billboard';
import {
  buildGeneratedVampireLayout,
  renderRiggedGeneratedVampireFrame,
} from '../generated-vampire';
import { resolveVampireRigPose, vampireRigSegmentLengths } from '../vampire-rig';

const F = buildGeneratedVampireLayout();
const IDLE = { facing: 'front', gait: 0, moving: false } as const;

function distance(a: Readonly<{ x: number; y: number }>, b: Readonly<{ x: number; y: number }>): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function handPoint(hand: PencilRigHand) {
  const base = resolveVampireRigPose(F, { pose: IDLE });
  return base.joints[hand === 'left' ? 'leftHand' : 'rightHand'];
}

function character(rigIntent: WorldCharacterPlacement['rigIntent']): WorldCharacterPlacement {
  return {
    id: 'protagonist',
    sprite: 'character.vampire-01.front-1',
    source: { x: 0, y: 0, width: 24, height: 32, kind: 'world-character', sourceId: 'test', cellClass: null, wallAdjacencyMask: null, category: 'world-character', visibility: 'public' },
    worldX: 0,
    worldY: 0,
    pivot: { x: 12, y: 30 },
    rotationDegrees: 0,
    scale: 1,
    color: '#ffffff',
    opacity: 1,
    layer: 'character',
    layerValue: 0,
    visualId: 'vampire-01',
    tile: { x: 0, y: 0 },
    shadowWorldX: 0,
    shadowWorldY: 0,
    angleDegrees: 0,
    gaitBobPixels: 0,
    moving: false,
    pose: 'idle',
    ...(rigIntent ? { rigIntent } : {}),
  };
}

describe('vampire pencil rig', () => {
  test.each(['left', 'right'] as const)('%s hand reaches a reachable canvas target', (hand) => {
    const baseHand = handPoint(hand);
    const target = { x: baseHand.x + (hand === 'left' ? 5 : -5), y: baseHand.y - 8 };
    const reached = resolveVampireRigPose(F, { pose: IDLE, intent: { reach: { hand, target } } });
    expect(distance(reached.joints[hand === 'left' ? 'leftHand' : 'rightHand'], target)).toBeLessThanOrEqual(1);
    const baseLengths = vampireRigSegmentLengths(resolveVampireRigPose(F, { pose: IDLE }), hand);
    const reachedLengths = vampireRigSegmentLengths(reached, hand);
    expect(Math.abs(reachedLengths.upper - baseLengths.upper)).toBeLessThanOrEqual(1);
    expect(Math.abs(reachedLengths.lower - baseLengths.lower)).toBeLessThanOrEqual(1);
  });

  test('treats non-finite reach targets as missing reach', () => {
    const base = resolveVampireRigPose(F, { pose: IDLE });
    const invalid = resolveVampireRigPose(F, {
      pose: IDLE,
      intent: { reach: { hand: 'right', target: { x: Number.NaN, y: Number.POSITIVE_INFINITY } } },
    });
    expect(invalid.joints).toEqual(base.joints);
  });

  test('treats a non-finite reach weight as the default full weight', () => {
    const target = { x: 88, y: 78 };
    const normal = resolveVampireRigPose(F, { pose: IDLE, intent: { reach: { hand: 'right', target } } });
    const invalid = resolveVampireRigPose(F, {
      pose: IDLE,
      intent: { reach: { hand: 'right', target, weight: Number.NaN } },
    });
    expect(invalid.joints).toEqual(normal.joints);
  });

  test('keeps a reached hand outside the protected head', () => {
    const head = F.head(0, 68);
    const reached = resolveVampireRigPose(F, { pose: IDLE, intent: { reach: { hand: 'right', target: head } } });
    const hand = reached.joints.rightHand;
    const normalized = Math.hypot((hand.x - head.x) / 18, (hand.y - head.y) / 25);
    expect(normalized).toBeGreaterThanOrEqual(1);
  });

  test('attaches a lantern to either carry hand', () => {
    for (const hand of ['left', 'right'] as const) {
      const pose = resolveVampireRigPose(F, { pose: IDLE, intent: { heldItem: { item: 'brass-lantern', hand } } });
      expect(pose.held?.hand).toBe(hand);
      expect(pose.held?.point.y).toBeGreaterThan(pose.joints[hand === 'left' ? 'leftHand' : 'rightHand'].y);
    }
  });

  test('removes gait and hair follow under reduced motion', () => {
    for (const facing of ['front', 'rear', 'left', 'right'] as const) {
      const moving = resolveVampireRigPose(F, { pose: { facing, gait: 1, moving: true } });
      const reduced = resolveVampireRigPose(F, { pose: { facing, gait: 1, moving: true }, reducedMotion: true });
      expect(Math.abs(moving.hairOffset.x) + Math.abs(moving.hairOffset.y)).toBeGreaterThan(0);
      expect(reduced.hairOffset).toEqual({ x: 0, y: 0 });
      expect(reduced.joints).toEqual(resolveVampireRigPose(F, { pose: { facing, gait: 1, moving: false } }).joints);
    }
  });

  test('renders identical RGBA bytes for identical input', () => {
    const intent = { heldItem: { item: 'brass-lantern', hand: 'right' } } as const;
    expect([...renderRiggedGeneratedVampireFrame(IDLE, 1, false, intent)])
      .toEqual([...renderRiggedGeneratedVampireFrame(IDLE, 1, false, intent)]);
  });

  test('reuses one dynamic frame for an identical cache key', () => {
    resetVampireRigCacheForTests();
    const placement = character({ reach: { hand: 'right', target: { x: 91, y: 83 } } });
    const first = new Uint8ClampedArray(120 * 180 * 4);
    const second = new Uint8ClampedArray(120 * 180 * 4);
    blitPencilFrame(first, placement, 0);
    blitPencilFrame(second, placement, 0);
    expect(vampireRigCompositionCountForTests()).toBe(1);
    expect(second).toEqual(first);
    blitPencilFrame(second, character({ reach: { hand: 'left', target: { x: 29, y: 83 } } }), 0);
    expect(vampireRigCompositionCountForTests()).toBe(2);
  });

  const benchmark = process.env.SI_VAMPIRE_RIG_BENCHMARK === '1' ? test : test.skip;
  benchmark('reports local composition p95', () => {
    const output = execFileSync(
      resolve('node_modules/.bin/tsx'),
      ['scripts/verification/benchmark-vampire-rig.ts'],
      { encoding: 'utf8' },
    );
    const p95 = Number(output.trim().split(':').at(-1));
    console.info(`vampire rig composition p95: ${p95.toFixed(3)} ms`);
    expect(p95).toBeLessThanOrEqual(2);
  });
});
