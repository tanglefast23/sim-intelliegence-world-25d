/**
 * Draw-call ceilings for the 2.5D renderer.
 *
 * The 2D spec's 24/12 cannot hold here: the lit path adds a shadow pass and boxes add batches.
 * Section 1 of the plan set 40/16 provisionally and deliberately generously. These are the
 * measured numbers instead.
 *
 * Measured by `npm run measure:25d-draw-calls` on the villa start position, both shadow paths, at
 * yaw 0 and yaw 35: **5 total / 3 atlas on the fallback path, 6 total / 3 atlas on the lit path**,
 * from 2120 descriptors. The extra lit call is the shadow pass.
 *
 * The numbers are structural rather than view-dependent: the renderer bakes five batches - floors,
 * boxes, billboards, the skirt and blob shadows - so the count moves only when a batch, a pass or
 * a material is added. That is why the headroom is small.
 *
 * A breach therefore means a NEW pass, a new material, or a mesh that stopped being merged. It
 * does not mean too much geometry. Fold the work into the existing batches before raising these.
 */
export const DRAW_CALL_CEILING = 8;

/** The atlas-textured batches alone: floors, boxes and billboards. Measured at 3. */
export const ATLAS_DRAW_CALL_CEILING = 5;
