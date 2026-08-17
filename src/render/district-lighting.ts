import type { MapId } from '../world/maps/catalog';
import { mixHex, worldSun, type WorldSun } from './atmosphere';

export type DistrictLightPool = Readonly<{ radius: number; x: number; y: number }>;

export type DistrictLighting = Readonly<{
  accent: string;
  casters: readonly Readonly<{ x: number; y: number }>[];
  name: string;
  /**
   * Additive glow drawn at each lamp sprite. Kept well above poolOpacity because additive light
   * on a lit floor needs real strength to read, and a lamp that is on should look on in daylight.
   */
  lampGlowOpacity: number;
  poolOpacity: number;
  pools: readonly DistrictLightPool[];
  shadow: Readonly<{ color: string; x: number; y: number }>;
  shelterShade: string;
  /** The global sun this district's lighting was composed against. See `worldSun`. */
  sun: WorldSun;
}>;

type DistrictPreset = Pick<DistrictLighting, 'accent' | 'casters' | 'name' | 'pools' | 'shelterShade'> & Readonly<{
  intensity: number;
  shadowColor?: string;
}>;

const DISTRICTS: Readonly<Record<MapId, DistrictPreset>> = {
  northwest_residential: {
    accent: '#ffc45c',
    casters: [{ x: 17, y: 24 }, { x: 27, y: 32 }, { x: 53, y: 39 }],
    intensity: 1,
    name: 'SUNWARD AMBER',
    shelterShade: '#18274433',
    pools: [
      { x: 27, y: 32, radius: 52 },
      { x: 41, y: 27, radius: 46 },
      { x: 51, y: 39, radius: 48 },
    ],
  },
  northeast_downtown: {
    accent: '#ff5f9f',
    casters: [{ x: 16, y: 20 }, { x: 41, y: 20 }, { x: 43, y: 41 }],
    intensity: 1,
    name: 'NEON ROSE',
    shadowColor: '#29265358',
    shelterShade: '#2023443d',
    pools: [
      { x: 19, y: 20, radius: 50 },
      { x: 50, y: 20, radius: 46 },
      { x: 48, y: 41, radius: 48 },
    ],
  },
  southwest_commercial: {
    accent: '#ffd06a',
    casters: [{ x: 12, y: 32 }, { x: 20, y: 32 }, { x: 49, y: 43 }],
    intensity: 0.95,
    name: 'SAFFRON LANTERN',
    shadowColor: '#26386466',
    shelterShade: '#1830504d',
    pools: [
      { x: 12, y: 37, radius: 44 },
      { x: 21, y: 35, radius: 48 },
      { x: 49, y: 43, radius: 46 },
    ],
  },
  southeast_docks: {
    accent: '#67d3ce',
    casters: [{ x: 17, y: 20 }, { x: 44, y: 20 }, { x: 49, y: 34 }],
    intensity: 1,
    name: 'HARBOR TEAL',
    shadowColor: '#21324958',
    shelterShade: '#13343f42',
    pools: [
      { x: 17, y: 20, radius: 48 },
      { x: 44, y: 20, radius: 46 },
      { x: 49, y: 34, radius: 50 },
    ],
  },
  west_office: {
    // Cool fluorescent rather than a district hue: the office is lit by its own ceiling, and a
    // warm accent here would read as evening light leaking through a windowless interior.
    accent: '#c8d4e0',
    // Three interior anchors, not the lot: the scene is the building. Step 7's ceiling rig places
    // the real fixture column; these are the pools the district owns whatever the rig does.
    casters: [{ x: 18, y: 14 }, { x: 36, y: 14 }, { x: 25, y: 33 }],
    intensity: 1,
    name: 'LEDGER FLUOR',
    shadowColor: '#2a314058',
    shelterShade: '#1c243033',
    pools: [
      { x: 18, y: 14, radius: 44 },
      { x: 36, y: 14, radius: 44 },
      { x: 25, y: 33, radius: 40 },
    ],
  },
};

/**
 * THE SUN OWNS VALUE. THE DISTRICT OWNS HUE.
 *
 * That is the whole composition rule, and it is the one every later renderer feature should
 * follow. The sun decides how long a shadow is, how dark it is, and how much of the picture the
 * lamps own. The district decides what colour the place is: its accent, its pools, its shelter
 * shade, and a bias on the shadow's hue so a harbour dusk is not a downtown dusk.
 *
 * Three deliberate changes from the four-bucket version, stated rather than smuggled:
 *
 * 1. Every period now carries a little district hue. Before, only DUSK read `shadowColor` and the
 *    other three were district-identical. That asymmetry was a consequence of the bucket table,
 *    not a decision.
 * 2. Midday pools fade to nothing instead of holding at 0.04. A light pool at noon is noise.
 * 3. The lamp and pool strengths are now one curve with two gains rather than four literals. The
 *    gains are chosen so the four bucket centres land within 0.05 of the values they replaced.
 */
const DISTRICT_SHADOW_BIAS = 0.34;
const LAMP_BASE = 0.34;
const LAMP_GAIN = 0.36;
const POOL_GAIN = 0.28;

export function districtLighting(mapId: MapId, absoluteMinute: number): DistrictLighting {
  const { intensity, shadowColor = '#25285852', ...district } = DISTRICTS[mapId];
  const sun = worldSun(absoluteMinute);
  return {
    ...district,
    lampGlowOpacity: (LAMP_BASE + sun.lampMix * LAMP_GAIN) * intensity,
    poolOpacity: sun.lampMix * POOL_GAIN * intensity,
    shadow: {
      color: mixHex(sun.shadowColor, shadowColor, DISTRICT_SHADOW_BIAS),
      x: sun.shadowX,
      y: sun.shadowY,
    },
    sun,
  };
}
