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
 * The head's share of the drawn figure, crown to sole.
 *
 * This is the one number that sets the character's proportions. Kindergrimm's rule is that the
 * head is the largest mass — that is what reads as cute rather than as a small person. See
 * `docs/art/character-sprite-design.md`. The pencil vampire was authored at 0.36, so his cloak was
 * the biggest thing on screen and he read as a thin man in a coat.
 *
 * Change this alone to restyle him. Everything below derives from it.
 */
export const HEAD_SHARE = 0.56;

/** How much narrower the body is than it was authored. The head has to out-mass the cloak. */
const BODY_WIDTH_SCALE = 0.8;

/**
 * Canvas rows the figure must occupy.
 *
 * `FLOOR` and the boot line are FIXED. `0dcf18b` on main tuned the boots onto the character's
 * contact point, so moving them makes the vampire float above or sink through his own shadow.
 * Proportion changes move the crown and the shoulders, never the sole.
 */
const FIGURE_TOP = 16;
const BOOT_BOTTOM = 302;
const FLOOR = 286;

/**
 * The coordinates the parts are authored in.
 *
 * Parts keep writing the numbers they always wrote. `head()` and `body()` map that authored space
 * onto the canvas, so the proportion lives here instead of being scattered through seven files.
 */
const HEAD_DESIGN_TOP = 28;
const HEAD_DESIGN_CHIN = 128;
const BODY_DESIGN_SHOULDER = 140;
const BODY_DESIGN_FLOOR = 286;
/** Authored line weights. Deliberately not scaled: a bigger head still holds the same pencil. */
const PEN_UNIT = 42;

const HEAD_SCALE = HEAD_SHARE * (BOOT_BOTTOM - FIGURE_TOP) / (HEAD_DESIGN_CHIN - HEAD_DESIGN_TOP);
const CHIN_Y = FIGURE_TOP + HEAD_SHARE * (BOOT_BOTTOM - FIGURE_TOP);
/** The neck. The shoulders start just under the chin, whatever the head share is. */
const SHOULDER_Y = CHIN_Y + 10;
const BODY_SCALE_Y = (FLOOR - SHOULDER_Y) / (BODY_DESIGN_FLOOR - BODY_DESIGN_SHOULDER);

/**
 * Shared skeleton every vampire part measures against.
 * Character pixels, y down, origin at the canvas left/top.
 * Parts must not invent anchors.
 */
export type VampireLayout = Readonly<{
  cx: number;
  s: number;
  w: number;
  /** Head scale. Multiply an authored radius or offset by this to keep it on the face. */
  hs: number;
  /** Authored head space to canvas. `dx` is an offset from `cx`, `dy` an authored row. */
  head: (dx: number, dy: number) => Point;
  /** Authored body space to canvas. Same shape as `head`. */
  body: (dx: number, dy: number) => Point;
  L: {
    skullY: number;
    hairY: number;
    earY: number;
    eyeX: (side: -1 | 1) => number;
    eyeY: number;
    noseY: number;
    my: number;
    chinY: number;
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
  const head = (dx: number, dy: number): Point => ({
    x: cx + dx * HEAD_SCALE,
    y: FIGURE_TOP + (dy - HEAD_DESIGN_TOP) * HEAD_SCALE,
  });
  const body = (dx: number, dy: number): Point => ({
    x: cx + dx * BODY_WIDTH_SCALE,
    y: SHOULDER_Y + (dy - BODY_DESIGN_SHOULDER) * BODY_SCALE_Y,
  });
  return {
    cx,
    s: PEN_UNIT * HEAD_SCALE,
    w: 30 * HEAD_SCALE,
    hs: HEAD_SCALE,
    head,
    body,
    L: {
      skullY: head(0, 82).y,
      hairY: head(0, 28).y,
      earY: head(0, 66).y,
      eyeX: (side) => side * 12 * HEAD_SCALE,
      eyeY: head(0, 85).y,
      noseY: head(0, 86).y,
      my: head(0, 104).y,
      chinY: CHIN_Y,
    },
    B: {
      shoulderY: SHOULDER_Y,
      hipX: 8 * BODY_WIDTH_SCALE,
      hipY: body(0, 198).y,
      floorY: FLOOR,
      bootY: body(0, 284).y,
    },
    lwMain: PEN_UNIT * 0.05,
    lwThin: PEN_UNIT * 0.021,
    colors: VAMPIRE_COLORS,
  };
}

export function pt(x: number, y: number): Point {
  return { x, y };
}
