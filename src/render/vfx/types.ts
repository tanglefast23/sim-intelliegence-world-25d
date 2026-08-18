import type { TilePoint } from '../../world/maps/schema';

export const VFX_REVISION = 2 as const;
export const VFX_STEP_MILLISECONDS = 334 as const;
export const VFX_MAX_DELTA_MILLISECONDS = 50 as const;
export const VFX_SUSPENSION_GAP_MILLISECONDS = 250 as const;

export type VfxMode = 'circle' | 'procedural';
export const VFX_KINDS = ['fire', 'sparkle', 'insects', 'leaves', 'neon', 'palm', 'steam', 'water'] as const;
export type VfxKind = (typeof VFX_KINDS)[number];
export type VfxRecipeId = `${VfxKind}-v1`;
export type VfxPrimitiveRole =
  | 'fire-halo'
  | 'fire-outer'
  | 'fire-core'
  | 'fire-ember'
  | 'sparkle-shadow'
  | 'sparkle-primary'
  | 'sparkle-satellite'
  | 'insects-halo'
  | 'insects-primary'
  | 'leaves-shadow'
  | 'leaves-primary'
  | 'neon-halo'
  | 'neon-primary'
  | 'palm-shadow'
  | 'palm-primary'
  | 'steam-shadow'
  | 'steam-primary'
  // The second half of the plume's cycle. A wisp that rises at one opacity and snaps back to the
  // spout reads as a flickering column; fading it out at the top of the climb is what makes the
  // four steps read as one plume rising and dissipating.
  | 'steam-wisp-shadow'
  | 'steam-wisp'
  | 'water-shadow'
  | 'water-primary';

export const VFX_ROLE_COLORS: Readonly<Record<VfxPrimitiveRole, string>> = Object.freeze({
  'fire-halo': '#f0783226',
  'fire-outer': '#c64f2280',
  'fire-core': '#ffd15c',
  'fire-ember': '#ffe49a80',
  'sparkle-shadow': '#5c4428cc',
  'sparkle-primary': '#fff4c8e6',
  'sparkle-satellite': '#fff3c4e6',
  'insects-halo': '#f6cd5133',
  'insects-primary': '#ffe889e6',
  'leaves-shadow': '#392c2259',
  'leaves-primary': '#e0a14ed9',
  'neon-halo': '#ef48bb33',
  'neon-primary': '#ff67d9e6',
  'palm-shadow': '#26341f66',
  'palm-primary': '#86a451d9',
  'steam-shadow': '#3f342c4d',
  'steam-primary': '#fff0d6a6',
  'steam-wisp-shadow': '#3f342c1f',
  'steam-wisp': '#fff0d647',
  'water-shadow': '#174c5966',
  'water-primary': '#8ef1e6d9',
});

export type AuthoredMapEffect = Readonly<{
  id: string;
  kind: VfxKind;
  tile: TilePoint;
}>;

export type PreparedVfxEmitter = Readonly<{
  id: string;
  kind: VfxKind;
  mapId: string;
  tile: TilePoint;
  recipeId: VfxRecipeId;
  seed: number;
  phaseOffset: number;
  lateralSign: -1 | 1;
}>;

export type VfxEmitterPartition = Readonly<{
  valid: readonly PreparedVfxEmitter[];
  fallback: readonly AuthoredMapEffect[];
}>;

export type VfxRect = Readonly<{
  role: VfxPrimitiveRole;
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type VfxBounds = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

export type VfxGeometry = Readonly<{
  emitterId: string;
  kind: VfxKind;
  recipeId: VfxRecipeId;
  ageStep: number;
  bounds: VfxBounds;
  rects: readonly VfxRect[];
}>;

export type AmbientVfxClock = Readonly<{
  ageMilliseconds: number;
  frameActive: boolean;
  lastSubmittedDeltaMilliseconds: number;
}>;

export type AmbientVfxClockInput = Readonly<{
  running: boolean;
  resumedFromSuspension?: boolean;
}>;

export type VfxWorldRect = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

/**
 * Stage 7: the VFX evidence node count outlived its Skia component.
 * It describes the evidence schema, not a drawing library, so it stays renderer-neutral here.
 */
export const PROCEDURAL_VFX_RENDER_NODE_COUNT = 19 as const;

/**
 * Transient (one-shot) VFX geometry.
 *
 * These live HERE rather than beside their recipes in `transient.ts` because `world-frame.ts` is on
 * `RENDERER_NEUTRAL_FILES`, and that allowlist is closed under import: a listed file may only import
 * `src/domain`, `src/world`, or another listed file. This file is listed; `transient.ts` is not, and
 * need not be, because the frame carries only the sampled result.
 *
 * A transient rect carries a RESOLVED colour rather than a `VfxPrimitiveRole`. Two reasons: roles are
 * counted by `PROCEDURAL_VFX_RENDER_NODE_COUNT`, and a one-shot's colour is resolved per frame from
 * the live sun so a muzzle flash at midnight reads differently from one at noon.
 */
export type TransientVfxLayer = 'ground' | 'aerial';

export type TransientVfxRect = Readonly<{
  /** 'ground' draws below feet, 'aerial' above them. See COMPOSITE_BATCHES. */
  layer: TransientVfxLayer;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 8-digit #rrggbbaa. */
  color: string;
}>;

/** An additive stepped-plateau light, drawn through the same glow texture the lamps use. */
export type TransientVfxGlow = Readonly<{
  worldX: number;
  worldY: number;
  radius: number;
  /** 6-digit #rrggbb. */
  color: string;
  opacity: number;
}>;
