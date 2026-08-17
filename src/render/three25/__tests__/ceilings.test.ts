import { ATLAS_DRAW_CALL_CEILING, DRAW_CALL_CEILING } from '../ceilings';

describe('2.5D draw-call ceilings', () => {
  test('are tighter than the provisional numbers once measured', () => {
    // The plan's provisional guesses were 40 and 16. The measured maxima are 6 and 3.
    expect(DRAW_CALL_CEILING).toBeLessThanOrEqual(40);
    expect(ATLAS_DRAW_CALL_CEILING).toBeLessThanOrEqual(16);
    expect(DRAW_CALL_CEILING).toBeLessThan(14);
    expect(ATLAS_DRAW_CALL_CEILING).toBeLessThan(8);
  });

  test('leave room for the lit path shadow pass', () => {
    expect(DRAW_CALL_CEILING).toBeGreaterThan(ATLAS_DRAW_CALL_CEILING);
  });

  /**
   * The renderer draws five batches: floors, boxes, billboards, the skirt and blob shadows. The
   * ceiling has to clear that with room for the lit path's shadow pass, or the smokes fail on a
   * correct frame.
   */
  test('clear the batches the renderer actually draws', () => {
    // Five batches plus the lit path's shadow pass is six, and the ceiling must clear that or a
    // correct frame fails its own smoke.
    // Six batches - floors, textured boxes, flat boxes, billboards, skirt, blobs - plus the lit
    // path's shadow pass.
    expect(DRAW_CALL_CEILING).toBeGreaterThanOrEqual(8);
    expect(ATLAS_DRAW_CALL_CEILING).toBeGreaterThanOrEqual(3);
  });
});
