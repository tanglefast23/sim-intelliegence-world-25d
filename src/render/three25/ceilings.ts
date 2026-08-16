/**
 * Draw-call ceilings for the 2.5D renderer.
 *
 * The 2D spec's 24/12 cannot hold here: the lit path adds a shadow pass and boxes add batches.
 * Section 1 of the plan set 40/16 provisionally. Measured on the villa frame at 1280x720 zoom 1:
 * 5 draw calls on the fallback path and 6 on the lit path, where the extra call is the shadow pass.
 * These are that measurement with roughly twice the headroom, which catches a batch-per-wall
 * blow-up while leaving room for another batch or two.
 *
 * If a measurement ever exceeds the ceiling, merge wall runs by `adjacencyMask` in `buildWallBoxes`
 * before raising it — the `ponytail:` comment there marks that as the intended optimisation.
 */
export const DRAW_CALL_CEILING = 12;

/** The atlas-textured batches alone, excluding the shadow pass and the untextured skirt. */
export const ATLAS_DRAW_CALL_CEILING = 8;
