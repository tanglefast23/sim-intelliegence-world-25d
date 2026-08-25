import { GRAPHITE, type Rgb } from './media';
import { hashSeed, Sketch, type Point } from './sketch';

export type AlarmClockView = 'front' | 'side';
export type AlarmClockAnchorId = 'snooze' | 'hour' | 'minute' | 'alarm' | 'power';

type InteractionAnchors = Readonly<Partial<Record<AlarmClockAnchorId, Point>>>;

const WIDTH = 96;
const HEIGHT = 66;

export const ALARM_CLOCK_RECIPE = {
  version: 1,
  status: 'review',
  assetId: 'modern-digital-alarm-clock-01',
  brief: 'Modern soft-touch digital alarm clock with a dominant amber 7:00 display.',
  seed: 730,
  upstreamCommit: 'de339ad739d8cbd28ff2dd4a940af38c0ede86c8',
  medium: 'graphite',
  canvas: { width: WIDTH, height: HEIGHT },
  world: {
    tileSize: 32,
    frame: { width: 32, height: 22 },
    footprint: { width: 28, depth: 12 },
    collision: { x: -14, y: -6, width: 28, height: 12 },
    depth: { mode: 'low' },
  },
  material: 'charcoal soft-touch plastic, smoked glass, rubber feet',
  time: '7:00',
  display: {
    digits: [
      { digit: '7', x: 26, y: 26 },
      { digit: '0', x: 46, y: 26 },
      { digit: '0', x: 60, y: 26 },
    ],
    colon: { x: 41, dotYs: [32, 39] },
  },
  orderedParts: ['contact-shadow', 'feet', 'case', 'screen', 'time', 'buttons'],
  colors: {
    case: [54, 52, 59] as Rgb,
    caseLight: [92, 88, 94] as Rgb,
    screen: [27, 25, 31] as Rgb,
    led: [246, 166, 60] as Rgb,
    rubber: [28, 26, 30] as Rgb,
    shadow: [62, 48, 44] as Rgb,
  },
  views: {
    front: {
      transparentBounds: { x: 2, y: 8, width: 92, height: 54 },
      groundContact: { x: 48, y: 57 },
      anchors: {
        snooze: { x: 48, y: 14 },
        hour: { x: 17, y: 16 },
        minute: { x: 25, y: 15 },
        alarm: { x: 74, y: 15 },
        power: { x: 83, y: 16 },
      } satisfies InteractionAnchors,
    },
    side: {
      transparentBounds: { x: 12, y: 9, width: 71, height: 53 },
      groundContact: { x: 48, y: 57 },
      anchors: {
        snooze: { x: 50, y: 15 },
        hour: { x: 29, y: 18 },
        power: { x: 75, y: 35 },
      } satisfies InteractionAnchors,
    },
  },
} as const;

export const ALARM_CLOCK_WIDTH = WIDTH;
export const ALARM_CLOCK_HEIGHT = HEIGHT;

function closed(points: readonly Point[]): readonly Point[] {
  return [...points, points[0]!];
}

function rounded(sketch: Sketch, points: readonly Point[]): readonly Point[] {
  return sketch.smooth(points);
}

function mass(
  sketch: Sketch,
  points: readonly Point[],
  color: Rgb,
  options: Readonly<{
    style?: 'black' | 'hatch' | 'scribble' | 'light';
    angle?: number;
    alpha?: number;
    paper?: boolean;
    edge?: number;
  }> = {},
): void {
  GRAPHITE.tone(sketch, points, {
    style: options.style ?? 'light',
    angle: options.angle,
    paper: options.paper,
  });
  GRAPHITE.skin(sketch, points, color, {
    alpha: options.alpha ?? 0.82,
    paper: false,
    underdraw: false,
  });
  GRAPHITE.edge(sketch, closed(points), options.edge ?? 1.6);
}

function rect(x: number, y: number, width: number, height: number): readonly Point[] {
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

function drawShadow(sketch: Sketch, view: AlarmClockView): void {
  const shadow = view === 'front'
    ? sketch.blobPts(49, 57, 44, 4.2, 0.02, 0.12)
    : sketch.blobPts(48, 57, 34, 4.1, 0.02, 0.12);
  GRAPHITE.skin(sketch, shadow, ALARM_CLOCK_RECIPE.colors.shadow, {
    alpha: 0.18,
    paper: false,
    underdraw: false,
  });
}

function drawFeet(sketch: Sketch, view: AlarmClockView): void {
  const feet = view === 'front'
    ? [rect(17, 50, 13, 8), rect(67, 50, 13, 8)]
    : [rect(22, 50, 12, 8), rect(66, 50, 10, 8)];
  for (const foot of feet) mass(sketch, rounded(sketch, foot), ALARM_CLOCK_RECIPE.colors.rubber, {
    style: 'black', paper: false, edge: 1.2,
  });
}

function drawFrontCase(sketch: Sketch): void {
  const outline = rounded(sketch, [
    { x: 7, y: 22 }, { x: 12, y: 17 }, { x: 84, y: 17 }, { x: 90, y: 23 },
    { x: 91, y: 46 }, { x: 85, y: 53 }, { x: 11, y: 53 }, { x: 5, y: 46 },
  ]);
  mass(sketch, outline, ALARM_CLOCK_RECIPE.colors.case, { style: 'scribble', angle: 0.14, alpha: 0.9, edge: 2.2 });
  GRAPHITE.edge(sketch, [{ x: 14, y: 20 }, { x: 82, y: 20 }], 0.9);
}

function drawSideCase(sketch: Sketch): void {
  const body = rounded(sketch, [
    { x: 19, y: 28 }, { x: 28, y: 18 }, { x: 68, y: 17 }, { x: 79, y: 24 },
    { x: 79, y: 47 }, { x: 71, y: 54 }, { x: 21, y: 54 }, { x: 14, y: 47 },
  ]);
  mass(sketch, body, ALARM_CLOCK_RECIPE.colors.case, { style: 'scribble', angle: 0.3, alpha: 0.9, edge: 2.2 });
  const litTop = rounded(sketch, [
    { x: 27, y: 19 }, { x: 67, y: 18 }, { x: 75, y: 23 }, { x: 22, y: 27 },
  ]);
  GRAPHITE.skin(sketch, litTop, ALARM_CLOCK_RECIPE.colors.caseLight, {
    alpha: 0.32, paper: false, underdraw: false,
  });
}

function drawFrontScreen(sketch: Sketch): void {
  mass(sketch, rounded(sketch, rect(12, 23, 73, 25)), ALARM_CLOCK_RECIPE.colors.screen, {
    style: 'black', angle: -0.16, paper: false, alpha: 0.94, edge: 1.7,
  });
}

function drawSideScreen(sketch: Sketch): void {
  const screen = rounded(sketch, [
    { x: 69, y: 25 }, { x: 79, y: 27 }, { x: 79, y: 44 }, { x: 69, y: 46 },
  ]);
  mass(sketch, screen, ALARM_CLOCK_RECIPE.colors.screen, {
    style: 'black', angle: -0.16, paper: false, alpha: 0.94, edge: 1.5,
  });
  GRAPHITE.skin(sketch, rect(74, 30, 5, 10), ALARM_CLOCK_RECIPE.colors.led, {
    alpha: 0.78, paper: false, underdraw: false,
  });
}

const DIGIT_SEGMENTS = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '3': ['a', 'b', 'c', 'd', 'g'],
  '7': ['a', 'b', 'c'],
} as const;

type SegmentId = (typeof DIGIT_SEGMENTS)[keyof typeof DIGIT_SEGMENTS][number];

function segmentPoints(x: number, y: number, segment: SegmentId): readonly Point[] {
  const width = 11;
  const height = 19;
  const thickness = 3.4;
  switch (segment) {
    case 'a': return rect(x + thickness * 0.65, y, width - thickness * 1.3, thickness);
    case 'b': return rect(x + width - thickness, y + thickness * 0.55, thickness, height / 2 - thickness * 0.65);
    case 'c': return rect(x + width - thickness, y + height / 2, thickness, height / 2 - thickness * 0.55);
    case 'd': return rect(x + thickness * 0.65, y + height - thickness, width - thickness * 1.3, thickness);
    case 'e': return rect(x, y + height / 2, thickness, height / 2 - thickness * 0.55);
    case 'f': return rect(x, y + thickness * 0.55, thickness, height / 2 - thickness * 0.65);
    case 'g': return rect(x + thickness * 0.65, y + height / 2 - thickness / 2, width - thickness * 1.3, thickness);
  }
}

function drawDigit(sketch: Sketch, digit: keyof typeof DIGIT_SEGMENTS, x: number, y: number): void {
  for (const segment of DIGIT_SEGMENTS[digit]) {
    GRAPHITE.skin(sketch, rounded(sketch, segmentPoints(x, y, segment)), ALARM_CLOCK_RECIPE.colors.led, {
      alpha: 0.98, paper: false, underdraw: false,
    });
  }
}

function drawTime(sketch: Sketch): void {
  for (const { digit, x, y } of ALARM_CLOCK_RECIPE.display.digits) drawDigit(sketch, digit, x, y);
  for (const dotY of ALARM_CLOCK_RECIPE.display.colon.dotYs) {
    GRAPHITE.skin(sketch, sketch.blobPts(ALARM_CLOCK_RECIPE.display.colon.x, dotY, 1.8, 1.8, 0, 0.08), ALARM_CLOCK_RECIPE.colors.led, {
      alpha: 0.98, paper: false, underdraw: false,
    });
  }
}

function button(sketch: Sketch, points: readonly Point[], style: 'light' | 'hatch' = 'light'): void {
  mass(sketch, rounded(sketch, points), ALARM_CLOCK_RECIPE.colors.caseLight, {
    style, angle: 0.2, paper: false, alpha: 0.82, edge: 1.1,
  });
}

function drawFrontButtons(sketch: Sketch): void {
  button(sketch, rect(31, 10, 34, 8), 'hatch');
  button(sketch, rect(13, 13, 8, 6));
  button(sketch, rect(22, 12, 7, 6));
  button(sketch, rect(70, 12, 8, 6));
  button(sketch, rect(80, 13, 7, 6));
}

function drawSideButtons(sketch: Sketch): void {
  button(sketch, rect(37, 10, 28, 8), 'hatch');
  button(sketch, rect(25, 14, 9, 6));
  button(sketch, rounded(sketch, rect(72, 31, 8, 8)));
}

export function drawAlarmClock(sketch: Sketch, view: AlarmClockView): void {
  drawShadow(sketch, view);
  drawFeet(sketch, view);
  if (view === 'front') {
    drawFrontCase(sketch);
    drawFrontScreen(sketch);
    drawTime(sketch);
    drawFrontButtons(sketch);
    return;
  }
  drawSideCase(sketch);
  drawSideScreen(sketch);
  drawSideButtons(sketch);
}

export function bakeAlarmClockFrame(view: AlarmClockView): Uint8ClampedArray {
  const sketch = new Sketch(WIDTH, HEIGHT);
  sketch.boil(hashSeed(ALARM_CLOCK_RECIPE.assetId, ALARM_CLOCK_RECIPE.seed, view));
  drawAlarmClock(sketch, view);
  return sketch.data;
}
