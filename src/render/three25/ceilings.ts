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
 * The numbers are structural rather than view-dependent: the count moves only when a batch, a pass
 * or a material is added, never when geometry does. The lit path is eight colour meshes - floors,
 * textured boxes, flat boxes, glow boxes, billboards, ground stains, lamp pools and the skirt -
 * plus the shadow pass and its two casters. That is why the headroom is small.
 *
 * A breach therefore means a NEW pass, a new material, or a mesh that stopped being merged. It
 * does not mean too much geometry. Fold the work into the existing batches before raising these.
 *
 * Raised from 8 to 10 once, deliberately: flat-shaded furniture needs an UNMAPPED material, because
 * the atlas holds no white texel and a colour drawn through the mapped material always carries a
 * sprite with it. That is a sixth batch plus its shadow pass, measured at 8 on the lit path. The
 * bar for the next raise is the same - name the batch and why it cannot join an existing one.
 */
export const DRAW_CALL_CEILING = 10;

/** The atlas-textured batches alone: floors, boxes and billboards. Measured at 3. */
export const ATLAS_DRAW_CALL_CEILING = 5;
