import type { Point } from './sketch';

export type Rgb = readonly [number, number, number];

export const VAMPIRE_COLORS = {
  pale: [232, 230, 226],
  ash: [160, 156, 162],
  hollow: [72, 66, 78],
  hair: [22, 20, 26],
  hairEdge: [46, 42, 52],
  cloak: [24, 22, 30],
  cloakLift: [50, 44, 56],
  lining: [132, 22, 32],
  fang: [254, 252, 248],
  red: [182, 16, 22],
  white: [248, 244, 240],
} as const satisfies Record<string, Rgb>;

/**
 * Shared skeleton every vampire part measures against.
 * Character pixels, y down, origin at the canvas left/top.
 * Parts must not invent anchors.
 */
export type VampireLayout = Readonly<{
  cx: number;
  s: number;
  w: number;
  L: {
    skullY: number;
    hairY: number;
    earY: number;
    eyeX: (side: -1 | 1) => number;
    eyeY: number;
    noseY: number;
    my: number;
  };
  B: {
    shoulderY: number;
    hipX: number;
    hipY: number;
    floorY: number;
    bootY: number;
  };
  lwMain: number;
  lwThin: number;
  colors: typeof VAMPIRE_COLORS;
}>;

export function buildVampireLayout(): VampireLayout {
  const cx = 120;
  const s = 42;
  const w = 30;
  return {
    cx,
    s,
    w,
    L: {
      skullY: 82,
      hairY: 28,
      earY: 66,
      eyeX: (side) => side * 12,
      eyeY: 85,
      noseY: 86,
      my: 104,
    },
    B: {
      shoulderY: 140,
      hipX: 8,
      hipY: 198,
      floorY: 286,
      bootY: 284,
    },
    lwMain: s * 0.05,
    lwThin: s * 0.021,
    colors: VAMPIRE_COLORS,
  };
}

export function pt(x: number, y: number): Point {
  return { x, y };
}
