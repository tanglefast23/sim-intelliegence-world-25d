import { ATLAS_DRAW_CALL_CEILING, DRAW_CALL_CEILING } from '../ceilings';

describe('2.5D draw-call ceilings', () => {
  test('are tighter than the provisional numbers once measured', () => {
    expect(DRAW_CALL_CEILING).toBeLessThanOrEqual(40);
    expect(ATLAS_DRAW_CALL_CEILING).toBeLessThanOrEqual(16);
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
    expect(DRAW_CALL_CEILING).toBeGreaterThanOrEqual(5);
  });
});
