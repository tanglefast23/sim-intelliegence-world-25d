---
title: Character sprite authoring
type: task-entrypoint
status: authoritative
scope: every new or changed SI World character, sprite, portrait, part, expression, or pose
pencil-reference: character-sprite-design2.0.md
legacy-atlas-reference: character-sprite-design.md
---

# Character sprite authoring

Start here for every character task. This file decides what Joe wants, which render path owns it,
and whether current code can draw it. It does not authorize renderer architecture work.

**Permanent style decision.** Every character world body uses the pencil method. Dialogue portraits
use the existing vampire dialogue-portrait style. A `24x30` atlas character is never an approved
world-body result. The environment atlas remains active and is outside this rule.

## 1. Run the interview yourself

Do not tell Joe to type `/grill-with-docs`. Run this focused design-tree interview directly:

1. Extract answers already present in Joe's request.
2. Inspect the character, `visualId`, and live render route. Do not ask Joe for code facts.
3. Ask all missing decisions whose prerequisites are settled. This set is the current frontier.
4. Ask the frontier as one numbered round. Give one recommendation and one short reason per question.
5. Wait for answers, recompute the frontier, and continue until no decisions remain.
6. Return the completed brief and current-support verdict.
7. Wait for Joe's explicit approval before drawing or changing code.

For a multi-character task, complete one character before starting the next. Extract every answer
already present in the request or approved plan. Ask only the remaining frontier for that character,
record Joe's approval, and then continue to the next character.

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
| Any other current or future world body | Pencil reference; complete the brief, then stop at Gate A until the generic pencil route exists |
| Dialogue portrait | Match the existing vampire dialogue-portrait style from the same approved brief |
| Legacy atlas world-body cell | Compatibility maintenance only; never a character deliverable or visual acceptance target |

For `vampire-01`, atlas entries still serve rollback and portrait generation. Atlas edits do not
change his visible 2.5D pencil body. The current body and portrait are separate code sources, which
is OPEN identity debt. Any identity-changing request across both surfaces uses one approved brief
and a side-by-side parity review; do not update either surface as an independent redesign. Do not
extend this legacy split to new world bodies.

## 3. Current pencil support

| CURRENT | NOT CURRENT |
|---|---|
| Versioned registry for the vampire and eight creature prototypes | Eight approved literal creature builds |
| Several pencil identities on screen together | Sit, quad, winged, serpentine, or limbless locomotion |
| One whole-character baker with shared primitives | Per-part canvases and bones |
| Nine head-envelope families | Approved creature-specific skull, torso, and limb anatomy |
| Per-character head family and palette recipes | Per-character head share and floor plan in the recipe |
| Graphite hardcoded for the character | Selectable character media |
| Four-facing idle and four-facing two-state walk | Extra poses or world-body expressions |
| Three whole-character boil frames | Per-part boil or blink-swapped faces |

The eight creature recipes are rejected human-template prototypes. They prove registry, texture,
and routing support only. They do not prove creature anatomy or visual acceptance.

Reduced-motion mode pins the pencil character to the current-facing idle pose and boil frame 0.
Keep that behavior in every character change; it does not require the future rig.

## 4. Creative gates

Reject or redesign before implementation when:

- The request copies a real person, costume, badge, emblem, or exact known character silhouette.
- A signature feature is a cruel stereotype about a real group, body, disability, job, or accent.
- Identity depends only on colour or disappears from a required facing.
- The result is a palette swap, duplicates another oddity, or exaggerates every part.
- A creature is a normal human body with an archetype printed, worn, attached, or painted on it.
- Removing the clothes and accessories would make the creature read as an ordinary human.

Translate inspiration into an original silhouette and story reason. Ask for human skin tone
separately from medium and graphite density. Never represent darker skin by making it dirtier,
rougher, or more heavily scribbled. Medium is the drawing method; skin tone is colour wash or an
atlas skin ramp.

## 5. Adaptive interview

### Round A — task, subject, and body

Ask every missing item:

1. **Deliverable:** New character, existing change, or concept brief? Which surfaces must show it?
2. **Identity:** Name or ID, story role, and why this character looks this way?
3. **Subject:** Human, literal creature archetype, original superhero, animal, or hybrid?
4. **Base:** Upright biped, crouched biped, seated, quadruped, winged, serpentine, limbless,
   spectral, constructed, skeletal, or custom?
5. **Generation mode:** One authored named character now, or a future generated population?
6. **Envelope:** Compact, chibi, tall, broad, long, top-heavy, bottom-heavy, or asymmetric?
7. **Posture and locomotion:** How does it stand, contact the ground, and move?

Keep three ideas separate: creature identity, anatomical base, and generation mode. A named
creature can use authored anatomy without a generated species system.

### Round B — matching subject branches

Ask every matching branch. Branches compose. A human superhero uses both the human and superhero
questions. A disabled creature uses the relevant human-dignity and creature questions.

**Human or human-shaped:** Which build, hair mass, clothing silhouette, role object, aid, or
prosthesis identifies them before facial detail? If there is an unusual body, aid, or prosthesis,
how does it remain one part of the whole person rather than the entire identity?

**Original superhero:** What original power, duty, or theme should the silhouette show? Which shape
carries it without copying a known suit, logo, badge, or hero? Does a cape, item, aura, or locomotion
require unsupported bones or effects?

**Creature archetype:** Which canonical anatomy makes the archetype readable before clothing:
skull or face, jaw or muzzle, torso, limbs, hands or feet, ground contact, and surface or material?
Which parts must be absent? Should it read cute, goofy, uncanny, threatening, or mixed? Do not
reduce the answer to one feature on a normal human body.

**Cat:** Domestic or wild, compact or long-bodied, short-haired or long-haired? Which muzzle, ears,
paws, tail, coat mass, and gait define it without colour alone? Is it a true quadruped, seated
companion, or intentionally cat-headed humanoid?

**Other animal or hybrid:** Which anatomy must survive every facing: muzzle, beak, horns, mane,
hooves, wings, fins, shell, or tail? Which locomotion and resting posture are essential? Which
features belong in the skull, and which need separate parts?

### Round C — identity, surface, and face

1. **Archetype anatomy:** What skull or face, torso, limbs and contact, surface or material, and
   canonical features make the creature literal?
2. **Primary oddity:** After the archetype reads, what one shape identifies this individual across
   all facings?
3. **Supporting feature:** What one shape or object supports it without competing?
4. **Head:** Which envelope is closest? What creature-specific skull, muzzle, beak, jaw, sockets,
   horn base, or constructed crown is required inside it?
5. **Head share:** Keep the vampire default `0.56`, or change it for a stated visual reason? The head
   remains dominant, and the floor stays pinned.
6. **Surface:** Skin, fur, feathers, scales, shell, slime, bone, cloth, armour, stone, smoke, metal,
   spectral material, or another covering? Where does it change?
7. **Skin or surface tone:** What human skin tone, fur value, scale value, bone value, or material
   value should appear? Record it separately from graphite density.
8. **Colour and value:** What palette and value hierarchy must read at play zoom?
9. **Medium intent:** Graphite now, or another desired medium recorded as unsupported intent?
10. **Resting face:** Eyes or sockets, brows or brow mass, nose or muzzle, mouth or jaw, ears, and
    resting emotion?
11. **Expressions:** Which additional faces have a named gameplay use?

After approval, the agent proposes density and stroke direction per mass. Joe does not need to
invent hatch angles.

### Round D — parts, facings, poses, and evidence

1. **Parts:** Which are reused or new, paired or asymmetric, held, worn, silhouette-only, or moving?
2. **Facings:** What appears, hides, overlaps, mirrors, or changes in front, rear, left, and right?
3. **Poses:** Is four-facing idle plus four-facing walk enough? Which gameplay action needs another pose?
4. **Evidence:** Require black silhouette, native play zoom, required facings, bright and dark
   ground, motion-edge checks, and boil-frame identity stability.

## 6. Approved character brief

```text
Character ID, name, role, and story reason:
Deliverable, target surfaces, and verified route:
Plain-language identity sentence:
Subject, creature identity, anatomical base, generation mode, posture, and locomotion:
Literal anatomy contract: skull/face; torso; limbs/contact; surface/material; canonical features; absent human features:
Stature, body envelope, head shape, and head share:
Hair, clothing, aids, prostheses, and role objects where applicable:
Surface, skin/surface tone, markings, colour/value hierarchy, and medium intent:
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
| New pencil visual ID | Add one versioned recipe through the existing registry |
| Different locomotion, extra poses, bones, or independent boil | Gate B |
| Expressions or blink transitions | Gate B, then Gate C |
| Generated species, crowds, rerolls, locks, or editor | Gate D after Gates A and B |
| Authored skull, muzzle, beak, jaw, bone, spectral, or constructed anatomy in the current biped canvas | Creature-specific drawing through the generic pencil registry |
| Selectable non-graphite medium | Separate approved architecture work |
| Dialogue portrait | Vampire portrait style from the approved brief; keep its current runtime checks |
| Legacy atlas character cell | Compatibility maintenance only; never route a redesign here |

Also stop when the output path is unresolved or code cannot prove a claimed capability. A stop
returns the approved intent and smallest prerequisite. It does not silently start a gate.

Never copy `vampire.ts`, add another special-case pencil mesh, or edit `CHARACTER_LOOKS` to satisfy
a world-body request. Use the generic pencil registry. Stop only when the requested anatomy needs
unsupported locomotion, bones, poses, or media.

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

Add one focused test for changed behavior. Run `npm run smoke:25d:lit` and
`npm run smoke:25d:fallback` for safe hidden in-world evidence. Those smokes do not select every
character facing, gait, or boil frame. If the task changes those states, add or use a deterministic
character-state capture before claiming visual coverage. Review silhouette, facings, each facing's
idle, both walks, ground contact, motion edges, paper coverage, and all three boil frames. The world
stays still. Hide clothing and accessories in one review layer and confirm that a named creature
still reads as its archetype. Verify that reduced motion selects the current-facing idle and boil
frame 0.

## References

- Pencil: [character-sprite-design2.0.md](character-sprite-design2.0.md)
- Legacy atlas compatibility and portrait source: [character-sprite-design.md](character-sprite-design.md)
- Shared identity and originality: [halcyra-art-bible.md](halcyra-art-bible.md#9-character-identity-and-proportions)
- Source method: [Kindergrimm](https://kindergrimm.vercel.app/how)
