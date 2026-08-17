# Implementation plan — West office interior (Ledger Annex)

Spec: [docs/specs/2026-08-17-west-office-interior.md](../specs/2026-08-17-west-office-interior.md)
Playbook: [docs/25d-scene-playbook.md](../25d-scene-playbook.md)

Nine steps. Each leaves `main` green and is committed on its own. Every step names what proves it.

Revision 2, after Grok review round 1. Five of its findings were verified against the code before
this rewrite, and all five held.

---

## 0. What is GENERATED, and therefore must not be hand-edited

This rule caused the largest correction to the spec, and then a second correction to this plan.
State it once and obey it everywhere.

| File | Written by | Author it in |
|---|---|---|
| `content/maps/*.json` | `buildProductionMaps()` | `westMap()` in `scripts/content/build-map-v2.ts` |
| `content/world/locations/production.json` | `build-production-content.ts` | `PRODUCTION_FULL_AI_CAST`, or `prototype.json` for non-cast locations |
| `content/world/characters/production.json` | `build-production-content.ts` | the cast tables |
| `content/production-bill.json` | `build-production-content.ts` | the cast tables |
| `content/schedules/prototype.json` | `build-production-content.ts` | `createInitialState()` |
| `src/domain/state/generated-layout.ts` | `content:build` | never by hand |
| `src/world/transfers/generated-routes.ts` | `content:build` | never by hand |
| `src/ai/registry/generated-browser-writing.ts` | `content:build` | never by hand |

`content:check` is builder-then-`git diff --exit-code`, so a hand edit to any of these is stripped
and then fails the gate. **`content/world/locations/prototype.json` IS hand-authored** — that is
where `west_office` and `ledger_annex` go, next to `ferry_terminal`.

**Step 0 has run and passed.** `northwest_residential` `(0, 24)` is walkable, and so are `(0,23)`,
`(0,25)`, `(1,24)`, `(2,24)`. The attachment point stands.

**Verified, so not a risk:** two objects on one tile is legal. `partOwnersByTile` is a list and
`addOwner` rejects only overlapping SOLIDS, so a non-solid ceiling panel over a solid desk compiles.

---

## Step 1 — The union and an empty shell

The map id, a walkable empty building, and every enumeration site that grows with it.

**Density is the trap here, and it is measured PER AREA.** `measureAndValidateDensity`
([src/world/maps/density.ts:115](src/world/maps/density.ts:115)) loops over `map.areas` and applies
the whole gate to each one. `buildProductionMaps` always passes `validateDensity: true`.
`furnished-interior` demands `objectSolidRatio` ≥ 0.08 and `detailRatio` ≥ 0.12; an empty room has
zero of both, and `intentionalOpenAreas` only silences the >6×6 hole rule, not the ratios. The
`structural-placeholder` fallback ([density.ts:179](src/world/maps/density.ts:179)) then demands
**≥ 6 wall-or-object solids AND ≥ 8 detail cells inside that area's own bounds**, where walls count
as solids but never as details.

So the seven spec areas cannot be authored empty. `cubicle-floor` `{7,7,37,15}`, `annex-hall`
`{7,22,37,4}` and `annex-lobby` `{44,7,9,34}` contain no wall run at all in a bare shell — the outer
wall and `annex-east` sit outside their bounds — giving 0 solids and 0 details each.

**The stub therefore has exactly two areas:**

- `annex-interior`, one `structural-placeholder` whose bounds match `annex-roof.interiorCells`
  `{7,7,46,34}`. **The outer shell does not help it**: those runs are at `x=6`, `x=53`, `y=6` and
  `y=41`, all outside these bounds, so the area starts at 0 solids exactly like the three above.
  Give it one `development-fixtures` object of **8 tiles, 6 of them `solid: true`**, from sprites
  that already exist. That single object clears both halves at once —
  [density.ts:176](src/world/maps/density.ts:176) counts `kind === 'object'` as a structural solid
  alongside `wall`, and the 8 parts are the 8 detail cells. `clusteredTiles(…, 8, 6, …)` inside the
  existing `placeholderArea` helper in `build-map-v2.ts` is already this shape; copy it. No interior
  wall ring is needed, so do not author one.
- `annex-lot`, also `structural-placeholder`. The spec's two car pairs, sign and two planters are
  **7** detail cells — one short. Add one more existing fixture.

Step 5 splits `annex-interior` into the **six** interior spec areas and switches them to
`furnished-interior`, when there is furniture to justify it. Six, not seven: the spec's seven areas
already count `annex-lot`, which exists from step 1 and is not split.

1. `MAP_IDS` in `src/world/maps/catalog.ts` gains `west_office`. **Two** hardcoded four-key catalog
   literals in that file then need a fifth row, not one: `buildWorldMapV2Catalog`
   ([catalog.ts:122](src/world/maps/catalog.ts:122)) gains `compile(candidates.west_office)`, and
   the v1 `buildWorldMapCatalog` ([catalog.ts:53](src/world/maps/catalog.ts:53)) gains
   `compileWorldMap(candidates.west_office, knownSprites)`. Nothing calls the v1 builder, but it is
   `satisfies WorldMapCatalog` and `tsc --noEmit` still checks it.
2. `westMap()` in `build-map-v2.ts`: lot, civic shell, front door, roof group, **two** areas, the
   reciprocal portal. `commonMap()` returns empty `doors`/`roofGroups`/`buildings`, so `westMap()`
   mutates after calling it, exactly as `northwestMap()` does. The only outer-shell gap is the
   front-door entrance, or `validateBuildings` throws.
3. `northwestMap()` gains portal `to-office` at `(0, 24)` and staging tile `(1, 24)`; its
   `LAYOUT_REVISIONS` entry moves 2 → 3.
4. `content/world/locations/prototype.json` gains **both** `west_office` and `ledger_annex`, and
   `westMap()` carries a `locationBindings` row for each in this same step.
   `buildWorldMapV2Catalog` ([catalog.ts:141](src/world/maps/catalog.ts:141)) throws
   `Location ledger_annex has no binding on west_office` otherwise — `west_office` is auto-bound as
   `map.id`, `ledger_annex` is not. A binding needs only `locationId` + one `areaId`, so both bind to
   the stub areas with no furniture: `west_office` → `annex-lot`, `ledger_annex` →
   `annex-interior`. Step 5 rewrites `ledger_annex.areaIds` when the interior splits.
   Widen `NeighborhoodIdSchema` in `src/content/schemas/world.ts` — it is a SEPARATE four-value
   enum, not `z.enum(MAP_IDS)`, and location parse fails without it.
5. **Move the location-count test here, 14 → 16 in one move.**
   `src/content/__tests__/content-validation.test.ts` pins `catalog.locations` at 14 (line 22) and
   `buildLocationNeighborhoodIndex(...).size` at 14 (line 38). Both locations land in this step, so
   both counts move to 16 in this step. Do not add the locations here and update the counts in step
   6 — step 1's `npm test` would be red at commit.
6. `createInitialState().maps` gains the fifth key. `maps` is an OPEN record, so a new game needs no
   migration — the transfer reducer throws on `!state.maps[destinationMapId]`, and this is the
   new-game path. v8 is only for old saves.
7. `src/application/runtime/map-catalog.ts` — the runtime loader, four hardcoded JSON imports and a
   four-key catalog literal. This is how the game boots; without it, typecheck and boot both fail.
8. Sweep the rest: `build-map-v2.ts` (`LAYOUT_REVISIONS`, `names`, `maps`, `LOCATION_NEIGHBORHOODS`),
   `validate-content.ts` `mapFiles`, `content-authority.ts`, `author-light-samples.ts`,
   `district-lighting.ts` (LEDGER FLUOR preset), `halcyra-audio-policy.ts` (reuse `sunward`),
   `preferences.ts`, `world-knowledge.ts`, `selected-character.ts`, `GROUNDING_TILES` in
   `dev-harness/scenario-state.ts`, art-quality manifests.
9. `ALL_MAP_PARITY_CASES` in `src/render/three/all-map-parity.ts` gains a west row **in this step**.
   `all-map-parity.test.ts:6` asserts the distinct `mapId` set equals `MAP_IDS`, so the unit test
   fails without it. The unit test does not load any effect, but the packaged all-map smoke does —
   so either give the stub a cheap steam effect here, or do not run that smoke until step 5. This
   plan does not run it until step 5.
10. Tests that pin the old shape: `map.test.ts` (4 → 5 catalog keys, northwest 2 → 3 portals, routes
    8 → 10, northwest layoutRevision 2 → 3), `map-v2.test.ts` `catalogCandidates()` needs a west
    stub or the constructor throws, `layout-recovery.test.ts` `ALL_MAP_IDS`, and
    `neighborhood-routes.test.ts` gains the office ↔ northwest and office → docks cases **here** —
    the routes exist as of item 3, so they are provable now, not later.
11. `npm run content:build`; commit `west.json` and every generated file.

**Explicitly NOT in this step.** `DEV_HARNESS_MAP_IDS` — golden-hour needs ≥6 `active_local` NPCs
and hero-scene throws without a `startComposition`, so the office joins it in step 6. And
`startComposition` itself, which names clerk ids and desk part ids that do not exist yet;
`validateStartComposition` would reject it.

**Proves it:** a `transitions.test.ts` case walking `northwest_residential` → `to-office` →
`west_office`. That is the walk proof. `verify:first-hour` runs here too, but as a different
question — it only walks northwest, so it proves the northwest graph did not move, and it runs
BEFORE any furniture exists so the portal is the only suspect. Plus typecheck, `content:check`,
`npm test`.

---

## Step 2 — Save migration v7 → v8

`parseSupportedEnvelopeShape` in `electron/persistence/save-format.ts` accepts 5, 6 and 7 only, and
parses 7 with the CURRENT schema. Bumping `STATE_SCHEMA_VERSION` to 8 therefore breaks both
directions at once: a v8 envelope is rejected outright, and a v7 envelope is parsed as if it were
v8 and fails. Follow the v6 pattern.

1. `LegacyStateV7Schema` — content-0.1.0, four maps, no clerks. Add a v7 parse path and make v8 the
   current schema. `migrateStateCopy` sends 1–6 through to v8 and sends 7 through `migrateV7ToV8`;
   today version 7 only re-parses.
2. `src/domain/state/migrations/v7-to-v8.ts` per spec 14.2. Insert the map record and
   `layoutRevisions.west_office = 1`; move northwest 2 → 3 only when the saved value is 2. Do not
   move the protagonist, and do not invent a `layoutMigrationEvidence` row.
3. A **frozen** `tests/fixtures/saves/valid-v7-envelope.json` that `content:build` does not rewrite.
   This matters: `buildSaveCutoverFixtures()` DERIVES the v5 and v6 fixtures from the current
   `createInitialState()`, so after step 1 they already contain `west_office` and cannot prove that
   a missing key gets inserted.
4. Update everything pinned to schema 7: `run-save-migration-package-smoke.ts`,
   `write-save-evidence.ts`, `art-quality-final-manifest.ts`, `tests/electron/save-faults.test.ts`.

**The clerks are not in this migration**, because they do not exist until step 6. That leaves a
hole this plan must close rather than comment on: a save migrated to v8 at THIS commit will never
run `v7-to-v8` again, so it would never receive them. Step 6 therefore adds an idempotent
current-version repair that inserts missing office NPCs and schedules on load. A v9 bump is the
alternative; the repair is cheaper and is chosen here.

**Proves it:** a unit test loads the frozen v7 fixture and asserts the office key appears, the
protagonist has not moved, and no evidence row was invented. `smoke:save-migration` loads a v7
envelope and walks west. `npm test`, `content:check`.

---

## Step 3 — Four atlas cells

1. `assets/source/art/manifest.json` object-landmark `maximumCount` 64 → 68 (measured: exactly 62 in
   use). Bump the art revision 15 → 16 in ALL of: the manifest, `ART_REVISION` in
   `src/render/atlas.ts`, and `generated-recipes.json`. `map-catalog.ts` throws when
   `ART_PRESENTATION_REVISION !== ATLAS_INDEX.artRevision`, so these move together or nothing boots.
2. Author the four cells of spec 9.2. Each must read top-down, because the 2D path draws the sprite.
3. `npm run art:atlas`; commit `assets/generated/`.
4. Measure the new cells with `scripts/art/measure-prop-cores.ts` and the modal-colour rule
   (exclude luminance < 55). `PROP_FLAT_COLORS` and `PROP_CORES` rows come from the MEASUREMENT,
   never from the spec's guessed hex values.
5. Update the tests pinning revision 15: `atlas-bill.test.ts`, `atlas-generation.test.ts`, and the
   sunward and tier-b art tests.

**Proves it:** `art:check` green, and a test asserting the four sprites exist and object-landmark is
within its new ceiling.

---

## Step 4 — Recipes and the glow guard

1. `PROP_RECIPES` rows for the four sprites at exactly the heights in spec section 10.
2. The ceiling plate is `glow: true`. Extend the existing guard — currently
   `/lamp|lantern|sign-neon|sign-sunset-market/` — to the ceiling panel and no wider.
3. Partitions are one-tile recipes, so a shared wall is one box rather than a consumed run that
   overhangs its neighbour.

**Proves it:** unit tests that the partition is 1.015 tall and thin on its own axis, the cooler's
jug is NOT glow, the plate IS, and the housing sits under the roof lid at 1.45 rather than floating.

---

## Step 5 — Furniture and density

1. Fill `westMap()` per spec 8.4–8.9. Derive the twelve modules from a loop over column and row
   edges; do not hand-list 96 part ids.
2. **Split `annex-interior` into the six interior spec areas now** — `annex-lobby`, `annex-hall`,
   `cubicle-floor`, `manager-office`, `cooler-nook`, `annex-kitchen` — and switch them to
   `furnished-interior`. `annex-lot` is untouched and is the seventh area; splitting into "seven"
   would leave eight areas or a duplicate lot. Rewrite `ledger_annex.areaIds` to those six in the
   same edit — a binding pointing at a deleted area fails the compile, and the lot is not part of
   the annex interior. Each of the six must independently clear `objectSolidRatio` ≥ 0.08 and
   `detailRatio` ≥ 0.12; the gate is per area, not per map.
3. A unit test derives the expected placed-partition set from the same grid, so shared walls cannot
   drift between the builder and the test.
4. Author the `office-kettle-steam` effect. **Step 8 needs it to reach this map at all**, so it is
   not optional decoration. This is also the commit where the packaged all-map smoke may run: the
   west parity row from step 1 has an effect to load as of here.
5. Hallway and lobby floors are `tile.pale-concrete`. `tile.villa-floor` globally borrows
   `tile.boardwalk`, which would import the villa's warm planks into a fluorescent office and fail
   criterion 6. Do not touch the global override.

**Proves it:** `npm run content:build` runs `validateDensity: true`, so the density gate fails the
BUILD, not a test. A pathfinding test walks portal → every clerk stand tile → lot.

*Note: `pale-concrete` is not in `INDOOR_MATERIALS`, so those tiles will footstep as stone. One-line
audio addition, not a blocker.*

---

## Step 6 — Thirteen clerks

**Without an explicit visual map, all twelve clerks render as the same generic resident.**
`visualIdForNpc` in `WorldScene.tsx` is `stateId.replaceAll('_', '-')` checked against
`CHARACTER_IDS`; `clerk_01` → `clerk-01` → no match → `generic-resident`. NPC state carries no
visualId field. Spec 12.1's "reuse resident-01 … resident-13" does nothing on its own.

1. Add the explicit map `clerk_01` → `resident-01` … `office_manager` → `resident-13` in
   `WorldScene.tsx`, which is not frozen.
2. Thirteen ambient rows in `createProductionNpcs` / `createProductionSchedules`, and change
   `buildWorldCatalog()` so the builder EMITS them into `production.json` and
   `production-bill.json`. Hand-editing those files is stripped by the next build.
3. Four-block stay-at-desk schedules per spec 12.2.
4. The idempotent v8 repair from step 2: insert missing office NPCs and schedules on load.
5. Move the `PRODUCTION_CAST_COUNTS` FORMULA (`ambient: residents + 2`, `totalNpcs: … + 3`), not
   just the expected numbers. Then `production-content.test.ts` (ambient 26 → 39, total 34 → 47) and
   `content-validation.test.ts` characters 35 → 48. The location counts already moved to 16 in step
   1, with the locations themselves; do not touch them again here.
6. Add `startComposition` now that clerk ids and desk parts exist. Add `west_office` to
   `DEV_HARNESS_MAP_IDS` now that both exist — golden-hour's ≥6 actives pass because simulation
   promotes inactive NPCs on the active map.

**Proves it:** after one simulated minute on `west_office`, each clerk's tile equals their work
tile. A test asserts `beginConversation('clerk_01')` returns `kind: 'ambient'` and does not throw —
`ConversationService.begin` never asks ambient NPCs for a writing pack, so no biographies are
needed. A test asserts the twelve clerks resolve to twelve DIFFERENT visuals.

---

## Step 7 — The ceiling rig

1. `CEILING_SPRITE_IDS_25D` in `three25/lighting.ts`. `lampLights()` unions floor lamps and ceiling
   fixtures with the ceiling column of spec 11.2.
2. `nightKeyOrigin` gains the indoor branch: inside `shelterCells`, with ceiling fixtures in frame,
   the directional aims straight DOWN from the ceiling centroid at ~80°, intensity 0.7, day colour.
   Outdoors and villa-at-night are untouched.
3. **`lighting.test.ts` currently pins `GROUND_LIGHTING_SPRITES` exactly equal to
   `LAMP_SPRITE_IDS_25D`.** Adding the ceiling sprite to GROUND breaks it. Update it to: GROUND =
   floor lamps ∪ ceiling; `LAMP_SPRITE_IDS_25D` stays equal to the frozen 2D set; ceiling is in
   neither the 2D set nor that equality.
4. The 0.84 sky night floor is **not** a `district-lighting.ts` field. It is the global `0.78` in
   `world-renderer-25.ts` (`hemisphere.intensity = dayHemisphereIntensity * (0.78 + 0.22 * daylight)`).
   Add a per-map branch there. Putting 0.84 in the LEDGER FLUOR preset does nothing by itself.

**Proves it:** unit tests that the indoor overhead key does not fire outdoors or in the villa, and
that the 2D lamp set is unchanged. **Not** pooling — that is step 8's job, and saying so here is the
point. "Draw calls stay 10" is only the `ceilings.ts` constant until a frame is measured in step 8.

---

## Step 8 — The capture loop

**`siWorldStandOnTile` only moves the player on the map they are already on.** A new-game capture
starts in the villa, so `standOnTile(28, 23)` would photograph Sunward. Relocation is
`siWorldOpenVfxFixture(mapId, effectId)`, which THROWS if the effect is missing — hence
`office-kettle-steam` in step 5.

1. `scripts/verification/capture-25d-office.ts` with the seven shots of spec 13.3. Each scene passes
   `district: { mapId: 'west_office', effectId: 'office-kettle-steam' }` and THEN `standOnTile`.
   Hidden window, `stayHidden: true`, pinned viewport, fractional crop, VFX step 2.
2. Score with `score-25d-frames.ts`. **Target pooling 1.45–1.8, not the outdoor `>2`.**
3. Iterate to 9.4+ with the 0.1 stop rule, one change per round. If a capture does not change, run
   the `y = 5` skirt positive control before stacking another guess.
4. Measure draw calls and frame time on this map with the existing
   `measure-25d-draw-calls.ts` and `measure-25d-frame-time.ts`. If frames drop, cut farm panels
   6 → 4 before touching the hemisphere.

**Proves it:** the scores, and the PNGs read against spec 13.1. Not added to
`capture-25d-districts.ts` — a shared folder is fine, a shared target is not.

---

## Step 9 — The full gate

`check:boundaries`, `art:check`, and a final `content:check`. Everything else has already been
proven by the step that introduced it, which is the point of the ordering.

---

## Ordering, and why it cannot be rearranged

Atlas (3) before furniture (5), because `knownSprites` rejects tiles that do not exist yet.
Furniture (5) before clerks (6), because `startComposition` validates part ids. Clerks (6) before
the ceiling rig (7), and both before capture (8) — a ceiling wash over empty carpet will score well
and mean nothing.

`neighborhood-routes.test.ts` uses a LOCAL four-id list and asserts every pair is reachable. Do not
point it at catalog `MAP_IDS`, or `west_office → southeast_docks` throws. Keep the 2×2 all-pairs
test as it is; add one case that office ↔ northwest is direct, and one asserting office → docks
still throws. **Both cases land in step 1**, with the portal that makes them true.

---

## What I expect to go wrong

**The enumeration sweep.** It is wide, and `z.enum(MAP_IDS)` sites fail at runtime rather than at
compile time. Step 1 will take more than one pass.

**Fourteen ceiling point lights** recompile lit materials as panels enter the frame. Downtown pays
this already with twenty posts. Frame time is measured in step 8, and the fix is fewer panels.

**Clerks are populated at 3am**, because their sleep tile is their desk. The spec calls this a
staging lie and accepts it for v1. Any player who walks in at night will see it.
