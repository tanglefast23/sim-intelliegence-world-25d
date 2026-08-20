import { buildVampireLayout, HEAD_SHARE, VAMPIRE_COLORS } from '../layout';
import { drawVampireCharacter } from '../parts';
import { drawArms } from '../parts/arms';
import { drawCloak, drawCollar } from '../parts/cloak';
import { drawEyes } from '../parts/eyes';
import { drawFangs } from '../parts/fangs';
import { drawHair } from '../parts/hair';
import { VAMPIRE_FACINGS, type VampireFacing } from '../pose';
import { hashSeed, Sketch } from '../sketch';
import { PENCIL_HEIGHT, PENCIL_WIDTH } from '../vampire';

function render(facing: VampireFacing, gait: 0 | 1, moving = true): Sketch {
  const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
  sketch.boil(hashSeed('vampire-01', facing, moving ? gait : 'idle', 0));
  drawVampireCharacter(sketch, buildVampireLayout(), { facing, gait, moving });
  return sketch;
}

/** Rows that carry any ink, so we can measure what the drawing actually occupies. */
function paintedRows(sketch: Sketch): readonly number[] {
  const rows: number[] = [];
  for (let y = 0; y < sketch.height; y += 1) {
    for (let x = 0; x < sketch.width; x += 1) {
      if ((sketch.data[(y * sketch.width + x) * 4 + 3] as number) > 8) {
        rows.push(y);
        break;
      }
    }
  }
  return rows;
}

function countsNear(sketch: Sketch, rgb: readonly [number, number, number], tolerance = 26): number {
  let hits = 0;
  for (let i = 0; i < sketch.data.length; i += 4) {
    if ((sketch.data[i + 3] as number) < 40) continue;
    if (
      Math.abs((sketch.data[i] as number) - rgb[0]) <= tolerance &&
      Math.abs((sketch.data[i + 1] as number) - rgb[1]) <= tolerance &&
      Math.abs((sketch.data[i + 2] as number) - rgb[2]) <= tolerance
    ) hits += 1;
  }
  return hits;
}

function hasInkNear(sketch: Sketch, x: number, y: number, radius = 2): boolean {
  for (let py = Math.round(y) - radius; py <= Math.round(y) + radius; py += 1) {
    for (let px = Math.round(x) - radius; px <= Math.round(x) + radius; px += 1) {
      if ((sketch.data[(py * sketch.width + px) * 4 + 3] as number) > 8) return true;
    }
  }
  return false;
}

function paintedBounds(sketch: Sketch): Readonly<{ minX: number; maxX: number; minY: number; maxY: number }> {
  let minX = sketch.width;
  let maxX = 0;
  let minY = sketch.height;
  let maxY = 0;
  for (let y = 0; y < sketch.height; y += 1) {
    for (let x = 0; x < sketch.width; x += 1) {
      if ((sketch.data[(y * sketch.width + x) * 4 + 3] as number) <= 8) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, maxX, minY, maxY };
}

function topPaintedRow(sketch: Sketch, fromX: number, toX: number): number {
  for (let y = 0; y < sketch.height; y += 1) {
    for (let x = fromX; x <= toX; x += 1) {
      if ((sketch.data[(y * sketch.width + x) * 4 + 3] as number) > 8) return y;
    }
  }
  return sketch.height;
}

describe('pencil vampire walk and proportions', () => {
  test('the approved hair has a deep widow peak and pointed temples', () => {
    const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
    const F = buildVampireLayout();
    sketch.boil(hashSeed('vampire-01', 'front', 'hair-review', 0));
    drawHair(sketch, F, { facing: 'front', gait: 0, moving: false });
    for (const point of [F.head(0, 76), F.head(-34, 50), F.head(34, 50)]) {
      expect(hasInkNear(sketch, point.x, point.y)).toBe(true);
    }
  });

  test('the cardigan is compact and carries a balanced high collar', () => {
    const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
    const F = buildVampireLayout();
    sketch.boil(hashSeed('vampire-01', 'front', 'cardigan-review', 0));
    drawCloak(sketch, F, { facing: 'front', gait: 0, moving: false });
    drawCollar(sketch, F, { facing: 'front', gait: 0, moving: false });
    const bounds = paintedBounds(sketch);
    expect(bounds.maxX - bounds.minX).toBeLessThanOrEqual(60);
    const leftTop = topPaintedRow(sketch, 0, Math.floor(F.cx) - 1);
    const rightTop = topPaintedRow(sketch, Math.ceil(F.cx) + 1, sketch.width - 1);
    expect(Math.abs(rightTop - leftTop)).toBeLessThanOrEqual(2);
    expect(countsNear(sketch, VAMPIRE_COLORS.cloakLift, 20)).toBeGreaterThan(12);
  });

  test('the guarded face carries cool under-eye shadows', () => {
    const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
    const F = buildVampireLayout();
    sketch.boil(hashSeed('vampire-01', 'front', 'eye-review', 0));
    drawEyes(sketch, F, { facing: 'front', gait: 0, moving: false });
    expect(countsNear(sketch, VAMPIRE_COLORS.ash, 20)).toBeGreaterThan(4);
  });

  test('the resting fang mouth stays quiet and compact', () => {
    const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
    const F = buildVampireLayout();
    sketch.boil(hashSeed('vampire-01', 'front', 'mouth-review', 0));
    drawFangs(sketch, F, { facing: 'front', gait: 0, moving: false });
    const bounds = paintedBounds(sketch);
    expect(bounds.maxX - bounds.minX + 1).toBeLessThanOrEqual(20);
    expect(bounds.maxY - bounds.minY + 1).toBeLessThanOrEqual(11);
  });
  test('the head is the largest mass, per the design doc', () => {
    // Kindergrimm's rule. He was authored at 0.36 and read as a thin man in a big coat.
    expect(HEAD_SHARE).toBeGreaterThanOrEqual(0.5);
    expect(HEAD_SHARE).toBeLessThanOrEqual(0.6);
    const F = buildVampireLayout();
    const rows = paintedRows(render('front', 0));
    const top = rows[0] as number;
    const bottom = rows[rows.length - 1] as number;
    const headShare = (F.L.chinY - top) / (bottom - top);
    expect(headShare).toBeGreaterThan(0.45);
  });

  test('standing still puts both feet flat on the floor', () => {
    // Idle used to reuse walk frame 0, which has a foot in the air, so he balanced on one leg
    // every time he stopped.
    const footLowest = (sketch: Sketch, fromX: number, toX: number): number => {
      for (let y = sketch.height - 1; y >= 0; y -= 1) {
        for (let x = fromX; x <= toX; x += 1) {
          if ((sketch.data[(y * sketch.width + x) * 4 + 3] as number) > 8) return y;
        }
      }
      return 0;
    };
    const cx = buildVampireLayout().cx;
    for (const facing of ['front', 'rear'] as const) {
      const idle = render(facing, 0, false);
      // Within the pencil's own wobble. A lifted foot is 20 body units up, far outside this.
      const gap = footLowest(idle, cx - 12, cx - 1) - footLowest(idle, cx + 1, cx + 12);
      expect(Math.abs(gap)).toBeLessThanOrEqual(2);
    }
    // Idle is its own drawing, not walk frame 0.
    for (const facing of VAMPIRE_FACINGS) {
      expect(render(facing, 0, false).data).not.toEqual(render(facing, 0, true).data);
    }
  });

  test('every facing changes between the two walk frames', () => {
    for (const facing of VAMPIRE_FACINGS) {
      expect(render(facing, 0).data).not.toEqual(render(facing, 1).data);
    }
  });

  test('the front walk plants one foot and lifts the other', () => {
    // The bug this pins: the legs had mirrored signs on one axis, so they splayed apart and then
    // overlapped. Both feet stayed on the floor and the character squatted instead of stepping.
    // One foot is always planted, so the figure's lowest row does NOT move — what alternates is
    // which side is carrying the weight.
    const footLowestRow = (sketch: Sketch, fromX: number, toX: number): number => {
      for (let y = sketch.height - 1; y >= 0; y -= 1) {
        for (let x = fromX; x <= toX; x += 1) {
          if ((sketch.data[(y * sketch.width + x) * 4 + 3] as number) > 8) return y;
        }
      }
      return 0;
    };
    const cx = buildVampireLayout().cx;
    for (const facing of ['front', 'rear'] as const) {
      const planted = render(facing, 0);
      const stepped = render(facing, 1);
      const leftPlanted = footLowestRow(planted, cx - 12, cx - 1);
      const leftStepped = footLowestRow(stepped, cx - 12, cx - 1);
      const rightPlanted = footLowestRow(planted, cx + 1, cx + 12);
      const rightStepped = footLowestRow(stepped, cx + 1, cx + 12);
      // Gait 0 stands on the left foot, gait 1 on the right. Lower on screen is a larger row.
      // The margin is 2, not the lift's full 10px: stroke ends now overshoot on purpose, so a
      // lifted boot trails a faint tail below itself. The squat bug this guards against measured
      // a gap of 0-1.
      expect(leftPlanted).toBeGreaterThan(leftStepped + 2);
      expect(rightStepped).toBeGreaterThan(rightPlanted + 2);
    }
  });

  test('the boots carry a light band so the step is visible against the cloak', () => {
    // hair and cloak differ by two units per channel. Without the ash band a moving boot is
    // correct and invisible at the same time.
    // Proportional to the sheet, so shrinking the drawing does not quietly fail this.
    const floor = Math.round((PENCIL_WIDTH * PENCIL_HEIGHT) / 1400);
    for (const facing of VAMPIRE_FACINGS) {
      expect(countsNear(render(facing, 0), VAMPIRE_COLORS.ash)).toBeGreaterThan(floor);
    }
  });

  test('the rear view shows no hands and no face', () => {
    // Measured directly since the medium refactor: paper gaps read as pale everywhere, so a
    // pale-pixel ratio no longer distinguishes a face from a cape.
    // Rear sleeves remain visible, but the hands stay beneath the closed cape.
    const armsOnly = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
    armsOnly.boil(hashSeed('vampire-01', 'rear', 'idle', 0));
    drawArms(armsOnly, buildVampireLayout(), { facing: 'rear', gait: 0, moving: false });
    expect(armsOnly.data.some((byte) => byte !== 0)).toBe(true);
    expect(countsNear(armsOnly, VAMPIRE_COLORS.pale, 12)).toBe(0);
    // And no eye colour appears on the back of a head.
    expect(countsNear(render('rear', 0), VAMPIRE_COLORS.red, 12)).toBe(0);
  });

  test('the head keeps its width in profile', () => {
    // The side skull spanned -18..+22 against a front -30..+30, so he thinned out mid-walk.
    const widthOf = (facing: VampireFacing) => {
      const sketch = render(facing, 0);
      let min = sketch.width;
      let max = 0;
      const chin = Math.round(buildVampireLayout().L.chinY);
      for (let y = 0; y < chin; y += 1) {
        for (let x = 0; x < sketch.width; x += 1) {
          if ((sketch.data[(y * sketch.width + x) * 4 + 3] as number) > 8) {
            if (x < min) min = x;
            if (x > max) max = x;
          }
        }
      }
      return max - min;
    };
    expect(widthOf('left')).toBeGreaterThan(widthOf('front') * 0.8);
    expect(widthOf('right')).toBeGreaterThan(widthOf('front') * 0.8);
  });
});
