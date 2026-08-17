import { CAMERA_YAW_DEGREES } from './three25/projection';

export type RendererKind = 'threejs-2d' | 'threejs-2-5d';

const RENDERER_QUERY: Readonly<Record<string, RendererKind>> = {
  '2d': 'threejs-2d',
  '2-5d': 'threejs-2-5d',
};

/**
 * Mirrors `toneMappingForEnvironment` below: the override is unsaved, local-or-smoke only, and
 * production always gets the shipping renderer. The 2D path stays the rollback path until the
 * 2.5D acceptance gate in docs/specs/2026-08-16-threejs-2-5d-renderer.md section 16 passes.
 */
export function rendererForEnvironment(input: Readonly<{
  hostname: string;
  search: string;
  smokeMode: boolean;
  smokeRenderer?: RendererKind;
}>): RendererKind {
  if (input.smokeMode && input.smokeRenderer) return input.smokeRenderer;
  const local = input.hostname === 'localhost' || input.hostname === '127.0.0.1';
  if (!local) return 'threejs-2d';
  const requested = new URLSearchParams(input.search).get('testRenderer');
  return (requested !== null ? RENDERER_QUERY[requested] : undefined) ?? 'threejs-2d';
}

export function selectedRenderer(): RendererKind {
  if (typeof window === 'undefined' || !window.location) return 'threejs-2d';
  return rendererForEnvironment({
    hostname: window.location.hostname,
    search: window.location.search,
    smokeMode: window.siWorldSmokeMode === true,
    smokeRenderer: window.siWorldTestRenderer,
  });
}

/**
 * Stage 4 enables ACES in production. The override is unsaved and test-only, so no-tone parity
 * and production ACES contrast can both be rerun from the same package.
 */
export type ToneMappingKind = 'none' | 'aces';

export function toneMappingForEnvironment(input: Readonly<{
  hostname: string;
  search: string;
  smokeMode: boolean;
  smokeToneMapping?: ToneMappingKind;
}>): ToneMappingKind {
  if (input.smokeMode && input.smokeToneMapping) return input.smokeToneMapping;
  const local = input.hostname === 'localhost' || input.hostname === '127.0.0.1';
  const requested = new URLSearchParams(input.search).get('testToneMapping');
  return local && (requested === 'none' || requested === 'aces') ? requested : 'aces';
}

/**
 * Camera yaw for the 2.5D renderer, in degrees.
 *
 * Production ships `CAMERA_YAW_DEGREES`. The localhost-only `?testYaw=` override exists so a
 * capture can render a different angle from the same scene without a new Electron flag; it is
 * clamped to 0-60, beyond which the ground projection no longer describes what is drawn.
 *
 * **Defaulting this to 0 is a real bug, not a safe fallback.** The renderer, the projection, the
 * clamp and the near-wall rule all derive from `CAMERA_YAW_DEGREES`; returning 0 here would render
 * the one angle the whole design was moved away from, and only a query parameter would fix it.
 */
export function yawForEnvironment(input: Readonly<{ hostname: string; search: string }>): number {
  const local = input.hostname === 'localhost' || input.hostname === '127.0.0.1';
  if (!local) return CAMERA_YAW_DEGREES;
  const requested = Number.parseFloat(new URLSearchParams(input.search).get('testYaw') ?? '');
  if (!Number.isFinite(requested)) return CAMERA_YAW_DEGREES;
  return Math.min(60, Math.max(0, requested));
}

export function selectedYawDegrees(): number {
  if (typeof window === 'undefined' || !window.location) return CAMERA_YAW_DEGREES;
  return yawForEnvironment({ hostname: window.location.hostname, search: window.location.search });
}

export function selectedToneMapping(): ToneMappingKind {
  if (typeof window === 'undefined' || !window.location) return 'aces';
  return toneMappingForEnvironment({
    hostname: window.location.hostname,
    search: window.location.search,
    smokeMode: window.siWorldSmokeMode === true,
    smokeToneMapping: window.siWorldTestToneMapping,
  });
}
