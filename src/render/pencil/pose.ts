import type { MovementDirection } from '../atlas';

export type VampireFacing = 'front' | 'rear' | 'left' | 'right';
export type AnatomicalSide = 'left' | 'right';
export type ProfilePlacement = 'leading' | 'trailing';

export type VampirePose = Readonly<{
  facing: VampireFacing;
  gait: 0 | 1;
  /** False means standing still: both feet flat, no swing, no sway. */
  moving: boolean;
}>;

export const VAMPIRE_FACINGS: readonly VampireFacing[] = ['front', 'rear', 'left', 'right'];

const CHARACTER_RIGHT_SCREEN_SIDE: Readonly<Record<VampireFacing, -1 | 1>> = {
  front: -1,
  rear: 1,
  left: 1,
  right: -1,
};

export function screenSideForAttachment(
  side: AnatomicalSide,
  facing: VampireFacing,
  profilePlacement: ProfilePlacement,
): -1 | 1 {
  if (facing === 'left' || facing === 'right') {
    const leading = facing === 'right' ? 1 : -1;
    return profilePlacement === 'leading' ? leading : leading === 1 ? -1 : 1;
  }
  const right = CHARACTER_RIGHT_SCREEN_SIDE[facing];
  return side === 'right' ? right : right === 1 ? -1 : 1;
}

/** Must match `BOIL_FRAMES` in vampire.ts. Kept literal to avoid an import cycle. */
const BOIL = 3;

/**
 * The sheet: one idle and two walk frames per facing.
 *
 * Idle is its own drawing rather than walk frame 0 — frame 0 has a foot in the air, so reusing it
 * left the vampire standing on one leg every time he stopped.
 *
 * Stopping preserves the last facing. Each facing therefore owns three idle boil frames before its
 * two three-boil walk gaits. At 120x180 this is 36 frames, about 2.97 MiB of raw RGBA data.
 *
 * Sitting, attack and sleep are NOT here. They are designed one at a time, and not as more baked
 * canvases — see section 6.6 of docs/art/character-sprite-design.md.
 */
export const IDLE_FRAMES = BOIL;
export const WALK_GAITS = 2;
export const VAMPIRE_SHEET_LENGTH = VAMPIRE_FACINGS.length * (IDLE_FRAMES + WALK_GAITS * BOIL);

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

export function vampireSheetIndex(pose: VampirePose, boil: number): number {
  const facing = Math.max(0, VAMPIRE_FACINGS.indexOf(pose.facing));
  const facingStart = facing * (IDLE_FRAMES + WALK_GAITS * BOIL);
  return facingStart + (pose.moving ? IDLE_FRAMES + pose.gait * BOIL : 0) + boil;
}
