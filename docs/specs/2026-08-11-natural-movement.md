---
title: "Natural click-to-move and readable walking"
type: specification
date: 2026-08-11
status: council-reviewed-final
base_sha: b4b014397be82cdccee60cb3bed3ee3e9ef02ff1
---

# Natural click-to-move and readable walking

> **Superseded 2026-08-17** by `docs/specs/2026-08-17-character-walk-animation.md`. Every character, the protagonist included, now has a distinct stride pose in each direction's second atlas cell. The protagonist's stride is derived from its authored idle frames, and the byte-identical-pair exception described below no longer holds.


## 1. Outcome

Click-to-move must look like a person crossing a place, not a chess piece moving on hidden graph paper.

The player and active NPCs must:

- choose direct diagonal routes across open space;
- avoid long forced Y-then-X or X-then-Y movement when a safe direct route exists;
- move continuously between tile centers instead of teleporting one tile per timer tick;
- soften safe turns without entering a wall, object, closed door, water tile, or occupied actor cell;
- show the existing two walking frames as visible alternating footfalls;
- keep direction, feet, bounce, lean, and shadow motion specific to each actor;
- remain deterministic at the authoritative tile and path level;
- remain crisp at the locked `1x`, `2x`, and `3x` integer zoom levels.

This phase changes navigation and presentation. It does not change the map scale, character size, building collision authority, or save format.

## 2. Confirmed baseline

The current implementation has four relevant limits:

1. `findCardinalPath()` expands only north, west, east, and south neighbors. Equal-cost routes become long axis-aligned runs.
2. `stepMovement()` changes an actor by one complete `32×32` tile every movement timer tick. No in-between world position exists.
3. `WorldScene` owns one global walk frame. It follows player movement, while active NPCs render with a default downward direction.
4. Normal gameplay draws one path dot at every planned tile center. This makes the grid route more visible.

The existing art is sufficient for the first natural-movement pass:

- `24×30` character cells on `32×32` tiles;
- front, rear, left, and right walking directions;
- two frames per direction;
- authored alternating front and lateral legs;
- rear frames generated from the front source;
- `145 ms` walking-frame timing;
- one-pixel lean, bounce, and shadow offsets.

## 3. Locked product behavior

### 3.1 Player input

- Left click remains the only movement command.
- A new click replaces the remaining route.
- A click during an active tile segment does not snap the actor. The actor finishes that segment, then follows the new route calculated from its reserved destination tile. A pending replacement target disables any turn blend that has not started.
- Escape stops after the active segment. The maximum stop delay is one segment.
- A blocked destination keeps the existing red invalid marker and `NO ROUTE` feedback.
- Clicking an object continues to route to its deterministic valid approach tile.
- Clicking an NPC selects the visible NPC and stops the player after the active segment.

### 3.2 Route appearance

- Open-space routes can use all eight neighboring tiles.
- A diagonal step is legal only when the destination and both adjacent cardinal side tiles are walkable. The route can never cut across the corner of a solid tile.
- A route can use small visual curves at a change in direction. Curving is presentation only. Authoritative movement still commits one path node at a time.
- A turn that cannot pass the presentation-clearance check remains a straight, sharp turn.
- Normal gameplay does not show the full tile-center breadcrumb route. A development proof can show path nodes, reservations, and sampled curve points.

### 3.3 Walking appearance

- Each moving actor has its own facing direction, walk phase, world position, and shadow position.
- At world speed `1`, the two existing atlas frames alternate for each `32 world pixels` of travel. One cardinal tile takes `145 ms`, so this keeps the approved base timing.
- An idle actor uses frame 1 and no bounce.
- The feet must visibly exchange lead position in front/rear and lateral movement. The torso, head, hair, and accessory do not need more atlas cells.
- A small vertical bounce, one-pixel body lean, and one-pixel shadow shift remain available. They follow the actor's own foot phase.
- Upward and upward-diagonal travel uses the rear cells. Downward and downward-diagonal travel uses the front cells. Pure left and right travel uses the lateral cells.
- Direction selection uses a stable previous-facing rule at exact diagonal ties. It must not flicker between two cells on consecutive render frames.
- The first pass accepts that a diagonal actor faces front or rear while also translating sideways. The player-visible proof must test this compromise before any three-quarter art is proposed.

### 3.4 Speed and pause

- Movement uses one constant world-space speed between route start and route arrival. A diagonal covers more distance and therefore takes longer than one cardinal step.
- At world speed `1`, a cardinal tile takes `145 ms`. A diagonal tile takes `205 ms`, derived from the true `sqrt(2)` distance at the same world-space speed. The deterministic `14:10` ratio is for A* route cost only.
- World speed `2` scales both durations by the existing effective-speed rule.
- World speed `0`, a conversation, a journal or relationship panel, a transition, sleep, and other pause tokens freeze presentation progress and foot phase.
- Resuming continues from the exact prior presentation point.
- World-speed scaling also scales gait distance per real millisecond. The `145 ms` art timing is the base timing at world speed `1`; speed `2` intentionally shows faster simulation and faster feet.

### 3.5 Reduced motion

- Required position travel remains continuous so the actor does not teleport.
- Reduced-motion mode disables bounce, lean, shadow shift, and optional route-level ease.
- Reduced-motion mode uses the same collision-safe route, linear segment interpolation, constant speed, and alternating leg frames.

## 4. Deterministic navigation contract

Replace the production cardinal path with one deterministic eight-neighbor A* path.

### 4.1 Integer costs

- Cardinal step cost: `10`
- Diagonal step cost: `14`
- Heuristic: octile distance, `14 × min(dx,dy) + 10 × (max(dx,dy) - min(dx,dy))`
- No floating-point value participates in path cost, comparison, or tie-breaking.

### 4.2 Stable expansion

Use one exported, tested neighbor order. Node comparison remains stable through:

1. total `f` cost;
2. heuristic `h` cost;
3. tile row;
4. tile column;
5. insertion sequence.

Two searches with identical map data, blockers, start, and target must return byte-identical results.

### 4.3 Corner rule

For a diagonal from `(x,y)` to `(x+dx,y+dy)`, require all three keys to be free:

- `(x+dx,y)`;
- `(x,y+dy)`;
- `(x+dx,y+dy)`.

One pure blocker source exposes two explicit views:

- `isStaticMovementBlocked()` combines map bounds, non-walkable terrain such as water, compiled `blockedKeys` for walls and movement-blocking objects, and closed-door overlays. A* and its diagonal side rule use this view.
- `isSegmentClaimBlocked()` extends the static view with other actors' committed occupancy, edge claims, and reservations. Segment start, curve clearance, and pre-commit validation use this view. The exact paired head-on exchange is the only dynamic-occupancy exception.

The moving actor's own committed start tile is the only ordinary self exemption. A planned route can pass through a tile that is currently occupied, but the actor cannot start that segment until the dynamic claim resolves.

### 4.4 Actor reservations

- An actor reserves the next tile before it starts a segment. A latched turn blend also reserves the following path node and each tile touched by the curve's expanded clearance envelope.
- Player movement has first reservation priority. NPCs then resolve in stable NPC ID order.
- An actor cannot start a segment into a tile that is occupied or reserved by another actor.
- If the next node is dynamically unavailable before segment start, wait without discarding the statically valid route. After the yield budget, replan around the current dynamic snapshot or cancel to idle when no route exists.
- A started segment owns its destination until it commits, aborts through defensive invalidation, or resets through a map transition.
- A blocker-state mutation must respect active reservations. For defensive safety, the movement clock revalidates a destination before commit. If it became illegal, the actor does not commit. It releases the invalid reservation, returns its presentation to the committed center with no domain command, and replans or settles into a stable wait.
- Exactly opposing actors can resolve one head-on corridor conflict through a deterministic paired edge exchange. The pair is ordered by player first, then stable actor ID. Both edge destinations are reserved atomically, both committed tiles exchange in the same movement update, and their presentation uses opposite `3 px` perpendicular passing offsets. No third actor can reserve either endpoint or the edge during the exchange.
- All other reservation failures enter `waiting`, not a repeated per-frame replan. After four failed attempts, the lower-priority actor searches in stable tile order for the nearest reachable yield tile within six tiles. If none exists, it remains waiting and retries only when the blocker or target changes. This prevents a livelock even when physical progress is impossible.

Reservations are runtime presentation/navigation data. They are not saved in world state.

## 5. Continuous movement contract

### 5.1 Separate authority from presentation

The saved and deterministic world state continues to store whole map tiles. A new pure movement-clock module owns transient movement data:

- committed tile;
- reserved destination tile;
- remaining path;
- segment elapsed milliseconds;
- segment duration milliseconds;
- unrounded continuous foot-anchor position;
- stable facing;
- accumulated travel distance;
- pending replacement target or pending stop;
- status and feedback tile.

The module accepts an explicit elapsed duration. It must not read `Date`, `performance.now()`, React state, the DOM, Electron, or Skia.

### 5.2 Frame driver

- One `requestAnimationFrame` driver supplies bounded elapsed time to the player and active NPC movements.
- Clamp one submitted frame delta to `50 ms`. A suspended window must not produce a large catch-up jump through doors, portals, actors, or interactions.
- A submitted frame must commit each crossed tile in route order. With the `50 ms` clamp and current speed contract, this phase expects at most one ordinary segment commit per render frame.
- Every tile commit continues to use the existing domain command and reducer path.
- Portal detection, roof state, area labels, location state, and autosave use the committed tile.

### 5.3 Segment interpolation

- Cardinal and diagonal segment positions use deterministic constant-speed interpolation from foot-anchor center to foot-anchor center.
- Route start and route arrival can use one bounded acceleration or deceleration window outside the per-tile segments. The first implementation can omit this route-level ease. It must never slow at each tile center.
- A direction change can replace the final and initial straight portions with one quadratic corner blend.
- Default turn radius: `6 world pixels`.
- Maximum turn radius: one quarter of the shorter adjacent segment.
- Do not curve the first route start, final destination, portal boundary, or a segment next to an unavailable clearance tile.
- Parameterize an accepted curve by a deterministic arc-length table so travel speed does not pulse through the curve.
- Latch the curve decision when the actor enters the blend. A pending replacement target or stop prevents an unstarted blend. A blend that has started keeps its reserved envelope until its exit point.

### 5.4 Curve clearance

Before a corner blend is used:

1. Build the curve's world-space bounds expanded by a `3 px` foot-clearance radius.
2. Enumerate every map tile touched by those expanded bounds.
3. Require every enumerated tile to be in bounds and free under `isSegmentClaimBlocked()`, except the actor's own committed and curve-reserved tiles.
4. Sample the accepted quadratic curve at `t = 0, .125, .25, .375, .5, .625, .75, .875, 1` in development tests and prove every expanded foot point remains in the accepted tile set.

If any check fails, render the two straight portions. Collision safety has priority over a rounded look.

### 5.5 Pixel snapping

- Keep the unrounded foot anchor for movement calculations.
- Snap only the final render position to the physical pixel grid: `round(world × zoom × DPR) / (zoom × DPR)`.
- Apply the existing atlas offset after foot-anchor placement.
- Use nearest-neighbor atlas sampling only.
- The same sampled point controls the sprite, shadow, selection ring, camera center target, and visible hit target.
- Runtime receives DPR as presentation input. Deterministic route, collision, tile commit, and proof traces keep unrounded world coordinates and never depend on DPR.

## 6. Character and foot animation contract

### 6.1 No new cell count

Keep exactly eight world cells per character. Do not add full side profiles, diagonal cells, idle sheets, or runtime paper-doll composition in this phase.

### 6.2 Generated-art checks

For each character and direction pair, except the protagonist during the weighted-wobble trial defined in `2026-08-12-protagonist-weighted-wobble.md`:

- both cells must exist and be `24×30` RGBA cells;
- the lower leg-and-shoe region, rows `21–29`, must differ between frames;
- at least one shoe edge must change horizontal or vertical position;
- the two cells must remain inside their atlas bounds and gutter;
- the generated rear method and lateral-leg composition method remain the source of truth.

The weighted-wobble protagonist keeps all eight `24×30` cells, but each same-direction pair is byte-identical so its rounded body floats without a false leg step. This exception applies only to `characterId === 'protagonist'`; every NPC keeps the difference gate above.

If a character's foot difference is not readable at `1x`, adjust only its source leg commands. Do not redraw the full body.

### 6.3 Per-actor presentation

`buildWorldFrameState()` receives one presentation record per visible actor. It must not apply a single global direction or frame to the full cast.

Each record contains:

- continuous foot anchor;
- committed tile for depth and roof authority;
- facing;
- walking or idle status;
- walk frame;
- optional reduced-motion flag.

Walk frame is `floor(accumulatedTravelDistance / 32) mod 2` while moving. Route start uses frame 1. Pause freezes distance. Idle resets to frame 1. This keeps foot phase attached to distance on cardinal, diagonal, and curved travel.

Depth sorting uses the snapped visual foot-anchor Y and then stable actor ID. Roof hiding and domain interaction use the committed tile.

## 7. Player-visible route and interaction details

- Replace the permanent route dots with one destination marker that fades after `350 ms` or when the destination changes.
- Keep the red invalid marker until the next movement request or for at least `700 ms`, whichever is later.
- The selection ring follows the visible foot anchor.
- `F` centers on the visible player anchor during movement and the committed tile while idle.
- NPC selection hit testing follows the visible `24×30` sprite bounds. Stable actor ID resolves overlapping sprites.
- An interaction starts only from a committed valid approach tile. Presentation smoothing cannot trigger an object, NPC, roof, or portal early.

## 8. Performance and lifecycle

- Split static world batches, authoritative roof state, and transient actor presentation. The motion driver rebuilds only the small character, shadow, and selection transform batch. It does not rebuild floors, objects, walls, or roof atlas batches.
- The Phase 22 maximum-load scene must keep at least `55 FPS` at `2560×1440`, DPR 2, `1x`, during simultaneous player movement, active NPC movement, foot animation, and camera panning.
- No movement timer or animation frame remains after `WorldScene` unmounts.
- Background/resume delta is clamped. No actor jumps multiple unverified tiles after window suspension.
- Normal gameplay does not expose smoke-only movement controls. Proof hooks use the existing `SI_WORLD_SMOKE=1` gate.
- Runtime uses `requestAnimationFrame`, but every qualification trace uses an injected fixed `16 ms` delta sequence through the same pure clock. Route and motion reports must be byte-reproducible.

## 9. Compatibility and non-goals

### Included

- Player and active NPC pathfinding
- Safe diagonal nodes
- Per-actor reservations
- Continuous player and NPC presentation
- Safe small corner curves
- Per-actor direction, feet, lean, bounce, and shadow
- Pixel crispness at `1x`, `2x`, and `3x`
- Destination and invalid feedback
- Browser and packaged Electron proof

### Excluded

- New character directions or more than two frames per direction
- Full side-profile heads or bodies
- Sitting, combat, romance, job, swimming, vehicle, or stair animation
- Crowd steering, pushing, local avoidance circles, or physics
- Changes to `32×32` tiles or `24×30` world cells
- Fractional zoom
- Save-schema changes
- A navmesh or third-party pathfinding dependency
- Final sound effects such as footsteps

## 10. Verification gates

### 10.1 Pure tests

- Identical eight-neighbor searches return identical paths and visit counts.
- An open diagonal route contains diagonal steps and costs less than its cardinal-only equivalent.
- Every blocked-corner combination rejects the diagonal.
- Cardinal-only corridors remain traversable.
- Dynamic occupancy and reservations prevent same-tile commits. An edge exchange is legal only through the explicit paired head-on rule.
- Replanning keeps the active segment and replaces only the remaining route.
- Escape stops after the active segment with no visual snap.
- Segment timing is `145 ms` cardinal and `205 ms` diagonal at speed 1.
- Pause and resume preserve exact progress.
- Delta clamping prevents suspended-window catch-up.
- Water, solid-object, wall, and closed-door tiles fail both cardinal and diagonal walkability through the same blocker function.
- A head-on pair resolves through one atomic edge exchange, while a non-resolvable crowd conflict enters stable waiting without replan churn.
- A destination that becomes invalid before commit produces no illegal tile command.
- Curve sampling passes only with sufficient clearance and falls back to straight segments otherwise.
- Render snapping produces physical-pixel coordinates at all three zoom levels and at DPR 1 and 2.

### 10.2 Art and frame tests

- All production characters keep eight reachable cells.
- Both frames differ in the lower leg-and-shoe region for all four directions, except the byte-identical protagonist pairs used by the weighted-wobble trial.
- Idle uses frame 1.
- Player and NPC frames can differ in the same rendered frame.
- NPC facing is not forced to front while moving.
- Reduced-motion mode removes bounce, lean, and shadow shift but keeps continuous travel and leg frames.

### 10.3 Integration tests

- Player click, interruption, Escape, object approach, NPC selection, pause, portal, and no-route flows pass.
- Two NPCs that want the same tile resolve by deterministic priority without overlap.
- Roof hiding changes only after committed entry.
- Saves taken during movement contain the last committed valid tile and reload idle from that tile.
- The first-hour deterministic golden is updated intentionally and remains stable.

### 10.4 Player-visible proof

Create one smoke-only natural-movement journey in Sunward Villas:

1. Move the protagonist across an open diagonal route.
2. Turn around one furnished obstacle.
3. Interrupt the route with a second click.
4. Stop with Escape.
5. Move the protagonist and at least two NPCs at the same time.
6. Repeat one route at `1x`, `2x`, and `3x`.
7. Repeat with reduced motion.

The proof writes:

- a JSON route and motion trace with path nodes, segment costs, sampled positions, curve decisions, reservations, facings, frames, and committed tiles;
- start, diagonal, safe-turn, interruption, crowd, and reduced-motion PNGs;
- a short recorded sequence or ordered frame strip that proves in-between positions and alternating feet;
- FPS and visible-draw counts during simultaneous movement and pan;
- the tested source commit and hashes for all measured movement source files.

The trace uses the fixed `16 ms` replay driver. It records unrounded world positions plus DPR-snapped render positions. Repeating the proof twice against the same commit must produce the same JSON hash.

Acceptance requires:

- at least one legal diagonal segment in the open-space route;
- at least five distinct rendered positions inside one cardinal segment at `1x`;
- no sampled foot anchor inside a blocked tile;
- no two actors with the same committed or reserved tile;
- both walk frames visible for the player and one NPC;
- no visual position jump larger than the allowed frame-delta distance;
- at least `55 FPS` under the Phase 22 maximum-load conditions.

## 11. Review and delivery gates

1. Opus 5 and Grok 4.5 independently audit this draft for movement feel, deterministic correctness, collision safety, pixel-art clarity, accessibility, testability, and scope.
2. The orchestrator records disagreements and writes one synthesized final specification.
3. Write a file-by-file implementation plan from the final specification.
4. Grok 4.5 audits the implementation plan at high reasoning effort. Correct all confirmed findings before code starts.
5. Implement the approved plan in one focused phase branch.
6. Run pure, integration, art, browser, packaged, performance, and player-visible proof gates.
7. Grok 4.5 audits the implemented diff and evidence at high reasoning effort. Correct confirmed findings and re-audit corrections.
8. Commit only movement-phase files, create one pull request, merge through normal repository rules, and prove local `main` equals `origin/main`.

The user-owned generated PNG files and `output/` directory remain unstaged and unchanged.
