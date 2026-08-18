import { CAMERA_YAW_DEGREES } from './three25/projection';

export type RendererKind = 'threejs-2d' | 'threejs-2-5d';

const RENDERER_QUERY: Readonly<Record<string, RendererKind>> = {
  '2d': 'threejs-2d',
  '2-5d': 'threejs-2-5d',
};

/**
 * Mirrors `toneMappingForEnvironment` below: the override is unsaved, local-or-smoke only, and
 * production always gets the shipping renderer. The shipping renderer is 2.5D; the 2D path stays
 * reachable as the rollback path through the localhost `?testRenderer=2d` override and through
 * `SI_WORLD_TEST_RENDERER` in smoke mode.
 *
 * **Smoke mode keeps the explicit 2D default on purpose.** `effectiveRenderer` in
 * electron/main/index.ts is `SI_WORLD_TEST_RENDERER ?? 'threejs-2d'`, and it names every screenshot
 * and evidence file a smoke writes. Defaulting smoke runs to 2.5D here without changing that line
 * would render 2.5D while labelling the output threejs-2d, which is the exact drift the comment
 * there warns about. Change both together or neither.
 */
export function rendererForEnvironment(input: Readonly<{
  hostname: string;
  search: string;
  smokeMode: boolean;
  /** The dev harness loads over `app://game/`, so the localhost query override never fires there. */
  devHarnessMode?: boolean;
  smokeRenderer?: RendererKind;
}>): RendererKind {
  if (input.smokeMode) return input.smokeRenderer ?? 'threejs-2d';
  // The dev harness exists to review the renderer under construction, so it defaults to 2.5D.
  // `SI_WORLD_TEST_RENDERER=threejs-2d` is the way back to the 2D rollback path.
  if (input.devHarnessMode === true) return input.smokeRenderer ?? 'threejs-2-5d';
  const local = input.hostname === 'localhost' || input.hostname === '127.0.0.1';
  if (!local) return 'threejs-2-5d';
  const requested = new URLSearchParams(input.search).get('testRenderer');
  return (requested !== null ? RENDERER_QUERY[requested] : undefined) ?? 'threejs-2-5d';
}

export function selectedRenderer(): RendererKind {
  if (typeof window === 'undefined' || !window.location) return 'threejs-2d';
  return rendererForEnvironment({
    hostname: window.location.hostname,
    search: window.location.search,
    smokeMode: window.siWorldSmokeMode === true,
    devHarnessMode: window.siWorldDevHarnessMode === true,
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
