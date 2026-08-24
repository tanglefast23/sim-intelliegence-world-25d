# Pencil Character Rig v1

**Status:** Draft master specification
**First character:** `vampire-01`
**Renderer:** Existing SI World 2.5D pencil renderer
**Method source:** KinderGrimm part, pivot, pose, and attachment ideas

## 1. Outcome

Give the vampire a small 2D character rig without changing the world renderer.

The rig must provide:

- movable hands;
- an item that follows a hand;
- procedural arm reaching;
- hair movement separate from the head;
- standing, walking, and sitting poses from one joint model;
- rig-local body overlap protection;
- deterministic skeletal pose animation.

The renderer must still receive one complete `120x180` RGBA frame. The world must still draw one pencil billboard batch. No body part becomes a Three.js mesh.

## 2. Current code facts

- `src/render/pencil/layout.ts` fixes the pencil frame at `120x180`.
- `src/render/pencil/billboard.ts` selects a complete baked frame and copies it into the pencil atlas.
- `src/render/three25/world-renderer-25.ts` clears and uploads one pencil atlas, then builds one pencil billboard mesh.
- `src/render/pencil/generated-vampire.ts` draws the current standing and walking vampire from the KinderGrimm recipe.
- `src/render/pencil/seated-vampire.ts` already draws ordered vampire parts from hip, knee, ankle, shoulder, elbow, and wrist points.
- `src/render/world-frame.ts` already carries facing, movement, pose, reduced motion, and the animation clock.
- Gameplay movement and collision remain tile-based.
- KinderGrimm `rig.js`, `part.js`, and `anim.js` prove the useful concepts: named parts, pivots, pose offsets, groups, attachment following, pose blending, and planted feet.

The seated vampire is the closest local pattern. The implementation must extend it instead of adding a second animation framework.

## 3. Scope

### Shipping in v1

- `vampire-01` uses the rig for idle, walk, and seated frames.
- All four facings work: front, rear, left, and right.
- Both arms have shoulder, elbow, and hand points.
- Both legs have hip, knee, and foot points.
- Head, hips, and hair have named anchors.
- A right or left arm can reach a frame-local target.
- A held pencil item follows the chosen hand.
- The first held item is a small brass lantern recipe used for acceptance evidence.
- Hair has a small deterministic follow offset while moving.
- Hands and held items are kept outside protected head and torso regions.
- Reduced motion removes decorative interpolation and hair lag.
- The old standing and seated frame functions remain available as a safe fallback during rollout.

### Not shipping in v1

- GPU skinning or separate runtime body-part meshes;
- a physics engine;
- changes to world pathfinding or tile collision;
- inventory or quest integration;
- automatic selection of nearby world objects;
- combat hit boxes or damage rules;
- a visual rig editor;
- a universal human or animal skeleton;
- rigging another character or an animal;
- combined seated reach or seated holding;
- separate rig intent for two actors that share `vampire-01` in one frame.

The rig input is a render contract. Gameplay can supply held items and reach targets later.

## 4. Core model

Use frame-local joint points, not a general matrix hierarchy.

```ts
export type PencilRigJointId =
  | 'hips' | 'head' | 'hair'
  | 'leftShoulder' | 'leftElbow' | 'leftHand'
  | 'rightShoulder' | 'rightElbow' | 'rightHand'
  | 'leftHip' | 'leftKnee' | 'leftFoot'
  | 'rightHip' | 'rightKnee' | 'rightFoot';

export type PencilRigPose = Readonly<{
  facing: VampireFacing;
  joints: Readonly<Record<PencilRigJointId, Point>>;
  hairAngleDegrees: number;
}>;

export type PencilRigIntent = Readonly<{
  reach?: Readonly<{
    hand: 'left' | 'right';
    target: Point;
    weight?: number;
  }>;
  heldItem?: Readonly<{
    item: 'brass-lantern';
    hand: 'left' | 'right';
  }>;
}>;
```

Joint points use the same design coordinates and `F.body(...)` mapping already used by `seated-vampire.ts`. There is one authored rest pose per facing and pose kind. Walking applies small deterministic offsets to those points.

Authored points are mapped through `F.body(...)` or `F.head(...)` once. All reach, distance, angle, frame-bound, and collision math then uses final canvas pixels in the `120x180` sheet. `reach.target` is already in this post-mapping canvas-pixel space. The world-frame builder copies it without conversion. A seated wrist maps to the arm's `hand` endpoint. A seated ankle maps to the leg's `foot` endpoint. The drawn hand and boot extend from those endpoints.

`PencilRigIntent` is optional on `WorldActor` and `WorldCharacterPlacement`. Existing callers need no changes. The world-frame builder copies the intent without interpreting it.

The pencil atlas has one slot per visual ID, not per actor. A later duplicate overwrites the same slot, so both actors display the last blitted vampire frame. Separate intent for duplicate vampires is unsupported in v1. Production content must contain exactly one `vampire-01`, the player.

## 5. Pose evaluation

Evaluation order is fixed:

1. Choose the authored base pose from facing and `CharacterPose`.
2. Apply the current gait phase when the character is moving. With reduced motion, use the idle stance and skip gait offsets.
3. If an item is held without reach, apply its authored carry pose. Otherwise apply reach to the chosen arm.
4. Clamp joints to authored angle and distance limits.
5. Project hands and held items out of protected body regions.
6. Apply planted contact correction.
7. Calculate hair follow.
8. Draw ordered parts and the held item into one `Sketch`.

### Idle and walk

The current generated vampire silhouette remains the visual reference. Idle keeps both feet planted. Walk uses the existing two gait phases and three boil frames. The new rig draws the normal idle and walk sheets. The old sheets remain fallback and comparison evidence; byte identity is not required after articulated limbs and hair ship.

The rig may change limb geometry where separation is needed. It must not redesign the head, pointed collar, face, palette, body proportions, or clothing.

### Sitting

The seated pose starts from the current `legPoints()` and `armPoints()` geometry in `seated-vampire.ts`. It uses the same ordered layers:

1. far upper leg;
2. far lower leg;
3. far boot;
4. torso;
5. near upper leg;
6. near lower leg;
7. near boot;
8. far arm;
9. head and hair;
10. near arm;
11. collar.

The hip anchor, not the feet, is planted while seated. Existing chair depth and lift rules in `pencilBillboards()` stay unchanged.

V1 ignores reach and held-item intent while seated. The current rear-chair mask removes rows that contain the seated arms. Supporting seated reach or holding needs a separate chair foreground mask and is a later combination, not one of the seven base capabilities.

## 6. Arm reach and movable hands

Each arm is a two-segment chain.

Use a small analytic two-bone inverse-kinematics solver. Inverse kinematics means: give the solver a hand target, and it finds the elbow position.

- The shoulder stays at the authored point.
- Upper-arm and forearm lengths stay fixed.
- The target is clamped to the arm's reachable circle.
- Each facing has an authored elbow bend direction.
- `weight` blends from the normal arm to the solved arm.
- The final hand stays within the `120x180` frame margin.
- Invalid values fall back to the base arm.

The solver uses only `Math.hypot`, `Math.acos`, and basic arithmetic. No dependency is added.

## 7. Held items and anchors

Each hand exposes a grip anchor at its resolved hand point and forearm angle.

The lantern has:

- a stable recipe ID;
- a grip offset;
- a grip angle for each facing;
- a draw position immediately after the selected hand and arm layer;
- a small protected circle used by overlap correction.

The item draws into the same character `Sketch`. Near and far arm mapping selects its depth for every facing. It adds no atlas slot, mesh, material, or draw call.

The current rear-facing art hides normal hand blobs. While a rear-facing hand reaches or holds an item, draw that grip hand blob with the arm. Keep rear hands hidden when there is no reach or held item.

If an item is present without a reach target, the chosen arm uses an authored carry pose. If both are present, the item follows the reached hand.

This proves automatic holding. It does not connect the lantern to inventory state.

## 8. Hair movement

Split hair control from head control without rewriting the hair art.

Add an optional angle and offset to `drawHair()`. The head keeps its current geometry. Hair follow is a pure function of facing, gait, moving, boil index, and reduced motion. It never reads raw `animationTimestampMilliseconds`.

Use a clamped discrete offset, not a spring simulation. This avoids stored physics state, bakes into the existing sheet keys, and stays deterministic from the current frame inputs.

- Idle hair remains at its authored angle.
- Walking hair trails by a small facing-aware angle.
- Seated hair remains near its authored angle.
- Reduced motion sets the angle and offset to zero.

Hair must not expose scalp gaps in any facing.

## 9. Body-part collision

This feature is rig-local visual collision. It is not gameplay collision.

Use only these protected regions:

- one head ellipse;
- one torso capsule;
- one small circle that represents the held item's volume.

Resolve reach or carry first. Project the lantern out of the protected body regions, then back-solve the hand through the grip offset. Solve the elbow, project the hand out of the head and torso again, and clamp to arm limits. Recheck both the hand and lantern. If no reachable non-overlapping point exists, use the authored carry or base arm pose. Body exclusion wins over exact target contact. The hand does not collide with its own held item.

This prevents the reported class of defects where a hand, arm, or held item appears to grow through the neck, face, or chest.

Do not run general part-versus-part collision. Do not expose hit boxes to gameplay in v1.

## 10. Drawing and renderer integration

Create one rigged vampire frame function beside the existing frame functions.

It must reuse:

- `Sketch` and `hashSeed`;
- the current layout and KinderGrimm recipe;
- current head, face, collar, cloak, and media draw functions;
- the limb and seated point patterns already in the repository;
- current boil, facing, and gait indexing.

`blitPencilFrame()` chooses the rigged vampire frame when `visualId` is `vampire-01`. This includes normal idle, walk, and sit frames. Other characters keep their current path.

The Three.js renderer remains unchanged unless a measured test proves a required atlas update fix. It must still upload one complete pencil atlas and draw one pencil mesh.

## 11. Determinism and reduced motion

- Do not use `Math.random()`.
- Derive boil marks from `hashSeed()` and stable IDs.
- Derive pose only from world-frame values.
- Clamp `weight` to `0..1`.
- Treat non-finite targets as absent.
- Keep all results inside frame-local bounds.
- The same inputs must return identical RGBA bytes.

With reduced motion:

- keep the existing frozen boil frame;
- keep functional reach and holding;
- use the idle stance and skip gait offsets before reach or holding;
- snap directly to the requested pose;
- remove hair follow;
- keep the current reduced-motion walk behavior.

## 12. Performance budget

The initial implementation bakes the no-intent idle, walk, and sit sheets from the rig. Reduced motion explicitly selects the idle rig stance, skips gait offsets, and forces hair follow off before reach or holding.

Frames with a reach or held item use one bounded last-frame cache for the single rigged vampire. Reach coordinates are rounded to whole canvas pixels. The key contains visual ID, facing, gait, pose, boil, reduced motion, reach hand, rounded target, clamped weight, held item ID, and held-item hand. A new key replaces the prior dynamic frame. There is no growing frame map.

Budgets on the current hidden renderer check:

- zero new Three.js draw calls;
- zero new runtime dependencies;
- unchanged `120x180` atlas slot size;
- no frame-wide scheduler;
- no per-part GPU upload;
- a cached rig frame with no changed input performs no new composition;
- one changed vampire rig frame must compose in at most `2 ms` at p95 in the focused benchmark.

The focused benchmark lives with the rig tests. It warms 20 frames, measures 200 composed frames with `performance.now()`, and reports p95. The `2 ms` value is a local engineering gate, not a cross-machine unit-test assertion. The hidden renderer check remains the player-facing draw-call and frame-time gate.

The existing renderer already refreshes the full pencil atlas. This work does not add another upload.

## 13. Fallback and migration

- Keep `bakeGeneratedVampireFrames()` until visual and test gates pass.
- Keep `bakeSeatedVampireFrames()` until the rigged seated pose passes its gate.
- Gate the new path to `vampire-01`.
- A missing or invalid rig intent renders the normal rig pose, not a blank frame.
- A rig composition error falls back to the matching old vampire frame and logs once.
- Do not change non-vampire rendering.

After acceptance, the old vampire functions can remain as test references. Their removal is a later cleanup, not part of this change.

## 14. Verification

### Unit checks

- the arm reaches reachable targets within one pixel;
- unreachable targets clamp without `NaN` values;
- elbow bend stays correct in all four facings;
- held lantern position matches the selected hand;
- hand collision keeps the hand outside the head and torso regions;
- planted feet do not move during upper-body reach;
- seated hips stay at the seat anchor;
- reduced motion removes hair follow and pose interpolation;
- identical inputs return identical frame bytes;
- non-vampire frame selection is unchanged;
- production content contains exactly one `vampire-01`; duplicate actors are documented as sharing the last blitted frame.

### Visual checks

Generate hidden, silent artifacts for:

- current vampire baseline, four facings;
- rigged idle, four facings;
- rigged walk, both gait phases and four facings;
- rigged seated, four facings;
- right-hand reach near and far;
- left-hand reach near and far;
- lantern carry and lantern reach;
- hair follow next to reduced-motion hair;
- a deliberate face-overlap target showing collision correction.

Capture one hidden in-world vampire frame after the renderer integration. Do not use a visible Electron window.

### Required commands

- focused rig and pencil tests;
- TypeScript type check;
- full test suite;
- existing art/content verification;
- hidden renderer performance and draw-call check.

## 15. Acceptance criteria

1. The normal vampire still reads as the approved vampire in all four facings.
2. The pointed collar, face, clothing, palette, proportions, and foot contact remain intact.
3. Both hands can move through a tested reach input.
4. The lantern follows either selected hand with correct depth.
5. A hand or lantern cannot pass through the protected head or torso regions.
6. Walking hair moves separately and reduced-motion hair does not.
7. Sitting uses rig joints and preserves current chair contact and depth behavior.
8. Idle, walk, sit, reach, and hold all finish as complete flat RGBA frames.
9. The world still uses its current tile collision and 2.5D renderer.
10. The rig adds no Three.js draw call or runtime dependency.
11. All focused and full tests pass.
12. Hidden visual evidence shows no neck growth, scalp gap, floating feet, or item z-order error.
13. Identical rig inputs return identical RGBA bytes, including repeated runs and reduced-motion inputs.

## 16. Reuse after v1

Do not create a universal rig from one vampire.

When a second biped is requested, reuse the joint solver and define new authored points and protected regions. When an animal is requested, reuse only the solver and attachment concepts. Add an animal-specific joint list then.

This keeps the useful KinderGrimm method reusable without forcing vampire anatomy onto animals.

## 17. Independent proposal synthesis

Opus 5 and Grok independently agreed on the flat-frame compositor, two-bone reach, hand anchors, pose blending, reduced-motion rules, fallback, and separation from gameplay collision.

The master spec rejects three larger proposals:

- no general affine matrix engine, because the repository already uses joint points;
- no frame-wide recomposition scheduler, because one rigged vampire does not need it;
- no public body hit-volume API, because the requested collision is visual overlap protection.

These can be added only after profiling or a real gameplay consumer proves the need.

## 18. Audit decision log

### Round 1 — Opus 5 and Grok

Accepted:

- define every solver and collision calculation in final canvas pixels;
- use one bounded last-frame cache with rounded reach coordinates and a complete key;
- document the atlas limit of one dynamic frame per visual ID;
- use three-point limbs and map wrist/ankle endpoints to hand/foot;
- attach item depth to the chosen near/far hand layer;
- correct held-item overlap through the grip before the final arm solve;
- generate normal pose sheets through the rig so hair motion can ship;
- make seated reach and holding an explicit later combination because the rear-chair mask removes the arm band;
- add a direct determinism acceptance gate and a concrete local benchmark method.

Rejected:

- requiring new no-intent frames to remain byte-identical to the old renderer. That would prevent the requested articulated limbs and hair from changing the shipping vampire. The old frames remain fallback and visual comparison evidence instead.

### Round 2 — Opus 5 and Grok

Accepted:

- state that reach targets arrive in final canvas-pixel space;
- make reduced motion select idle geometry before applying reach or holding;
- use only facing, gait, moving, boil, and reduced motion for hair follow;
- include the carry pose in the fixed evaluation order;
- recheck collision after grip correction and fall back when no safe point exists;
- draw a rear grip hand only while that hand reaches or holds;
- document the real last-write-wins behavior for duplicate visual IDs and enforce one production vampire.

No round-2 finding required a new renderer, dependency, scheduler, or gameplay system.
