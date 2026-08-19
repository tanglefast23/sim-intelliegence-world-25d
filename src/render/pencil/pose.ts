import type { MovementDirection } from '../atlas';

export type VampireFacing = 'front' | 'rear' | 'left' | 'right';

export type VampirePose = Readonly<{
  facing: VampireFacing;
  gait: 0 | 1;
}>;

export const VAMPIRE_FACINGS: readonly VampireFacing[] = ['front', 'rear', 'left', 'right'];

export function facingFromDirection(direction: MovementDirection): VampireFacing {
  if (direction === 'up') return 'rear';
  if (direction === 'left') return 'left';
  if (direction === 'right') return 'right';
  return 'front';
}

export function poseFromSprite(sprite: string): VampirePose {
  const match = /\.(front|rear|left|right)-([12])$/u.exec(sprite);
  return {
    facing: (match?.[1] as VampireFacing | undefined) ?? 'front',
    gait: match?.[2] === '2' ? 1 : 0,
  };
}

/** Kindergrimm gait: one shared phase, offsets only. */
export function gaitSwing(gait: 0 | 1): number {
  return gait === 0 ? -16 : 16;
}

export function vampireSheetIndex(pose: VampirePose, boil: number): number {
  return VAMPIRE_FACINGS.indexOf(pose.facing) * 6 + pose.gait * 3 + boil;
}
