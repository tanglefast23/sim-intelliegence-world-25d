---
title: "feat: Use KinderGrimm recipes to generate SI World character sprites"
type: feat
date: 2026-08-23
status: audited-plan
upstream: vendor/kindergrimm-upstream
upstream_commit: de339ad739d8cbd28ff2dd4a940af38c0ede86c8
---

# KinderGrimm character generator integration plan

## 1. Outcome

Use KinderGrimm's recipe, layout, ordered-part, medium, and deterministic drawing method to create
new SI World World Sprites and change existing World Sprites.

Keep SI World's world art, 2.5D renderer, camera, lighting, sprite scale, four facings, movement,
contact points, visual calibration, and Dialogue Icons intact.

The first implementation ends with `vampire-01` as one opt-in pilot character generated through the
new boundary. His approved redesign brief lives in
`docs/specs/2026-08-20-vampire-protagonist-redesign.md`. The pilot does not replace the full cast.

## 2. Locked product rules

1. `vendor/kindergrimm-upstream` is the pristine reusable source. Never edit it.
2. Pin the upstream submodule to `de339ad739d8cbd28ff2dd4a940af38c0ede86c8` until a separate
   reviewed update changes that commit.
3. The adapter must port the pinned KinderGrimm recipe, layout, medium, and part-generation code.
   It must not recreate those rules from the architecture guide alone. SI World owns character
   designs and required facings.
4. World Sprites remain `120x180` RGBA pencil sheets shown on `42x60` world billboards.
5. `billboard.ts` and the existing Three.js character batch remain the runtime presentation path.
6. Front, rear, left, and right remain required. KinderGrimm has no rear-facing generator, so SI
   World keeps its facing and locomotion contracts.
7. Keep SI World's darker graphite, bold line, carried-paper, head-share, ground-contact, and
   native-play-zoom calibration.
8. Existing characters do not move to the new generator until their own visual review passes.
9. Dialogue Icons and Cinematic Portraits remain separate pixel-art surfaces. One approved brief
   keeps their identity synchronized with the World Sprite.
10. Only characters boil. The world remains still.

## 3. Upstream source boundary

The submodule keeps the complete upstream repository, history pointer, README, architecture guide,
and Unlicense together. This makes the source easy to initialize or add to another project:

```bash
git submodule update --init --recursive
git submodule add https://github.com/albertobeiz/kindergrimm.git vendor/kindergrimm-upstream
git -C vendor/kindergrimm-upstream checkout de339ad739d8cbd28ff2dd4a940af38c0ede86c8
```

The SI-owned adapter lives outside the submodule. It can port or wrap upstream behavior, but every
ported contract must link to the pinned upstream file and have a focused contract fixture. Use the
actual pinned functions and selected part algorithms as the source. Do not write a similar generator
from the guide.

Cross-project reuse means the pristine upstream repository. The SI adapter remains project-specific.
Do not extract a generic package until a second project needs the adapted code.

Use these upstream sources first:

| Upstream source | Contract to adopt |
|---|---|
| `src/rng.js` | Stable seed and independent per-part RNG streams |
| `src/rig.js` | Recipe completion and recipe-as-identity |
| `src/layout.js` | One layout publishes all shared anchors |
| `src/parts/index.js` | Ordered registry, behind to front |
| `src/part.js` | Per-part drawing surface, state, and deterministic boil inputs |
| `src/media.js` | Parts request `tone`, `skin`, and `edge` |
| `src/sketch.js` | Hand-drawn shape and stroke behavior |
| `src/poses/` and `src/anim.js` | Reference only until a gameplay need requires bones |

Do not import KinderGrimm's rooms, games, camera, lighting, scenery, post effects, items, voxel
renderer, gloss renderer, plant renderer, vendored Three.js, or audio.

### 3.1 Fidelity boundary

| Exact pinned upstream behavior | Intentional SI World adaptation | Excluded now |
|---|---|---|
| `hashStr`, RNG sequences, `partRng` at reroll zero, nightmare casting, deterministic draft completion, registry order, selected part `gen` and drawing algorithms, shared layout anchors, media and sketch behavior | Four facings, `120x180` sheet mapping, darker graphite calibration, whole-frame RGBA composition, shared boil clock | Selectable species, rerolls, locks, editor, bones, crowds, extra media |

Create small golden fixtures by running the pristine upstream code at the pinned commit. SI World's
facing and sheet mapping, and the final RGBA pixels, are adaptations. They must not claim byte parity
with upstream.

## 4. SI World integration seam

Keep the public runtime seam:

```text
legacy PencilCharacterRecipe -> existing bakePencilCharacterFrames()
generated shipping recipe
  -> pinned KinderGrimm completion, layout, media, sketch, and ordered-part contracts
  -> SI World facing and `120x180` sheet adapter
  -> bakeGeneratedPencilFrames()
both paths -> pencilCharacterFrames() -> existing RGBA cache, texture slot, billboard, and renderer
```

Leave `bakePencilCharacterFrames(PencilCharacterRecipe)` unchanged. It remains the legacy path for
the current cast. Add a separate generated baker that accepts only a validated shipping recipe.
`pencilCharacterFrames()` owns the per-character choice. Existing renderer consumers must not learn
about recipes, parts, species, media, or the upstream repository.

Recipes are authored and reviewed before shipping. At runtime, SI World lazily bakes and caches RGBA
frames from approved shipping recipes, as it does today. Do not add checked-in generated sprite
sheets in this plan.

## 5. Phase 0 — preserve the upstream source

Current uncommitted foundation:

- `.gitmodules` tracks `vendor/kindergrimm-upstream`.
- The submodule points to the official repository.
- The submodule is pinned at the reviewed commit.
- The full Unlicense stays with the source.
- A separate clean clone at `/Users/joemacprom5/Documents/Vibecode/kindergrimm` keeps the full Git
  history, tags, and working files outside SI World.

Before implementation:

- [x] Add a project-side provenance note with the origin, commit, license, update command, and
      "never edit the submodule" rule.
- [ ] Add a check that fails if the submodule has local changes.
- [ ] Confirm a fresh recursive clone resolves the exact commit.
- [ ] Generate pinned contract fixtures for upstream hash, RNG, reroll-zero seed derivation, fixed
      human/biped draft completion, selected part generation, shared layout anchors, and registry
      order.

## 5.1 Lock the approved pilot before generator design

Use `vampire-01` as the pilot. Treat his approved brief in
`docs/specs/2026-08-20-vampire-protagonist-redesign.md` as the locked source for literal anatomy,
signature oddity, supporting feature, facings, and movement evidence.

If Joe chooses another pilot, revise this plan before Phase 1. Do not design generic parts before the
pilot proves which parts are required.

## 6. Phase 1 — port the generator contract

Create the smallest SI-owned TypeScript adapter under `src/render/pencil/`. Use the pinned upstream
`rig.js` directly in the authoring script. Lock its generated parameters in
a reviewed shipping recipe. Adapt only the selected parameters to SI World's existing layout,
graphite medium, part drawers, facings, and RGBA buffers. Do not add a second runtime renderer.

Required contracts:

```ts
type PencilPartSlot = Readonly<{
  params?: Readonly<Record<string, unknown>>;
}>;

type PencilRecipeDraft = PencilCharacterRecipe & Readonly<{
  seed: number;
  species: 'human';
  base: 'biped';
  parts: Readonly<Record<string, PencilPartSlot>>;
}>;

type PencilShippingRecipe = Omit<PencilRecipeDraft, 'parts'> & Readonly<{
  status: 'shipping';
  parts: Readonly<Record<string, Readonly<{
    params: Readonly<Record<string, unknown>>;
  }>>>;
}>;
```

`PencilCharacterRecipe` keeps `kind`, `archetype`, `artStatus`, anatomy, shape, and palette. This
preserves the existing approval gate. Names may change if the implementation finds an existing
equivalent. Do not add a generic part interface before the vampire proves it is needed. Preserve the
upstream `gen(rng, casting)` boundary. Do not pass the whole recipe into part generation.

Required behavior:

- [x] Store the vampire source recipe at `src/render/pencil/recipes/vampire-01.json`.
- [x] Run upstream `ensureParams()` directly for the reviewed `nightmare` casting and `biped` base.
- [x] The shipping recipe is complete, versioned, validated, and treated as immutable.
- [x] `bakeGeneratedVampireFrames()` accepts only the validated shipping recipe. Do not change the legacy baker's
      input contract.
- [ ] Derive each part RNG from the pinned `${seed}:${partId}:0` rule. Add rerolls only with a later
      authoring tool.
- [x] Keep identity choices outside `draw()`.
- [x] Build shared anchors from SI World's layout, then apply the generated tuning and existing sheet
      mapping.
- [x] Map the vampire's selected upstream part parameters onto SI World's ordered part drawers.
- [x] Route masses and contours through SI World's graphite medium and sketch behavior.
- [ ] Keep construction RNG separate from boil RNG.
- [ ] Round-trip recipe JSON without losing identity.
- [ ] Validate version, visual ID, kind, archetype, `artStatus`, seed, fixed species/base, known part
      IDs, required anatomy, supported facing policies, and JSON-safe parameter values.
- [ ] Adding a registry part does not add it to an approved shipping recipe.
- [x] Keep `GRAPHITE` as the pilot medium.
- [x] Leave selectable species, rerolls, locks, editor controls, and saved-game persistence out.

Smallest checks:

- [ ] The same incomplete recipe completes to the same params twice.
- [x] The same complete recipe produces identical RGBA bytes twice.
- [ ] Each completed part matches the pinned human-casting fixture and does not read sibling params.
- [ ] Changing boil input does not change layout or stable identity params.
- [ ] Part order is deterministic and duplicate IDs fail.
- [ ] The recipe JSON round-trips.

## 7. Phase 2 — keep SI World's four-facing baker

Adapt the generated parts to the existing frame contract:

- four facings: front, rear, left, right;
- one idle and two walk states per facing;
- three boil frames per state;
- `VAMPIRE_SHEET_LENGTH` remains unchanged;
- current reduced-motion selection remains facing-specific idle plus boil frame 0;
- exact floor, contact, scale, and texture-slot dimensions remain unchanged.

KinderGrimm's front and three-quarter construction cannot define SI World's rear view. Each SI part
must state its facing behavior. Rear views hide face parts and draw the back anatomy. Lateral views
keep SI World's leading and trailing attachment rules.

Do not add bone meshes in this phase. Compose parts into the existing whole-character RGBA frame.
This gets the authoring method without changing renderer draw calls. KinderGrimm's independent
per-part `fps` and `off` clocks are an accepted difference in this phase. SI World keeps its current
whole-frame boil clock until separate part animation has a gameplay need.

Checks:

- [x] Every visual ID still bakes `VAMPIRE_SHEET_LENGTH` frames. `vampire-01` uses the generated
      baker through the existing billboard cache. The legacy baker remains available as a baseline.
- [ ] Non-opted-in characters produce byte-identical frames.
- [ ] The pencil texture remains `PENCIL_WIDTH * PENCIL_VISUAL_IDS.length` by `PENCIL_HEIGHT`.
- [ ] Existing billboard width, height, lift, tint, depth bias, and world scale remain unchanged.
- [ ] Existing world-renderer static hashes or equivalent captures remain unchanged outside the
      pilot character pixels.
- [ ] Record every non-pilot frame hash before implementation and require exact equality afterward.
- [ ] Renderer draw calls, texture dimensions, and per-frame work remain unchanged.
- [ ] The vampire's generated cold bake is no more than twice its legacy cold bake. Cached selection
      adds no measurable per-frame work.

## 8. Phase 3 — one opt-in pilot character

Use the main vampire with his approved creative brief. Do not migrate the full cast as the first proof.

The pilot must:

- use a versioned recipe;
- use the ordered part registry;
- use literal creature anatomy before clothing or accessories;
- preserve its approved signature oddity and supporting feature;
- generate every required facing, idle, walk, and boil state;
- render through the existing billboard path; and
- leave every other character and every world asset unchanged.

Let `src/render/pencil/billboard.ts::pencilCharacterFrames()` own the vampire selection:

- `legacy`: select the current renderer;
- `generated`: require the validated shipping recipe and fail loudly on generation errors.

Keep the old vampire baker callable as the baseline. Review tools, hidden captures, and production
use the `generated` candidate through the same central selector. The standing world path,
authored seated renderer, `writeVampireFourFacingReview()`, and `writeVampireMotionReviews()` use
that selector. Do not catch a generation error and silently display legacy art.

The vampire has an authored seated renderer. It uses the same generated layout while keeping the
standing identity. Add a regression check that sitting cannot switch him back to legacy art.

## 9. Phase 4 — evidence and acceptance

Automated evidence:

```bash
npx jest --runInBand --runTestsByPath \
  src/render/pencil/__tests__/sketch.test.ts \
  src/render/pencil/__tests__/media.test.ts \
  src/render/pencil/__tests__/head-shape.test.ts \
  src/render/pencil/__tests__/characters.test.ts \
  src/render/pencil/__tests__/generated-vampire.test.ts \
  src/render/pencil/__tests__/seated-characters.test.ts \
  src/render/pencil/__tests__/vampire-parts.test.ts \
  src/render/pencil/__tests__/vampire-walk.test.ts \
  src/render/three25/__tests__/billboards.test.ts \
  src/render/three25/__tests__/world-renderer-25.test.ts \
  scripts/art/__tests__/full-cast-art.test.ts \
  scripts/art/__tests__/protagonist-dialogue-portrait.test.ts
npm run typecheck
npm test
npm run art:check
npm run content:check
```

Store the pre-change non-pilot RGBA hashes in
`tests/fixtures/rendering/pencil-nonpilot-frame-hashes.json`. Store the vampire's legacy and generated cold
bake measurements in `tests/fixtures/performance/pencil-character-bake.json`. Keep the assertions in
one focused generated-character test rather than creating a new test framework.

Extend `scripts/art/build-pencil-cast-review.ts`. Do not add a second review generator.

Required review images:

- black silhouette;
- front, rear, left, and right at native play scale;
- idle and both walks;
- all three boil frames;
- bright and dark ground;
- anatomy-only view with clothing and personal accessories hidden;
- side-by-side World Sprite and Dialogue Icon identity check.
- authored seated pose using the same generated identity.

Run the safe hidden 2.5D captures through the existing hidden-window tooling. Capture the player in
front, rear, left, right, authored seated pose, and native play zoom.
A source sheet alone cannot approve the change.

Acceptance requires both:

1. Automated checks prove determinism, compatibility, and unchanged world presentation.
2. Joe accepts the pilot at native play zoom.

## 10. Later phases, only after the pilot

After one pilot passes, migrate one character at a time. Keep per-character fallback and evidence.

After two characters prove the contract, create the reusable character-authoring skill. It should
conduct the existing interview, write or update a recipe, prefer existing parts, add a per-part
reroll only when requested, run checks, build review sheets, and capture the hidden in-game result.

Do not build these without a new approved trigger:

- generated species populations;
- a visual editor;
- crowds or scoring;
- selectable non-graphite character media;
- save-file recipe persistence;
- runtime bone meshes;
- blink-swapped expressions;
- attack, run, sleep, or new locomotion systems.

## 11. Failure and rollback

- A generator error must name the visual ID and part ID.
- A draft recipe may be incomplete. It cannot enter the shipping registry.
- An invalid or incomplete shipping recipe fails generation. It must not silently use generic or
  legacy art.
- A performance regression keeps the part generator but retains whole-frame composition.
- A visual rejection restores the registry switch to the previous renderer without touching world
  art or other characters.
- An upstream update is a separate review. Never move the submodule pointer during character work.
- Generation failures name visual ID, part ID, facing, idle or gait state, and boil frame.

## 12. Acceptance criteria

- [ ] The official KinderGrimm repository remains clean, pinned, licensed, and reusable.
- [ ] SI World uses the pinned recipe and part contracts as the generator basis.
- [ ] One pilot World Sprite is generated from a versioned recipe.
- [ ] The shipping recipe contains no missing or unknown part data.
- [ ] Adding a new registry part does not change the approved recipe.
- [ ] The pilot supports all existing facings and movement states.
- [ ] Every part declares explicit front, rear, left, and right behavior.
- [ ] Every grounded facing and gait reaches the existing contact row without clipping the sheet.
- [ ] Reduced motion selects the current-facing idle and boil frame 0.
- [ ] The vampire keeps the same generated identity when the authored seated pose is active.
- [ ] Existing non-pilot character pixels remain unchanged.
- [ ] World art, camera, lighting, renderer batches, and Dialogue Icons remain unchanged.
- [ ] Deterministic and recipe-isolation tests pass.
- [ ] Existing focused pencil tests and TypeScript pass.
- [ ] Cold bake, cached memory, texture dimensions, draw calls, and frame time meet Phase 2 limits.
- [ ] Native review sheets and hidden in-game captures exist.
- [ ] Joe approves the pilot before migration expands.

## 13. Opus and Grok audit resolution

- Keep the legacy baker unchanged. Use a separate generated baker behind one central selector.
- Port the pinned generator code and selected part algorithms. Do not imitate the guide.
- Keep `kind`, `archetype`, `artStatus`, and the current approval gate in generated recipes.
- Fix the pilot to nightmare casting and a biped base. Add selectable species only when needed.
- Defer rerolls, locks, independent part layers, and dependency graphs until an authoring tool needs
  them.
- Make reviews, standing frames, seated crops, and hidden captures use the same selected identity.
- Store non-pilot pixel hashes and bake measurements in named fixtures. Run the renderer, art, and
  content gates.

## 14. References

- `vendor/kindergrimm-upstream/ARCHITECTURE.md`
- `vendor/kindergrimm-upstream/src/rig.js`
- `vendor/kindergrimm-upstream/src/part.js`
- `vendor/kindergrimm-upstream/src/layout.js`
- `vendor/kindergrimm-upstream/src/parts/index.js`
- `docs/art/character-sprite-authoring.md`
- `docs/art/character-sprite-design2.0.md`
- `docs/art/halcyra-art-bible.md`
- `src/render/pencil/characters.ts`
- `src/render/pencil/billboard.ts`
- `src/render/pencil/layout.ts`
- `src/render/pencil/sketch.ts`
- `src/render/pencil/media.ts`
- `src/render/pencil/pose.ts`
- `scripts/art/build-pencil-cast-review.ts`
- `scripts/verification/hidden-window-capture.ts`
