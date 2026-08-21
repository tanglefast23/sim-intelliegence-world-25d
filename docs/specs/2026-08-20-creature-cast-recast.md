---
title: Pencil creature cast recast
status: direction-corrected-current-art-rejected
surface-policy-approved-by: Joe
literal-archetype-policy-approved-by: Joe
character-brief-approval: previous visual approvals withdrawn; rebuild one character at a time
date: 2026-08-20
entrypoint: docs/art/character-sprite-authoring.md
world-body-reference: docs/art/character-sprite-design2.0.md
portrait-reference: assets/source/dialogue-portraits/protagonist.png
---

# Pencil creature cast recast

## Permanent surface decision

- Every character world body uses the 2.5D pencil method.
- Dialogue portraits use the existing vampire dialogue-portrait style.
- A `24x30` atlas character is not an acceptable world-body result.
- The environment atlas remains active for world art.
- The pencil world body and dialogue portrait use one approved identity brief and are reviewed
  side by side.

The old atlas-specific implementation plan was rejected. Its token coordinates, palette ramps,
oddity cases, atlas revision work, and `CHARACTER_LOOKS` edits are not part of this plan.

## Goal

Recast the eight existing named townsfolk as mythological creatures. Each creature literalizes one
existing trait. Keep IDs, names, biographies, dialogue, schedules, quests, and population counts.

The creature is the cost of the trait, not a costume. A creature chosen only for mood fails.

The current eight bodies and portraits are rejected. They preserve human anatomy and add creature
markers. Registry, gathering, dialogue, and portrait routing remain useful. The art does not.

## Player-visible acceptance

1. All eight have pencil world bodies in the shipping 2.5D renderer.
2. Each body has front, rear, left, and right idle plus both walk states.
3. Each body keeps its identity through all three deterministic boil frames.
4. At a fresh game start, all eight appear together outside the protagonist's home.
5. Tapping any of them opens the normal conversation panel immediately.
6. Conversation portraits use the same large pixel-art style as the vampire portrait.
7. The gathering is presentation-only. It must not change saves, schedules, quests, or witness
   logic. Normal schedules resume after the opening showcase.

## Shared pencil rules

- Authored named characters. No species generator, crowd generator, editor, rerolls, or locks.
- Literal archetype anatomy. Do not start with the shared human skull, torso, arms, and legs.
- Each recipe defines skull or face, torso, limbs and contact, surface or material, canonical
  archetype features, and human features that must be absent.
- Clothing, tools, jewelry, hair, and personal oddities are drawn only after the naked archetype
  reads correctly.
- Keep the current four-facing idle and walk scope where the archetype uses upright locomotion.
- Graphite medium with the existing dark in-game calibration.
- Default head share `0.56` unless a brief below gives a visible reason to change it.
- The head remains the largest mass.
- One primary silhouette feature and one supporting feature per character.
- The primary feature survives front, rear, left, and right without colour.
- Use drawn masses: hatching, scribble, stipple, carried paper, and medium-owned contours. Flat
  vector fills with rough outlines fail.
- Stable identity values are chosen before drawing. Boil changes marks, not anatomy or clothing.
- Portraits are not pencil sheets. They match `assets/source/dialogue-portraits/protagonist.png` in
  scale, pixel treatment, framing, and value clarity.

## Current-support verdict

Gate A is complete. The pencil renderer supports the vampire and eight creature visual IDs together.
This proves routing, texture slots, facings, gait states, and boil frames. It does not approve the
creature anatomy.

The completed Gate A preserved the vampire while adding:

- a versioned authored pencil recipe;
- generic character and layout naming;
- a registry keyed by pencil visual ID;
- renderer support for several pencil characters on screen together; and
- no dependency from pencil world bodies to `CHARACTER_LOOKS`.

Do not copy `vampire.ts` eight times. Do not send all eight recipes through one human anatomy draw
path. Each accepted creature needs its own anatomy drawing inside the shared registry and baker.

## Character interview rule

Redesign and approve one character at a time in this order:

1. Linda
2. Mina Park
3. Devon Price
4. Rafael Cruz
5. Tomas Reed
6. Priya Nair
7. Sora Tan
8. Elise Moreau

Joe withdrew the earlier visual approval after seeing the builds. The general archetype direction
below is required, but exact corrected art is approved one character at a time. Priya the skeleton
is next. Do not redraw the other seven during Priya's pass.

## Required archetype corrections

### Linda — Bigfoot

- Trait: guarded recluse; kind when she feels safe.
- Archetype anatomy: a literal furred hominid. Use a low domed skull, short muzzle, buried neck,
  barrel torso, long arms, broad hands, short bowed legs, and oversized bare feet.
- Absent human features: no human skin face, styled human hair, small human hands, or normal shoes.
- Head envelope: `lump`, reshaped by the low crown and muzzle.
- Surface: dense umber fur covers the head, face edge, torso, arms, and legs.
- Canonical features: full-body shag, long reach, broad hands, and unmistakably large feet.
- Primary personal feature: a ragged side-heavy shag mass ending near the elbows.
- Supporting feature: a sage shoulder wrap that leaves the hands and feet visible.
- Face: deep-set observant eyes, heavy brow ridge, short muzzle, and small dry resting smile.
- Motion: heavy planted steps; fur keeps the limbs readable.

### Mina Park — Witch

- Trait: calm, exact about boundaries, and clear about price.
- Archetype anatomy: a literal storybook witch. Use an angular skull, long hooked nose, pointed chin,
  high cheek hollows, long fingers, narrow shoulders, and a slightly stooped spine.
- Absent human features: no smooth ordinary face, short fingers, or neutral upright posture hidden
  under a hat.
- Head envelope: `drop` under the hat, with the hook nose and chin changing the profile.
- Surface: weathered supernatural skin and cloth under plum and gold wash.
- Canonical features: hooked profile, long hands, bent posture, and bent cone hat.
- Primary personal feature: rigid bent cone hat with a broad brim and forward hook.
- Supporting feature: flared coat.
- Face: calm level eyes, precise brow ridge, hooked nose, pointed chin, and neutral mouth.
- Motion: controlled short steps; coat and feet remain separate.

### Devon Price — Goblin

- Trait: charming and discreet; trades in secrets.
- Archetype anatomy: a literal goblin. Use a wide low skull, long pointed ears, projecting nose,
  receding chin, wiry torso, long forearms, clawed fingers, bent knees, and broad splayed feet.
- Absent human features: no normal human ears, nose, hands, stance, or smooth skin proportions.
- Head envelope: `wonky`, widened by ears and nose.
- Surface: ochre-green goblin skin with sparse dark hair, mustard cloth, and lime detail.
- Canonical features: pointed ears, long nose, clawed hands, crouched proportions, and splayed feet.
- Primary personal feature: wide stepped ears that change in every facing.
- Supporting feature: loose charm bracelet.
- Face: bright attentive eyes, social brows, guarded half-smile.
- Motion: quick light steps; ears stay stable through boil.

### Rafael Cruz — Orc

- Trait: blunt, proud, and reliable; impatient with waste.
- Archetype anatomy: a literal orc. Use a heavy low forehead, broad nose, massive lower jaw, thick
  neck, high shoulders, deep chest, large hands, bowed legs, and heavy feet.
- Absent human features: no normal human jaw, neck, shoulder width, hands, or copper human skin.
- Head envelope: `square`, driven by the jaw rather than a human face box.
- Surface: olive or moss leathery skin, sparse umber hair, rust clothing, and gold wash.
- Canonical features: massive jaw, rooted tusks, heavy shoulders, large hands, and grounded stance.
- Primary personal feature: two thick vertical upswept tusks rooted inside the lower jaw.
- Supporting feature: cook apron and long ladle.
- Face: firm brows, warm eyes, direct mouth.
- Motion: strong planted stride; tusks never read as a moustache.

### Tomas Reed — Ghost

- Trait: orderly clerk everyone talks through.
- Archetype anatomy: a literal ghost. Use a hollow spectral face, empty or dim eyes, no solid flesh,
  a vapor torso, trailing arm wisps, and a lower body that tapers into smoke above the ground.
- Absent human features: no human skin, styled hair, solid hands, ordinary legs, shoes, or planted
  foot contact.
- Head envelope: `tall` inside a spectral hood shape.
- Surface: translucent ash and cyan vapor under a navy shroud wash.
- Canonical features: hollow face, transparent edges, floating taper, and displaced contact shadow.
- Primary personal feature: bureaucratic shroud framing the hollow face.
- Supporting feature: rigid permit pouch.
- Face: dim eyes, straight spectral brow, and notice-like deadpan mouth.
- Motion: quiet float with a stable height; the lower taper deforms without becoming legs.

### Priya Nair — Skeleton

- Trait: direct, patient, and unwilling to hide false promises.
- Brief approval: Joe approved this corrected design on 2026-08-20.
- Archetype anatomy: a literal articulated skeleton. Use a bare skull, empty eye sockets, nasal
  cavity, separate jaw, visible neck vertebrae, spine, ribs, sternum, pelvis, upper and lower arm
  bones, hand bones, thigh and shin bones, and bony feet.
- Absent human features: no skin, scalp, flesh face, human eyeballs, human nose, lips, sweater
  torso, printed ribs, solid sleeves, or solid trouser legs. Her approved hair grows magically from
  the back of the bare skull and does not add skin or a scalp.
- Head envelope: `tall`, with the skull about 25% larger than realistic. The skull shape comes from
  cranium, cheekbones, sockets, and jaw rather than a human face box.
- Surface: clean warm ivory bone, graphite joints and cavities, black hair, muted teal cloth,
  charcoal accents, and turquoise pupil light.
- Canonical features: skull, sockets, jaw, spine, rib cage, pelvis, separated long bones, and joints.
- Primary personal feature: long black hair in a thick side braid over her right shoulder, reaching
  her hip and growing magically from the back of her skull. The side never switches.
- Supporting feature: broad bow tie.
- Clothing: muted teal sleeveless wrap top with a deep V and raised hem; charcoal A-line skirt above
  the knees with side splits. Sternum, lower ribs, arm bones, knee joints, shin bones, and feet stay
  visible.
- Face: small turquoise magical pupils float inside empty sockets. Rest uses steady pupils and a
  closed jaw. Joy brightens the pupils and opens the jaw slightly. Upset sharpens the pupils and
  tilts the tight jaw. Do not add eyeballs, eyelids, human eyes, or brows.
- Motion: precise articulated stride; bone count, joint placement, rib count, braid side, and outfit
  shape stay stable.

### Sora Tan — Ghoul

- Trait: stylish, competitive, generous, and cutting.
- Archetype anatomy: a literal ghoul. Use a corpse-like skull face, sunken eyes, broad predatory jaw,
  long mouth, exposed or receded gums, clawed hands, hunched shoulders, and lean scavenger limbs.
- Absent human features: no healthy porcelain face, ordinary jaw, manicured human hands, or runway
  posture under a maw accessory.
- Head envelope: `wide`, driven by the jaw and cheek hollows.
- Surface: cool corpse skin, dark hair remnants, plum clothing, and violet wash.
- Canonical features: sunken face, long maw, corpse surface, claws, and scavenger posture.
- Primary personal feature: broad jaw and controlled long maw extending beyond both cheeks.
- Supporting feature: large necklace.
- Face: competitive eyes, arched brows, controlled sharp expression.
- Motion: confident runway step; jaw remains different from Rafael's tusks in silhouette.

### Elise Moreau — Frankenstein

- Trait: curious and skeptical; lets silence make another person talk.
- Brief approval: Joe approved the completed design tree on 2026-08-21.
- Archetype anatomy: a literal constructed corpse. Use a broad flattened cranium, slab brow,
  mismatched stitched flesh planes, heavy jaw, thick neck, neck electrodes or clamps, oversized
  hands, and stiff assembled limbs.
- Absent human features: no smooth porcelain skin, ordinary round skull, narrow neck, small hands,
  or seamless body.
- Head envelope: `square`, with a flattened crown and constructed jaw.
- Surface: muted green-gray stitched flesh, dark auburn hair remnants, mustard clothing, and red
  recorder detail.
- Canonical features: assembled flesh, seams, heavy brow, flat crown, thick neck hardware, large
  hands, and deliberate stiffness.
- Primary personal feature: skeptical slab brow projecting past both temples.
- Supporting feature: oversized shoulder recorder.
- Face: skeptical brow, focused set eyes, stitched cheek plane, and closed listening mouth.
- Motion: deliberate stiff stride. Keep the design original rather than copying one screen version.
- Proportions: `0.56` head share with a broad top-heavy torso, short stiff legs, and oversized hands.
- Clothing: short open mustard reporter jacket, above-knee charcoal straight skirt with side splits,
  and charcoal ankle boots. The neck, hands, knee seams, and lower legs remain visible.
- Fixed anatomical right: lower eye, cool ash cheek plane, round electrode, and sparse auburn tuft.
- Fixed anatomical left: wider jaw corner, moss forearm, square neck clamp, and red shoulder recorder.
- Recorder attachment: a short dark harness anchors the recorder to the anatomical-left shoulder.
  It appears screen-right in front, screen-left in rear, full in the left profile, and as a far edge
  in the right profile.
- Permanent seams: crown to right temple, right cheek, neck ring, right shoulder, left forearm, and
  right knee. Their sides and paths stay fixed in every facing, gait, and boil frame.
- Portrait: slight three-quarter turn toward anatomical left. Rest keeps focused eyes and a closed
  mouth. Joy lifts one brow and uses a small uneven smile. Upset lowers the slab brow and clenches
  the jaw.

## Dialogue portrait contract

- Use the vampire portrait at `assets/source/dialogue-portraits/protagonist.png` as the visual bar.
- Use the same large pixel blocks, close face framing, clean value groups, and transparent surround.
- Do not use a world-body screenshot as a portrait.
- Preserve the same head, hair mass, face, primary feature, and supporting feature as the pencil body.
- Preserve the same literal skull or face, torso, visible limbs, surface, and canonical archetype
  features. The pixel style must not pull the creature back onto a human portrait template.
- Keep current gameplay expressions `rest`, `joy`, and `upset` where the conversation UI requests
  them.
- Show each portrait in the real conversation panel after tapping the gathered character.

## Implementation order

1. Keep the completed registry, billboards, gathering, and dialogue routing.
2. Mark all eight current creature bodies and portraits as rejected human-template prototypes.
3. Redraw Priya as a literal skeleton in the pencil body and vampire-style portrait.
4. Review Priya with clothing and accessories hidden, then in the real game.
5. Keep Priya rejected until Joe approves both surfaces.
6. Redraw the other seven one at a time only after Priya is approved.
7. Keep legacy atlas character cells only while rollback compatibility still needs them.

## Verification

For every character, review:

1. Archetype-only anatomy with clothing and accessories hidden.
2. Black silhouette.
3. Native play zoom on bright and dark ground.
4. Front, rear, left, and right.
5. Idle and both walk states in each facing.
6. Ground contact and motion edges.
7. Three boil frames with stable anatomy, bone count, and feature placement.
8. Pencil body beside the vampire-style dialogue portrait.
9. Hidden in-game gathering and tap-to-dialogue capture.

Automated checks must cover deterministic recipes, unique registry IDs, all facings and states,
reduced-motion freeze, vampire output stability, multiple pencil characters in one frame, and normal
schedule behavior after the opening showcase.

## Explicit non-goals

- No atlas world-body redesigns.
- No new character IDs or count changes.
- No species generator, editor, reroll, or selectable medium.
- No extra poses or different locomotion during the one-character rebuild.
- No human-template creature bodies.
- No exact copy of one film, game, toy, or illustration. Canonical public-domain anatomy remains
  allowed and required.
- No simultaneous redraw of all eight. Approve one character before the next.
- No biography, personality, dialogue, quest, or schedule rewrite.
