import { buildVampireLayout, SHEET_HEIGHT, SHEET_WIDTH, type VampireLayout } from './layout';
import { screenSideForAttachment, VAMPIRE_FACINGS, type AnatomicalSide, type VampireFacing, type VampirePose } from './pose';
import { hashSeed, type Point, Sketch } from './sketch';
import { drawEars } from './parts/ears';
import { drawEyes } from './parts/eyes';
import { drawFangs } from './parts/fangs';
import { drawHair } from './parts/hair';
import { drawNose } from './parts/nose';
import { drawSkull } from './parts/skull';

const BOIL_FRAMES = 3;

type SeatedPartId =
  | 'far-upper-leg' | 'far-lower-leg' | 'far-boot'
  | 'torso'
  | 'near-upper-leg' | 'near-lower-leg' | 'near-boot'
  | 'far-arm' | 'head' | 'near-arm' | 'collar';

type SeatedBone = Readonly<{
  id: SeatedPartId;
  side?: AnatomicalSide;
  pivot: Readonly<{ x: number; y: number }>;
  depth: number;
  boilPhase: 0 | 1 | 2;
  draw: (sketch: Sketch, F: VampireLayout, facing: VampireFacing, side?: AnatomicalSide) => void;
}>;

function closed(sketch: Sketch, points: readonly Point[]): readonly Point[] {
  const shape = sketch.smooth(points);
  return [...shape, shape[0]!];
}

function cloth(sketch: Sketch, F: VampireLayout, points: readonly Point[], color: keyof VampireLayout['colors'], angle: number): void {
  const shape = closed(sketch, points);
  F.media.tone(sketch, shape, { style: 'light', angle });
  F.media.skin(sketch, shape, F.colors[color], { paper: false, underdraw: false, alpha: 0.9 });
  F.media.edge(sketch, shape, F.lwMain);
}

function limb(sketch: Sketch, F: VampireLayout, start: Point, end: Point, width: number, color: keyof VampireLayout['colors'], angle: number): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length * width;
  const ny = dx / length * width;
  const shape = closed(sketch, [
    { x: start.x + nx, y: start.y + ny },
    { x: end.x + nx, y: end.y + ny },
    { x: end.x - nx, y: end.y - ny },
    { x: start.x - nx, y: start.y - ny },
  ]);
  F.media.tone(sketch, shape, { style: 'hatch', angle });
  F.media.skin(sketch, shape, F.colors[color], { paper: false, underdraw: false, alpha: 0.88 });
  F.media.edge(sketch, shape, F.lwMain);
}

function isLeading(side: AnatomicalSide): boolean {
  return side === 'left';
}

function screenSide(side: AnatomicalSide, facing: VampireFacing): -1 | 1 {
  return screenSideForAttachment(side, facing, isLeading(side) ? 'leading' : 'trailing');
}

function legPoints(F: VampireLayout, facing: VampireFacing, side: AnatomicalSide): Readonly<{ hip: Point; knee: Point; ankle: Point }> {
  const sideOnScreen = screenSide(side, facing);
  if (facing === 'left' || facing === 'right') {
    const dir = facing === 'right' ? 1 : -1;
    const near = sideOnScreen === dir;
    return {
      hip: F.body(dir * (near ? 4 : -2), 220),
      knee: F.body(dir * (near ? 66 : 50), near ? 220 : 224),
      ankle: F.body(dir * (near ? 62 : 46), near ? 282 : 278),
    };
  }
  return {
    hip: F.body(sideOnScreen * 8, 220),
    knee: F.body(sideOnScreen * 28, 220),
    ankle: F.body(sideOnScreen * 28, 282),
  };
}

function armPoints(F: VampireLayout, facing: VampireFacing, side: AnatomicalSide): Readonly<{ shoulder: Point; elbow: Point; wrist: Point }> {
  const sideOnScreen = screenSide(side, facing);
  if (facing === 'left' || facing === 'right') {
    const dir = facing === 'right' ? 1 : -1;
    const near = sideOnScreen === dir;
    return {
      shoulder: F.body(dir * (near ? 7 : -1), 148),
      elbow: F.body(dir * (near ? 31 : 21), near ? 181 : 177),
      wrist: F.body(dir * (near ? 46 : 36), near ? 202 : 207),
    };
  }
  return {
    shoulder: F.body(sideOnScreen * 16, 148),
    elbow: F.body(sideOnScreen * 36, 176),
    wrist: F.body(sideOnScreen * 40, 202),
  };
}

function drawUpperLeg(sketch: Sketch, F: VampireLayout, facing: VampireFacing, side?: AnatomicalSide): void {
  if (!side) return;
  const points = legPoints(F, facing, side);
  limb(sketch, F, points.hip, points.knee, 4.2 * F.k, 'ash', side === 'left' ? 0.45 : -0.45);
}

function drawLowerLeg(sketch: Sketch, F: VampireLayout, facing: VampireFacing, side?: AnatomicalSide): void {
  if (!side) return;
  const points = legPoints(F, facing, side);
  limb(sketch, F, points.knee, points.ankle, 4 * F.k, 'ash', side === 'left' ? -0.35 : 0.35);
}

function drawBoot(sketch: Sketch, F: VampireLayout, facing: VampireFacing, side?: AnatomicalSide): void {
  if (!side) return;
  const sideOnScreen = screenSide(side, facing);
  const dir = facing === 'left' || facing === 'right' ? (facing === 'right' ? 1 : -1) : sideOnScreen;
  const { ankle } = legPoints(F, facing, side);
  const toe = { x: ankle.x + dir * (facing === 'left' || facing === 'right' ? 7 : 3) * F.k, y: F.body(0, 302).y };
  const heel = { x: ankle.x - dir * 4 * F.k, y: F.body(0, 302).y };
  const top = { x: ankle.x - dir * 3 * F.k, y: ankle.y - 2 * F.k };
  const shape = closed(sketch, [top, { x: ankle.x + dir * 4 * F.k, y: ankle.y }, toe, heel]);
  F.media.tone(sketch, shape, { style: 'black' });
  F.media.skin(sketch, shape, F.colors.hair, { paper: false, underdraw: false, alpha: 0.88 });
  F.media.edge(sketch, shape, F.lwMain);
  const bandTop = facing === 'rear' ? ankle.y - 2 * F.k : heel.y - 4 * F.k;
  const bandBottom = bandTop + 4 * F.k;
  F.media.skin(sketch, sketch.smooth([
    { x: heel.x, y: bandTop }, { x: toe.x, y: bandTop },
    { x: toe.x, y: bandBottom }, { x: heel.x, y: bandBottom },
  ]), F.colors.ash, { underdraw: false, alpha: 0.78 });
}

function drawTorso(sketch: Sketch, F: VampireLayout, facing: VampireFacing): void {
  if (facing === 'left' || facing === 'right') {
    const dir = facing === 'right' ? 1 : -1;
    cloth(sketch, F, [
      F.body(-dir * 11, 137), F.body(dir * 14, 140),
      F.body(dir * 19, 216), F.body(dir * 8, 231),
      F.body(-dir * 16, 225), F.body(-dir * 22, 171),
    ], 'cloak', -dir * 0.32);
    cloth(sketch, F, [
      F.body(-dir * 5, 142), F.body(dir * 10, 145),
      F.body(dir * 12, 210), F.body(-dir * 5, 210),
    ], 'shirt', dir * 0.35);
    return;
  }

  if (facing === 'rear') {
    cloth(sketch, F, [
      F.body(-20, 136), F.body(20, 136), F.body(31, 178),
      F.body(27, 226), F.body(0, 234), F.body(-27, 226), F.body(-31, 178),
    ], 'cloak', 0.35);
    sketch.sline([F.body(0, 144), F.body(0, 228)], F.lwThin * 1.4, 0.6);
    return;
  }

  cloth(sketch, F, [
    F.body(-6, 136), F.body(-27, 142), F.body(-34, 178),
    F.body(-29, 226), F.body(-10, 232), F.body(-8, 172),
  ], 'cloak', 0.45);
  cloth(sketch, F, [
    F.body(6, 136), F.body(27, 142), F.body(34, 178),
    F.body(29, 226), F.body(10, 232), F.body(8, 172),
  ], 'cloakLift', -0.45);
  cloth(sketch, F, [
    F.body(-10, 142), F.body(0, 153), F.body(10, 142),
    F.body(13, 220), F.body(-13, 220),
  ], 'shirt', -0.3);
  for (const y of [169, 193]) {
    const button = F.body(0, y);
    F.media.skin(sketch, sketch.blobPts(button.x, button.y, 1.4, 1.4, 0, 0.25), F.colors.red, {
      paper: false, underdraw: false, alpha: 0.95,
    });
  }
}

function drawArm(sketch: Sketch, F: VampireLayout, facing: VampireFacing, side?: AnatomicalSide): void {
  if (!side) return;
  const { shoulder, elbow, wrist } = armPoints(F, facing, side);
  limb(sketch, F, shoulder, elbow, 6 * F.k, side === 'left' ? 'cloak' : 'cloakLift', side === 'left' ? 0.25 : -0.25);
  limb(sketch, F, elbow, wrist, 5.5 * F.k, side === 'left' ? 'cloak' : 'cloakLift', side === 'left' ? -0.35 : 0.35);
  F.media.skin(sketch, sketch.blobPts(wrist.x, wrist.y + 2 * F.k, 6 * F.k, 5 * F.k, 0, 0.35), F.colors.pale, {
    paper: false, underdraw: false, alpha: 0.92,
  });
}

function drawHead(sketch: Sketch, F: VampireLayout, facing: VampireFacing): void {
  const pose: VampirePose = { facing, gait: 0, moving: false };
  drawSkull(sketch, F, pose);
  drawEars(sketch, F, pose);
  drawHair(sketch, F, pose);
  drawEyes(sketch, F, pose);
  drawNose(sketch, F, pose);
  drawFangs(sketch, F, pose);
}

function drawCollar(sketch: Sketch, F: VampireLayout, facing: VampireFacing): void {
  if (facing === 'left' || facing === 'right') {
    const dir = facing === 'right' ? 1 : -1;
    cloth(sketch, F, [
      F.body(-dir * 5, 140), F.body(-dir * 25, 145),
      F.head(-dir * 27, 105), F.head(-dir * 22, 119),
    ], 'cloakLift', -dir * 0.25);
    return;
  }
  for (const side of [-1, 1] as const) {
    cloth(sketch, F, [
      F.body(side * 6, 140), F.body(side * 36, 145),
      F.head(side * 33, facing === 'rear' ? 99 : 103), F.head(side * 25, 119),
    ], 'cloakLift', side * 0.25);
  }
}

const SEATED_BONES: readonly SeatedBone[] = [
  { id: 'far-upper-leg', side: 'right', pivot: { x: 8, y: 210 }, depth: 10, boilPhase: 0, draw: drawUpperLeg },
  { id: 'far-lower-leg', side: 'right', pivot: { x: 20, y: 246 }, depth: 11, boilPhase: 1, draw: drawLowerLeg },
  { id: 'far-boot', side: 'right', pivot: { x: 16, y: 282 }, depth: 12, boilPhase: 2, draw: drawBoot },
  { id: 'torso', pivot: { x: 0, y: 180 }, depth: 20, boilPhase: 0, draw: drawTorso },
  { id: 'near-upper-leg', side: 'left', pivot: { x: -8, y: 210 }, depth: 30, boilPhase: 2, draw: drawUpperLeg },
  { id: 'near-lower-leg', side: 'left', pivot: { x: -20, y: 246 }, depth: 31, boilPhase: 0, draw: drawLowerLeg },
  { id: 'near-boot', side: 'left', pivot: { x: -16, y: 282 }, depth: 32, boilPhase: 1, draw: drawBoot },
  { id: 'far-arm', side: 'right', pivot: { x: 16, y: 148 }, depth: 40, boilPhase: 2, draw: drawArm },
  { id: 'head', pivot: { x: 0, y: 82 }, depth: 50, boilPhase: 1, draw: drawHead },
  { id: 'near-arm', side: 'left', pivot: { x: -16, y: 148 }, depth: 60, boilPhase: 0, draw: drawArm },
  { id: 'collar', pivot: { x: 0, y: 140 }, depth: 70, boilPhase: 2, draw: drawCollar },
];

function compositeOver(target: Uint8ClampedArray, source: Uint8ClampedArray): void {
  for (let offset = 0; offset < target.length; offset += 4) {
    const sourceAlpha = source[offset + 3]! / 255;
    if (sourceAlpha === 0) continue;
    const targetAlpha = target[offset + 3]! / 255;
    const alpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
    for (let channel = 0; channel < 3; channel += 1) {
      target[offset + channel] = Math.round((
        source[offset + channel]! * sourceAlpha
        + target[offset + channel]! * targetAlpha * (1 - sourceAlpha)
      ) / alpha);
    }
    target[offset + 3] = Math.round(alpha * 255);
  }
}

export function bakeSeatedVampireFrames(): readonly Uint8ClampedArray[] {
  const F = buildVampireLayout();
  return VAMPIRE_FACINGS.flatMap((facing) => Array.from({ length: BOIL_FRAMES }, (_, boil) => {
    const output = new Uint8ClampedArray(SHEET_WIDTH * SHEET_HEIGHT * 4);
    for (const bone of SEATED_BONES) {
      const part = new Sketch(SHEET_WIDTH, SHEET_HEIGHT);
      part.boil(hashSeed('vampire-01', 'seated', facing, bone.id, (boil + bone.boilPhase) % BOIL_FRAMES));
      bone.draw(part, F, facing, bone.side);
      compositeOver(output, part.data);
    }
    return output;
  }));
}

export function seatedVampireFrameIndex(facing: VampireFacing, boil: number): number {
  return Math.max(0, VAMPIRE_FACINGS.indexOf(facing)) * BOIL_FRAMES + boil % BOIL_FRAMES;
}

export const VAMPIRE_SEATED_BONE_IDS = SEATED_BONES.map(({ id }) => id);
