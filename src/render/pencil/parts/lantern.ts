import type { VampireLayout } from '../layout';
import type { Point, Sketch } from '../sketch';

function rotate(point: Point, origin: Point, angle: number): Point {
  const x = point.x - origin.x;
  const y = point.y - origin.y;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: origin.x + x * cos - y * sin, y: origin.y + x * sin + y * cos };
}

export function drawBrassLantern(sketch: Sketch, F: VampireLayout, grip: Point, angleRadians: number): void {
  const bowl = { x: grip.x, y: grip.y + 5 * F.k };
  const handle = [
    rotate({ x: bowl.x - 5 * F.k, y: bowl.y }, grip, angleRadians),
    rotate({ x: bowl.x - 4 * F.k, y: bowl.y - 9 * F.k }, grip, angleRadians),
    rotate({ x: bowl.x + 4 * F.k, y: bowl.y - 9 * F.k }, grip, angleRadians),
    rotate({ x: bowl.x + 5 * F.k, y: bowl.y }, grip, angleRadians),
  ];
  sketch.sline(handle, F.lwThin * 1.4, 0.72);
  const center = rotate(bowl, grip, angleRadians);
  const glass = sketch.blobPts(center.x, center.y + 3 * F.k, 7 * F.k, 8 * F.k, angleRadians, 0.3);
  F.media.skin(sketch, glass, [184, 139, 62], { paper: false, underdraw: false, alpha: 0.88 });
  F.media.edge(sketch, [...glass, glass[0]!], F.lwMain);
  const glow = sketch.blobPts(center.x, center.y + 3 * F.k, 3.2 * F.k, 4.2 * F.k, angleRadians, 0.2);
  F.media.skin(sketch, glow, [255, 226, 116], { paper: false, underdraw: false, alpha: 0.96 });
}
