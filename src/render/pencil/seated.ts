import type { PencilLayout } from './layout';
import { VAMPIRE_FACINGS, type VampireFacing } from './pose';
import type { Point } from './sketch';

export type SeatedLegAnchors = Readonly<{
  hip: Point;
  knee: Point;
  ankle: Point;
  footDirection: -1 | 1;
}>;

export type SeatedArmAnchors = Readonly<{
  shoulder: Point;
  elbow: Point;
  wrist: Point;
}>;

export function seatedLegAnchors(
  F: PencilLayout,
  facing: VampireFacing,
  screenSide: -1 | 1,
  reach = 1,
): SeatedLegAnchors {
  if (facing === 'left' || facing === 'right') {
    const direction: -1 | 1 = facing === 'right' ? 1 : -1;
    const near = screenSide === direction;
    return {
      hip: F.body(direction * (near ? 4 : -2), 220),
      knee: F.body(direction * (near ? 66 : 50) * reach, near ? 220 : 224),
      ankle: F.body(direction * (near ? 62 : 46) * reach, near ? 282 : 278),
      footDirection: direction,
    };
  }
  return {
    hip: F.body(screenSide * 8, 220),
    knee: F.body(screenSide * 28 * reach, 220),
    ankle: F.body(screenSide * 28 * reach, 282),
    footDirection: screenSide,
  };
}

export function seatedArmAnchors(
  F: PencilLayout,
  facing: VampireFacing,
  screenSide: -1 | 1,
  reach = 1,
): SeatedArmAnchors {
  if (facing === 'left' || facing === 'right') {
    const direction: -1 | 1 = facing === 'right' ? 1 : -1;
    const near = screenSide === direction;
    return {
      shoulder: F.body(direction * (near ? 7 : -1), 148),
      elbow: F.body(direction * (near ? 31 : 21) * reach, near ? 181 : 177),
      wrist: F.body(direction * (near ? 46 : 36) * reach, near ? 202 : 207),
    };
  }
  return {
    shoulder: F.body(screenSide * 16, 148),
    elbow: F.body(screenSide * 36 * reach, 176),
    wrist: F.body(screenSide * 40 * reach, 202),
  };
}

export function segmentBox(start: Point, end: Point, halfWidth: number): readonly Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length * halfWidth;
  const ny = dx / length * halfWidth;
  return [
    { x: start.x + nx, y: start.y + ny },
    { x: end.x + nx, y: end.y + ny },
    { x: end.x - nx, y: end.y - ny },
    { x: start.x - nx, y: start.y - ny },
  ];
}

export function seatedFrameIndex(facing: VampireFacing, boil: number): number {
  return Math.max(0, VAMPIRE_FACINGS.indexOf(facing)) * 3 + boil % 3;
}
