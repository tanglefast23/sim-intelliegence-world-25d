import type { VampireLayout } from '../layout';
import { gaitSwing, type VampirePose } from '../pose';
import type { Point, Sketch } from '../sketch';

function sleeve(sketch: Sketch, F: VampireLayout, points: readonly Point[], near: boolean): void {
  const shape = sketch.smooth(points);
  F.media.tone(sketch, shape, { style: 'light', angle: near ? -0.3 : 0.3 });
  F.media.skin(sketch, shape, near ? F.colors.cloakLift : F.colors.cloak, {
    paper: false,
    underdraw: false,
    alpha: 0.9,
  });
  F.media.edge(sketch, [...shape, shape[0]!], F.lwMain);
}

function hand(sketch: Sketch, F: VampireLayout, point: Point, radius: number): void {
  F.media.skin(sketch, sketch.blobPts(point.x, point.y, radius, radius, 0, 0.4), F.colors.pale, {
    paper: false,
    underdraw: false,
    alpha: 0.9,
  });
}

export function drawArms(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  const swing = pose.moving ? gaitSwing(pose.gait) : 0;

  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir: -1 | 1 = pose.facing === 'right' ? 1 : -1;
    const far: -1 | 1 = dir === 1 ? -1 : 1;
    for (const side of [far, dir]) {
      const near = side === dir;
      const armSwing = near ? swing : -swing;
      const wrist = F.body(
        side * (near ? 18 : 17) - armSwing * 0.25,
        (near ? 218 : 205) + armSwing * 0.2,
      );
      sleeve(sketch, F, [
        F.body(side * (near ? 7 : 4), 140),
        F.body(side * (near ? 20 : 15) - armSwing * 0.12, near ? 181 : 172),
        { x: wrist.x + side * 4 * F.k, y: wrist.y },
        { x: wrist.x - side * 4 * F.k, y: wrist.y },
        F.body(side * (near ? 1 : -1), 178),
      ], near);
      hand(sketch, F, { x: wrist.x, y: wrist.y + 4 * F.k }, near ? 7 * F.k : 5 * F.k);
    }
    return;
  }

  for (const side of [-1, 1] as const) {
    const armSwing = side * swing;
    const wrist = F.body(side * 31 + swing * 0.2, 214 + armSwing * 0.38);
    sleeve(sketch, F, [
      F.body(side * 15, 140),
      F.body(side * 38, 178 + armSwing * 0.15),
      { x: wrist.x + side * 5 * F.k, y: wrist.y },
      { x: wrist.x - side * 5 * F.k, y: wrist.y },
      F.body(side * 26, 176 + armSwing * 0.1),
    ], side === 1);
    if (pose.facing !== 'rear') hand(sketch, F, { x: wrist.x, y: wrist.y + 4 * F.k }, 7 * F.k);
  }
}
