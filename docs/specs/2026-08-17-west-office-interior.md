---
title: West office interior (Ledger Annex)
type: feat
date: 2026-08-17
status: draft-ready-to-plan
target: a fifth 64×48 map, ceiling-lit, west of Sunward Villas
unfreezes: content/, src/world, src/domain, src/ai, the sprite atlas
amends: docs/specs/2026-08-16-threejs-2-5d-renderer.md section 5 goal 2; docs/25d-scene-playbook.md section 2 freeze list
---

# West office interior specification

## 1. Decision

SI World adds a fifth map, `west_office`, the same size as the four that exist: `64×48` tiles, `32` world pixels per tile. It attaches to the free west edge of `northwest_residential`. The interior is a boring single-storey office: a cubicle farm, a hallway, a shared kitchen, a water-cooler alcove, and a manager's office. Every cubicle has an NPC at the desk.

This is a **content and simulation change**, not a display-only 2.5D pass. The playbook freeze that kept `src/domain`, `src/world`, `src/ai`, `content/`, and the atlas locked for the 2.5D renderer is lifted for the files this document names. The 2D renderer stays the production path and the rollback path. The new map must compile, path-find, and photograph in both renderers.

The 2.5D playbook remains the house guide for how the room is drawn. Section 6 of that playbook is the reason this scene is specified as ceiling-lit. The four districts are a dark world with one warm pocket. An office is a fluorescent floor plate. Scoring it as a night market is how this work would fail.

## 2. What this is not

This is not a sixth district of Halcyra's 2×2. It is a **western spur** off Sunward Villas. One reciprocal portal. No route to downtown, the market, or the docks except through northwest.

This is not a 2.5D-only reinterpretation of an existing map. There is no office in the catalog today.

This is not a multi-storey building, a perspective camera, imported furniture, eight-direction characters, or a sit cycle. Characters stay upright four-direction billboards. "Working at a desk" means standing on the tile south of the desk.

This is not twelve new full-AI characters, twelve biographies, or twelve portraits. The world-character atlas is already at its ceiling.

This is not permission to edit `src/render/three/world-renderer.ts` or `src/render/world-frame.ts`. Ceiling fixtures are a 2.5D lighting set, not a 2D lamp-set expansion.

## 3. Rule revocation

The 2.5D spec, revision 2, section 5, goal 2: keep `src/domain`, `src/world`, `src/ai`, and `content/` untouched. The playbook section 2 freeze list repeats that and adds the atlas.

This document revokes those freezes **for the rows below only**. Everything not listed stays frozen.

| Root | Status after this spec | Why |
|---|---|---|
| `content/` | **unfrozen** | New map JSON, locations, ambient clerks, northwest portal |
| `src/world` | **unfrozen** | `MAP_IDS`, catalog builders, routes, density, content:build inputs |
| `src/domain` | **unfrozen** | Fifth map in neighbourhood state, v8 migration, cast, generated layout |
| `src/ai` | **unfrozen** | `content:build` rewrites `generated-browser-writing.ts` |
| Sprite atlas | **unfrozen, bounded** | Four new `object-landmark` cells, art revision 15 → 16 |
| `src/render/world-frame.ts` | **stays frozen** | Frame already carries props, shelter, lamps |
| `src/render/three/world-renderer.ts` | **stays frozen** | 2D rollback. Ceiling lights are a 2.5D-only set |
| `src/render/three25/` | already owned | Recipes, ceiling-light set, indoor overhead key |
| `src/render/district-lighting.ts` | **unfrozen** | `Record<MapId, …>` must gain a fifth preset |
| `src/audio/halcyra-audio-policy.ts` | **unfrozen** | Same `Record<MapId, …>` |

`npm run check:boundaries` does not change. Domain and world still cannot import `three`, React, Electron, or `src/render`.

## 4. Goals

1. A player standing in Sunward Villas can walk west at tile `(0, 24)` and enter Ledger Annex.
2. The interior reads as a cheap office at yaw 45 / elevation 30: partitions enclose, desks have mass, ceiling panels light the plate.
3. Twelve cubicles, twelve ambient clerks, one ambient manager. Every cubicle occupied during the capture window.
4. Ceiling-lit night holds a pooling ratio of **1.45–1.8**, not the outdoor pocket target of `>2`.
5. Existing saves load. Continuing players can reach a populated office.
6. `verify:first-hour` stays green without moving any northwest walkable tile except the new portal and its staging tile.
7. Draw-call ceiling stays 10 total / 5 atlas. No new batch, pass, or material.
8. The 2D path remains playable. Production can ship this map before the 2.5D gate.

## 5. Non-goals

No new music. Reuse Sunward audio. No new wall family (civic walls already exist). No new character looks, portraits, or walk frames. No full-AI manager in v1. No conversation folders for clerks. No sit animation. No changing villa table or sofa recipes. No raising the hemisphere until the office floods. No BFS rewrite of `routeBetween` in v1. No quests, verbal missions, or invitations that target the office. No stairs, no second floor, no exterior skyline of towers.

## 6. Locked baseline

Verified in the worktree against the files this brief named.

### 6.1 Maps

Four maps, each `schemaVersion: 2`, `layoutRevision: 2`, `64×48`, `tileSize: 32`. Authored under `content/maps/*.json`. Zod lives in `src/world/maps/schema.ts`. The closed union is `MAP_IDS` in `src/world/maps/catalog.ts`:

```ts
'northwest_residential' | 'northeast_downtown' | 'southwest_commercial' | 'southeast_docks'
```

Portals must sit on their declared edge, be reciprocal, and align on the shared axis. East–west pairs in this game already share `y = 24`. South–north pairs share `x = 32`.

`northwest_residential` portals today: `to-downtown` at `(63, 24)`, `to-commercial` at `(32, 47)`. Its west edge is free. The villa shell starts at `x = 8`. Ground west of that is default `tile.warm-sand`. No wall run, terrain solid, or object in the authored file occupies `(0, 24)`. **Implementation step 0 is a compiler assertion that `(0, 24)` is walkable before the portal is added.** If that tile is blocked, this spec's attachment point moves one walkable tile north or south and the office entrance moves with it. Do not guess.

### 6.2 Saves and neighbourhood state

`STATE_SCHEMA_VERSION = 7`. Chain is `v1` → `v7`. `maps` is `z.record(StableIdSchema, MapStateSchema)`, an open record, not a four-key object. `layoutRevisions` is the same shape. `createInitialState()` still lists exactly four map records.

`contentVersion` is the literal `'content-0.1.0'`. A bump requires the migration to rewrite the field, or old envelopes fail to parse.

### 6.3 Cast and atlas

`production-bill.json`: 8 full-AI, 26 ambient, 35 visual ids. World-character ceiling is `280 = 35 × 8`. That category is full. Portrait ceiling is 53 with 35 used. Object-landmark ceiling is 64; the 2.5D spec counted 62 used. Two slots left. Not enough for this map.

Ambient residents `resident_01`…`resident_24` already have looks. New clerk **ids** can reuse those **visuals**. No new walk frames.

### 6.4 Lighting the four districts use

Point lights come from lamp **props**, not from `DistrictLighting.pools`. Set is `LAMP_SPRITE_IDS_25D`, copied from the frozen 2D renderer and pinned equal by test. Night key above `lampMix` 0.6 moves the one directional to the lamp centroid, day-coloured, intensity 1.6, grazing at 20°. Indoor blobs inside `shelterCells` stay short. Outdoor night crush keys off distance to the nearest emitter, 4 → 15 tiles. Hemisphere night floor is 0.78 of day. Pooling ratio: flood ≈ 1.4, pocket `>2`.

A ceiling-lit room that keeps the grazing night key will rake hard shadows away from an overhead grid. That is the playbook's own trap 11, applied indoors. Section 10 changes the indoor key. It does not change the four districts.

### 6.5 First-hour golden

`runFirstHourGolden()` walks only `northwest_residential`, talks to Linda, places `generic_resident`, resolves the boyfriend quest. The summary does not include map count or NPC count. It will break if northwest pathfinding changes, if `generated-layout` moves Linda or the witness, or if `state.revision` after the scripted commands changes. It will not break merely because a fifth key exists on `state.maps`.

### 6.6 Routing

`routeBetween` finds a direct portal or the first one-hop leg. Comment in `src/world/transfers/routes.ts` says Halcyra is a 2×2. A spur that only connects to northwest can reach downtown and the market in one hop through northwest. It **cannot** reach the docks: there is no `northwest → southeast` portal. `routeBetween('west_office', 'southeast_docks')` throws. v1 clerks never leave `west_office`. Do not rewrite the router until a clerk or a quest needs that path.

## 7. Map identity and attachment

| Field | Value |
|---|---|
| id | `west_office` |
| displayName | Ledger Annex |
| file | `content/maps/west.json` |
| schemaVersion | 2 |
| layoutRevision | 1 |
| width / height / tileSize | 64 / 48 / 32 |
| defaultSprite | `tile.pale-concrete` |
| audio district | `sunward` (reuse, no new music) |
| lighting name | LEDGER FLUOR |
| accent | `#c8d4e0` |

Northwest gains one portal and one staging tile, and bumps `layoutRevision` 2 → 3.

```
northwest_residential.to-office
  edge: west
  tile: { x: 0, y: 24 }
  destinationMapId: west_office
  destinationEntranceId: from-residential

west_office.from-residential
  edge: east
  tile: { x: 63, y: 24 }
  destinationMapId: northwest_residential
  destinationEntranceId: to-office
```

Northwest staging adds `{ x: 1, y: 24 }`. Office staging is `{ x: 62, y: 24 }` plus the lobby tile `{ x: 50, y: 24 }`. Alignment is `y = 24` on both sides, matching every other east–west portal in the catalog.

Do not place a solid, a wall, or a terrain rectangle on those four tiles.

## 8. Floor plan in tiles

The map is a parking strip on the east and one office building on the west. The building is the scene. The lot exists so the portal is not a hole in a wall and so the player has somewhere to stand before the front door.

```
x        6                         29        44      53        63
    y=6  ╔══════════════════════════════════════════════╗ lot
         ║     CUBICLE FARM 4×3                    ║  L      ║
         ║     12 desks, 12 clerks                 ║  O      ║
    y=22 ║═════ HALLWAY 4 tiles tall ═══════════════║  B  door ║  portal
    y=27 ║ MGR OFFICE ║ COOLER ║ KITCHEN           ║  B      ║  (63,24)
    y=41 ╚══════════════════════════════════════════════╝
```

### 8.1 Exterior lot

| Piece | Bounds | Notes |
|---|---|---|
| Lot ground | `{ x: 54, y: 0, width: 10, height: 48 }` | `tile.pale-concrete` |
| Approach stripe | `{ x: 54, y: 23, width: 10, height: 3 }` | `tile.plaza-paver`, the walk from portal to door |
| Portal | `{ x: 63, y: 24 }` | east edge, walkable |
| Two parked cars | anchors `(56, 10)` and `(56, 36)` | existing `tile.parked-car-cyan-left` / `coral-left` pairs |
| Civic sign | `(58, 22)` | `tile.sign-civic` |
| Two lot planters | `(55, 20)`, `(55, 28)` | `tile.fixture-planter` |

Area `annex-lot`: bounds `{ x: 54, y: 0, width: 10, height: 48 }`, density `structural-placeholder`, entrance `{ x: 62, y: 24 }`, required portal `from-residential`.

### 8.2 Building shell

Material: `civic`. Walls are `WALL_HEIGHT_TILES = 1.45`. Use the family's `-f` variant for `sideSource` so `alphaTest` does not punch holes. Doors face their doorway.

| Run | Bounds | Openings |
|---|---|---|
| `annex-north` | `{ x: 6, y: 6, width: 48, height: 1 }` | none |
| `annex-south` | `{ x: 6, y: 41, width: 48, height: 1 }` | none |
| `annex-west` | `{ x: 6, y: 7, width: 1, height: 34 }` | none |
| `annex-east` | `{ x: 53, y: 7, width: 1, height: 34 }` | `annex-front-opening` at `{ x: 53, y: 24 }` |
| `mgr-east` | `{ x: 20, y: 27, width: 1, height: 14 }` | `mgr-door` at `{ x: 20, y: 33 }` |
| `mgr-north` | `{ x: 7, y: 27, width: 13, height: 1 }` | none |
| `cooler-east` | `{ x: 28, y: 27, width: 1, height: 8 }` | `cooler-opening` at `{ x: 28, y: 30 }` |
| `cooler-south` | `{ x: 21, y: 34, width: 8, height: 1 }` | none |
| `kitchen-west` | `{ x: 29, y: 27, width: 1, height: 14 }` | `kitchen-door` at `{ x: 29, y: 33 }` |
| `kitchen-north` | `{ x: 30, y: 27, width: 13, height: 1 }` | none |

Front door: `closed-unlocked`, sprite `tile.closed-door`, `roofGroupId: annex-roof`, approach tiles `(52, 24)` and `(54, 24)`. Manager and kitchen doors are the same pattern. The cooler opening has no door, just a gap.

Roof group `annex-roof`:

- `cells`: `{ x: 6, y: 6, width: 48, height: 36 }`
- `interiorCells`: `{ x: 7, y: 7, width: 46, height: 34 }`

Building `ledger-annex` lists every interior area, the four outer wall runs, entrance `annex-front-opening`, roof `annex-roof`. The compiler's outer-shell flood must not reach any interior cell. The only outer gap is the front door, and that opening is an entrance, so it stays in the shell set.

### 8.3 Interior ground

| Region | Bounds | Sprite |
|---|---|---|
| Office carpet | `{ x: 7, y: 7, width: 37, height: 34 }` | `tile.dock-floor` |
| Hallway runner | `{ x: 7, y: 22, width: 37, height: 4 }` | `tile.villa-floor` |
| Lobby floor | `{ x: 44, y: 7, width: 9, height: 34 }` | `tile.villa-floor` |
| Kitchen floor | `{ x: 30, y: 28, width: 13, height: 13 }` | `tile.sunset-floor` |

2.5D floor overrides (render-side only, in `FLOOR_SOURCE_OVERRIDES`):

- `tile.dock-floor` stays. Measured luminance 57.2, above the lift ceiling of 52. Grey-green reads as cheap carpet under the corner camera. Do not borrow boardwalk here. Warm planks in an office break criterion 6.
- `tile.villa-floor` already borrows `tile.boardwalk` globally. That is wrong for an office hallway. **Do not change the global override.** Add a map-aware override keyed on the placement's map id, or author the hallway as `tile.pale-concrete` so the villa keep its planks. Prefer `tile.pale-concrete` for the hallway and lobby if a map-aware override is more than twenty lines. Name the choice in the implementation PR. Do not silently retint Sunward.

### 8.4 Cubicle farm — 12 desks

Area `cubicle-floor`: `{ x: 7, y: 7, width: 37, height: 15 }`, density `furnished-interior`.

Module is **6 wide × 4 deep**. Four columns, three rows. East walls are shared. One-tile aisles between rows.

Column west edges: `8, 13, 18, 23`. Each module occupies `x = west .. west+5`. Shared wall at `west+5` is also the next module's west wall, except column 0's west wall at `x = 8` and column 3's east wall at `x = 28`.

Row north edges: `8, 13, 18`. Aisles at `y = 12` and `y = 17`. Hallway begins at `y = 22`, so `y = 21` is a one-tile buffer and is marked `intentionalOpenAreas`.

Service corridor on the farm's east: `{ x: 29, y: 7, width: 15, height: 15 }`, also intentional open, with a copier (counter pair at `(36, 9)`), a planter at `(32, 9)`, and a civic sign at `(40, 10)`.

One cubicle, local coordinates, column west `W`, row north `N`:

| Piece | Tiles | Sprite | Solid |
|---|---|---|
| North partition | `(W+1 .. W+4, N)` | `tile.cubicle-partition-h` | yes |
| West partition | `(W, N+1 .. N+3)` | `tile.cubicle-partition-v` | yes |
| East partition | `(W+5, N+1 .. N+3)` | `tile.cubicle-partition-v` | yes, omitted when shared and already placed |
| Desk | `(W+1, N+1)`, `(W+2, N+1)` | `tile.table-left`, `tile.table-right` | yes |
| Filing | `(W+4, N+1)` | `tile.counter-left` | yes |
| Clerk stand | `(W+2, N+2)` | — | **no**. This tile must stay walkable |
| Ceiling panel | `(W+2, N+1)` | `tile.fixture-ceiling-panel` | no |

Shared walls are placed once. Derive the placed set from this grid in a unit test, the same way `RUN_FORMING_GROUPS` is derived from map JSON. Do not hand-list 12 × 8 ids in two places.

Clerk stand tiles, which are also the work tiles:

```
(10,10) (15,10) (20,10) (25,10)
(10,15) (15,15) (20,15) (25,15)
(10,20) (15,20) (20,20) (25,20)
```

Open south face of each module is the aisle. That is how you walk in. Do not close the south with a partition.

Intentional open rectangles for density: the two aisles `{ x: 8, y: 12, width: 21, height: 1 }` and `{ x: 8, y: 17, width: 21, height: 1 }`, the buffer `{ x: 8, y: 21, width: 36, height: 1 }`, and the service corridor `{ x: 29, y: 7, width: 15, height: 15 }`.

Furnished-interior gates this area must meet: solid-object ratio 0.08–0.30, detail ratio ≥ 0.12, walkable ratio ≥ 0.55, at least three object parts and two kinds, no unmarked empty rectangle larger than 6×6.

### 8.5 Hallway

Area `annex-hall`: `{ x: 7, y: 22, width: 37, height: 4 }`, density `furnished-interior`.

The whole rectangle is `intentionalOpenAreas` except three planters at `(12, 23)`, `(30, 23)`, `(42, 23)` and three ceiling panels at `(18, 23)`, `(28, 23)`, `(38, 23)`. Entrance tiles: `(43, 23)` from the lobby, `(20, 22)` from the farm, `(24, 25)` toward the cooler. Primary route is the area itself.

This is the capture spine. Keep it 4 tiles tall so a yaw-45 frame shows cubicle faces on the north and kitchen/manager doors on the south.

### 8.6 Manager's office

Area `manager-office`: `{ x: 7, y: 27, width: 14, height: 14 }`, density `furnished-interior`.

| Piece | Anchor | Sprite |
|---|---|---|
| Desk | `(11, 30)` two tiles | `tile.table-left` / `right` |
| Manager stand | `(12, 32)` | walkable |
| Filing run | `(8, 29)` three counters | `tile.counter-left` / `right` / `left` |
| Sofa | `(14, 37)` | `tile.sofa-left` + `right` |
| Planter | `(17, 29)` | `tile.fixture-planter` |
| Ceiling panel | `(13, 33)` | `tile.fixture-ceiling-panel` |

Intentional open: `{ x: 10, y: 33, width: 8, height: 3 }` so the walk from the door to the desk is legal empty space.

### 8.7 Water-cooler alcove

Area `cooler-nook`: `{ x: 21, y: 27, width: 8, height: 8 }`, density `furnished-interior`.

| Piece | Anchor | Sprite |
|---|---|---|
| Cooler | `(24, 30)` | `tile.water-cooler` |
| Two planters | `(22, 28)`, `(26, 28)` | `tile.fixture-planter` |
| Ceiling panel | `(24, 31)` | `tile.fixture-ceiling-panel` |
| Steam | `(24, 30)` | effect kind `steam` |

The cooler is solid. Approach tile `(24, 31)` is walkable. That is the only social tile in the building if a later pass wants a conversation hook. v1 does not add one.

### 8.8 Kitchen

Area `annex-kitchen`: `{ x: 29, y: 27, width: 24, height: 14 }` clipped by the lobby wall at `x = 44`, so authored bounds `{ x: 29, y: 27, width: 15, height: 14 }`. Density `furnished-interior`.

| Piece | Anchor | Sprite |
|---|---|---|
| North counter run | `(31, 28)` four tiles | `tile.counter-left` / `right` repeating |
| Table | `(34, 33)` two tiles | `tile.table-left` / `right` |
| Two planters | `(31, 36)`, `(40, 36)` | `tile.fixture-planter` |
| Ceiling panels | `(33, 31)`, `(39, 35)` | `tile.fixture-ceiling-panel` |
| Steam | `(31, 28)` | effect kind `steam`, id `office-kettle-steam` |

`office-kettle-steam` is also the VFX fixture a district-style capture can use to reach this map. The hero shot does not stand on it.

### 8.9 Lobby

Area `annex-lobby`: `{ x: 44, y: 7, width: 9, height: 34 }`, density `furnished-interior`.

| Piece | Anchor | Sprite |
|---|---|---|
| Reception counter | `(46, 22)` three tiles, faces east | counters |
| Sofa | `(46, 14)` | sofa pair |
| Planters | `(45, 9)`, `(50, 9)`, `(45, 37)`, `(50, 37)` | planter |
| Civic sign | `(48, 20)` | `tile.sign-civic` |
| Ceiling panels | `(47, 12)`, `(47, 24)`, `(47, 36)` | ceiling panel |

Intentional open: `{ x: 48, y: 20, width: 5, height: 9 }`, the walk from the front door to the hallway.

### 8.10 Areas, locations, start composition

Areas: `annex-lot`, `annex-lobby`, `annex-hall`, `cubicle-floor`, `manager-office`, `cooler-nook`, `annex-kitchen`. Seven areas, one building.

Location registry adds:

- `west_office` — "Ledger Annex Exterior"
- `ledger_annex` — "Ledger Annex"

`content/world/locations/production.json` adds `ledger_annex` with `neighborhoodId: west_office`, `kind: business`, adjacent `west_office`.

Location bindings:

- `west_office` → `annex-lot`
- `ledger_annex` → lobby, hall, cubicle-floor, manager-office, cooler-nook, annex-kitchen

Start composition:

```json
{
  "cameraAnchor": { "x": 50, "y": 24 },
  "requiredActorIds": ["clerk_01", "clerk_02", "office_manager"],
  "requiredDetailPartIds": [
    "cubicle-r0c0-desk-part-01",
    "cubicle-r0c1-north-part-01",
    "annex-ceiling-hall-28"
  ],
  "landmarkAreaIds": ["cubicle-floor", "annex-hall"]
}
```

Protagonist spawn on this map: `{ x: 50, y: 24 }`. That is the lobby, in the light, facing the hallway. It is not used by a new-game start. New games still spawn in the villa.

## 9. Sprites

### 9.1 Reuse, do not redraw

| Need | Sprite | Why this is safe |
|---|---|---|
| Desk | `tile.table-left` / `tile.table-right` | Already a top slab plus a leg. Same object in 2D and 2.5D. Do not change `tableTile()`. |
| Kitchen / reception / filing | `tile.counter-left` / `right` | Grey metal `#84949c`. A filing cabinet at this pixel size is a counter. Do not add drawer strips globally; they would rewrite every villa kitchen. |
| Manager sofa | `tile.sofa-left` / `right` | Already a four-box recipe. Leave it. |
| Planters | `tile.fixture-planter` | Lobby and cooler. |
| Signage | `tile.sign-civic` | Already a post-and-panel. |
| Cars | parked-car pairs | Lot only. |
| Exterior / lobby / hallway floor | `tile.pale-concrete`, `tile.villa-floor` | In atlas. |
| Carpet | `tile.dock-floor` | Cool grey, not Sunward amber. |
| Kitchen floor | `tile.sunset-floor` | Slightly warmer, marks the break room. |
| Outer walls | material `civic` | `tile.wall-civic-*` plus `-f` sides. |
| Doors | `tile.closed-door` | Existing axis resolution. |
| Steam | effect kind `steam` | Kitchen kettle and cooler. `rise` in 2.5D. |

### 9.2 Four new atlas cells

Object-landmark is 62 / 64. Raise `maximumCount` from 64 to 68. Bump `artRevision` 15 → 16. Four 32×32 cells plus gutters do not threaten the 1024² pack. `art:check` must stay green and the regenerated atlas must be committed.

| New sprite | Role | 2D read | 2.5D read |
|---|---|---|---|
| `tile.cubicle-partition-h` | East–west fabric panel | Beige floor stamp, fully opaque | Thin box, height 1.015, depth 0.14 |
| `tile.cubicle-partition-v` | North–south fabric panel | Same paint, rotated stamp | Thin box, width 0.14 |
| `tile.fixture-ceiling-panel` | Troffer | Pale square on the carpet, a floor marking of a light | Housing + glow plate under the roof |
| `tile.water-cooler` | Cooler | Blue jug on a grey body, top-down | Body + jug + spigot |

Two partition sprites are required because recipes are axis-aligned and sprite-keyed. One sprite cannot be both a north wall and an east wall.

Do **not** add `tile.office-desk` or `tile.office-chair` in v1. A chair the NPC cannot sit in is set dressing the atlas cannot afford until object-landmark is raised again. If a capture round scores the desks as slabs, that is the moment to spend a fifth and sixth cell, not now.

Do **not** add new character cells. Reuse `resident-01` … `resident-13` for the thirteen new actor ids.

### 9.3 What would be a bad reinterpretation

Hanging a partition recipe on `tile.counter-left` makes every villa kitchen a cubicle wall and makes the 2D office a counter farm. Hanging a ceiling recipe on `tile.fixture-lamp` plants floor lamps in every cubicle in 2D and adds twenty posts to the 2D lamp set. Using `tile.boardwalk` as office carpet imports Sunward's living-room floor into a fluorescent room and fails criterion 6. All three are rejected.

## 10. Box recipes

Heights are in tiles. Centres follow `recipes.ts`: `y` is the box centre, a floor-sitting box has `y = height / 2`. Check every recipe from above at elevation 30. No upright may hide inside another span.

### 10.1 Cubicle partition

Height `WALL_HEIGHT_TILES * 0.7 = 1.015`. Tall enough to enclose a seated-looking desk, short enough that the camera still sees the room and the clerk's head.

```
tile.cubicle-partition-h:
  { x: 0, y: 0.5075, z: 0, width: 0.98, height: 1.015, depth: 0.14, tint: '#c4b8a0' }

tile.cubicle-partition-v:
  { x: 0, y: 0.5075, z: 0, width: 0.14, height: 1.015, depth: 0.98, tint: '#c4b8a0' }
```

Authored beige until the atlas exists, then measure modal colour excluding luminance `< 55` and replace the tint if the paint already is that beige. Run `readableTint`. Same curve as every other authored tint. These are one-tile recipes on purpose so a shared wall is one box, not a consumed run that overhangs.

### 10.2 Desk

Keep `tableTile()`:

```
{ x: 0, y: 0.46, z: 0, width: 0.98, height: 0.09, depth: 0.7, tint: PALE_WOOD }
{ x: 0, y: 0.23, z: 0, width: 0.09, height: 0.46, depth: 0.6, tint: PALE_WOOD_SHADE }
```

Two adjacent tiles already read as one desk on two legs. Do not add a chair box to this recipe. That chair would appear under every villa table.

### 10.3 Filing / kitchen / reception counter

Keep the current single box, height 0.84. Do not add drawer strips. A later office-only sprite may do that.

### 10.4 Water cooler

```
body   { x: 0, y: 0.36, z: 0, width: 0.42, height: 0.72, depth: 0.42, tint: '#8a9298' }
jug    { x: 0, y: 0.90, z: 0, width: 0.30, height: 0.28, depth: 0.30, tint: '#bfe4ff' }
cap    { x: 0, y: 1.07, z: 0, width: 0.12, height: 0.08, depth: 0.12, tint: '#8a9298' }
spigot { x: 0, y: 0.52, z: 0.24, width: 0.08, height: 0.08, depth: 0.12, tint: '#6a7278' }
```

The jug is not `glow`. It is plastic, not a lamp. Do not add this sprite to any lamp set. The optional steam emitter is the thing that reads as cold air.

### 10.5 Ceiling panel

```
housing { x: 0, y: 1.38, z: 0, width: 0.84, height: 0.08, depth: 0.84, tint: '#d0d4d8' }
plate   { x: 0, y: 1.33, z: 0, width: 0.72, height: 0.04, depth: 0.72, tint: '#e8eef4', glow: true }
```

The plate is a light. `glow: true`, face shade `[1,1,1,1,1,1]`, unlit batch. Only fixtures may set `glow`; extend the existing test to allow this sprite.

The housing sits just under the roof lid at `y = 1.45`. A zoom-3 interior shot must see the plate against the lid, not a floating square in mid-air.

### 10.6 Fixture inventory

Fourteen ceiling panels, on purpose. Downtown's fourteen neon signs taught the cost of adding that many to the **point-light** set. These fourteen **are** the lights, so they join the new ceiling set, not the floor-lamp set. A zoom-3 window over the cubicle farm sees about six. That is inside what the four districts already compile when a street of posts enters the frame.

```
Cubicle farm: (11,9) (21,9) (11,19) (21,19) (16,14) (26,14)
Hallway:      (18,23) (28,23) (38,23)
Lobby:        (47,12) (47,24) (47,36)
Kitchen:      (33,31) (39,35)
Manager:      (13,33)
Cooler:       (24,31)
```

Farm panels sit on the listed tiles even when that tile is also a desk. The panel is not solid. The desk recipe owns the furniture; the panel is a separate object in the same cell, like a villa lamp on a floor tile. If the compiler rejects two objects on one tile, move the panel one tile south into the stand tile's neighbour, not onto the clerk.

## 11. Lighting rig

An office is ceiling-lit. The pooled-lamp night model is the wrong default. The playbook's own worked example said "raise the hemisphere night floor, or map ceiling fixtures to point lights at greater height." This spec does the second, with a small first as a floor, and it changes the indoor night key so the room does not rake.

### 11.1 What must not happen

- Floor-lamp posts in the cubicles.
- Night key at 20° from the centroid of a 14-panel grid. That is a sunset in a fluorescent room.
- Hemisphere night floor high enough that the pooling ratio drops below 1.4. That is the courtyard flood again.
- Outdoor crush applied inside `shelterCells`. The existing function already no-ops indoors. Keep it.
- Flicker at ±6% on every troffer. An office that blinks looks broken. Ceiling flicker is ±2% or off.
- Adding ceiling sprites to `LAMP_SPRITE_IDS` in the frozen 2D renderer. The copy-equality test would then demand a 2D edit.

### 11.2 Ceiling point lights

New set in `src/render/three25/lighting.ts`:

```
CEILING_SPRITE_IDS_25D = { 'tile.fixture-ceiling-panel' }
```

`lampLights()` unions floor lamps and ceiling fixtures. Ceiling entries differ:

| | Floor lamp | Ceiling panel |
|---|---|---|
| Height of the point | head box, ~1.0 | 1.33 |
| Colour | recipe glow (`#ffd9a0` etc.) | `#d8e4f0` |
| Distance | 11 | 10 |
| Decay | 1.4 | 1.2 |
| Intensity | `0.2 + lampMix * 11` | `0.6 + lampMix * 6` |
| Flicker | ±6% | ±2% or 1.0 |
| Floor pool radius | 3.2 | 4.0 |
| Floor pool opacity | `0.5 * lampMix` | `0.28 * lampMix` |

Cooler, wider, weaker than a post. Overlap is the even wash. Local falloff between a panel and a far corner is what criterion 3 scores. The 2D lamp set is untouched. `GROUND_LIGHTING_SPRITES` gains the ceiling sprite so any future outdoor use of that sprite still carves crush. The equality test between `LAMP_SPRITE_IDS_25D` and the 2D set stays, and does not include the ceiling set.

### 11.3 Indoor night key

New branch in `nightKeyOrigin` and the sun aim in `world-renderer-25.ts`:

- If `lampMix >= 0.6` AND the player tile is inside `shelterCells` AND at least one ceiling fixture is in frame, the directional aims **straight down** from the centroid of those ceiling fixtures. Elevation ~80°, intensity 0.7, colour stays day-sun `#ffefdb`. Shadows become tight puddles under desks and partitions.
- If the player is indoors but only floor lamps are in frame (the villa at night), keep today's short-blob indoor behaviour and do not steal the villa's lamp key.
- If the player is outdoors, nothing changes. District night key, outdoor crush, grazing 20° stay.

Character blobs inside shelter already stay short. They follow this overhead key the same way they already refuse the dead sun. Contact stains stay.

### 11.4 Hemisphere floor, this map only

`districtLighting('west_office')`:

```
accent: '#c8d4e0'
name: 'LEDGER FLUOR'
shelterShade: '#1a222c33'
casters: [{ x: 28, y: 23 }, { x: 47, y: 24 }]
pools: []          // 2.5D does not place lights from pools
intensity: 1.05
```

Sky night floor for tiles on this map is **0.84 of day**, not 0.78. That is a floor so a desk at the edge of a panel does not crush to the void. It is not a flood. If a night capture measures pooling `< 1.45`, **lower** this number, do not raise panel intensity. If pooling `> 1.9`, add a panel or raise intensity slightly, do not raise the hemisphere.

Sky colour stays `#f5dcb0` over `#4a4a44`. Do not tint the sky with the district accent. A grey office that paints its sky teal-grey loses the little warm/cool it has. Skyglow for this map is off, or at `0.15 * lampMix` toward `#d8e4f0` brightness-rescaled. Measure both. Keep the one that does not drop mean saturation.

### 11.5 Day and fallback

Noon is the control. Sun does the work, panels sit near-off (`lampMix` ~ 0), colour must still match. The no-lights fallback must hold 60 FPS and carry its own shot. Fallback indoor night will look flatter. That is acceptable if noon and lit-night both score. Do not "fix" fallback by turning the hemisphere into a flood.

### 11.6 Coexistence with the outdoor model

The lot is outside the roof and outside `shelterCells`. It uses outdoor crush against the lobby's ceiling panels and any lot lamps. There are no lot lamps in v1, so the lot at night falls toward the void. That is correct. The building is the stage. Do not plant posts in the car park to save the lot. The capture does not frame the lot.

A player standing in the doorway has tiles in and out of shelter in one frame. `shelteredTint` already handles that per tile. Do not add a special case.

## 12. NPC placement

### 12.1 Who

Thirteen new ambient NPCs. No full-AI. No character folders. No portraits. No authored dialogue.

| Id | Visual | Stand tile | Role |
|---|---|---|---|
| `clerk_01` … `clerk_12` | `resident-01` … `resident-12` | the twelve stand tiles in §8.4 | at the desk |
| `office_manager` | `resident-13` | `(12, 32)` | in the office |

They join `content/world/characters/production.json` as `tier: ambient`, `homeLocationId: ledger_annex`. They join `createProductionNpcs` / `createProductionSchedules` as their own list, not as more `DISTRICT_HUBS` residents. `PRODUCTION_AMBIENT_RESIDENTS` stays 24. Tests that pin that length stay green. Tests that pin `PRODUCTION_CAST_COUNTS.totalNpcs` must move from 34 to 47.

`production-bill.json` gains the thirteen ids. `visualIds` does **not** gain new looks.

Conversation: if the runtime refuses to open a panel without a writing pack, clerks are not talkable. If it falls back to `generic-resident`, that is acceptable and must be asserted by a test so we do not silently ship thirteen empty prompt projections. Do not write thirteen biographies "to be safe."

### 12.2 How they stay at the desk

Schedule, every clerk and the manager:

```
00:00  activity sleep     tile = stand tile   map = west_office
08:00  activity work      tile = stand tile   map = west_office
12:00  activity work      tile = stand tile   map = west_office
22:00  activity evening   tile = stand tile   map = west_office
```

Four blocks, strictly increasing, matches `ScheduleStateSchema`. The sleep and evening tiles are the desk. That is a staging lie. It is cheaper than thirteen homes on Sunward, and it keeps the night capture populated. A later pass may give them northwest homes and a commute through `to-office`. That pass must also stop `routeBetween('west_office', 'southeast_docks')` from throwing if anyone ever books a docks goal.

They never transfer. `presence.kind` is `inactive` until the player is on `west_office`, matching today's off-neighbourhood ambient rule in `blankNpc`. When the player enters, they are `active_local` at the stand tile. If the active-NPC system walks them toward a schedule goal they already occupy, the path is empty and they stand. Assert that: after one minute of sim on this map, each clerk's tile equals their work tile.

Do not put clerks in `northwest_residential.spawns`. They do not belong in the villa start composition or the first-hour witness set.

### 12.3 Facing

Desks sit on the north side of the module. Clerks stand south of the desk and face **up** (north), into the desk. The manager faces north into their desk. Billboards stay world-vertical, yaw-facing only. If a clerk renders through the partition, the partition is too tall or the stand tile is too far north. Move the stand tile, do not rotate the card onto the view plane.

## 13. Capture and scoring

### 13.1 What "10/10" means here

The rubric in playbook section 1 still has ten points. Two readings change.

Criterion 3, light falls on things: a desk under a panel is brighter than the service-corridor carpet. It is not "one warm pocket in a dark world." A ceiling-lit room that scores a pooling ratio of 2.4 has been lit like a street.

Criterion 8, density: the frame is cubicles, hallway, and a clerk. It is not 70% carpet. Empty beige is a fail even if the lighting is even.

"10/10 for a deliberately boring office" is: depth reads, partitions enclose, fluorescent wash with local falloff, hard tight shadows, grey/beige/wood in one light, carpet ≠ laminate ≠ metal ≠ fabric, the grid fills the frame, the player is readable in the hallway, nearest filter and flat shade. It should look cheap and finished, not romantic.

Ship bar stays 9.4+ with a 0.1 gain stop rule.

### 13.2 Pooling

Target **1.45–1.8** on the night cubicle shot. Below 1.4 is a flood; treat a luminance-up / dead-pixel-down pair as suspect until this ratio agrees. Above 2.0 means the panels are acting like posts. Fix the rig, do not retarget the number.

Noon has no pooling requirement. Noon is the colour control.

### 13.3 Shots

New script `scripts/verification/capture-25d-office.ts`. Hidden window, `show: false`, `stayHidden: true`, audio muted, throttling off, processes closed on success and failure. Pin viewport. Crop by fraction. VFX step 2. Reach the map through `office-kettle-steam` or an explicit `district: { mapId: 'west_office' }` once the harness can relocate without a fixture. Stand the player with `standOnTile`, not by hoping the fixture is the composition.

| Name | Minute | Zoom | Stand | Why |
|---|---|---|---|---|
| `office-cubicles-late` | 1020 (17:00) | 3 | `(28, 23)` | Hero shot. Workers at desks, hallway light, grid fills the frame |
| `office-cubicles-night` | 1245 | 3 | `(28, 23)` | Ceiling rig, pooling 1.45–1.8 |
| `office-cubicles-noon` | 720 | 3 | `(28, 23)` | Colour control |
| `office-cubicles-night-fallback` | 1245 | 3 | `(28, 23)` | No-lights path |
| `office-kitchen-night` | 1245 | 3 | `(36, 33)` | Steam, counters, warmer floor |
| `office-manager-night` | 1245 | 3 | `(16, 33)` | Sofa + desk + one clerk-boss |
| `office-lobby-day` | 720 | 2 | `(50, 24)` | Door, reception, civic sign, lot crush outside |

`(28, 23)` is on the hallway runner, within three tiles of a ceiling panel, looking into the densest part of the farm. Count render parts inside the zoom-3 window and confirm before locking the tile. If the densest window is the empty service corridor, ignore the count and keep `(28, 23)`.

Bisect a dark result with the three-capture rule: lit night, fallback night, lit noon.

### 13.4 Scoring loop

1. `npm run typecheck`
2. `npm run export:web`
3. `npx tsx scripts/verification/capture-25d-office.ts --output-root artifacts/phase-25d/office/<round>`
4. `npx tsx scripts/verification/score-25d-frames.ts <round> <previous>`
5. Read the PNGs against section 13.1. Crop a 3× nearest of one partition, one desk, one clerk.
6. Change one thing. Recapture. If the PNG does not change, run the `y = 5` skirt control before stacking another guess.
7. `npm test`, `npm run check:boundaries`, `npm run content:check`, `npm run art:check` if the atlas moved. Commit.

Evidence labels stay in lockstep with the smokes. If `#world-geometry-state` or the camera label changes format, update both sides in the same PR.

Do not add this map to `capture-25d-districts.ts` as a fifth "district" scored against the pocket-light rubric. It is a different scene type. A shared folder is fine. A shared target is not.

## 14. Honest cost of every unfrozen root

### 14.1 New map id in the union and neighbourhood state

`MAP_IDS` grows. Every `Record<MapId, …>` and every `z.enum(MAP_IDS)` grows with it. Known call sites:

- `src/world/maps/catalog.ts` — both catalog builders, four-key literals
- `scripts/content/build-map-v2.ts` `LAYOUT_REVISIONS` and the filename table
- `scripts/content/validate-content.ts` filename table
- `scripts/art/content-authority.ts`
- `scripts/qualification/author-light-samples.ts` `MAP_FILES`
- `src/render/district-lighting.ts`
- `src/audio/halcyra-audio-policy.ts`
- `src/application/presentation/preferences.ts` (already `z.enum(MAP_IDS)`)
- `src/ui/dev-harness` map lists and the golden-hour `test.each`
- art-quality manifests that list four map ids
- `src/world/__tests__/map-v2.test.ts` reciprocal fixtures

`assertV2CompatibilityRoutes` will fail until `content:build` rewrites `generated-routes.ts` and that file is committed. `routeBetween`'s 2×2 comment becomes a lie unless it is updated. The algorithm can stay.

Cost: one mechanical pass, then the generated commit. Under-counting the `Record<MapId, …>` sites is how this PR stays red for a day.

### 14.2 Save migration: v7 → v8, not additive

New games could insert the fifth map in `createInitialState()` and leave `STATE_SCHEMA_VERSION` at 7. `maps` is an open record. That is a trap.

A v7 envelope that does not contain `west_office` cannot transfer there: the reducer checks `state.maps[command.destinationMapId]`. A v7 envelope that does not contain the thirteen clerks loads an empty office. `contentVersion` is a literal. Layout revision on northwest moves 2 → 3; the layout-migration machinery expects to see that.

**v8 is required.** `v7-to-v8.ts`:

1. Set `schemaVersion: 8`, `contentVersion: 'content-0.2.0'`.
2. Insert `maps.west_office = { id: 'west_office', active: false, unlocked: true, discoveredEntranceIds: [] }` if missing.
3. Insert `layoutRevisions.west_office = 1`. Rewrite `layoutRevisions.northwest_residential` to 3 only if the saved value is 2 **and** no northwest actor tile became illegal. The portal is additive. There should be no `layoutMigrationEvidence` row. If a fixture disagrees, stop and look; do not invent a teleport.
4. Insert the thirteen NPC records, blank relationships, and four-block schedules if missing. Do not touch existing NPCs.
5. Do not move the protagonist. Do not unlock the office as active.

Fixtures under `tests/fixtures/saves/`. `smoke:save-migration` must load a v7 envelope and walk west into a populated annex. `STATE_SCHEMA_VERSION` becomes 8. `CONTENT_VERSION` becomes `content-0.2.0`.

Cost: one migration module, one fixture family, a smoke, and every test that pins schema 7. This is the largest simulation cost in the spec. Skipping it ships a map continuing players cannot use.

### 14.3 content:build output

`npm run content:build` rewrites:

- `src/domain/state/generated-layout.ts`
- `src/world/transfers/generated-routes.ts`
- `src/ai/registry/generated-browser-writing.ts`
- save fixtures the builder owns

`content:check` is builder then `git diff --exit-code`. The generated files are part of the PR. Do not hand-edit them.

Browser-writing for thirteen ambient clerks with no folders must not fail the builder. If it currently requires a writing pack per NPC, that is a builder change, not thirteen biographies. Prefer "ambient without writing is legal."

### 14.4 Atlas

Four new object-landmark cells. Raise the category ceiling 64 → 68. Art revision 15 → 16. `art:check` regenerates and diffs. Commit `assets/generated/`.

World-character stays 280. Portrait stays 53. No new wall family (civic is 16+ cells; wall-door has four slots free, not sixteen).

`PROP_FLAT_COLORS`, `PROP_RECIPES`, `LAMP_GLOW_COLORS` (if the plate glow is derived), and the glow-guard test all gain rows. Measure colours from the new cells after they exist. Do not invent hex values in the renderer and then skip the measure.

Cost: one art revision, four cells, recipe rows, a committed atlas. Cheaper than twelve characters. More honest than reinterpreting counters as walls.

### 14.5 NPCs, registries, schedules, conversation

Thirteen ambient rows across production characters, production-cast, production-bill, initial-state (via `createProductionNpcs`), and the v8 migration. One location, one neighbourhood binding. No `content/characters/<clerk>/`. No interests, no quests, no memories.

If a later pass wants a talkable manager, that is a new spec: one folder, one full-AI row, one portrait expression set, and a world-character budget raise of 8 cells. Do not sneak it into v1.

Cost of v1 clerks: state bloat and a few tests. Cost of doing them full-AI: the cast pipeline, the portrait smoke, the atlas ceiling, and first-hour-adjacent conversation surface. Rejected.

### 14.6 verify:first-hour

Can this break it? **Yes, if we are sloppy. No, if northwest's walkable graph is unchanged.**

Safe:

- Fifth map key, thirteen inactive NPCs on another map, new schedules those NPCs own.
- Generated routes that add two portal rows.

Unsafe:

- Any new solid, wall, or object on northwest that changes a path Linda or the protagonist uses.
- Moving `generic_resident`'s work tile in `generated-layout`.
- A layout-migration pass that rewrites villa tiles because revision went 2 → 3.
- A `CONTENT_VERSION` bump without a migration, so `createInitialState` cannot parse.

Action: after the northwest portal lands, run `npm run verify:first-hour` (the `tsx` script, not a visible window) before any office furniture exists. If the golden mismatches, the portal work is the suspect, not the cubicles. Do not update `tests/fixtures/first-hour/golden.json` unless the summary change is explained in the same commit.

### 14.7 Renderer and capture surface

`three25/` is already unfrozen. The new work there is recipes, a ceiling light set, an indoor overhead key, and a map-aware floor override if §8.3 needs one. No new batch. Glow boxes already have a batch. Draw-call ceiling stays 10 / 5.

`district-lighting.ts` and the audio policy must compile after `MAP_IDS` grows. That is a fifth preset and a `sunward` reuse, not a new soundtrack. `audio:check` stays green if no sample changes.

Capture scripts and the hidden-window harness must learn a fifth map. Prefer a dedicated office script over overloading the district scorer.

### 14.8 What stays cheaper if we refuse part of the ask

Filling the 64×48 with cubicles: density fails, lighting floods, the capture frames carpet. Rejected in §8.

A realistic 08:00–17:00 commute from Sunward: empty night shots, thirteen more actors on the villa map, first-hour risk, and a router hole to the docks. Rejected in §12.

Zero new sprites: the 2D office does not read as an office and the 2.5D recipes damage the four districts. Rejected in §9.

Skipping v8: continuing saves cannot enter a populated office. Rejected in §14.2.

## 15. Implementation sequence

Plan against this order. Each step is a PR-sized slice that leaves main green.

1. **Probe northwest `(0, 24)`.** Compiler assertion. Stop if blocked.
2. **Union only.** Add `west_office` to `MAP_IDS`, a stub map (lot + empty civic shell + reciprocal portal), district lighting preset, audio reuse, `content:build`, typecheck. No NPCs yet. New games can walk into an empty shell.
3. **v8.** Migration, fixtures, `CONTENT_VERSION`, save-migration smoke. Empty shell still, but old saves can enter it.
4. **Atlas.** Four cells, art revision 16, recipes, colour measure.
5. **Furniture and density.** Floor plan as authored in §8. `validateDensity: true`. Path from portal to every clerk stand and back to the lot.
6. **Clerks.** Thirteen ambient rows, stay-at-desk schedules, presence test.
7. **Ceiling rig.** Point lights, overhead indoor key, pooling shot.
8. **Capture loop** to 9.4+ with a 0.1 stop. Noon + night + fallback.
9. **First-hour + boundaries + content:check + art:check + unit tests.** Only then consider the map done.

Do not start at step 7. A ceiling rig with no furniture is a flood over carpet, and the scorer will lie that it is going well.

## 16. Acceptance

The spec is done when a later plan can assign work without inventing tile bounds, sprite ids, recipe heights, light numbers, NPC ids, or a migration shape.

The feature is done when all of these are true:

- A new game and a migrated v7 save can walk west from Sunward into Ledger Annex.
- Twelve clerks and one manager occupy the twelve cubicles and the office at minute 1020 and at minute 1245.
- Night cubicle capture pooling is in `[1.45, 1.8]`, rubric ≥ 9.4, gain ≤ 0.1 against the previous round.
- Draw calls ≤ 10, atlas batches ≤ 5.
- `verify:first-hour` matches the committed golden, or the golden update is explained.
- `content:check`, `art:check`, `check:boundaries`, `typecheck`, and `npm test` pass.
- The 2D path still loads the map. No edit in `world-renderer.ts` or `world-frame.ts`.

## 17. Risks left on purpose

- `(0, 24)` walkability is read from authored JSON, not from a compiled blocked-key set. Step 0 exists because of that.
- Two objects on one desk tile (desk + ceiling panel) may be illegal in the v2 compiler. If it is, move the panel, do not delete the desk.
- Hallway floor sprite vs the global villa→boardwalk override is an implementation choice (§8.3). Either a map-aware override or `tile.pale-concrete`. Do not retint Sunward.
- Ambient clerks may or may not be talkable depending on writing-pack requirements. §12.1 says which way to resolve it. Confirm against the builder, do not assume.
- Fourteen ceiling point lights will recompile lit materials as panels enter and leave the inflated frame. Downtown already pays this. If frame time on this map fails 60 FPS in the hidden-window measure script, drop farm panels from 6 to 4 before touching the hemisphere.
- `routeBetween('west_office', 'southeast_docks')` still throws. Documented. Do not "fix" it until a caller exists.

That is the whole ask: a floor plan in tiles, a sprite list, box recipes, a ceiling-lit rig that can live next to the outdoor night key, clerks who stay at their desks, a capture plan whose 10/10 is honest about boredom, and a freeze-by-freeze cost.
