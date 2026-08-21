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

Recast the eight existing named townsfolk as mythological creatures, then add Marcus and Calder as
two separate people. Each creature literalizes one
existing trait. Keep IDs, names, biographies, dialogue, schedules, quests, and population counts.

The creature is the cost of the trait, not a costume. A creature chosen only for mood fails.

The initial eight bodies and portraits are rejected. They preserve human anatomy and add creature
markers. Registry, gathering, dialogue, and portrait routing remain useful. The art does not.

Marcus Vale is an additional ninth creature character. His approved brief, World Sprite, portrait
routing, and place in the opening gathering follow the same acceptance rules.

## Player-visible acceptance

1. All ten have pencil world bodies in the shipping 2.5D renderer.
2. Each body has front, rear, left, and right idle plus both walk states.
3. Each body keeps its identity through all three deterministic boil frames.
4. At a fresh game start, all ten appear together outside the protagonist's home.
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

Gate A is complete. The pencil renderer supports the vampire and ten creature visual IDs together.
This proves routing, texture slots, facings, gait states, and boil frames. It does not approve the
creature anatomy.

The completed Gate A preserved the vampire while adding:

- a versioned authored pencil recipe;
- generic character and layout naming;
- a registry keyed by pencil visual ID;
- renderer support for several pencil characters on screen together; and
- no dependency from pencil world bodies to `CHARACTER_LOOKS`.

Do not copy `vampire.ts` ten times. Do not send all ten recipes through one human anatomy draw
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
9. Marcus Vale
10. Calder Nine

Joe withdrew the earlier visual approval after seeing the builds. The general archetype direction
below is required, but exact corrected art is approved one character at a time. Joe approved
Calder's final build on 2026-08-21.

## Required archetype corrections

### Linda — Bigfoot

- Trait: guarded recluse; kind when she feels safe.
- Brief approval: Joe approved the recommended literal-Bigfoot direction on 2026-08-21.
- Archetype anatomy: a literal furred hominid. Use a low domed skull, short muzzle, buried neck,
  barrel torso, long arms, broad hands, short bowed legs, and oversized bare feet.
- Absent human features: no human skin face, styled human hair, small human hands, or normal shoes.
- Head envelope: `lump`, reshaped by the low crown and muzzle.
- Surface: long shaggy umber fur covers the head, face edge, torso, arms, and legs. Every body region
  must read as long fur, not a smooth dark mass. Use brown fur values throughout. Do not use grey or
  garment-shaped value blocks that can read as a hood, collar, shirt, or trousers. Crown, mane,
  neck, torso, arms, and legs use one continuous fur material. Fur strands cross body-part joins so
  their texture never stops at the neck or waist like a garment seam.
- Canonical features: full-body shag, long reach, broad hands, and unmistakably large feet.
- Primary personal feature: an extra-long all-body shag with ragged edges around the crown,
  shoulders, arms, torso, and legs.
- Supporting item: none. Linda wears no clothing or accessories.
- Face: deep-set observant eyes, heavy brow ridge, short muzzle, and small dry resting smile.
- Motion: heavy planted steps; fur keeps the limbs readable.
- Dialogue Icon expressions: observant rest, soft eyes with a small smile for joy, and a tight brow
  and mouth for upset.
- Cinematic Portrait: separate three-quarter chest-up art. Show the heavy brow, short muzzle,
  all-body shag, and one connected broad hand. Never enlarge the Dialogue Icon.
- Rotation contract: the muzzle points toward travel, the rear hides all facial features, and each
  profile shows one near eye. Long fur stays rooted to every body region. Profile mane fur stays
  behind the muzzle and never becomes a detached mass.

### Marcus Vale — Werewolf

- Trait: confident jock; physically imposing without losing the cast's cute proportions.
- Brief approval: Joe approved the recommended literal-werewolf direction on 2026-08-21.
- Archetype anatomy: a literal werewolf. Use upright wolf ears, a long muzzle, black nose, buried
  neck, huge shoulders, massive chest, powerful arms, clawed hands, digitigrade legs, heavy paws,
  and a shaggy tail attached to the lower spine.
- Size: Marcus is the largest and most massive character in the game. His World Sprite renders
  about 25% taller and wider than Rafael while keeping firm ground contact.
- Absent human features: no human face, human ears, flat human feet, narrow human shoulders, or
  ordinary hair placed on a human head.
- Surface: deep reddish-brown fur with charcoal mane and lower-limb areas. Yellow eyes, pale lower
  fangs, and small pale claws stay readable on bright and dark ground.
- Clothing: a charcoal athletic gym tank with gold neckline trim, torn charcoal athletic shorts,
  and one gold varsity wristband. The tank has wide armholes that keep his shoulders and arms
  exposed. The anatomy-only view hides all three items and remains a complete werewolf.
- Rotation contract: profiles show one real-depth eye, a projecting muzzle, one visible lower fang,
  and both arms around the torso. The tail stays attached at the lower spine, remains behind the
  muzzle, and changes screen side with body rotation. Rear views hide all facial features.
- Motion: heavy planted stride. Opposite feet and arms move without changing ear, fang, paw, tail,
  wristband, or ground-contact logic.
- Dialogue Icons: separate block-pixel rest, joy, and upset expressions.
- Cinematic Portrait: separately authored detailed block-pixel art. Never enlarge the Dialogue
  Icon.

### Mina Park — Witch

- Trait: calm, exact about boundaries, and clear about price.
- Brief approval: Joe approved the recommended classic-witch direction on 2026-08-21.
- Office role: janitor. Her cleaning broom is a quiet joke about the broom a witch would fly.
- Archetype anatomy: a literal storybook witch. Use an angular skull, long hooked nose, pointed chin,
  high cheek hollows, long fingers, narrow shoulders, and a slightly stooped spine.
- Absent human features: no smooth ordinary face, short fingers, or neutral upright posture hidden
  under a hat.
- Head envelope: `drop` under the hat, with the hook nose and chin changing the profile.
- Surface: weathered green supernatural skin, long charcoal-grey hair, near-black cloth, plum lift,
  and a restrained gold wash.
- Canonical features: hooked profile, long hands, bent posture, and bent cone hat.
- Primary personal feature: bent black cone hat with a broad brim and forward hook.
- Supporting features: a long flared black robe and a working janitor broom carried in her anatomical
  right hand.
- Face: calm level eyes, precise brow ridge, hooked nose, pointed chin, and neutral mouth.
- Motion: controlled short steps; coat and feet remain separate.
- Rotation contract: the nose points toward travel, hair stays rooted behind the skull and arms,
  profiles show one near eye, and the rear hides all facial features. The broom stays in her right
  hand, changes screen side with body rotation, and stays behind the nose in both profiles.

### Devon Price — Alien

- Trait: charming, guarded, observant, and discreet. He studies people without treating them as
  specimens and protects private stories because personal memory is sacred to him.
- Brief approval: Joe approved the recommended Alien replacement on 2026-08-21.
- Visual approval: Joe approved Devon's final World Sprite, Dialogue Icons, and Cinematic Portrait
  on 2026-08-21.
- Story role: Devon remains the downtown bartender. The job lets him learn social rituals while
  earning belonging without becoming a tourist attraction.
- Archetype anatomy: a literal alien. Use a huge bare cranium, black almond eyes, tiny nostrils,
  narrow jaw, long neck, slim torso, long arms, three-fingered hands, slim legs, and small feet.
- Absent human features: no human ears, hair, eye whites, projecting human nose, or five-fingered
  hands.
- Head envelope: `drop`, enlarged through the cranium and tapered toward the jaw.
- Surface: cool blue-grey skin, black eyes, burgundy cloth, cream collar, and copper details.
- Canonical features: huge cranium, black almond eyes, tiny nostrils, long arms, three-fingered
  hands, and an inquisitive forward lean.
- Primary personal feature: one swept-back sensory antenna attached to the anatomical-left crown.
- Supporting feature: a copper cocktail shaker attached to a holster on the anatomical-right hip.
- Clothing: one closed burgundy bartender vest with a narrow cream collar. The long alien arms,
  hands, legs, and feet remain visible.
- Face: no brows. Rest is watchful, joy softens the eye angle, and upset sharpens it.
- Rotation contract: the antenna and shaker use body-local sides. Profiles show one real-depth eye,
  the leading nostril and mouth, and both arms. Rear hides all facial features.
- Motion: a precise inquisitive walk. The cranium, antenna, eye count, three fingers, shaker, and
  feet keep stable positions through every facing, gait, and boil frame.

### Rafael Cruz — Orc

- Trait: blunt, proud, and reliable; impatient with waste.
- Brief approval: Joe approved the recommended literal-orc direction on 2026-08-21.
- Visual approval: Joe approved Rafael's final World Sprite, Dialogue Icons, and Cinematic Portrait
  on 2026-08-21.
- Archetype anatomy: a literal orc. Use a heavy low forehead, broad nose, massive lower jaw, thick
  neck, high shoulders, deep chest, large hands, bowed legs, and heavy feet.
- Absent human features: no normal human jaw, neck, shoulder width, hands, or copper human skin.
- Head envelope: `square`, driven by the jaw rather than a human face box.
- Surface: consistent moss-green leathery skin, sparse dark umber hair, warm neutral cook cloth,
  brown work clothing, and a muted gold ladle.
- Canonical features: massive jaw, rooted tusks, heavy shoulders, large hands, and grounded stance.
- Primary personal feature: two thick vertical upswept tusks rooted inside the lower jaw.
- Supporting feature: worn cook apron, dark work shorts, brown wrist wraps, and a long ladle held
  in his anatomical-right hand.
- Face: firm brows, warm eyes, direct mouth.
- Rotation contract: the ears attach behind the jaw hinge, not to the forehead. Profiles show one
  real-depth eye, one attached trailing ear, a projecting broad nose, one rooted tusk, and the full
  depth of the lower jaw. The ladle changes screen side with body rotation and stays in Rafael's
  anatomical-right hand. Rear views hide all facial features.
- Motion: strong planted stride; the head stays connected to the thick neck, the feet stay heavy,
  and the tusks never read as a moustache.

### Tomas Reed — Ghost

- Trait: orderly clerk everyone talks through.
- Brief approval: Joe approved the recommended classic bedsheet direction on 2026-08-21.
- Visual approval: Joe approved Tomas's final World Sprite and Dialogue Icons on 2026-08-21.
- Archetype anatomy: a literal classic bedsheet ghost. The white sheet is his visible supernatural
  body. It forms a rounded crown, continuous draped torso, wing-like sheet arms, and a wide flowing
  hem that hovers above the ground.
- Absent human features: no visible person under the sheet, skin, hair, hands, legs, shoes, mouth,
  or planted foot contact.
- Head envelope: `tall`, softened into a rounded sheet crown without a separate head or neck.
- Surface: warm white spectral cloth, pale grey fold planes, and graphite construction marks.
- Canonical features: white sheet silhouette, two black eye holes, draped arms, scalloped floating
  hem, and no visible body beneath it.
- Primary personal feature: wide explanatory-shrug arms in front and rear views. Profiles
  foreshorten both lateral arms into the sheet body instead of turning either arm into a beak.
- Supporting feature: a small white permit tag sewn to the anatomical-left lower drape.
- Face: two large uneven black eye holes and no mouth. Profiles show one eye hole. Rear shows none.
- Facing rule: front and rear keep both arm drapes. Profiles show one eye hole, real sheet depth,
  foreshortened lateral arms, and the body-local permit-tag side.
- Motion: quiet stable hover. The two walk states lift opposite arm drapes in front and rear, while
  every facing changes hem folds without adding feet or changing the hover height.
- Portrait: close white-sheet crown, hard black eye holes, and the white permit tag. Joy opens and
  slightly tilts the holes. Upset narrows and angles them. Geometry remains one continuous sheet.

### Calder Nine — Robot

- Replacement: Calder replaces the unchanged `Resident 01` Atlas character. Tomas remains the
  approved Ghost.
- Visual approval: Joe approved Calder's World Sprite, Dialogue Icons, and Cinematic Portrait on
  2026-08-21.
- Role: Ledger Annex records archivist.
- Personality: orderly, dependable, understated, and quietly stubborn. His jokes arrive like late
  administrative notices.
- Motivation: Calder wants recognition as a person, not office equipment.
- Backstory: Calder was built as municipal records unit `C-9`. During a storm blackout, he rebuilt
  damaged manifests and kept evacuation records moving. The city thanked `the equipment`, not him.
  He kept `Nine` by choice and now seeks legal and social recognition as a person.
- Strengths: procedures, records, schedules, reliability, and finding inconsistencies.
- Friction: ambiguity slows him. When compassion conflicts with a written rule, he states the
  conflict instead of pretending it does not exist.
- Voice: concise administrative language. Never use `beep-boop` speech or an emotionless-machine
  stereotype.
- Archetype anatomy: a literal compact retro office robot. Use a rounded rectangular metal head,
  recessed amber display eyes, a voice grille, a segmented neck, a cabinet torso, piston arms,
  three-pronged clamp hands, jointed legs, and broad rubber feet.
- Absent human features: no human skin, hair, face, fingers, flesh joints, or human clothing placed
  over a human body.
- Head envelope: `square`, with a front display bezel and real profile depth.
- Surface: warm ivory enamel, steel-blue panels, brass joints, and charcoal rubber feet.
- Canonical features: metal box head, amber display eyes, voice grille, filing-drawer torso,
  segmented limbs, clamp hands, and broad planted feet.
- Primary personal feature: a small office ID badge clipped to the anatomical-left chest.
- Supporting feature: an inset filing drawer with a brass label slot built into the torso.
- Face: rest uses level amber eyes, joy lifts them, and upset angles them inward. The voice grille
  changes minimally and never becomes a human mouth.
- Rotation contract: profiles show one real-depth display eye, the front bezel, both arms, and
  jointed legs. The rear hides facial features and shows an access panel. The ID badge stays on the
  same body side through every turn.
- Motion: precise planted steps. Opposite piston arms and jointed legs move without changing the
  clamp count, drawer position, badge side, or foot contact.
- Dialogue Icons: separate block-pixel rest, joy, and upset expressions.
- Cinematic Portrait: separately authored detailed block-pixel art. Never enlarge the Dialogue
  Icon.
- Status: approved literal Robot anatomy and portrait art.

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
- Art approval: Joe approved the World Sprite, Dialogue Icons, and Cinematic Portrait on 2026-08-21.
- Archetype anatomy: a literal ghoul. Use a corpse-like skull face, sunken eyes, broad predatory jaw,
  long mouth, exposed or receded gums, clawed hands, hunched shoulders, and lean scavenger limbs.
- Absent human features: no healthy porcelain face, ordinary jaw, manicured human hands, or runway
  posture under a maw accessory.
- Head envelope: `wide`. The oversized bare skull is the largest mass.
- Surface: mottled corpse-green skin, black cavities, dark plum cloth, and old-gold jewelry.
- Canonical features: oversized skull, hollow sockets, small nasal cavity, broad jagged maw, long
  hanging arms, claws, bent legs, broad splayed feet, and a crouched scavenger posture.
- Primary personal feature: a wide jagged maw cut into the skull. It is anatomy, not an accessory.
- Supporting feature: a large old-gold pendant attached to a short neck chain.
- Clothing: a closed dark-plum wrap with a clear sash and ragged hem. It must not hide the arms,
  hands, legs, feet, or the narrow corpse torso.
- Face: small amber lights inside the hollow sockets. Do not add human eyes, brows, or lips.
- Motion: a grounded crouched prowl. The skull, jaw, arms, claws, pendant, and feet keep the same
  body-local positions in every facing and walk frame.

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

## Portrait contract

- Use the vampire portrait at `assets/source/dialogue-portraits/protagonist.png` as the visual bar.
- Use the same large pixel blocks, close face framing, clean value groups, and transparent surround.
- Use **Dialogue Icon** for the small normal-conversation portrait.
- Use **Cinematic Portrait** for separate detailed art in the large cinematic panel.
- Never enlarge a Dialogue Icon to make a Cinematic Portrait.
- Do not use a world-body screenshot as a portrait.
- Preserve the same head, hair mass, face, primary feature, and supporting feature as the pencil body.
- Preserve the same literal skull or face, torso, visible limbs, surface, and canonical archetype
  features. The pixel style must not pull the creature back onto a human portrait template.
- Keep current gameplay expressions `rest`, `joy`, and `upset` where the conversation UI requests
  them.
- Show each portrait in the real conversation panel after tapping the gathered character.

## Implementation order

1. Keep the completed registry, billboards, gathering, and dialogue routing.
2. Mark the initial eight creature bodies and portraits as rejected human-template prototypes.
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
- No simultaneous redraw of all ten. Approve one character before the next.
- No biography, personality, dialogue, quest, or schedule rewrite.
