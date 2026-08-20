# Halcyra art bible

Status: Canonical art contract. The Phase 33 HFM-geometry full-cast rebuild follows section 9.

## 1. Style target

Halcyra uses an original warm-noir pixel-diorama style.

- The game always stays 2D.
- Keep the scene minimal. Favor RimWorld-like simulation clarity over decorative detail.
- Never replace readable sprites and flat diorama layers with 3D rendering or high-detail painted art.
- The island looks attractive at first sight.
- Warm sun, clean water, and inviting businesses sell the public image.
- Deep shade, worn service routes, guarded doors, and selective neon show the hidden vice economy.
- The result must stay readable at native `1x` zoom.
- Character art must reuse the proven HFM geometry and assembly grammar. Halcyra clothing, accessories, palettes, jobs, and identities remain original.

## 2. Fixed scale

- One world tile is `32x32` pixels.
- One world character cell is `24x30` pixels.
- One portrait cell is `24x29` pixels.
- World zoom runs from `100%` to `300%` in `10%` steps.
- All final placement is on whole screen pixels.
- Runtime sampling is nearest neighbor.
- Source layers compile into flat atlas cells before play.

## 3. Light and depth

- Primary light comes from the upper left.
- Top and left edges can use one lighter value.
- Bottom and right edges can use one darker value.
- Contact shadows sit on the lower-right side of a solid object.
- A cast shadow can extend farther only when the object is tall enough to justify it.
- Do not put independent light directions in adjacent cells.
- Night lighting uses small local pools. It does not recolor every object with saturated neon.

Depth order remains:

1. ground base;
2. ground transition;
3. ground decal;
4. low prop and contact shadow;
5. character and tall object;
6. wall and door face;
7. roof and canopy;
8. temporary effect.

## 4. Contours

- Use a dark warm contour, not pure black, for ordinary forms.
- Keep the outer silhouette stronger than interior seams.
- Use one-pixel contour steps. Avoid noisy single pixels around smooth shapes.
- A solid object's lower edge must be easy to find because it supports collision readability.
- Do not outline every ground variation. Ground must stay behind actors and objects.
- Transparent pixels must have RGB `0,0,0`.

## 5. Palette system

Use compact material families. A family contains a base, light, shade, deep contour, and one restrained accent.

### Island daylight

| Role | Direction |
|---|---|
| Sun | pale amber, low saturation |
| Sand | warm ochre and tan |
| Stone | warm gray with a small olive bias |
| Water | muted teal, not electric blue |
| Foliage | dusty green with yellow-green sun edges |
| Wood | amber brown with dark umber seams |

### Warm noir

| Role | Direction |
|---|---|
| Deep shade | brown-violet or blue-charcoal |
| Vice accent | magenta, red-orange, or cyan in small areas |
| Civic accent | muted brass and cold gray |
| Police accent | dark navy with a restrained pale-blue mark |
| Warning | dirty amber or muted red |

Rules:

- One object family should use no more than five main values before small identity accents.
- Saturated accents must occupy less area than neutral material colors.
- UI colors do not define world-material colors.
- Character skin, hair, and clothing values must remain separate in shade.

## 6. Material grammar

Each shipped material family needs:

- at least three base variants when the material covers a large area;
- declared `soft`, `built`, or `none` edge behavior;
- a stable coordinate rule for structured patterns;
- restrained decals that do not change collision or gameplay state;
- one tested native-zoom sample on both a light and a dark neighbor.

### Sand

- Use broad value groups, small ripples, and sparse pebbles.
- Avoid evenly spaced dots.
- Sand meets water with a soft edge.
- Sand meets a built floor with a controlled built edge.

### Wood and boardwalk

- Planks continue across tile boundaries by coordinate phase.
- Seams use long grouped lines, not a full square grid on every tile.
- Add small wear near doors and traffic lanes.

### Stone, paver, and concrete

- Use grouped slabs or pavers with stable phase.
- Put dirt and chips near edges and contact points.
- Do not cover the full surface with uniform grain.

### Asphalt

- Keep the base low contrast.
- Use rare patched areas, drainage wear, and tire marks.
- Road marks must stay legible above texture.

### Water

- Use slow grouped bands and rare light glints.
- Do not animate every tile independently.
- The shoreline edge must read at `1x`.

## 7. Buildings, walls, and roofs

- Wall faces must show thickness and a stable lower contact edge.
- Corners and joins use generated adjacency cases.
- Doors must remain clear in open and closed states. Horizontal-wall doors use side-by-side panels. Vertical-wall doors use stacked panels. The dark doorway cavity touches both wall ends, but the door slab is inset from every jamb so no wall-colored band can read through the assembly.
- Two door tiles must never share an edge. Keep at least one full wall tile between doors.
- Roofs use district-specific material families. They must not all reuse boardwalk art.
- Roof edges need one visible overhang or fascia line.
- Interior floors must not visually merge with outside ground.
- Collision remains deterministic map data. Large generated trees, palms, and bushes add a solid owner on their visible tile. Grass, flowers, leaf litter, and small stones stay passable.

## 8. Props and landmarks

- Small props can fit one tile. Large props are composed first, then split into atlas cells.
- Multi-tile seams must be invisible after composition.
- Tall props declare an anchor tile and full transparent bounds.
- A character must pass behind the upper area and in front of the lower area when the scene requires it.
- Contact shadows must touch the prop. Floating shadows are rejected.
- A landmark needs one clear large shape before micro-detail.

## 9. Character identity and proportions

### 9.1 One source for one person

- One approved character brief is authoritative for the person's identity across portraits and world views. Current code can use separate render sources, but they must remain synchronized to that brief.
- The approved identity record owns the stable look ID, skin or surface, face, hair, body build, clothing, accessory, held item, and expression intent.
- For a named creature, the approved identity record also owns literal archetype anatomy: skull or
  face, torso, limbs and ground contact, surface or material, and canonical creature features.
  Clothing and accessories cannot substitute for creature anatomy.
- For atlas-path characters, generate the portrait and eight walking cells from this shared source. Do not draw a portrait and world character as separate identities.
- A portrait can contain more detail. It cannot change the archetype, skull or face, torso, limbs,
  surface, head shape, hair mass, key facial feature, body build, main clothing shape, or signature
  accessory.
- A rear or lateral cell can omit a hidden detail. It must preserve the same readable person.
- A recolor, status tint, outfit state, or expression changes only that state. It does not create a new face.

### 9.2 Halcyra character style

- Atlas-path creation rule: every new or changed atlas portrait and world character uses the HFM `24x29` portrait and `24x30` world geometry in this section. Characters routed through `src/render/pencil/` use `character-sprite-authoring.md` and `character-sprite-design2.0.md` instead.
- Use original expressive oddball chibi character art. HFM supplies the atlas shared-source method and pixel discipline; Kindergrimm supplies the pencil construction method. Neither supplies production character designs.
- Atlas only: use HFM's cut-corner face box, fixed eye and mouth rows, stepped portrait shoulders, visible arm and hand columns, two narrow separated legs, shaped feet, and `face -> feature -> body -> outline` assembly order.
- Atlas only: use one logical pixel as the drawing unit. Use hard edges. Do not use gradients, smoothing, or anti-aliasing.
- Atlas only: light the character from the upper left.
- Use a large, readable head and face. The face must remain readable at native `1x`.
- Design the silhouette before the face detail. One major silhouette feature must identify the person before color is considered.
- A creature must read as its archetype with clothing and accessories hidden. Reject a human body
  wearing a creature symbol, printed bones, fur trim, tusk accessory, witch hat, or stitch costume.
- Public-domain archetypes can use recognizable anatomy. Do not copy the exact costume, makeup,
  pose, or silhouette of one protected adaptation.
- Use a controlled dark outer contour. Keep skin, hair, clothing, and accessory values separate where they touch.
- Atlas only: use the shared Halcyra palette families. Add a color only when it improves identity at `1x`.
- Keep all identities fictional and original. Do not copy a real person, full costume, badge, or exact character silhouette.

### 9.3 Mandatory two-feature identity

Every person must have a special, unique, and slightly goofy look. This is a production rule, not an optional polish pass.

- Give each person one primary `signature oddity` and one secondary distinctive feature. Both features must change an authored shape or add a readable object. Atlas uses pixels; pencil uses authored strokes and parts. Text metadata alone does not count.
- The oddity can use the face, hair, facial hair, clothing, accessory, posture, body shape, or the size of one body part.
- Halcyra has no football-uniform limit. Use odd coats, uneven sleeves, huge collars, tiny hats, oversized bags, strange shoes, long noses, broad jaws, narrow shoulders, large hands, or other story-compatible choices.
- Exaggerate one main feature and one supporting feature. The supporting feature can be a hat, jewelry, scarf, dress, cape, unusual sleeve, large black boots, case, bag, tool, or body proportion. Do not make every part noisy.
- Both features must change shape or add a readable object. Color alone does not count.
- The primary oddity must survive front, rear, left, and right cells. A second face detail can be front-specific.
- No two production people can use the same primary oddity or the same complete look.
- The oddity must fit the person's job, habits, history, or attitude. It must not become a cruel stereotype.
- Named people and the protagonist use authored look records.
- Ambient residents use a stable look ID derived from their stable person ID and an authored component pool. Resolve collisions so two people in the active population do not receive the same complete look.
- `generic-resident` identifies the single prototype resident and can remain the unknown-ID development fallback. Reusing it for other production residents does not pass this rule.

### 9.4 Atlas geometry and motion

- For atlas-path characters, keep the current `24x30` world cell and eight walking cells.
- Keep the HFM `24x29` portrait cell.
- Use the same head, eye, mouth, hair, and feature coordinates in portrait and world sources. Do not scale a separate portrait drawing.
- Keep the top, left, and right source margins open for the generated contour. World feet can use the bottom row, as in HFM.
- World bodies need visible arms or an intentional asymmetric garment, two separate narrow legs, and two shaped feet.
- Portrait shoulders must widen through the HFM neck and four shoulder steps before the lower bust. A solid rectangle that starts directly below the head is rejected.
- Feet must change in both walking frames.
- Lateral movement keeps the current front-body method until a native-zoom test proves it unclear.
- If lateral identity is unclear, add one mirrored three-quarter head and hair view before a full side body.

### 9.5 Atlas portrait expressions

- Each new or rebuilt named identity has `rest`, `joy`, and `upset` portrait expressions from the same source.
- Expressions can change eyes, brows, and mouth. They cannot change the person's geometry or signature oddity.
- Until the UI selects expressions, `rest` is the default portrait. The other expressions remain generated and reviewable.

### 9.6 Character review gate

- Review silhouettes without color and review the character at its native play scale.
- Reject a person who reads as a palette swap, ordinary haircut plus ordinary clothes, or a softened version of another person.
- Reject a person if either authored feature disappears at native play scale.
- Atlas only: review the full cast at native `1x` before the enlarged `3x` board, inspect all eight world cells and portrait expressions, and compare the portrait with the front world cell.
- Pencil only: follow `character-sprite-authoring.md` for required facings, states, hidden 2.5D captures, and current capture limitations.
- Reject a portrait that looks good alone but does not match the world character.

## 10. District identity

### Sunward Villas

- relaxed beach-resort materials;
- warm stone, pale wood, fabric shade, clean water, dense planted edges;
- hidden service doors and darker private paths add the noir layer.

### Neon Crescent

- dark pavement, controlled neon pools, worn entrances, bar and club signs;
- neon is an accent, not a full-screen wash.

### Palm Exchange

- shaded shopping walks, awnings, market signs, varied storefront materials;
- use repeated commercial modules with identity accents.

### Harbor Authority

- heavy concrete, metal, ferry equipment, civic brass, police navy;
- larger solid forms and controlled open work zones.

## 11. Density

- A playable area must not look like an empty grid.
- Use building mass, planted edges, paths, small material changes, and prop groups to form outdoor rooms.
- Keep main routes wide enough for pathfinding and click targets.
- Dense art cannot add an interaction. Only the declared large-vegetation families can add deterministic collision.
- Tier B districts receive art upgrades only on existing placements in this program.

## 12. Good sample rules

A good sample:

- reads at native `1x` without zoom help;
- has one clear focal shape;
- keeps characters separate from the ground;
- uses grouped texture instead of uniform noise;
- shows the upper-left light direction;
- preserves solid-object and door readability;
- stays coherent next to two neighboring tiles.

## 13. Rejected sample rules

Reject a sample that has any of these defects:

- a visible repeated checker or dot field;
- texture stronger than collision or route cues;
- outlines on every ground mark;
- different light directions in one scene;
- a character face that disappears at `1x`;
- a prop that appears to float;
- a multi-tile seam through the main shape;
- neon over most of the image;
- a copied silhouette, palette, texture, or interface from a reference game.

## 14. Imitation limits

Reference games can teach scale, density, contrast, depth order, and review methods. They cannot supply production pixels.

- Do not trace screenshots.
- Do not copy named material textures.
- Do not copy a character silhouette or face design.
- Do not copy UI framing, icons, fonts, labels, or color layout.
- Keep Halcyra's warm-noir resort identity and HFM-derived character source method original.

## 15. Review gate

Every changed cell must appear on a review board at native `1x` and nearest-neighbor `3x`. Review it on dark and light backgrounds. A generated-pixel change requires an `artRevision` bump and a new revisioned pixel baseline in the same phase.

## 16. Phase 28 prototype family ledger

This ledger is the source contract for the hard Sunward prototype. All entries use upper-left light, a warm dark contour, whole pixels, and nearest-neighbor sampling.

### 16.1 Characters

| Family | Primary shape | Second non-color feature | Portrait match | Direction rule |
|---|---|---|---|---|
| Protagonist | swept side-part hair | diagonal gold strap | hair, teal shirt, strap, skin, and face marks match | front body stays; feet move laterally; rear keeps hair mass and strap-free back |
| Linda | long side hair columns | paired gold earrings | hair columns, coral dress, earrings, skin, and mouth match | hair columns and earrings survive front and lateral cells; rear keeps the long hair mass |
| Generic resident | high swept quiff | wide glasses | quiff, glasses, blue shirt, skin, and face marks match | quiff and glasses survive front and lateral cells; rear keeps the asymmetric hair mass |

Source margins stay open on the top, left, and right. Phase 33 supersedes the old open-bottom rule: shaped feet can use the bottom row. A one-pixel outward contour is generated after layer composition. Full side profiles are not used because the native `1x` prototype keeps all three identities readable.

### 16.2 Materials

| Family | Ramp | Density | Edge | Variant rule | Good native sample | Reject |
|---|---|---|---|---|---|---|
| Warm sand | pale amber, tan, ochre, muted umber | low | soft | four broad ripple and pebble variants | grouped ripples with open calm areas | even dots or a one-cell stamp |
| Dune grass | sand, dusty green, deep leaf green | high in small clusters | soft | four irregular planted clusters | clustered blades with visible sand | a full green carpet or checker |
| Villa floor | pale amber wood, umber seam | medium | built | two coordinate-phased board patterns | long board groups that continue visually | a dark square grid |
| Spa stone | warm sage-gray, pale edge, deep joint | low | built | two coordinate-phased slab patterns | grouped slabs with quiet centers | uniform grain on every pixel |
| Shallow water | muted teal, pale glint, deep band | medium | soft | four slow horizontal band variants | calm bands with rare glints | electric blue or noisy waves |

The soft transition uses broken triangular edge groups. The built transition uses a continuous light, mid, and shade curb. Both families provide masks `1` through `f`; the review board covers straight, inner, outer, saddle, island, strip, unequal-priority junction, and equal-priority tie cases.

### 16.3 Building and roof

| Family | Shape and material | Contact or edge cue | States |
|---|---|---|---|
| Villa wall | warm pale stucco on a brown-gray core | darker lower and right faces show thickness | all 16 orthogonal joins |
| Villa door | amber timber panels with brass detail | dark threshold remains readable | open, closed-unlocked fixture, closed-locked fixture |
| Sunward roof | terracotta groups with pale fascia | dark five-pixel overhang and light fascia | base, edge, corner |

### 16.4 Props, vegetation, and landmark

| Family | Focal shape | Depth and collision cue | Multi-tile rule |
|---|---|---|---|
| Sofa | long rose cushion and two arms | dark lower cushion and feet | compose the `2x1` object, then split |
| Table | long amber top with two pale place settings | dark legs touch the lower edge | compose the `2x1` object, then split |
| Planter | terracotta box with three leaf masses | dark lower pot edge | one cell |
| Palm | wide dusty-green crown over one narrow trunk | trunk reaches its anchor and uses a dark base | one tall cell |
| Lamp | small amber lantern on a charcoal post | broad dark foot marks the blocker | one tall cell |
| Fountain landmark | pale stone square, teal basin, brass center | dark outer rim and lower band define the footprint | compose the `2x2` object, then split |

The sofa, table, palm, lamp, and fountain are tall-prop review classes. Each needs player-in-front and player-behind proof. Contact shadows stay attached to the object. Ground decals never become solids or interactions.

## 17. Phase 33 HFM full-cast two-feature ledger

The compact look records in `scripts/art/character-look-roster.ts` are authoritative. They generate 35 production identities, 280 world cells, 35 rest portraits, and 18 additional named-character expression portraits. The old per-character JSON sources are retired.

### 17.1 Named cast

| Character | Signature oddity | Supporting feature |
|---|---|---|
| Devon Price | towering nightclub-door flat-top | broad bartender jacket over a tiny waist |
| Elise Moreau | question-mark forelock | oversized shoulder recorder |
| Linda | cloud-sized side hair mass | flared dress |
| Mina Park | three-layer spa-stone bun | one huge towel sleeve and a small supply bag |
| Priya Nair | long crossed hair sticks | oversized clinic coat pockets |
| Protagonist | enormous wind-swept prizewinner forelock | diagonal luggage strap |
| Rafael Cruz | moustache curls beyond both cheeks | cook apron and ladle |
| Sora Tan | angular collar beyond both shoulders | one long sleeve and one short sleeve |
| Tomas Reed | square ear defenders wider than his head | long narrow clerk body and permit pouch |

### 17.2 Ambient cast

| Visual ID | Signature oddity | Supporting feature |
|---|---|---|
| `generic-resident` | apartment-window glasses | long scarf |
| `linda-boyfriend` | tiny pompadour on a long head | broad bow tie |
| `resident-01` | wearable umbrella hat | wide rain cape |
| `resident-02` | planet-like twin buns | large black boots |
| `resident-03` | one-sided crescent cap | one bright cuff |
| `resident-04` | shoulder-to-ankle satchel | guitar case |
| `resident-05` | lantern-shaped chin | short jacket |
| `resident-06` | full-width straw hat | two short braids |
| `resident-07` | coin hat with cheek-high collar | flared coat |
| `resident-08` | one giant bell sleeve | opposite ponytail |
| `resident-09` | head-width bow | large black boots |
| `resident-10` | crooked tower beanie | long scarf |
| `resident-11` | one-sided fan hair | split tunic |
| `resident-12` | square spiral moustache | round vest and tiny button |
| `resident-13` | eye-to-waist monocle chain | side-fastened jacket |
| `resident-14` | collar wings above both shoulders | tiny waist belt |
| `resident-15` | loop backpack above the head | charm bracelet |
| `resident-16` | torso-sized square gloves | large black boots |
| `resident-17` | cap with one tall ear flap | half cape |
| `resident-18` | bent soft mohawk | narrow suspenders |
| `resident-19` | stiff square veil cap | pearl necklace |
| `resident-20` | face-covering star glasses | star cuff |
| `resident-21` | permanent shoulder bird | large necklace |
| `resident-22` | three stiff tripod braids | guitar case |
| `resident-23` | two stacked pairs of square goggles | short jacket |
| `resident-24` | spiral shell shoulders | thin ponytail |

Revision 12 is a historical atlas contract. It uses the protagonist as the shared proportion bar for
legacy atlas humans. It does not control pencil creature anatomy or creature dialogue portraits.
Literal creature anatomy overrides the shared human face, eye grid, body, and profile. The old
automated protagonist-style score cannot approve a creature redesign.

The cast keeps generated rear cells and the front-body lateral method. Named sources generate `rest`, `joy`, and `upset`; ambient sources generate `rest`. Review `artifacts/phase-24/art-quality/phase-33-hfm-full-cast/full-cast-identity-1x.png` before the `3x` board.

## 18. Phase 30 complete Sunward family ledger

Revision 7 upgrades the authoritative `northwest_residential` environment. Door openings can move only to enforce the one-wall-tile spacing rule. Room ownership, interactions, portals, routes, and story content stay unchanged.

### 18.1 Materials and ground detail

| Family | Public variants | Native rule | Reject |
|---|---:|---|---|
| Warm sand | 4 | short, irregular ripple groups with quiet space and rare pebbles | a dominant diagonal cycle, checker, or uniform noise |
| Villa floor | 4 | dark square tiles with related dark grout and low-contrast generated surface texture | bright planks, broken seams, or texture that competes with a character |
| Plaza paver | 2 | pale masonry courses with small, offset wear marks | one-cell stamp or high-contrast grout |
| Boardwalk | 2 | aligned vertical boards with continuous horizontal construction seams | a variant that breaks a shared seam or creates a false blocker |

The `sand-traces` presentation family can select stones, grass, flowers, shrubs, saplings, and palms. Large bushes, saplings, and palms are solid. Grass, flowers, leaf litter, and small stones are passable. All decals stay non-interactive. Material selection and collision placement are deterministic.

### 18.2 Villa shell and openings

| Family | Required visual mass | Opening or state rule |
|---|---|---|
| Villa walls | continuous warm solid cap, dark core, brick outer face, and lower contact shadow | all 16 adjacency cells join without internal tile-end borders; corner caps stay continuous |
| Villa doors | warm timber panels, dark contour, and restrained hardware | side-by-side panels in horizontal walls, stacked panels in vertical walls, and one wall tile between doors |
| Sunward roof | grouped terracotta courses, pale fascia, and controlled wear | base, edge, and corner remain presentation-only and keep the existing roof group |

Villa wall source modules are local to the `villa` palette. The approved Northwest shell and door pass establishes the Tier B architecture grammar for later districts: continuous solid wall mass across all 16 joins, uninterrupted corners, exposed side-face detail, recessed doors, small rectangular handles, and no adjacent door openings. Downtown entered Tier B in revision 8. Civic and commercial walls enter Tier B only during their own district pass and must meet the same continuity and opening bar in their distinct palettes.

### 18.3 Existing props and signs

Beds, sofas, tables, counters, spa signs, market signs, lamps, planters, and palms use the warm-noir resort palette. Each solid footprint offset must have a render part at the same offset with at least 128 visible pixels. Decorative overhangs can use transparent pixels, but they cannot add collision or close a walk lane.

Review all changed cells on `sunward-architecture-1x.png` first. The `3x` board is only an inspection aid. Review the four material boards at native size before the scaled copies.
