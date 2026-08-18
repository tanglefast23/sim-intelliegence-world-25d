import {
  VFX_STEP_MILLISECONDS,
  type AuthoredMapEffect,
  type PreparedVfxEmitter,
  type VfxBounds,
  type VfxGeometry,
  type VfxRect,
  type VfxWorldRect,
} from './types';

const TILE_SIZE = 32;

function anchor(effect: Readonly<{ tile: AuthoredMapEffect['tile'] }>) {
  return {
    x: effect.tile.x * TILE_SIZE + TILE_SIZE / 2,
    y: effect.tile.y * TILE_SIZE + TILE_SIZE / 2,
  };
}

export function declaredVfxBounds(effect: Readonly<Pick<AuthoredMapEffect, 'kind' | 'tile'>>): VfxBounds {
  const center = anchor(effect);
  const extent = {
    fire: { left: 5, top: 10, right: 5, bottom: 3 },
    sparkle: { left: 5, top: 10, right: 5, bottom: 3 },
    insects: { left: 10, top: 8, right: 10, bottom: 8 },
    leaves: { left: 13, top: 9, right: 13, bottom: 8 },
    neon: { left: 10, top: 5, right: 10, bottom: 5 },
    palm: { left: 12, top: 9, right: 12, bottom: 7 },
    steam: { left: 7, top: 18, right: 7, bottom: 2 },
    water: { left: 15, top: 6, right: 15, bottom: 4 },
  }[effect.kind];
  return Object.freeze({
    left: center.x - extent.left,
    top: center.y - extent.top,
    right: center.x + extent.right,
    bottom: center.y + extent.bottom,
  });
}

export function vfxBoundsIntersectWorldRect(
  effect: Readonly<Pick<AuthoredMapEffect, 'kind' | 'tile'>>,
  worldRect: VfxWorldRect,
): boolean {
  const bounds = declaredVfxBounds(effect);
  return bounds.right >= worldRect.left && bounds.left <= worldRect.right &&
    bounds.bottom >= worldRect.top && bounds.top <= worldRect.bottom;
}

function rect(
  role: VfxRect['role'],
  x: number,
  y: number,
  width: number,
  height: number,
): VfxRect {
  return Object.freeze({ role, x, y, width, height });
}

function fireGeometry(
  emitter: PreparedVfxEmitter,
  step: number,
  reducedMotion: boolean,
): readonly VfxRect[] {
  const center = anchor(emitter);
  const phase = reducedMotion ? emitter.phaseOffset : (step + emitter.phaseOffset) % 4;
  const outerByPhase = [
    rect('fire-outer', center.x - 2, center.y - 7, 4, 5),
    rect('fire-outer', center.x - 1, center.y - 8, 3, 6),
    rect('fire-outer', center.x - 3, center.y - 6, 5, 4),
    rect('fire-outer', center.x - 2, center.y - 8, 4, 6),
  ] as const;
  const output = [
    rect('fire-halo', center.x - 4, center.y - 9, 9, 10),
    outerByPhase[phase] as VfxRect,
    rect('fire-core', center.x - 1, center.y - 4, 3, 4),
  ];
  if (!reducedMotion) {
    output.push(rect(
      'fire-ember',
      center.x + emitter.lateralSign * (2 + (phase % 2)),
      center.y - 8 - (phase % 3),
      1,
      1,
    ));
  }
  return Object.freeze(output);
}

function sparkleGeometry(
  emitter: PreparedVfxEmitter,
  step: number,
  reducedMotion: boolean,
): readonly VfxRect[] {
  const center = anchor(emitter);
  const phase = reducedMotion ? emitter.phaseOffset : (step + emitter.phaseOffset) % 4;
  const arm = reducedMotion ? 2 : 2 + (phase % 2);
  const output = [
    rect('sparkle-shadow', center.x - 1, center.y - arm - 1, 3, arm * 2 + 3),
    rect('sparkle-shadow', center.x - arm - 1, center.y - 1, arm * 2 + 3, 3),
    rect('sparkle-primary', center.x, center.y - arm, 1, arm * 2 + 1),
    rect('sparkle-primary', center.x - arm, center.y, arm * 2 + 1, 1),
  ];
  if (!reducedMotion) {
    output.push(rect(
      'sparkle-satellite',
      center.x + emitter.lateralSign * (3 + (phase % 2)),
      center.y - 3 + phase,
      1,
      1,
    ));
  }
  return Object.freeze(output);
}

function environmentalGeometry(
  emitter: PreparedVfxEmitter,
  step: number,
  reducedMotion: boolean,
): readonly VfxRect[] {
  const center = anchor(emitter);
  const phase = reducedMotion ? emitter.phaseOffset : (step + emitter.phaseOffset) % 4;
  const drift = reducedMotion ? 0 : emitter.lateralSign * phase;
  if (emitter.kind === 'insects') {
    return Object.freeze([
      rect('insects-halo', center.x - 9 + drift, center.y - 7 + phase, 3, 3),
      rect('insects-halo', center.x + 5 - drift, center.y + 3 - phase, 3, 3),
      rect('insects-primary', center.x - 8 + drift, center.y - 6 + phase, 1, 1),
      rect('insects-primary', center.x + 6 - drift, center.y + 4 - phase, 1, 1),
    ]);
  }
  if (emitter.kind === 'leaves') {
    return Object.freeze([
      rect('leaves-shadow', center.x - 11 + drift, center.y + 4, 5, 2),
      rect('leaves-primary', center.x - 10 + drift, center.y - 5 + phase, 4, 2),
      rect('leaves-primary', center.x - 1 - drift, center.y - 1, 3, 2),
      rect('leaves-primary', center.x + 7 + drift, center.y - 7 + phase, 4, 2),
    ]);
  }
  if (emitter.kind === 'neon') {
    const pulse = reducedMotion || phase === 3 ? 0 : 1;
    return Object.freeze([
      rect('neon-halo', center.x - 10, center.y - 5, 20, 10),
      rect('neon-primary', center.x - 8 + pulse, center.y - 1, 16 - pulse * 2, 2),
    ]);
  }
  if (emitter.kind === 'palm') {
    const sway = reducedMotion ? 0 : emitter.lateralSign * (phase % 2);
    return Object.freeze([
      rect('palm-shadow', center.x - 10 + sway, center.y + 3, 20, 3),
      rect('palm-primary', center.x - 11 + sway, center.y - 2, 9, 3),
      rect('palm-primary', center.x + 2 + sway, center.y - 5, 9, 3),
    ]);
  }
  if (emitter.kind === 'steam') {
    const rise = reducedMotion ? 0 : phase * 2;
    // Past the halfway point of the four-step cycle the plume draws through the faded roles, so it
    // reads as rising and dissipating rather than as a column that snaps back to the spout. The
    // rect COUNT is constant across phases on purpose: `evidence.ts` reports primitives per kind,
    // and a count that moved with the animation step would make that number unreadable.
    const fading = !reducedMotion && phase >= 2;
    const wisp = fading ? 'steam-wisp' : 'steam-primary';
    const backer = fading ? 'steam-wisp-shadow' : 'steam-shadow';
    return Object.freeze([
      rect(backer, center.x - 5, center.y - 7 - rise, 3, 7),
      rect(backer, center.x + 2, center.y - 11 + rise / 2, 3, 8),
      rect(wisp, center.x - 4 + drift, center.y - 9 - rise, 2, 6),
      rect(wisp, center.x + 3 - drift, center.y - 14 + rise / 2, 2, 7),
    ]);
  }
  if (emitter.kind === 'water') {
    const waterDrift = reducedMotion ? 0 : phase - 2;
    return Object.freeze([
      rect('water-shadow', center.x - 11 + waterDrift, center.y, 22, 4),
      rect('water-shadow', center.x - 7 - waterDrift, center.y - 6, 14, 3),
      rect('water-primary', center.x - 9 + waterDrift, center.y + 1, 7, 2),
      rect('water-primary', center.x + 2 + waterDrift, center.y + 1, 7, 2),
      rect('water-primary', center.x - 5 - waterDrift, center.y - 5, 10, 1),
    ]);
  }
  throw new Error(`Unsupported environmental VFX kind: ${emitter.kind}.`);
}

export function sampleVfxGeometry(
  emitter: PreparedVfxEmitter,
  ageMilliseconds: number,
  reducedMotion: boolean,
): VfxGeometry {
  if (!Number.isFinite(ageMilliseconds) || ageMilliseconds < 0) {
    throw new Error('VFX age must be a finite non-negative number.');
  }
  const ageStep = Math.floor(ageMilliseconds / VFX_STEP_MILLISECONDS);
  const rects = emitter.kind === 'fire'
    ? fireGeometry(emitter, ageStep, reducedMotion)
    : emitter.kind === 'sparkle'
      ? sparkleGeometry(emitter, ageStep, reducedMotion)
      : environmentalGeometry(emitter, ageStep, reducedMotion);
  return Object.freeze({
    emitterId: emitter.id,
    kind: emitter.kind,
    recipeId: emitter.recipeId,
    ageStep,
    bounds: declaredVfxBounds(emitter),
    rects,
  });
}

export function primarySilhouette(geometry: VfxGeometry): string {
  return geometry.rects
    .filter(({ role }) => role === 'fire-outer' || role === 'fire-core' || role.endsWith('-primary'))
    .map(({ x, y, width, height }) => `${x},${y},${width},${height}`)
    .join('|');
}
