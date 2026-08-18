import type { MapId } from '../../world/maps/catalog';

export type AllMapParityVfxMode = 'procedural' | 'circle';

export type AllMapParityCase = Readonly<{
  devicePixelRatio: 1 | 1.25 | 1.5 | 2;
  effectId: string;
  id: string;
  mapId: MapId;
  viewport: Readonly<{ height: number; width: number }>;
  /** Stage 3 amendment 2026-08-15: 'circle' exercises the Three.js fallback-circle batch. */
  vfxMode: AllMapParityVfxMode;
  zoom: 1 | 2 | 3;
}>;

export const ALL_MAP_PARITY_CASES: readonly AllMapParityCase[] = Object.freeze([
  { id: 'northwest-1280x720-dpr1-zoom1', mapId: 'northwest_residential', effectId: 'patio-fire', viewport: { width: 1280, height: 720 }, devicePixelRatio: 1, zoom: 1, vfxMode: 'procedural' },
  { id: 'northeast-1440x900-dpr1-zoom2', mapId: 'northeast_downtown', effectId: 'club-neon-east', viewport: { width: 1440, height: 900 }, devicePixelRatio: 1, zoom: 2, vfxMode: 'procedural' },
  { id: 'southwest-1600x720-dpr1-zoom3', mapId: 'southwest_commercial', effectId: 'courtyard-insects', viewport: { width: 1600, height: 720 }, devicePixelRatio: 1, zoom: 3, vfxMode: 'procedural' },
  { id: 'southeast-1920x1080-dpr1-zoom1', mapId: 'southeast_docks', effectId: 'yard-steam', viewport: { width: 1920, height: 1080 }, devicePixelRatio: 1, zoom: 1, vfxMode: 'procedural' },
  { id: 'northwest-2560x1440-dpr1-zoom1', mapId: 'northwest_residential', effectId: 'patio-fire', viewport: { width: 2560, height: 1440 }, devicePixelRatio: 1, zoom: 1, vfxMode: 'procedural' },
  { id: 'northwest-1440x900-dpr1_25-zoom1', mapId: 'northwest_residential', effectId: 'patio-fire', viewport: { width: 1440, height: 900 }, devicePixelRatio: 1.25, zoom: 1, vfxMode: 'procedural' },
  { id: 'northeast-1600x720-dpr1_25-zoom2', mapId: 'northeast_downtown', effectId: 'club-neon-east', viewport: { width: 1600, height: 720 }, devicePixelRatio: 1.25, zoom: 2, vfxMode: 'procedural' },
  { id: 'southwest-1920x1080-dpr1_25-zoom3', mapId: 'southwest_commercial', effectId: 'courtyard-insects', viewport: { width: 1920, height: 1080 }, devicePixelRatio: 1.25, zoom: 3, vfxMode: 'procedural' },
  { id: 'southeast-2560x1440-dpr1_25-zoom1', mapId: 'southeast_docks', effectId: 'yard-steam', viewport: { width: 2560, height: 1440 }, devicePixelRatio: 1.25, zoom: 1, vfxMode: 'procedural' },
  { id: 'northwest-1600x720-dpr1_5-zoom2', mapId: 'northwest_residential', effectId: 'patio-fire', viewport: { width: 1600, height: 720 }, devicePixelRatio: 1.5, zoom: 2, vfxMode: 'procedural' },
  { id: 'northeast-1920x1080-dpr1_5-zoom3', mapId: 'northeast_downtown', effectId: 'club-neon-east', viewport: { width: 1920, height: 1080 }, devicePixelRatio: 1.5, zoom: 3, vfxMode: 'procedural' },
  { id: 'southwest-2560x1440-dpr1_5-zoom1', mapId: 'southwest_commercial', effectId: 'courtyard-insects', viewport: { width: 2560, height: 1440 }, devicePixelRatio: 1.5, zoom: 1, vfxMode: 'procedural' },
  { id: 'southeast-1280x720-dpr1_5-zoom2', mapId: 'southeast_docks', effectId: 'yard-steam', viewport: { width: 1280, height: 720 }, devicePixelRatio: 1.5, zoom: 2, vfxMode: 'procedural' },
  { id: 'northwest-1920x1080-dpr2-zoom3', mapId: 'northwest_residential', effectId: 'patio-fire', viewport: { width: 1920, height: 1080 }, devicePixelRatio: 2, zoom: 3, vfxMode: 'procedural' },
  { id: 'northeast-2560x1440-dpr2-zoom1', mapId: 'northeast_downtown', effectId: 'club-neon-east', viewport: { width: 2560, height: 1440 }, devicePixelRatio: 2, zoom: 1, vfxMode: 'procedural' },
  { id: 'southwest-1280x720-dpr2-zoom2', mapId: 'southwest_commercial', effectId: 'courtyard-insects', viewport: { width: 1280, height: 720 }, devicePixelRatio: 2, zoom: 2, vfxMode: 'procedural' },
  { id: 'southeast-1440x900-dpr2-zoom3', mapId: 'southeast_docks', effectId: 'yard-steam', viewport: { width: 1440, height: 900 }, devicePixelRatio: 2, zoom: 3, vfxMode: 'procedural' },
  { id: 'west-office-1280x720-dpr1-zoom1', mapId: 'west_office', effectId: 'office-kettle-steam', viewport: { width: 1280, height: 720 }, devicePixelRatio: 1, zoom: 1, vfxMode: 'procedural' },
  { id: 'maximum-load-2560x1440-dpr2-zoom1', mapId: 'northwest_residential', effectId: 'patio-fire', viewport: { width: 2560, height: 1440 }, devicePixelRatio: 2, zoom: 1, vfxMode: 'procedural' },
  // Stage 3 amendment 2026-08-15: the only case that renders effects through the fallback-circle batch.
  { id: 'fallback-circle-1280x720-dpr1-zoom1', mapId: 'northwest_residential', effectId: 'patio-fire', viewport: { width: 1280, height: 720 }, devicePixelRatio: 1, zoom: 1, vfxMode: 'circle' },
]);

/**
 * The DPR and VFX-mode combinations the packaged all-map smoke must launch.
 * The runner starts one packaged window per combination, so it never launches
 * a mode that no locked case needs.
 */
export const ALL_MAP_PARITY_COMBINATIONS: readonly Readonly<{
  devicePixelRatio: 1 | 1.25 | 1.5 | 2;
  vfxMode: AllMapParityVfxMode;
}>[] = Object.freeze(
  [...new Set(ALL_MAP_PARITY_CASES.map(({ devicePixelRatio, vfxMode }) => `${devicePixelRatio}|${vfxMode}`))]
    .map((key) => {
      const [dpr, mode] = key.split('|');
      return Object.freeze({
        devicePixelRatio: Number(dpr) as 1 | 1.25 | 1.5 | 2,
        vfxMode: mode as AllMapParityVfxMode,
      });
    }),
);
