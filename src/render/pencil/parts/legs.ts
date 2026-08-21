import type { Sketch } from '../sketch';
import type { VampireLayout } from '../layout';
import type { VampirePose } from '../pose';

/** All authored in body space, like the rest of the part. `F.body` maps them to the canvas. */
const HIP_Y = 198;
const FLOOR_Y = 286;
const BOOT_Y = 284;
/** How far the swinging foot leaves the floor on the front and rear walk. */
const STEP_LIFT = 20;
/** The profile lift is smaller: the leg is seen edge-on, so it reads at less travel. */
const SIDE_LIFT = 12;
const BOOT_HEIGHT = 26;
/** Thickness of the pale sole. */
const SOLE = 7;

/**
 * One boot, heel to toe, with a pale sole under it.
 *
 * The sole is not decoration. `colors.hair` is `[22, 20, 26]` and `colors.cloak` is `[24, 22, 30]`,
 * so a black boot drawn over the cloak has almost no edge and the whole leg reads as more cloak.
 * The walk cannot be seen without something light at the floor line.
 */
function drawBoot(
  sketch: Sketch,
  F: VampireLayout,
  heelX: number,
  toeX: number,
  topY: number,
  lightBand: 'sole' | 'cuff' = 'sole',
): void {
  const bottom = topY + BOOT_HEIGHT;
  const overhang = toeX > heelX ? 3 : -3;
  const shape = sketch.smooth([
    F.body(heelX, topY), F.body(toeX, topY),
    F.body(toeX + overhang, bottom), F.body(heelX, bottom),
  ]);
  F.media.tone(sketch, shape, { style: 'black' });
  F.media.skin(sketch, shape, F.colors.hair, { paper: false, underdraw: false, alpha: 0.82 });
  F.media.edge(sketch, [...shape, shape[0]!], F.lwThin * 1.6);
  // The light band is what separates a near-black boot from a near-black cloak. It sits under the
  // boot when the sole faces us and at the ankle when it does not — a sole seen from directly
  // behind is a drawing mistake, not a highlight.
  const [bandTop, bandBottom] = lightBand === 'sole'
    ? [bottom - SOLE, bottom]
    : [topY, topY + SOLE];
  F.media.skin(sketch, sketch.smooth([
    F.body(heelX, bandTop), F.body(toeX + overhang * 0.5, bandTop),
    F.body(toeX + overhang * 0.5, bandBottom), F.body(heelX, bandBottom),
  ]), F.colors.ash, { underdraw: false, alpha: 0.75 });
}

/**
 * The walk.
 *
 * **Front and rear.** The two legs run on ONE phase in opposite states: one foot is planted and
 * carries the weight, the other lifts and tucks toward the midline. The first version gave the two
 * legs opposite signs on the same axis (`leftX = swing * .35`, `rightX = -swing * .35`), so frame 0
 * splayed both legs outward and frame 1 pulled both inward until they overlapped. That is a squat,
 * not a step, and on the rear frame the two legs collapsed into a single line.
 *
 * **Left and right.** These already strode, one leg forward and one back off the same swing. What
 * was missing was the trailing boot — only the leading leg had one — and the leading boot's toe
 * pointed in `+x` for both facings, so a vampire walking left had his toe on backwards.
 */
export function drawLegs(sketch: Sketch, F: VampireLayout, pose: VampirePose): void {

  if (pose.facing === 'left' || pose.facing === 'right') {
    const dir = pose.facing === 'right' ? 1 : -1;
    /**
     * Contact then passing, not a swap.
     *
     * The first version set `front = swing * dir` and `back = -swing * dir`, so the two feet were
     * at `{-16, +16}` in BOTH frames and only traded which one was drawn on top. The silhouette
     * never changed, which is why the profile walk looked frozen while the front walk did not.
     * Frame 0 spreads the legs; frame 1 brings the trailing leg under the body and lifts it.
     */
    const spread = pose.gait === 0;
    const leadX = pose.moving ? (spread ? 14 : 5) * dir : 5 * dir;
    const trailX = pose.moving ? (spread ? -14 : -2) * dir : -5 * dir;
    const trailLift = pose.moving && !spread ? SIDE_LIFT : 0;
    const leg = (footX: number, lift: number, drop: number) => sketch.smooth([
      F.body(-3, HIP_Y), F.body(3, HIP_Y),
      F.body(footX + 4, FLOOR_Y + drop - lift), F.body(footX - 4, FLOOR_Y + drop - lift),
    ]);
    const trailLeg = leg(trailX, trailLift, 0);
    const leadLeg = leg(leadX, 0, 6);
    F.media.tone(sketch, trailLeg, { style: 'hatch', angle: 0.45 });
    F.media.tone(sketch, leadLeg, { style: 'hatch', angle: -0.45 });
    F.media.skin(sketch, trailLeg, F.colors.hairEdge, { paper: false, underdraw: false, alpha: 0.78 });
    F.media.skin(sketch, leadLeg, F.colors.hairEdge, { paper: false, underdraw: false, alpha: 0.78 });
    F.media.edge(sketch, [...trailLeg, trailLeg[0]!], F.lwMain);
    F.media.edge(sketch, [...leadLeg, leadLeg[0]!], F.lwMain);
    // Trailing boot first so the leading one overlaps it, same as the legs above.
    drawBoot(sketch, F, trailX - dir * 7, trailX + dir * 9, BOOT_Y - trailLift);
    drawBoot(sketch, F, leadX - dir * 8, leadX + dir * 11, BOOT_Y + 3);
    return;
  }

  // Standing still means standing still: both feet flat, square under the hips. Reusing walk
  // frame 0 for idle left him balanced on one leg every time he stopped.
  const phase = pose.gait === 0 ? 1 : -1;
  const leftLift = !pose.moving ? 0 : phase === 1 ? 0 : STEP_LIFT;
  const rightLift = !pose.moving ? 0 : phase === 1 ? STEP_LIFT : 0;
  // The planted foot pushes away from the midline; the lifted one tucks across it.
  const leftX = !pose.moving ? 0 : phase === 1 ? -4 : 6;
  const rightX = !pose.moving ? 0 : phase === 1 ? -6 : 4;

  const left = sketch.smooth([
    F.body(-8, HIP_Y), F.body(-1, HIP_Y),
    F.body(-2 + leftX, FLOOR_Y - leftLift), F.body(-10 + leftX, FLOOR_Y - leftLift),
  ]);
  const right = sketch.smooth([
    F.body(1, HIP_Y), F.body(8, HIP_Y),
    F.body(10 + rightX, FLOOR_Y - rightLift), F.body(2 + rightX, FLOOR_Y - rightLift),
  ]);
  F.media.tone(sketch, left, { style: 'hatch', angle: 0.45 });
  F.media.tone(sketch, right, { style: 'hatch', angle: -0.45 });
  F.media.skin(sketch, left, F.colors.hairEdge, { paper: false, underdraw: false, alpha: 0.78 });
  F.media.skin(sketch, right, F.colors.hairEdge, { paper: false, underdraw: false, alpha: 0.78 });
  F.media.edge(sketch, [...left, left[0]!], F.lwMain);
  F.media.edge(sketch, [...right, right[0]!], F.lwMain);
  // Toes point outward on both facings. From behind that is anatomically the heel, but at this
  // size the silhouette is identical and a separate rear boot would only add a part to maintain.
  const band = pose.facing === 'rear' ? 'cuff' : 'sole';
  drawBoot(sketch, F, -1 + leftX, -13 + leftX, BOOT_Y - leftLift, band);
  drawBoot(sketch, F, 1 + rightX, 13 + rightX, BOOT_Y - rightLift, band);
}
