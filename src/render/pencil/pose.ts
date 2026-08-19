import type { MovementDirection } from '../atlas';

export type VampireFacing = 'front' | 'rear' | 'left' | 'right';

export type VampirePose = Readonly<{
  facing: VampireFacing;
  gait: 0 | 1;
  /** False means standing still: both feet flat, no swing, no sway. */
  moving: boolean;
}>;

export const VAMPIRE_FACINGS: readonly VampireFacing[] = ['front', 'rear', 'left', 'right'];

/**
 * Idle first, then the two walk frames.
 *
 * Idle is its own drawing rather than walk frame 0. Frame 0 has a foot in the air, so reusing it
 * left the vampire standing on one leg every time he stopped.
 */
export const VAMPIRE_STATES: readonly VampirePose[] = [
  { facing: 'front', gait: 0, moving: false },
  { facing: 'front', gait: 0, moving: true },
  { facing: 'front', gait: 1, moving: true },
];

/** Must match `BOIL_FRAMES` in vampire.ts. Kept literal to avoid an import cycle. */
const BOIL = 3;

export function facingFromDirection(direction: MovementDirection): VampireFacing {
  if (direction === 'up') return 'rear';
  if (direction === 'left') return 'left';
  if (direction === 'right') return 'right';
  return 'front';
}

export function poseFromSprite(sprite: string, moving = false): VampirePose {
  const match = /\.(front|rear|left|right)-([12])$/u.exec(sprite);
  return {
    facing: (match?.[1] as VampireFacing | undefined) ?? 'front',
    gait: match?.[2] === '2' ? 1 : 0,
    moving,
  };
}

/** Kindergrimm gait: one shared phase, offsets only. */
export function gaitSwing(gait: 0 | 1): number {
  return gait === 0 ? -16 : 16;
}

export function vampireStateIndex(pose: VampirePose): 0 | 1 | 2 {
  if (!pose.moving) return 0;
  return pose.gait === 0 ? 1 : 2;
}

export function vampireSheetIndex(pose: VampirePose, boil: number): number {
  return VAMPIRE_FACINGS.indexOf(pose.facing) * VAMPIRE_STATES.length * BOIL
    + vampireStateIndex(pose) * BOIL
    + boil;
}
