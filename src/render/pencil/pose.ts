import type { MovementDirection } from '../atlas';

export type VampireFacing = 'front' | 'rear' | 'left' | 'right';

export type VampirePose = Readonly<{
  facing: VampireFacing;
  gait: 0 | 1;
  /** False means standing still: both feet flat, no swing, no sway. */
  moving: boolean;
}>;

export const VAMPIRE_FACINGS: readonly VampireFacing[] = ['front', 'rear', 'left', 'right'];

/** Must match `BOIL_FRAMES` in vampire.ts. Kept literal to avoid an import cycle. */
const BOIL = 3;

/**
 * The sheet: ONE front idle, then two walk frames per facing.
 *
 * Idle is its own drawing rather than walk frame 0 — frame 0 has a foot in the air, so reusing it
 * left the vampire standing on one leg every time he stopped.
 *
 * **Idle is front-facing only, on purpose.** A character who stops turns to face the camera, so
 * three more idle drawings would never be seen. Walking keeps all four facings. Together with the
 * 120x180 sheet this is 27 frames at 2.3 MB, against 36 frames at 12.4 MB before.
 *
 * Sitting, attack and sleep are NOT here. They are designed one at a time, and not as more baked
 * canvases — see section 6.6 of docs/art/character-sprite-design.md.
 */
export const IDLE_FRAMES = BOIL;
export const WALK_GAITS = 2;
export const VAMPIRE_SHEET_LENGTH = IDLE_FRAMES + VAMPIRE_FACINGS.length * WALK_GAITS * BOIL;

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
  // Standing still always lands on the single front idle, whatever way he was last facing.
  if (!pose.moving) return boil;
  const facing = Math.max(0, VAMPIRE_FACINGS.indexOf(pose.facing));
  return IDLE_FRAMES + (facing * WALK_GAITS + pose.gait) * BOIL + boil;
}
