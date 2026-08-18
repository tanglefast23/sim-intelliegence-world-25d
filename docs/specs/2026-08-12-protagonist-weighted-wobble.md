---
title: Protagonist Weighted Wobble Trial
type: feature-spec
date: 2026-08-12
status: implemented-and-verified
---

# Protagonist Weighted Wobble Trial

> **Superseded 2026-08-17** by `docs/specs/2026-08-17-character-walk-animation.md`. Every character, the protagonist included, now has a distinct stride pose in each direction's second atlas cell. The protagonist's stride is derived from its authored idle frames, and the byte-identical-pair exception described below no longer holds.


## Goal

Test the supplied rounded, black-haired protagonist in the real game. The character floats along the existing path instead of showing leg-based walking. When horizontal travel starts, the body leans into the movement and settles like a rounded Russian doll with weight at its base.

This is a protagonist-only visual trial. NPC movement and NPC art do not change.

## Player-visible behavior

1. The supplied front, rear, left, and right views map to down, up, left, and right travel.
2. The protagonist remains inside the existing `24×30` world cell.
3. Hair is black with a small charcoal highlight ramp. Skin, teal clothing, gold strap, outline, scale, and proportions stay faithful to the supplied reference.
4. Movement uses one stable pose per direction. The eight-cell atlas contract remains, but each direction's two protagonist cells are byte-identical for this trial. This is an explicit protagonist exception to the existing lower-leg frame-difference gate; NPC frame-pair checks remain unchanged.
5. Up and down travel floats without bounce, lean, foot changes, or sprite cycling.
6. Left and right travel floats and rotates around the bottom-center of the sprite.
7. The bottom-center pivot stays planted while the upper body wobbles.
8. The shadow stays centered. It does not slide with the upper body.
9. When movement is idle, waiting, unreachable, or reduced-motion, the angle is exactly zero. A pause freezes the current angle and resumes from that exact point.

## Wobble curve

The wobble starts when a pure horizontal run starts. A run starts at a new left/right movement request or when a route turns from vertical or diagonal travel into pure horizontal travel. Continuing across adjacent horizontal tiles does not restart the wobble.

Track `horizontalRunDistance` in presentation movement state. Reset it when a pure horizontal run starts: movement changes from idle, vertical, diagonal, or the opposite horizontal direction into left/right travel. Do not reset it at each `beginSegment` for consecutive same-direction horizontal tiles. Advance it by the exact sampled travel distance only while facing left or right. Do not use wall-clock time.

The existing direction contract remains authoritative: diagonal steps use front/rear art and have zero rotation, even though their translation has a horizontal component. A vertical or diagonal segment ends the current horizontal run. A later pure horizontal segment starts a new wobble.

Retarget precedence is explicit:

- An immediate request made without an active segment resets the run.
- A request made during an active segment remains pending until that segment commits, as it does today.
- When the pending target is applied, snapshot the completed direction and distance, run the normal replan, then carry `horizontalRunDistance` only if the completed facing and the first step of the returned path are the same pure left/right direction.
- Reset it when the new path begins vertical, diagonal, idle, or in the opposite horizontal direction.

Cancellation preserves the current run through an already-active segment so the body does not snap upright. Reset only when that segment commits and the stop takes effect. Cancellation without an active segment resets immediately.

Entering `waiting` or `unreachable` resets the run and renders upright. If a blocker clears, an automatic replan succeeds, or a yield route starts later, its first pure horizontal segment begins a new run rather than resuming the old wobble.

For horizontal travel:

```text
p = clamp(horizontalRunDistance / 96, 0, 1)
directionSign = left ? -1 : +1
angleDegrees = directionSign * 10 * sin(3 * PI * p) * (1 - p)^2
```

The curve has these properties:

- Starts upright with immediate forward acceleration.
- Reaches about `+7°` near 16 px.
- Returns upright at 32 px, which is the end of the first cardinal tile.
- Reaches about `-2.5°` near 48 px.
- Returns upright at 64 px.
- Adds one very small final forward settle before reaching zero at 96 px.
- Has no route-end snap for one-, two-, or three-tile horizontal runs.
- Uses the opposite sign for left travel.

The constants are tuning values, not simulation rules. Visual review may lower the amplitude or shorten the settle distance. It must not change path timing, collision, reservations, committed tiles, or save data.

## Rendering contract

Use the existing Skia `Atlas` batch and `RSXform` transforms. Add rotation only to the transient character placement.

For the protagonist in all directions and both frame indexes, force the legacy movement offsets to `leanX = 0`, `bounceY = 0`, and `shadowX = 0`. NPC presentation remains unchanged.

Rotate around source point `(12, 29)` in the `24×30` cell. This intentionally uses the bottom art row, two pixels below the legacy row-27 foot anchor. Preserve the bottom point's current world position; the shadow remains at the existing foot anchor. At zero angle, placement is byte-for-byte equivalent to the existing translation.

With curve output `angleDegrees`, zoom `z`, source pivot `(px, py)`, and current top-left placement `(worldX, worldY)`:

```text
thetaRadians = angleDegrees * PI / 180
scos = z * cos(thetaRadians)
ssin = z * sin(thetaRadians)
tx = (worldX + px) * z - (scos * px - ssin * py)
ty = (worldY + py) * z - (ssin * px + scos * py)
```

Carry the angle on an optional character-placement field. Consume it only when building the character atlas transforms. The shared helper's zero-angle path must remain unchanged for floors, details, props, walls, and roofs.

Use nearest-neighbor atlas sampling. Do not add tween libraries, physics engines, per-frame React animations, or runtime sprite-layer composition.

The physical-pixel snap contract still applies to the unrotated bottom pivot. The rotated quad is allowed to occupy non-axis-aligned physical pixels; nearest-neighbor sampling must remain enabled.

Static floor, prop, wall, roof, and effect batches must remain unchanged.

## State and determinism

- `horizontalRunDistance` is transient movement state. It is not domain state and is not saved.
- Reset it on an immediate request, cancellation without an active segment, completed active cancellation, waiting, unreachable, teleport, portal transition, or start of a different run. Apply the pending-retarget carry predicate after the normal replan returns, as described above.
- Increase it using the same bounded movement delta already used by the deterministic movement clock.
- The pure wobble function must return the same angle for the same direction, status, distance, and reduced-motion flag.
- Game speed changes how quickly distance is covered, so the wobble naturally speeds up at `2×` without a separate timing path.
- Pausing does not change status, distance, or angle. Resuming continues from the exact prior presentation point.
- The deterministic trace and packaged proof record `horizontalRunDistance` and `protagonistWobbleDegrees` so the acceptance gates are machine-checkable.

## Reduced motion

Reduced-motion mode keeps continuous positional travel and the correct directional sprite. It disables rotation, bounce, lean offsets, and shadow offsets. The result is a stable floating character. Turning reduced motion off mid-run derives the current angle from the distance already travelled; it does not restart the run.

The standing alternating-leg requirement remains valid for NPCs. The protagonist keeps its internal frame counter for compatibility and evidence, but both cells for a direction render identical pixels.

## Non-goals

- No change to NPC art or NPC movement.
- No spring physics solver.
- No ragdoll or collision-driven rotation.
- No vertical wobble in this trial.
- No changes to pathfinding, turn curves, reservations, speed, simulation, saves, or map geometry.
- No claim that all characters should adopt this look until the protagonist trial is approved.

## Acceptance criteria

- [ ] The real game uses the new black-haired protagonist in all four directions.
- [ ] The protagonist floats; no leg-step or one-pixel bounce is visible.
- [ ] Left starts lean left and right starts lean right.
- [ ] The first lean is clearly larger than the counter-wobble.
- [ ] The wobble settles to exactly zero within 96 px of a horizontal run.
- [ ] One-tile horizontal travel ends upright.
- [ ] A vertical-to-horizontal turn starts one wobble without restarting at every tile.
- [ ] Diagonal front/rear travel remains upright; a later pure left/right segment starts a new wobble.
- [ ] A same-direction deferred retarget does not restart an active horizontal wobble.
- [ ] Active cancellation preserves the current angle through the segment commit, then resets without a snap.
- [ ] Waiting, blocker recovery, automatic replan, and yield-route restart all render upright before any new horizontal run.
- [ ] The bottom-center pivot remains visually planted during rotation.
- [ ] Reduced-motion travel has zero rotation.
- [ ] Existing NPC walk animation remains unchanged.
- [ ] Existing collision, route, interruption, save, and deterministic trace tests remain green.
- [ ] New unit tests cover left/right signs, peak/counter-wobble ordering, tile-boundary zeros, final settle, resets, and reduced motion.
- [ ] Unit tests prove all protagonist legacy offsets are zero and all NPC offsets remain unchanged.
- [ ] Atlas tests prove protagonist frame pairs are byte-identical while NPC frame-difference gates remain active.
- [ ] Deterministic and packaged traces record the wobble distance and angle.
- [ ] A zero-angle transform exactly matches the legacy translation.
- [ ] Pivot invariance holds for sample left/right angles at zoom `1×`, `2×`, and `3×`.
- [ ] A real pending-target movement sequence carries same-direction run distance and resets it for a different next direction.
- [ ] Real local captures cover left, right, up, down, one-tile travel, long travel, a turn, interruption, `1×/2×/3×` zoom, and reduced motion.
- [ ] Review and tuning repeat until the motion reads as a weighted rounded-body wobble, not jitter, sliding, or a pendulum.

## Review questions

1. Is distance-based damped rotation the smallest deterministic fit for the existing movement clock?
2. Does the direction-run reset cover turns, retargeting, blocking, cancellation, and arrival without hidden snapping?
3. Is bottom-center `RSXform` rotation safe inside the current character atlas batch at all integer zoom levels?
4. Are the reduced-motion and test requirements complete?
