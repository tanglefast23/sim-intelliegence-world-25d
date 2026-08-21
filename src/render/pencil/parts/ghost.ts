import type { PencilLayout, PencilPalette } from '../layout';
import { screenSideForAttachment, type VampirePose } from '../pose';
import type { Point, Sketch } from '../sketch';

type GhostOptions = Readonly<{ adorned: boolean; seated?: boolean }>;
type SheetColor = Extract<keyof PencilPalette, 'pale' | 'ash' | 'white'>;

function sheetPoint(F: PencilLayout, x: number, bodyY: number): Point {
  return { x: F.head(x, 70).x, y: F.body(0, bodyY).y };
}

function sheetMass(
  sketch: Sketch,
  F: PencilLayout,
  points: readonly Point[],
  color: SheetColor = 'white',
  angle = -0.45,
): void {
  F.media.tone(sketch, points, { style: 'light', angle });
  F.media.skin(sketch, points, F.colors[color], { paper: false, underdraw: false, alpha: 0.58 });
  F.media.edge(sketch, [...points, points[0]!], F.lwThin * 0.85);
}

function darkHole(sketch: Sketch, F: PencilLayout, centre: Point, rx: number, ry: number): void {
  const points = sketch.blobPts(centre.x, centre.y, rx, ry, 0, 0.28);
  F.media.tone(sketch, points, { style: 'black', paper: false });
  F.media.skin(sketch, points, F.colors.hollow, { paper: false, underdraw: false, alpha: 0.88 });
  F.media.edge(sketch, [...points, points[0]!], F.lwThin * 0.75);
}

function drawShroud(sketch: Sketch, F: PencilLayout, pose: VampirePose, seated = false): void {
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
  const hemShift = pose.moving ? (pose.gait === 0 ? -4 : 4) : 0;
  const armLift = pose.moving ? (pose.gait === 0 ? -7 : 5) : 0;
  const points = seated && profile
    ? sketch.smooth([
      F.head(-dir * 20, 51), F.head(-dir * 5, 42), F.head(dir * 10, 41),
      F.head(dir * 26, 53), F.head(dir * 31, 76), sheetPoint(F, dir * 34, 167),
      sheetPoint(F, dir * 56, 218), sheetPoint(F, dir * 52, 270),
      sheetPoint(F, dir * 34, 279), sheetPoint(F, dir * 18, 264),
      sheetPoint(F, -dir * 11, 275), sheetPoint(F, -dir * 31, 250),
      sheetPoint(F, -dir * 31, 164), F.head(-dir * 29, 62),
    ])
    : seated
      ? sketch.smooth([
        F.head(-22, 52), F.head(-10, 43), F.head(0, 40), F.head(12, 43), F.head(24, 53),
        F.head(31, 72), sheetPoint(F, 34, 151), sheetPoint(F, 54, 171),
        sheetPoint(F, 61, 191), sheetPoint(F, 46, 209), sheetPoint(F, 39, 247),
        sheetPoint(F, 45, 268), sheetPoint(F, 25, 277), sheetPoint(F, 6, 264),
        sheetPoint(F, -9, 277), sheetPoint(F, -28, 264), sheetPoint(F, -43, 247),
        sheetPoint(F, -46, 209), sheetPoint(F, -61, 191), sheetPoint(F, -54, 171),
        sheetPoint(F, -34, 151), F.head(-31, 66),
      ])
      : profile
    ? sketch.smooth([
      F.head(-dir * 20, 51), F.head(-dir * 5, 42), F.head(dir * 10, 41),
      F.head(dir * 26, 53), F.head(dir * 31, 76), sheetPoint(F, dir * 33, 168),
      sheetPoint(F, dir * 39, 255), sheetPoint(F, dir * 25, 274),
      sheetPoint(F, dir * 6, 259 + hemShift), sheetPoint(F, -dir * 10, 274),
      sheetPoint(F, -dir * 31, 261 - hemShift), sheetPoint(F, -dir * 31, 164),
      F.head(-dir * 29, 62),
    ])
    : sketch.smooth([
      F.head(-22, 52), F.head(-10, 43), F.head(0, 40), F.head(12, 43), F.head(24, 53),
      F.head(31, 72), sheetPoint(F, 34, 151),
      sheetPoint(F, 50, 160 + armLift), sheetPoint(F, 70, 177 + armLift),
      sheetPoint(F, 69, 190 + armLift), sheetPoint(F, 55, 201 + armLift * 0.5),
      sheetPoint(F, 40, 222), sheetPoint(F, 36, 204), sheetPoint(F, 43, 254),
      sheetPoint(F, 31, 274), sheetPoint(F, 16, 258 + hemShift),
      sheetPoint(F, 3, 274), sheetPoint(F, -10, 259 - hemShift),
      sheetPoint(F, -29, 274), sheetPoint(F, -43, 254), sheetPoint(F, -36, 204),
      sheetPoint(F, -40, 222), sheetPoint(F, -55, 201 - armLift * 0.5),
      sheetPoint(F, -69, 190 - armLift), sheetPoint(F, -70, 177 - armLift),
      sheetPoint(F, -50, 160 - armLift), sheetPoint(F, -34, 151),
      F.head(-31, 66),
    ]);
  sheetMass(sketch, F, points);

  const foldX = profile ? dir * 5 : 0;
  const foldBottom = seated ? 241 : 251;
  sketch.sline([F.head(foldX, 39), sheetPoint(F, foldX - 5, foldBottom)], F.lwThin * 0.72, 0.3);
  sketch.sline([F.head(foldX - 14, 44), sheetPoint(F, foldX - 20, foldBottom - 8)], F.lwThin * 0.62, 0.25);
  sketch.sline([F.head(foldX + 14, 46), sheetPoint(F, foldX + 20, foldBottom - 13)], F.lwThin * 0.62, 0.25);
  if (!profile) {
    sketch.sline([sheetPoint(F, 31, 164), sheetPoint(F, 50, 204 + armLift * 0.4)], F.lwThin * 0.72, 0.3);
    sketch.sline([sheetPoint(F, -31, 164), sheetPoint(F, -50, 204 - armLift * 0.4)], F.lwThin * 0.72, 0.3);
  }
}

function drawEyeHoles(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  if (pose.facing === 'rear') return;
  if (pose.facing === 'front') {
    darkHole(sketch, F, F.head(-13, 76), 5.4, 8.4);
    darkHole(sketch, F, F.head(14, 79), 5.8, 9.2);
    return;
  }
  const dir = pose.facing === 'right' ? 1 : -1;
  darkHole(sketch, F, F.head(dir * 17, 77), 5.1, 8.8);
}

function drawPermitTag(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const side = screenSideForAttachment('left', pose.facing, 'trailing');
  const profile = pose.facing === 'left' || pose.facing === 'right';
  const full = !profile || pose.facing === 'left';
  const anchor = sheetPoint(F, side * 24, 192);
  const width = full ? 8 : 3;
  const tag = [
    { x: anchor.x - width / 2, y: anchor.y }, { x: anchor.x + width / 2, y: anchor.y },
    { x: anchor.x + width / 2, y: anchor.y + 11 }, { x: anchor.x - width / 2, y: anchor.y + 11 },
  ];
  sheetMass(sketch, F, tag, 'pale', 0.2);
  if (full) {
    sketch.sline([{ x: anchor.x - 2, y: anchor.y + 4 }, { x: anchor.x + 2, y: anchor.y + 4 }], F.lwThin * 0.5, 0.55);
    sketch.sline([{ x: anchor.x - 2, y: anchor.y + 7 }, { x: anchor.x + 1, y: anchor.y + 7 }], F.lwThin * 0.5, 0.55);
  }
}

export function drawClassicSheetGhost(
  sketch: Sketch,
  F: PencilLayout,
  pose: VampirePose,
  options: GhostOptions = { adorned: true },
): void {
  drawShroud(sketch, F, pose, options.seated);
  drawEyeHoles(sketch, F, pose);
  if (options.adorned) drawPermitTag(sketch, F, pose);
}
