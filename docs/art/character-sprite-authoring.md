---
title: Character sprite authoring
type: task-entrypoint
status: authoritative
scope: every new or changed SI World character, sprite, portrait, part, expression, or pose
pencil-reference: character-sprite-design2.0.md
atlas-reference: character-sprite-design.md
---

# Character sprite authoring

Start here for every character task. This file decides what Joe wants, which render path owns it,
and whether current code can draw it. It does not authorize renderer architecture work.

## 1. Run the interview yourself

Do not tell Joe to type `/grill-with-docs`. Run this focused design-tree interview directly:

1. Extract answers already present in Joe's request.
2. Inspect the character, `visualId`, and live render route. Do not ask Joe for code facts.
3. Ask all missing decisions whose prerequisites are settled. This set is the current frontier.
4. Ask the frontier as one numbered round. Give one recommendation and one short reason per question.
5. Wait for answers, recompute the frontier, and continue until no decisions remain.
6. Return the completed brief and current-support verdict.
7. Wait for Joe's explicit approval before drawing or changing code.

```markdown
❓ **Q1 — Head envelope:** Which head shape do you want?

➡️ **Recommendation:** `square`, because the broad jaw carries strength in every facing.
```

If the design needs unsupported code, preserve the creative brief, name the smallest prerequisite,
and stop. Do not shrink a cat into a vampire-shaped human or start a new rig.

## 2. Route before drawing

| Requested surface | Current route |
|---|---|
| Shipping 2.5D `vampire-01` body | Pencil reference |
| Other current world characters | Atlas reference |
| Current portraits | Atlas reference |
| New pencil `visualId` | Complete brief, then stop at Gate A |
| Pencil portrait | Complete brief, then stop; no path exists |

For `vampire-01`, atlas entries still serve rollback and portraits. Atlas edits do not change his
visible 2.5D pencil body.

## 3. Current pencil support

| CURRENT | NOT CURRENT |
|---|---|
| One hardcoded `vampire-01` design | Generic recipes or a second pencil identity |
| One two-arm, two-leg biped plan | Sit, quad, winged, serpentine, limbless, or custom bases |
| Nine ordered vampire parts | Paws, tails, wings, bones, or per-part canvases |
| Nine head families | A generic muzzle or custom skull system |
| Vampire default `HEAD_SHARE = 0.56` | Per-character proportions through recipes |
| Graphite hardcoded for the character | Selectable character media |
| Front idle and four-facing two-state walk | Extra poses, expressions, or pencil portraits |
| Three whole-character boil frames | Per-part boil or blink-swapped faces |

Reduced-motion mode does not freeze pencil boil today. Treat this as an accessibility bug, not a
creative choice and not permission to build the future rig.

## 4. Creative gates

Reject or redesign before implementation when:

- The request copies a real person, costume, badge, emblem, or exact known character silhouette.
- A signature feature is a cruel stereotype about a real group, body, disability, job, or accent.
- Identity depends only on colour or disappears from a required facing.
- The result is a palette swap, duplicates another oddity, or exaggerates every part.

Translate inspiration into an original silhouette and story reason. Ask for human skin tone
separately from medium and graphite density. Never represent darker skin by making it dirtier,
rougher, or more heavily scribbled. Medium is the drawing method; skin tone is colour wash or an
atlas skin ramp.

## 5. Adaptive interview

### Round A — task, subject, and body

Ask every missing item:

1. **Deliverable:** New character, existing change, or concept brief? Which surfaces must show it?
2. **Identity:** Name or ID, story role, and why this character looks this way?
3. **Subject:** Human, human-shaped creature, original superhero, monster, cat, animal, or hybrid?
4. **Base:** Biped, seated, quadruped, winged, serpentine, limbless, or custom?
5. **Envelope:** Compact, chibi, tall, broad, long, top-heavy, bottom-heavy, or asymmetric?
6. **Posture and locomotion:** How does it stand, contact the ground, and move?

Keep three ideas separate: creature identity, anatomical base, and generation mode. A named animal
can be authored without generated species data, but pencil character two still requires Gate A.

### Round B — matching subject branch

**Human or human-shaped:** Which build, hair mass, clothing silhouette, and role object identify
them before facial detail? If there is an unusual body, aid, or prosthesis, how does it remain one
part of the whole person rather than the entire identity?

**Original superhero:** What original power, duty, or theme should the silhouette show? Which shape
carries it without copying a known suit, logo, badge, or hero? Does a cape, item, aura, or locomotion
require unsupported bones or effects?

**Monster:** Which anatomical rule is unusual: number, scale, placement, asymmetry, or material?
Should it read cute, goofy, uncanny, threatening, or mixed? Is it a biped with one monstrous feature
or a different body plan?

**Cat:** Domestic or wild, compact or long-bodied, short-haired or long-haired? Which muzzle, ears,
paws, tail, coat mass, and gait define it without colour alone? Is it a true quadruped, seated
companion, or intentionally cat-headed humanoid?

**Other animal or hybrid:** Which anatomy must survive every facing: muzzle, beak, horns, mane,
hooves, wings, fins, shell, or tail? Which locomotion and resting posture are essential? Which
features belong in the skull, and which need separate parts?

### Round C — identity, surface, and face

1. **Primary oddity:** What one shape identifies this individual in silhouette across all facings?
2. **Supporting feature:** What one shape or object supports it without competing?
3. **Head:** Which supported family is closest? Is a muzzle, beak, jaw, horn base, or custom crown
   required?
4. **Head share:** Keep the vampire default `0.56`, or change it for a stated visual reason? The head
   remains dominant, and the floor stays pinned.
5. **Surface:** Skin, fur, feathers, scales, shell, slime, cloth, armour, stone, smoke, metal,
   spectral material, or another covering? Where does it change?
6. **Colour and value:** What palette and value hierarchy must read at play zoom?
7. **Medium intent:** Graphite now, or another desired medium recorded as unsupported intent?
8. **Resting face:** Eyes, brows, nose or muzzle, mouth, ears, and resting emotion?
9. **Expressions:** Which additional faces have a named gameplay use?

After approval, the agent proposes density and stroke direction per mass. Joe does not need to
invent hatch angles.

### Round D — parts, facings, poses, and evidence

1. **Parts:** Which are reused or new, paired or asymmetric, held, worn, silhouette-only, or moving?
2. **Facings:** What appears, hides, overlaps, mirrors, or changes in front, rear, left, and right?
3. **Poses:** Is front idle plus four-facing walk enough? Which gameplay action needs another pose?
4. **Evidence:** Require black silhouette, native play zoom, required facings, bright and dark
   ground, motion-edge checks, and boil-frame identity stability.

## 6. Approved character brief

```text
Character ID, name, role, and story reason:
Deliverable, target surfaces, and verified route:
Subject, creature identity, anatomical base, posture, and locomotion:
Stature, body envelope, head shape, and head share:
Surface, markings, colour/value hierarchy, and medium intent:
Primary oddity and supporting feature:
Resting face and requested gameplay expressions:
Parts and layer order:
Front, rear, left, and right behavior:
Requested poses and review evidence:
Supported now:
Unsupported or separately gated:
Smallest prerequisite:
Approved by Joe: pending
```

No drawing or code starts while approval is pending.

## 7. Stop conditions and route

Finish the brief, then stop when any applies:

| Requirement | Route |
|---|---|
| Existing pencil vampire within current scope | Smallest owning-part or shared-primitive change |
| Second pencil identity | Gate A, only with explicit authorization |
| Extra poses, bones, or independent boil | Gate B |
| Expressions or blink transitions | Gate C |
| Animal base, species generation, crowds, rerolls, or editor | Gate D after Gate A |
| Custom skull or selectable non-graphite character medium | Separate approved architecture work |
| Atlas character or portrait | Atlas reference and `npm run art:check` |

Also stop when the output path is unresolved or code cannot prove a claimed capability. A stop
returns the approved intent and smallest prerequisite. It does not silently start a gate.

Never copy `vampire.ts`, add another special-case pencil mesh, or edit `CHARACTER_LOOKS` to change
the visible 2.5D vampire.

## 8. Verification

For a supported pencil change, run:

```bash
npx jest --runInBand --runTestsByPath \
  src/render/pencil/__tests__/sketch.test.ts \
  src/render/pencil/__tests__/media.test.ts \
  src/render/pencil/__tests__/head-shape.test.ts \
  src/render/pencil/__tests__/vampire-parts.test.ts \
  src/render/pencil/__tests__/vampire-walk.test.ts
npm run typecheck
```

Add one focused test for changed behavior. Then use a hidden 2.5D capture at native play zoom.
Review silhouette, facings, front idle, both walks, ground contact, motion edges, paper coverage, and
all three boil frames. The world stays still. Do not claim accessibility completion while
reduced-motion boil remains unfixed.

## References

- Pencil: [character-sprite-design2.0.md](character-sprite-design2.0.md)
- Atlas: [character-sprite-design.md](character-sprite-design.md)
- Shared identity and originality: [halcyra-art-bible.md](halcyra-art-bible.md#9-character-identity-and-proportions)
- Source method: [Kindergrimm](https://kindergrimm.vercel.app/how)
