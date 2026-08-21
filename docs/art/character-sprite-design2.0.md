---
title: Character sprite design 2.0
type: architecture-reference
status: authoritative-reference
scope: 2.5D pencil character method, current implementation, and migration gates
task-entrypoint: character-sprite-authoring.md
rule-sources:
  - halcyra-art-bible.md sections 9.1 and 9.3 plus identity and originality clauses from 9.2
  - https://kindergrimm.vercel.app/how
last-reviewed: 2026-08-20
---

# Character sprite design 2.0

Use [character-sprite-authoring.md](character-sprite-authoring.md) first for every character task.
That guide conducts the interview, verifies the render path, and stops unsupported work. Load this
reference only after the task routes to the 2.5D pencil path or changes pencil architecture.

Every World Sprite targets this pencil method. Dialogue Icons and Cinematic Portraits use the
vampire portrait's block-pixel treatment, but they share the World Sprite's anatomy contract.
Cinematic Portraits are separate detailed assets, never enlarged Dialogue Icons.

This document combines three sources:

1. [Halcyra art bible §9](halcyra-art-bible.md#9-character-identity-and-proportions) supplies shared
   identity continuity, originality, silhouette, and two-feature rules.
2. [How a creature is drawn](https://kindergrimm.vercel.app/how) supplies the drawing and rig
   method.
3. GBrain slug `concepts/kindergrimm` records source architecture, constants, and traps.

The result is not a copy of Kindergrimm's creatures. It is SI World's character system, built with
Kindergrimm's procedural sketch method and calibrated for SI World's bright 2.5D world.

---

## 1. Current and target in one view

**CURRENT:** Gate A is complete. SI World has a versioned registry, twelve pencil visual IDs,
whole-character canvases, four-facing idle and walk states, and several pencil bodies on screen.
The vampire, Calder, Devon, Rafael, Sora, and Tomas are approved. Six creature recipes remain rejected human-template
prototypes. Priya has a literal skeleton renderer, but her revised world body remains in review. A
small Gate B slice now gives the ten assigned desk characters a part-separated, four-facing seated
pose. It does not convert standing locomotion or unlock arbitrary extra poses.

**TARGET:** every character world body uses a deterministic recipe with literal anatomy. A creature
recipe defines its skull or face, torso, limbs and contact, surface or material, and canonical
features before clothing. Dialogue portraits keep the existing vampire portrait style and the same
literal anatomy.

Five rules apply now:

1. **The head is the largest mass.** The current vampire default is `HEAD_SHARE = 0.56`.
2. **The silhouette carries identity.** Give each person one signature oddity and one supporting
   feature. Colour alone does not count.
3. **Parts describe shapes; the medium draws them.** Current parts use `tone` and `skin`; routing
   contours through `edge` remains open work.
4. **Stable choices happen before drawing.** A boil frame can change graphite wobble, not identity.
5. **Only characters boil.** The world keeps its drawn grain still.
6. **Archetype controls anatomy.** A human body with a creature feature or costume is rejected.

---

## 2. Authority and scope

### 2.1 Which rule wins

| Question | Authority |
|---|---|
| What must be decided before drawing? | `character-sprite-authoring.md` |
| Who is this person, and what makes them readable? | Art bible §9.1, §9.3, and identity/originality clauses in §9.2 |
| How does a shipping pencil character draw and move? | This document |
| What does the game implement today? | `src/render/pencil/` and its tests |
| Where did the procedural method come from? | Kindergrimm's live `how` page |

If code and this document disagree, do not silently trust either one. Confirm the shipping path,
fix the stale side, and update the test that protects the decision.

### 2.2 Shared identity law

These identity rules apply to World Sprites, Dialogue Icons, and Cinematic Portraits:

- One approved character brief defines one person across every view.
- All three surfaces must show the same archetype, skull or face, torso, limbs, surface,
  head mass, body, and signature item.
- A Dialogue Icon must remain clear at small size. A Cinematic Portrait must add authored detail,
  close framing, and clean anatomy instead of scaling the Dialogue Icon.
- Current `vampire-01` code uses a pencil body and a separate high-resolution pixel portrait. That
  split is the approved surface style but remains identity-sync debt. Keep both synchronized from
  one brief and review them side by side.
- Each person gets one primary signature oddity and one supporting feature.
- Both features change shape or add a readable object.
- The primary oddity survives front, rear, left, and right.
- No two production people share a primary oddity or a complete look.
- The oddity fits the person's job, habits, history, or attitude.
- Design the black silhouette before face detail or colour.
- Keep identities fictional and original. Do not copy a real person, full costume, badge, emblem,
  or exact known character silhouette.
- Never make a cruel stereotype the character's signature feature.
- A named creature must read as its archetype with clothing and accessories hidden.
- Canonical creature anatomy is not the character's signature oddity. It is the required base.
- Use recognizable public-domain archetype anatomy without copying one protected adaptation.

For the target world-body system, the stable source is a recipe. Portraits are not pencil drawings;
they match the existing vampire dialogue portrait and share the same approved identity brief.

### 2.3 What this document does not require now

Do not build speculative systems.

- Do not build all six Kindergrimm media. Graphite is the character medium now.
- Do not build a species generator until SI World needs generated crowds.
- Do not build an editor before recipes exist and two characters prove the contract.
- Do not add attack, sleep, run, or new sitting systems as more baked full-character canvases. The
  desk-seat slice reuses one shared anchor contract and the existing character-specific parts.
- Do not make world props boil. Their texture stays one frame.

---

## 3. Pencil render path

| Path | Current use | Source | Output | Rules |
|---|---|---|---|---|
| Pencil | Every character world body; six are approved and six remain in review | `src/render/pencil/` | A `120×180` transparent sketch sheet on a `42×60` world billboard | This document |

`src/render/pencil/billboard.ts` builds the pencil batch. The 2.5D renderer uploads visible pencil
frames into fixed horizontal texture slots.

This routing has three consequences:

1. A world-body edit belongs in `src/render/pencil/`.
2. Dialogue portrait pixels do not change the pencil world body.
3. New pencil identities use `PENCIL_CHARACTER_RECIPES`. Do not copy `vampire.ts` or add another
   special-case mesh.

---

## 4. SI World's style target

### 4.1 Borrow the method, not the lightness

Kindergrimm's source page uses light graphite on cream paper. SI World uses the same construction
method with darker values and bolder lines.

Joe selected this calibration in-game on 2026-08-19. The bright world and `NearestFilter`
minification erased thin, light marks at play zoom.

Current locked values:

- Sheet: `120×180`.
- World billboard: `42×60`.
- Head share: `0.56` from crown to sole.
- Body width scale: `0.8` relative to the original authored body.
- Main line width: `2.1 px` from `PEN_UNIT * 0.05`.
- Carried paper alpha: `0.94`.
- Dense black uses two textured passes and nearly closes its gaps.
- The vampire uses the graphite medium.

Match new characters to the vampire **in the game**, not to a source swatch at full sheet size.
Do not lighten the calibration without a new native play-zoom comparison.

### 4.2 Drawn mass, not flat vector fill

A pencil contour around a flat polygon is not this style.

- A dark mass is hatching, scribble, stipple, or another medium-owned stroke field.
- Paper remains visible between marks where the density allows it.
- A transparent sprite carries paper under each exposed mass. Otherwise grass shows through it.
- Different masses use different stroke directions. One angle everywhere joins the figure into one
  texture.
- A scribble is one chained wandering line, not many neat parallel segments.
- Colour is a translucent wash over construction, not an opaque replacement for it.

### 4.3 Character motion must remain legible

Correct motion can still disappear when adjacent values match.

The vampire's hair, cloak, and boots are nearly black. His boots use a pale ash band so the step
survives against the cloak. Every new character needs the same value check at play zoom. Add the
smallest value edge that reveals the motion; do not redraw the whole outfit.

---

## 5. Current implementation map

This table separates shipped facts from the target architecture. Do not describe a target as if it
already exists.

| # | Kindergrimm section | SI World today | Status | Target |
|---|---|---|---|---|
| 1 | Pencil | Filled-ribbon strokes, three sine bands, grit, breathing width, crumbs, erased bites, end overshoot, and seeded `mulberry32` | Shipped | Keep shared |
| 2 | Shape | `blobPts`, `jitterRing`, Chaikin smoothing, and nine head shapes | Shipped | Keep shared |
| 3 | Material | `tone` and `skin` are used; `edge` exists, but parts still call `sketch.broken()` directly; `CHARCOAL` exists in the module and tests, but character routing hardcodes graphite and props use crayon | Partial | Route contours through `media.edge`; add another selectable character medium only for a real need |
| 4 | Head | Nine envelope families, `HEAD_ROUND = 0.92`, and profile swell/collapse; creature-specific skull anatomy is not built | Partial | Keep envelopes shared; author literal skull or face anatomy per archetype |
| 5 | Map | `buildPencilLayout()` publishes shared transforms and anchors, but the working nose uses row 95 while stale `F.L.noseY` points to row 86 | Partial | Reconcile shared positions; let creature anatomy omit or replace human face anchors |
| 6 | Parts | Shared vampire primitives plus one prototype feature function for eight creatures | Rejected for creatures | Replace each prototype with creature-specific skull, torso, limb, surface, and canonical-feature drawing |
| 7 | Species | No casting table and no generated part params | Missing | Build only when generated populations need loaded dice |
| 8 | Boil | Three whole-character frames on one `1.15 fps` clock | Partial | Give each part its own three frames, speed, and offset |
| 9 | Face | One static face per facing; no blink or expression states | Missing | Lazy face states switched behind a blink |
| 10 | Pose | One idle plus two walk drawings for each of four facings; no bones or blend API | Partial | Poses write blended bone offsets |
| 11 | Seed | Versioned authored recipes and deterministic `hashSeed`; no saved JSON, locks, or part rerolls | Partial | Persist only if saves need recipe data |

Current correctness gaps that the older document hides:

- The published `F.L.noseY` is stale and unused. Do not replace working row 95 with row 86 merely
  to satisfy the anchor abstraction.
- Pencil parts use the medium for masses and washes, but bypass `media.edge()` for contours.
- Reduced-motion mode pins the pencil character to its current-facing idle and boil frame 0. Keep that
  regression test independent of the future bone rig.
- The eight creature prototypes all run through the same human anatomy. Their registry and routing
  tests pass, but their art status remains rejected.

### 5.1 The current frame budget

The current sheet contains:

- one idle for each of four facings;
- two walk frames for each of four facings; and
- three boil frames for every state.

That is `4 × 3 × 3 = 36` frames. At `120×180×4`, the raw frame data is about `2.97 MiB` per
character before texture overhead.

This budget is acceptable for the current cast and its fixed pose scope. It is the wrong curve for
many more poses.

---

## 6. Target architecture

The target pipeline is:

```text
versioned recipe
  -> authored values or species-biased gen()
  -> one character layout F
  -> ordered part registry
  -> one or more canvases per part and state
  -> THREE.Group bones and planes
  -> blended pose, expression, and autonomic animation
```

### 6.1 The recipe is the person

Target saved state:

```ts
{
  version,
  seed,
  archetype,
  anatomy: {
    base,
    skullOrFace,
    torso,
    limbsAndContact,
    surfaceOrMaterial,
    canonicalFeatures,
    absentHumanFeatures
  },
  medium,
  color,
  parts: {
    [partId]: { params, lock, rr }
  }
}
```

Rules:

- The same recipe must rebuild the same person on any supported machine.
- Each part gets an independent RNG stream from `seed`, `partId`, and `rr`.
- Incrementing `rr` rerolls one part only.
- `lock` keeps a selected part through a global reroll.
- An authored archetype and anatomy contract are stable identity. They are not generation hints.
- A future species profile can bias generated recipes. It cannot replace the anatomy contract.
- The recipe stores identity. Boil frame seeds store only redraw variation.
- Version the recipe before any recipe ships in a save.

Authored named characters can use explicit params first. They do not need a crowd generator.

### 6.2 One layout publishes every anchor

The layout runs once per character and returns `F`.

`F` owns:

- head scale and half width;
- head shape and head share;
- head-space and body-space transforms;
- eye, nose, mouth, chin, shoulder, hip, floor, and boot anchors;
- main and thin line weights;
- medium and colours; and
- conversion between character pixels and world units.

Parts may use authored offsets inside head or body space. They must call the layout transforms.
They must not invent a second chin, floor, eye row, or sheet origin.

Construction RNG and boil RNG stay separate. Layout must not change when a boil frame changes.

### 6.3 Parts stay small

The target part contract follows Kindergrimm's useful boundary:

```text
gen(rng, casting)       -> plain recipe params
bones(params, F)        -> one or more attachment records
size(params, F)         -> canvas bounds
draw(sketch, params, state, F, bone)
```

A part can also declare state names, layer order, depth, species limits, base limits, pivot, or
region when a real use requires them.

Part rules:

- One feature is one small file plus one registry line.
- The registry draws behind parts first and front parts last.
- Depth ranks are unique.
- A held item hangs from the shoulder/arm rig. It does not invent a world-space anchor.
- Stable style, side, length, and shape choices live in params, not `draw()`.
- A part asks the medium how to render a mass. It does not call a graphite-only fill helper.
- A part can request darkness and stroke direction. The medium owns the technique.

### 6.4 Archetype anatomy is required; species generation is optional

An authored creature recipe must define literal anatomy even when no generator exists.

- `skullOrFace`: skull, sockets, muzzle, jaw, brow mass, ears, crown, or constructed head.
- `torso`: flesh, fur, ribs, shroud, armour, assembled mass, or another real body structure.
- `limbsAndContact`: arms, claws, bones, legs, paws, vapor taper, float height, and floor rule.
- `surfaceOrMaterial`: skin, fur, bone, spectral haze, stitched flesh, scales, or another covering.
- `canonicalFeatures`: the minimum features that make the archetype readable without clothing.
- `absentHumanFeatures`: human features that must not be drawn, such as skin, hair, nose, or flesh.

Draw the anatomy base first. Add the individual's oddity, clothing, and role object afterward. A
skeleton with ribs printed on a sweater fails. An orc with human skin and attached tusks fails.

A creature-specific skull, torso, or limb drawing can use the current full-character canvas when
the four-facing biped locomotion and floor rule stay unchanged. It does not need a species generator
or bone rig.

Species generation is loaded dice.

A species is data that biases `gen()`.

Use the cheapest lever that creates the needed difference:

1. Change weighted options.
2. Change a shared shape param, such as a muzzle lobe.
3. Add a new part only when it needs its own canvas, layer, bone, or state.

A dog is not a duplicate character system. A muzzle is usually a skull param. Wings qualify as a
part because they need their own layer and motion.

Do not build species generation until SI World needs generated non-human residents or crowds.

### 6.5 Each part boils on its own clock

The target renderer draws three boil textures per visible part state. The numbers stay fixed, but
the graphite redraw changes.

- Seed each texture from the recipe seed, part ID, state, and frame.
- Give each part a speed between about `0.85` and `1.6 fps`.
- Give each part a stable phase offset.
- Swap textures. Do not regenerate on every render frame.
- Never reroll identity inside `draw()`.
- Freeze every boil clock on a stable frame when reduced-motion mode is active.

The current whole-character `1.15 fps` clock makes every mark change together. That reads as a
three-frame video, not separate hand-drawn parts. Fixing this requires per-part canvases. A timing
change alone cannot fix it.

### 6.6 Expressions swap while a blink hides the cut

The target face has lazy part states.

- Build the resting face first.
- Build another state only when gameplay asks for it.
- An expression names states for eyes, brows, mouth, and any other face part.
- Body language uses the same offset system as a pose.
- Ramp continuous offsets over about half a second.
- Change discrete face textures while the eyes are closed.
- Reopen the eyes on the new face.

Do not guess a character's expressions. Decide them in the character brief.

### 6.7 Poses move bones, not drawings

The target pose API writes weighted offsets to the root, head, body, or named bones.

- Poses use offsets, never absolute replacement coordinates.
- Two poses mix by adding their weighted offsets.
- Walk and run share one gait phase.
- A tempo change must not teleport a foot.
- One-shot actions blend faster, play, and return control.
- A pose scales breathing, gaze, and other autonomic motion instead of disabling the entire layer.

Do not add sitting, attack, sleep, or run as full baked character sheets. Build the bone split first.

---

## 7. The drawing method

### 7.1 Pencil

A stroke is a filled ribbon. It is not `ctx.stroke()`.

The shared pencil currently:

1. Extends the authored spine past both ends.
2. Resamples it at `max(2.2, width × 0.9)`.
3. Pushes each sample along its normal with three sine bands.
4. Adds grit to every sample.
5. Builds left and right rails from a breathing half-width.
6. Fills the ribbon at partial ink opacity.
7. Throws crumbs past thick edges.
8. Erases some edge coverage to make paper bites.

The core offset is:

```text
off = amp × (
  0.55 × sin(t × f1 × 2 + p1) +
  0.30 × sin(t × f2 + p2) +
  0.15 × sin(t × f3 + p3)
)
```

Frequency bands:

- `f1 1.5–3.5`: drift;
- `f2 5–9`: waver; and
- `f3 11–17`: tremor.

Do not tune one character's pencil. Change the shared pencil only with a cross-character visual
comparison and its deterministic tests.

### 7.2 Shape

Every organic shape is a ring of points.

`blobPts(cx, cy, rx, ry, rot, wob)` uses 16 points, a two-frequency radius change, rotation, and one
Chaikin pass.

- Always pass `rot` for a non-round shape. A random rotation can turn it on end.
- `wob` describes the hand, not object detail.
- Use about `0.4` for a slowly drawn eye.
- Use values near `1` for a scribbled mass.
- Use `jitterRing` for authored rings that also need a hand quality.

### 7.3 Material

The medium contract is:

```text
tone(sketch, points, options)       mass and darkness
skin(sketch, points, color, options) colour wash
edge(sketch, points, width)         closing contour
underdraw                            construction remains visible?
```

Density names are shared intent:

```text
black 1.00
hatch 0.72
scribble 0.62
stipple 0.50
light 0.34
```

A part chooses a density name and optional stroke direction. The selected medium decides what that
request looks like.

### 7.4 Head

The current head family is:

```text
round, square, tall, drop, pear, lump, wide, bumpy, wonky
```

The ring moves `0.92` of the way toward its mathematical target. Never move it all the way. A fully
perfect target stops looking drawn.

The vampire uses `tall`. A constructed corpse can use `square`. A witch can use `drop`.

These are outer envelopes, not anatomy. `square` does not create a constructed corpse. `tall` does
not create a skeleton. The archetype still needs its own skull or face construction inside the
envelope.

For a profile or three-quarter construction:

- keep the full head envelope;
- swell the near side by `10%`;
- collapse the far side by `28%`;
- move the eye back toward the ear; and
- push the nose and mouth toward the leading edge.

A profile is not a front view squeezed narrower.

### 7.5 Body-local attachment and physical layer order

Place parts on the character, not on the screen. Every asymmetric body part, hairstyle, garment,
accessory, and held item needs a body-local attachment record before drawing:

- **anchor:** the skull region, joint, limb, garment point, or held-item bone where it starts;
- **anatomical side:** character-left, character-right, or centre;
- **path:** every anchor the shape must remain connected through from start to end;
- **profile placement:** near, far, leading, trailing, or hidden;
- **depth relation:** which nearby masses draw before it and which draw after it; and
- **motion owner:** the body part whose gait or pose offset it follows.

Convert anatomical side to screen side through one shared facing map. Do not choose screen `x` with
an isolated `pose.facing` ternary inside a part. Front and rear usually swap screen sides. Left and
right profiles must obey the approved near/far or leading/trailing rule. The same mapping controls
the attachment anchor and every later point in the shape.

Write a four-facing attachment table for every asymmetric part:

| Facing | Screen side | Visible anchor | Profile placement | Draw before | Draw after |
|---|---|---|---|---|---|
| Front | mapped from anatomical side | named anchor | n/a | named deeper masses | named nearer masses |
| Rear | mapped from anatomical side | named anchor | n/a | named deeper masses | named nearer masses |
| Left | mapped from anatomical side | near/far or leading/trailing | explicit | named deeper masses | named nearer masses |
| Right | mapped from anatomical side | near/far or leading/trailing | explicit | named deeper masses | named nearer masses |

The path must overlap its anchor. A line or chain cannot begin after a transparent gap. A hanging
shape follows gravity from its anchor unless the brief gives it another force. Colour can separate
two attached parts, but colour cannot repair a detached or physically impossible shape.

A held item must cross the gripping hand, not stop beside it. Draw the deeper item segment, then the
hand, then any nearer segment. Give a cleaning tool, cane, or weapon a clear lower endpoint or
contact rule. In both profiles, keep it behind the face unless the approved action puts it there.
Headwear must cover its intended skull area without stray skin or hair leaking above the brim.

Layer order follows body depth, not code convenience. Draw a far paired limb first, then the torso
or garment, then a hanging middle layer, then the near limb. A sleeveless garment cannot cover an
exposed arm. Hair behind a skull can emerge over clothing while remaining behind the near arm.

### 7.6 Adjacent masses and garment topology

Before adding texture, inspect every pair of touching masses. They must differ through at least one
strong channel: value, colour family, pencil density, stroke direction, or a visible paper gap.
Do not place several near-black masses together and expect outlines alone to separate them at play
zoom. Keep one darkest identity mass and step adjacent clothing or anatomy to another value.

Every garment mass uses one closed contour. Do not double-render mirrored front panels in a profile;
their overlap becomes an unintended dark slab. A profile garment must preserve the same neckline,
armhole, raised hem, split, and exposed anatomy promised by the front brief. If the garment does not
cover a body part, draw that body part on the visible side of the garment.

Run a semantic-confusion check after dressing: name each silhouette mass without looking at the
code. Reject the frame if hair reads as a limb, an accessory reads as anatomy, two limbs merge into
one, or clothing hides a required joint. Fix attachment, topology, depth, or value before adding
detail.

---

## 8. Architecture intake summary

The task entrypoint owns the adaptive interview. See
[character-sprite-authoring.md](character-sprite-authoring.md). This table records the fields that
matter to pencil architecture after Joe approves the creative brief.

| Decision | Required answer |
|---|---|
| Stable identity | Character ID, name, role, and story reason for the look |
| Creature identity | Human, literal creature archetype, superhero, animal, or custom hybrid |
| Anatomical base | Upright biped, crouched biped, sit, quad, winged, serpentine, limbless, skeletal, spectral, constructed, or custom |
| Literal anatomy | Skull or face; torso; limbs and contact; surface or material; canonical features; absent human features |
| Generation mode | Authored named character now, or generated population later |
| Silhouette | One primary signature oddity that survives all four facings |
| Supporting feature | One secondary shape or readable object |
| Head | One of the nine families, or a clearly blocked custom skull requirement |
| Proportion | Keep the vampire default `0.56`, or state the visual reason and floor-contact plan |
| Surface | Skin, fur, feathers, scales, shell, bone, cloth, armour, spectral material, stitched flesh, or another covering |
| Medium | Graphite is current; another character medium is target intent until routing exists |
| Parts | Required parts, new files, mirrored parts, held items, and layer order |
| Face | Resting face and only expressions with named gameplay uses |
| Pose scope | Front idle and four-facing walk now; other poses need a gameplay use and Gate B |

Reject the brief if:

- identity depends on colour;
- the signature oddity disappears from the rear or side;
- the new person is a palette swap;
- a creature becomes an ordinary human when clothing and accessories are hidden;
- canonical anatomy is treated as a printed symbol, costume, or attached prop;
- every part is exaggerated;
- the design needs a separate portrait identity;
- the request copies a real person, costume, badge, emblem, or exact known silhouette;
- the signature feature becomes a cruel stereotype; or
- a missing architecture feature is described as if it exists.

---

## 9. Build workflow

### 9.1 Current generic whole-character baker

For each new character world body:

1. Write one versioned recipe.
2. Record the literal anatomy contract.
3. Choose one head envelope and head share.
4. Draw creature skull or face, torso, limbs and contact, surface, and canonical features.
5. Hide clothing and accessories. Confirm that the archetype still reads.
6. Add the individual's signature oddity and supporting feature.
7. Reuse shared primitives only when their anatomy is correct for the creature.
8. Build the layout once and draw through the selected medium.
9. Bake only four-facing idle, two walk states, and three boil frames.
10. Compare the pencil world figure with the vampire-style portrait from the same brief.
11. Keep both surfaces rejected until the literal-anatomy review passes.

---

## 10. Facing and motion rules

### Front

- The legs clear the hem, or the step disappears.
- One foot plants while the other lifts.
- Arms carry opposing gait motion on the visible vertical axis.
- A dark accessory needs a value edge against dark clothing.

### Rear

- Hide face parts.
- Hide hands when a closed cape covers the arms.
- Show an ankle cuff instead of a shoe sole.
- Cover the skull to the jaw when exposed skin would read as a face on the back of the head.

### Left and right

- Keep the head's full envelope.
- Draw both boots.
- Point the toe in the travel direction.
- Separate contact and passing poses. Swapping overlap order is not animation.
- Place the eye behind the leading face edge.
- Push the nose and mouth forward.

### Idle and gait

- Idle is its own drawing. Do not reuse a walk frame with one foot lifted.
- Stopping preserves the last facing. Front, rear, left, and right each have an idle drawing.
- Pass `moving` explicitly. A zero gait offset can mean standing or one instant of a walk.
- Both walk frames must change the silhouette.
- One shared gait phase drives opposite limb states. Do not mirror both legs on one axis and create a
  squat.

---

## 11. Migration gates

Build these gates only when their trigger becomes real.

### Gate A — generic pencil registry — complete

Generalize identity and renderer routing without changing the vampire's pixels.

Required result:

- a versioned authored recipe for the vampire;
- generic character and layout names instead of a second vampire copy;
- a registry keyed by pencil visual ID;
- renderer support for more than one pencil design on screen;
- the existing vampire tests and captures remain stable; and
- no external character look record controls a pencil character.

Do not add species generation, an editor, or extra media in this gate.

Gate A is complete in `src/render/pencil/characters.ts`, `billboard.ts`, and the 2.5D texture path.
Its completion proves routing and texture support. It does not approve the eight creature drawings.

### Gate B — before different locomotion, extra poses, or independent boil

Split parts into their own canvases and attach them to bones.

Required result:

- authored body bases publish their own contact, locomotion, and facing rules;
- every visible part has a stable bone, pivot, size, layer, and depth;
- each part owns three deterministic boil textures per active state;
- per-part clocks use stable speed and phase offsets;
- reduced-motion mode pins all parts to stable frames;
- idle and walk are bone offsets rather than full redraws; and
- current contact points, facings, and world scale do not move.

This gate can unlock authored sit, quad, winged, serpentine, or limbless locomotion. It also unlocks
sitting, attack, sleep, run, and proper non-unison boil. A creature-specific skull, torso, limb, or
surface inside the current biped canvas does not require Gate B. Gate B does not create generated
species data.

### Gate C — when gameplay needs visible emotion

Requires Gate B. Add lazy face states, blink timing, and expression body offsets.

Required result:

- rest builds first;
- unused expressions allocate nothing;
- a blink hides discrete face swaps;
- body offsets blend; and
- expressions cannot change identity geometry.

### Gate D — when generated populations need it

Requires Gates A and B. Add species casting, per-part reroll, locks, crowd scoring, and editor
support.

Do not build this for authored named characters alone.

---

## 12. Verification gate

A character is not complete because the source sheet looks good.

### 12.1 Automated checks

Run the smallest relevant checks first:

```bash
npx jest --runInBand --runTestsByPath \
  src/render/pencil/__tests__/sketch.test.ts \
  src/render/pencil/__tests__/media.test.ts \
  src/render/pencil/__tests__/head-shape.test.ts \
  src/render/pencil/__tests__/vampire-parts.test.ts \
  src/render/pencil/__tests__/vampire-walk.test.ts
npm run typecheck
```

Add focused checks for:

- deterministic output from the same recipe and state;
- different boil frames without identity drift;
- full part registry order;
- all four facings and both gait states;
- explicit idle routing;
- reduced-motion boil and walk freeze;
- foot contact and profile width;
- rear face and hand exclusions;
- rear garment topology and visible far profile limbs;
- unique depth ranks after the bone split; and
- recipe round-trip after recipes ship.

### 12.2 Visual checks

The existing hidden 2.5D smokes prove an in-world shipped frame, but they cannot select every
character facing, gait, or boil frame. A task that changes those states needs a deterministic
character-state capture before claiming complete visual evidence.

Never score the front view and infer that the other views pass. Review front, rear, left, and right
as separate drawings. For each facing, confirm every asymmetric part's mapped side, visible anchor,
unbroken path, depth order, and intended meaning. Then repeat the check for idle, both walks, and all
three boil frames. A `10/10` claim is allowed only after this full matrix and native play zoom pass.

Review in this order:

1. Archetype-only drawing with clothing and accessories hidden.
2. Black silhouette with colour removed.
3. Native play zoom in the real world.
4. Front, rear, left, and right.
5. Idle and both walk states.
6. Motion edges against the outfit.
7. Paper coverage over bright and dark ground.
8. Three boil frames for identity stability.
9. Part clocks for non-unison boil after gate B.
10. Vampire-style dialogue portrait beside the front pencil world figure.

Reject the character if:

- the torso or clothing becomes the dominant mass;
- a side view becomes a thin version of the front;
- flat fills replace drawn mass;
- all parts share one hatch direction;
- hatching becomes grey mush at play zoom;
- a moving limb disappears into clothing;
- the rear shows a face, hand, or sole that should be hidden;
- the boil changes shape, side, length, or identity;
- the whole world shimmers;
- the design reads only when enlarged;
- a named creature reads as a human wearing its archetype;
- a skeleton contains human skin, scalp, flesh, a printed rib cage, or hair without an approved
  supernatural attachment that still passes the hair-hidden anatomy review;
- a spectral body uses ordinary human legs and floor contact without an approved reason; or
- clothing or an accessory supplies the only recognizable archetype feature.

---

## 13. Traps

### Editing the wrong source

World-body identity lives in the pencil recipe and its anatomy renderer. Editing portrait art or an
unrelated character roster does not change the visible pencil body.

### Treating an archetype as a costume

The registry can route many drawings, but routing does not create anatomy. Do not call the shared
human skull, torso, arms, and legs and then paint ribs, fur, tusks, stitches, or a hat on top. Draw
the creature anatomy first.

### Treating the recipe seed as the boil seed

The recipe seed creates the person. A derived boil seed redraws one part state. Do not let a boil
frame reroll identity params.

### Flat fills behind pencil contours

This produces a vector cartoon with rough edges. Route masses through the medium.

### Transparent hatch gaps

A transparent sprite over the world needs carried paper under exposed masses. Use `paper: false`
only for shading or a mass that sits on another covered mass.

### One texture clock for every part

Changing the global FPS does not fix unison boil. Per-part canvases and stable clock offsets do.

### Adding poses before bones

Each new baked pose multiplies full canvases. Add the bone rig before sitting, attack, sleep, or
run.

### Required rotation in `blobPts`

The TypeScript API requires `rot`, which prevents the source generator's accidental random-rotation
trap. Keep that parameter required. Pass an intentional rotation for every shape.

### Shared anchors inside parts

Parts can author local offsets. They cannot invent the eye row, chin, floor, or world conversion.
Before moving an existing local value into `F`, verify that the published anchor matches the proven
drawing. `F.L.noseY` does not match the current nose and must be reconciled before reuse.

### Perfect mathematical shapes

Do not set head rounding to `1`. Keep some of the original hand in the ring.

### Lightening for source fidelity

Technique fidelity and value fidelity are different. SI World keeps the Kindergrimm method but uses
Joe's darker calibration for play-zoom survival.

---

## 14. Definition of done

A shipping pencil character is done when the following checks pass.

- [ ] one recipe or stable authored source defines the person;
- [ ] a named creature has a written literal-anatomy contract;
- [ ] the skull or face, torso, limbs and contact, surface or material, canonical features, and
      absent human features match that contract;
- [ ] the creature reads as its archetype with clothing and accessories hidden;
- [ ] one signature oddity and one supporting feature read without colour;
- [ ] the design is original and does not use a cruel stereotype;
- [ ] the head is the largest identity mass;
- [ ] shared anchors are verified against the proven drawing before parts consume them;
- [ ] parts use the current medium contract, with open `edge` bypasses labeled honestly;
- [ ] stable choices do not reroll across boil frames;
- [ ] every asymmetric part uses a body-local side, named anchor, continuous path, and four-facing
      attachment table;
- [ ] held items cross their gripping hand, obey their contact rule, and do not drift across the face;
- [ ] touching masses remain distinct by value, colour, texture, or a visible gap at play zoom;
- [ ] garment contours are closed and preserve their openings and exposed anatomy in profiles;
- [ ] no hair, accessory, garment, or body part can be mistaken for a different body part;
- [ ] front, rear, left, and right preserve identity;
- [ ] idle and both walk states read at play zoom;
- [ ] feet contact the ground and motion has a visible value edge;
- [ ] rear and profile exclusions are correct;
- [ ] deterministic tests pass;
- [ ] reduced-motion mode freezes the boil;
- [ ] the world remains still while the character boils;
- [ ] the vampire-style dialogue portrait matches the approved pencil-body identity;
- [ ] neither surface is marked as a rejected human-template prototype;
- [ ] a real in-game capture passes visual review; and
- [ ] the document and code describe the same implementation status.

---

## References

- [Character sprite authoring task entrypoint](character-sprite-authoring.md)
- [Halcyra art bible](halcyra-art-bible.md)
- [Kindergrimm: how a creature is drawn](https://kindergrimm.vercel.app/how)
- GBrain slug: `concepts/kindergrimm`
- [`src/render/pencil/layout.ts`](../../src/render/pencil/layout.ts)
- [`src/render/pencil/sketch.ts`](../../src/render/pencil/sketch.ts)
- [`src/render/pencil/media.ts`](../../src/render/pencil/media.ts)
- [`src/render/pencil/head-shape.ts`](../../src/render/pencil/head-shape.ts)
- [`src/render/pencil/parts/index.ts`](../../src/render/pencil/parts/index.ts)
- [`src/render/pencil/pose.ts`](../../src/render/pencil/pose.ts)
- [`src/render/pencil/vampire.ts`](../../src/render/pencil/vampire.ts)
- [`src/render/pencil/billboard.ts`](../../src/render/pencil/billboard.ts)
