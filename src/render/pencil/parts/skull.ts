import type { Sketch } from '../sketch';
import { pt, type VampireLayout } from '../layout';
import type { VampirePose } from '../pose';

export function drawSkull(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {
  const { cx, s, w, colors } = F;
  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    const skull = sketch.smooth([
      pt(cx - dir * 6, F.L.hairY + 10),
      pt(cx + dir * 8, 48),
      pt(cx + dir * 22, 70),
      pt(cx + dir * 18, 102),
      pt(cx + dir * 8, 122),
      pt(cx - dir * 4, 128),
      pt(cx - dir * 16, 110),
      pt(cx - dir * 18, 78),
      pt(cx - dir * 10, 52),
    ]);
    sketch.fill(skull, colors.pale, 0.97);
    sketch.fill(sketch.blobPts(cx + dir * 6, 96, s * 0.14, s * 0.12, 0, 0.3), colors.ash, 0.4);
    sketch.broken(skull, F.lwMain);
    return;
  }

  const skull = sketch.smooth([
    pt(cx, F.L.hairY + 10),
    pt(cx + 14, 46),
    pt(cx + 26, 60),
    pt(cx + w, F.L.skullY),
    pt(cx + 18, 102),
    pt(cx + 6, 118),
    pt(cx, 128),
    pt(cx - 6, 118),
    pt(cx - 18, 102),
    pt(cx - w, F.L.skullY),
    pt(cx - 26, 60),
    pt(cx - 14, 46),
  ]);
  sketch.fill(skull, colors.pale, 0.97);
  if (pose.facing === 'front') {
    sketch.fill(sketch.blobPts(cx + 12, 94, s * 0.18, s * 0.14, 0.1, 0.35), colors.ash, 0.44);
    sketch.fill(sketch.blobPts(cx - 12, 94, s * 0.18, s * 0.14, -0.1, 0.35), colors.ash, 0.44);
  }
  sketch.broken(skull, F.lwMain);
}
