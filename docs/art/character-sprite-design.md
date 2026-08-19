---
title: Character sprite design
type: reference
date: 2026-08-19
status: authoritative
rule-source: docs/art/halcyra-art-bible.md section 9
---

# Character sprite design

Read this before you make any new character. It is the procedure and the proportions.

Section 9 of [halcyra-art-bible.md](halcyra-art-bible.md) is the law. This document does not
change it. This document tells you the numbers, the steps, and the traps.

Three things are true and people keep getting them wrong:

1. **The head is the biggest thing.** That is what makes the cast read as cute.
2. **`head`, `build` and `eyes` on `CharacterLook` do nothing.** See [Traps](#traps).
3. **The character the player sees is the pencil vampire, not an atlas sprite.** Sections 1–5 cover
   the 24×30 atlas pipeline. If you are changing what is on screen right now, go to
   [section 6](#6-the-pencil-vampire) first.

---

## 1. The head rule

The head is the largest mass in the sprite. Not the torso. This is the whole cute read.

Kindergrimm ([how a creature is drawn](https://kindergrimm.vercel.app/how.html), by Alberto
Beiz) is the clearest reference for this. Every creature on that page is a big head, a small
lozenge torso, and thin stick limbs. The head carries the character. The body is a stand.

Our 24×30 world cell already does this. Keep it.

| Band | Rows | Height | Share of cell |
|---|---|---|---|
| Hair above the skull | 1–3 | 3 | 10% |
| Head box | 4–17 | 14 | 47% |
| Torso | 18–27 | 10 | 33% |
| Feet | 28–29 | 2 | 7% |

Head plus hair is **15 to 17 of 30 rows, 50–57% of the character**. The range is the hairstyle:
`swept` starts at row 3, `stacked-bun` and `high-bun` reach row 1. Head to torso is about
**1.4 : 1** by height. The figure is roughly three head-heights tall, not seven.

The head box is `x 4–19`, `y 4–17` — **16 px wide out of 24, 67% of the cell width**
(`headBounds()`, [character-source.ts:293](../../scripts/art/character-source.ts:293)).

**Do not shrink the head to fit a new hat, collar or prop.** Push the prop into rows 1–3, or into
the torso band. If the prop cannot fit, the prop is wrong, not the head.

**Known deviation from the reference.** Our torso is as wide as the head — both peak at 16 px
(`worldBodyCommands`, rows 19–23 at `x 4–19`,
[character-source.ts:463](../../scripts/art/character-source.ts:463)). Kindergrimm keeps the torso
clearly narrower than the head. If a character needs to read cuter, narrow the torso in its
`outfitPattern`. Do not widen the head to compensate.

---

## 2. The grid map

World cell 24×30. Portrait cell 24×29. Both from the **same source**. Never draw them separately.

```
row  0      free margin — generated contour needs it
row  1– 3   hair above the skull
row  4      skull top (inset 1 px each side)
row  4–17   head box, x 4–19
row 12–14   eye band. EYE_COLUMNS 7,8,9,10 and 13,14,15,16
row 14      lip pixels [11,14] [12,14]
row 16      mouth run, x 10–13
row 17      chin
row 18–27   torso and arms
row 24      hands, at x 3 and x 20
row 28      contact row — one painted run, anchors the shadow
row 29      feet, split by a 2 px stride gap
```

Hard limits:

- Never paint `x = 0` or `x = 23`. The outward contour needs those columns.
- Row 28 stays **one** painted run. Splitting it moves `shadowWorldY`
  ([character-source.ts:517](../../scripts/art/character-source.ts:517)).
- The blink band rewrites only `W/K/D` inside `EYE_COLUMNS`. Anything you want to survive a
  blink must sit outside columns 7–10 and 13–16. Fangs at `[11,15]` and `[12,15]` survive; that
  is why they are placed there.
- Feet must change between both walk frames.

---

## 3. Identity before colour

From art bible §9.3, restated because it is the rule people skip.

Every person needs **one signature oddity** and **one supporting feature**. Both must be real
authored pixels that change a shape or add a readable object. Colour alone does not count.

Design order:

1. Silhouette. Black shape only. Can you name the person?
2. One exaggerated feature. Then one supporting feature. Then stop.
3. Face detail.
4. Colour last.

The primary oddity must survive front, rear, left and right. A second face detail may be
front-only. No two production people share a primary oddity.

---

## 4. Adding a character: the steps

1. **Write the look row.** Add a `CharacterLook` to `CHARACTER_LOOKS` in
   [scripts/art/character-look-roster.ts](../../scripts/art/character-look-roster.ts).
   Pick ramps from the existing `SKIN_RAMPS`, `HAIR_RAMPS`, `CLOTHING_RAMPS`, `ACCENT_RAMPS`.
   Do not invent a hex.
2. **Register the id.** Add it to `CHARACTER_IDS` in
   [src/render/atlas.ts](../../src/render/atlas.ts).
   *If you skip this the character silently becomes `generic-resident`.* Add the id first.
3. **Add the oddity case.** New oddity means a `case` in the oddity switch in
   [character-source.ts](../../scripts/art/character-source.ts). The switch throws on an unknown
   name, so a typo fails the build rather than shipping.
4. **Reuse a secondary.** Pick from `SECONDARY_FEATURES`. Adding a new one is a second draw
   function; reuse first.
5. **Raise the ceilings.** In [assets/source/art/manifest.json](../../assets/source/art/manifest.json):
   `world-character` (currently 288, 24×30), `world-character-eyes` (36, 24×3),
   `portrait` (56, 24×29). One named character costs **12 cells**: 8 walk + 1 eyes + 3 portraits.
   An ambient character costs 10: 8 walk + 1 eyes + 1 portrait.
6. **Bump `ART_REVISION`** in [src/render/atlas.ts:47](../../src/render/atlas.ts:47).
7. **Rebuild and check.**

```bash
npm run art:check
```

`art:check` runs the atlas builder then `git diff --exit-code`. Generated art must be committed.

8. **Look at it.** Review at native `1×` before `3×`. Review the silhouette without colour.
   Compare portrait and front world cell side by side. Reject a palette swap.

---

## 5. What transfers from Kindergrimm

The reference generator draws in vector graphite, not pixels. These principles still apply to us:

| Principle | How it applies here |
|---|---|
| **Big head, small body** | Section 1. The one rule that makes the cast cute. |
| **Silhouette carries identity** | Art bible §9.3. Design the shape before the face. |
| **One layout publishes every anchor** | `headBounds()`, `EYE_BAND`, `EYE_COLUMNS`, `STRIDE_GAP` are shared constants. A new part reads them; it never re-derives the chin. |
| **A part is one file plus one registry line** | A look is one roster row plus one `CHARACTER_IDS` line. Keep it that cheap. |
| **A species is loaded dice, not new drawings** | Ambient residents are the same parts with a different component pool, not new art. |
| **Choices that must hold still go in generation** | Our looks are authored constants, so this is free — but never make a draw command depend on anything that varies per frame. |

These do **not** apply. We are a pixel atlas, not a live canvas:

- No wobble, no boil, no per-frame redraw. Our motion is 2 authored walk frames plus a blink band.
- No medium abstraction. One palette, hard edges, no anti-aliasing, no gradients.
- No procedural shape families. Head geometry is one fixed box.

---

## 6. The pencil vampire

**This is the character the player sees.** Everything above governs the 24×30 atlas sprites. The
pencil vampire in [src/render/pencil/](../../src/render/pencil/) is a separate, live Kindergrimm
renderer — filled-ribbon strokes, `mulberry32`, three boil frames per pose. `pencilBillboards()`
filters `visualId === 'vampire-01'` and draws it in place of that atlas sprite on the 2.5D path,
which is the shipping path. Editing `vampire-01` in the roster changes nothing on screen.

This document previously claimed production did not use the pencil path. That was wrong and cost a
full session of work on the wrong character.

### 6.1 Proportions live in one constant

`HEAD_SHARE` in [layout.ts](../../src/render/pencil/layout.ts) is the head's share of the figure
from crown to sole. It is **0.56**. Change that line alone to restyle him.

Parts never write canvas coordinates. They author in head space or body space and call `F.head(dx,
dy)` or `F.body(dx, dy)`. That is what makes the proportion one number instead of seven files. He
was authored at 0.36 with the numbers scattered, which is exactly why nothing enforced the rule.

**`FLOOR` and the boot line are fixed.** `0dcf18b` tuned the boots onto the character's contact
point. Proportion changes move the crown and the shoulders, never the sole, or he floats above his
own shadow.

### 6.2 Gait: one phase, opposite states

The two legs share **one** phase and sit in opposite states of it — one planted, one lifted. Never
give them mirrored signs on the same axis. The original code did (`leftX = swing * .35`,
`rightX = -swing * .35`), which splays both legs outward on one frame and overlaps them on the
other. That is a squat, and on the rear frame the legs collapsed into a single line.

The arms follow the same rule. A front view cannot show an arm travelling forward, so carry the
arm swing on **y**: one hand rises as the other drops, against the lifting leg.

### 6.3 Motion needs a value edge

`colors.hair` is `[22, 20, 26]` and `colors.cloak` is `[24, 22, 30]`. A black boot on a black cloak
has no edge, so a correctly animated foot is still an invisible one. Every boot carries a pale
`ash` band. **Pixels being right is not the same as motion being legible** — render it and look.

### 6.4 Per-facing rules

| Facing | Rule |
|---|---|
| front | Legs must clear the cloak hem, or the step cannot be seen. |
| rear | **No hands** — the cape hangs closed over both arms. **No sole** — you cannot see the underside of a shoe from behind; the pale band moves to the ankle cuff. **No face** — the hair must cover the skull to the jaw, or a pale chin-shaped wedge reads as a face on the back of his head. |
| left / right | Both boots are drawn, not just the leading one. The toe points the way he walks — a hardcoded `+x` toe puts his foot on backwards when he walks left. |

### 6.5 The character workflow

**Every new character starts with `/grill-with-docs`.** Joe must type it — it cannot be invoked
for him. Its job is to settle the eleven decisions below before a line is drawn. Do not start
drawing and do not guess; come back with the table filled in.

The eleven rows are the eleven sections of
[how a creature is drawn](https://kindergrimm.vercel.app/how.html). Each row says what we have, and
what has to be decided per character.

| # | Section | What we have | Decide per character |
|---|---|---|---|
| 1 | the pencil | Ribbon strokes, three summed sines, grit, crumbs, `erase` bite. **Ends do not overshoot yet** — see audit 6.9 | Nothing. Shared by everyone. |
| 2 | the shape | `blobPts` ported. `wob` is the hand: eye ~0.4, scribbled mass 1 | Which masses are scribbled, which are drawn slowly |
| 3 | the material | **Missing, and actively violated.** 46 flat `fill` calls, 35 at alpha ≥ 0.82 — the reference has no flat fill in any medium. This is the whole visual gap; see audit 6.9 | Nothing yet. The medium layer is the top build priority. |
| 4 | the head | `HEAD_SHAPES`: round, square, tall, drop, pear, lump, wide, bumpy, wonky | **Head shape.** Always ask. Vampire `tall`, Frankenstein `square`. |
| 5 | the map | `layout.ts` publishes every anchor. `HEAD_SHARE` sets proportion. `FLOOR` is pinned | Head share, if it differs from 0.56 |
| 6 | the parts | 9 parts: cloak, legs, arms, skull, ears, hair, eyes, nose, fangs | **Which parts this character needs**, and which are new files |
| 7 | the species | **Missing.** No `gen()`, so there is nothing to load the dice on | Human or not. Only actionable once `gen()` exists. |
| 8 | the boil | 3 frames per state at 1.15fps. **We boil in unison**, which the reference warns reads as video | Nothing yet. Per-part clocks are a shared fix. |
| 9 | the face | **Missing.** No expression states, no blink, no lazy state drawing | **Which expressions.** Never assume. The vampire has none. |
| 10 | the pose | Idle (front only) and walk (all four facings). Baked canvases, no bones | **Which poses beyond idle and walk.** See 6.6 — they are blocked on a bone rig. |
| 11 | the seed | **Missing.** Nothing is saved. Characters are hardcoded TypeScript, no recipe JSON | Nothing yet. |

Five of the eleven are missing entirely. Say so when the grill reaches them, rather than inventing
an answer.

**Locked pose scope.** Every character gets an **idle, front-facing only** — a character who stops
turns to face the camera, so the other three idles would never be seen. Every character gets
**walking in all four facings**. Nothing else is drawn up front; sitting, attack and sleep are
designed one at a time.

### 6.5.1 Ask, do not guess

**Run the `grill-with-docs` skill before drawing any new character.** Come back with questions, and
give a recommendation with each one so Joe can say "yes" rather than design it himself.

Ask at least these:

| Question | Options | How to suggest |
|---|---|---|
| Head shape | the nine in `HEAD_SHAPES` | Name one and say why. Frankenstein → `square`. A witch → `drop`. |
| Expressions | which faces this character can pull | Never assume. The vampire has none yet. |
| Signature part | what makes them theirs | One exaggerated feature, one supporting. Art bible §9.3 applies here too. |
| Species | human, or loaded dice toward something else | Only ask once the `gen()` layer exists. |

**Head shape is one word.** [head-shape.ts](../../src/render/pencil/head-shape.ts) carries
`round, square, tall, drop, pear, lump, wide, bumpy, wonky`. `buildVampireLayout('square')` is the
whole change. The ring is smoothed twice and slid `HEAD_ROUND` (0.92) of the way onto the target —
never 1, or the silhouette stops looking drawn.

**Expressions do not exist yet.** The reference draws spare faces lazily — only the resting one
costs a canvas at build time — and swaps them while a blink hides the change. We have no `states`,
no blink, and no expression table. When Joe asks for a character, ask which expressions it needs
and build only those.

### 6.6 Poses do not scale the way we build them (LOCKED)

Today every state is a **fully baked canvas**. `bakeVampireFrames()` draws
`facings (4) × states (3) × boil (3) = 36` frames at 240×360×4 bytes — **12.4 MB** for idle and
two walk frames.

The plan is many more poses: sitting, attack, sleep, run for the vampire, and at least idle, walk
and sitting for everyone else. On the current architecture:

| States | Frames | Memory |
|---|---|---|
| idle + walk (now) | 36 | 12.4 MB |
| + sitting | 48 | 16.6 MB |
| + sitting, attack, sleep, run | 84 | 29 MB |

Per character. That is the wrong curve, and it gets worse with a second character.

**The reference does not redraw.** Its step 10 says the drawings never change — a pose writes bone
*offsets* through a small ctx API (`root`, `head`, `body`, `bone`, `each`, `state`), every write is
scaled by a blend weight, so a transition is two poses summing and nothing snaps. Walk and run
share one gait phase, so changing tempo never teleports a foot.

We have no bones. Parts draw straight to canvas coordinates, so a pose can only be a whole new
bake. **LOCKED 2026-08-19: before adding sitting and attack, move the parts onto a bone the animator
can offset.** Idle is front-facing only; walking covers all four facings; nothing else is drawn up
front. With the 120x180 sheet that is 27 frames and 2.2 MB, against 36 frames and 12.4 MB before.
Adding four poses to the current design costs 29 MB and four more full drawings per facing; adding
them to a bone rig costs four small offset tables.

### 6.7 Provisional — not locked in

> **These rules are being worked out on screen and are NOT settled.** They stay in this box until
> Joe says he likes how the vampire looks. Do not treat them as law, and do not copy them to
> another character yet.

- **Idle is its own drawing, not walk frame 0.** Frame 0 has a foot in the air, so reusing it
  leaves the character balanced on one leg whenever he stops. `VAMPIRE_STATES` bakes idle, walk 1
  and walk 2 per facing. Idle means both feet flat and square, no arm swing, no cloak sway.
- **`moving` must be plumbed, not inferred.** `gaitBobPixels` is 0 while standing *and* at stride
  phase 0, so it cannot tell you whether a character is walking. `WorldCharacterPlacement.moving`
  carries the real flag.
- **A profile walk needs contact and passing, not a swap.** Putting the feet at `{-16, +16}` and
  only trading which is drawn in front leaves the silhouette identical in both frames — the walk
  looks frozen. One frame spreads the legs; the other brings the trailing leg under the body and
  lifts it.
- **A fang needs a mouth behind it.** Bare white triangles on skin read as loose teeth from the
  front and as a long hanging nose in profile. Draw the dark mouth first; the fangs hang from its
  lower edge.
- **He needs a nose, and it must not be outlined.** A `broken` ring closes the shape and detaches
  it: front-on the pair read as spectacles, in profile it floats off the edge as a ball. Fill it
  and carry the form with a shadow underneath so it merges into the skull.
- **Face rows:** eyes 85, nose 95, mouth 103. The nose at 90 overlapped the eye blobs.

### 6.8 The profile is not the front view squashed

Two things break a profile, and both were wrong here:

- **The head must not narrow when he turns.** The side skull spanned `-18..+22` against a front
  `-30..+30`, so he lost a third of his head width mid-walk and read as a thin man. Both facings
  use the same envelope; only the weight shifts forward.
- **The mouth pushes forward, off the eye.** In a cartoon profile the eye sits back toward the ear
  and the mouth sits at the leading edge of the face. Eye and mouth in the same column reads as a
  flattened front view. Here the eye is at `dir * 5` and the fangs at `dir * 17..25`.

---

### 6.9 Audit, 2026-08-19: why ours still does not look like the reference

Joe asked why our vampire reads so differently from the page and ordered a full audit of every
rule we copied. Verdict: **the pencil is a faithful port; the drawing is not.** We ported how a
LINE is made and then filled every mass with a flat polygon, which the reference never does
anywhere. The gap is the fills, not the strokes.

**Misapplication 1 — flat fills. This is the whole visual gap.** The reference has no flat fill in
any medium. A graphite mass is *hatched or scribbled* — strokes laid side by side with paper
showing in the gaps. Even `black · 1`, the densest swatch on the page, is scribble with gaps.
Watercolour stacks translucent layers; oil lays opaque *daubs*; every medium builds mass out of
strokes. We call `sketch.fill()` 46 times, 35 of them at alpha ≥ 0.82. Our masses are vector
shapes with pencil edges. Theirs are pencil all the way through. The fix is the medium layer's
`tone(pts, { style })` with the `DENSITY` table (`black 1, hatch .72, scribble .62, stipple .5,
light .34`), implemented as strokes.

**Misapplication 2 — the palette bakes in what the medium should own.** The page: a part gets one
opinion, *how dark*, "not how to make it dark — that stays the medium's business." Our
`VAMPIRE_COLORS` are near-black hexes (`cloak [24,22,30]`, `hair [22,20,26]`) applied at 0.9+
alpha, so every part decides exactly how its darkness is made. The reference works in graphite
grey (INK at partial alpha) plus light colour washes over it. A dark cloak should be
`tone(..., { style: 'black' })` — dense scribble, gaps showing — not an opaque hex.

**Misapplication 3 — no paper.** The reference composites on cream. Its skin is a pale wash with
hatching over paper; its gaps read as paper. Our sprite is transparent over the game world, so
textured fills would show grass through his chest and graphite contours land on dark floors
instead of cream. When the medium layer is built, **the character must carry his own paper**: fill
the union silhouette with `PAPER` first, then tone and wash over it. Without this, hatched fills
will read as holes.

**Misapplication 4 — stroke ends do not overshoot.** The page names three habits of the pencil:
"the spine wanders, the width breathes, the ends run past where they should stop." We ported the
first two. Our spine stops exactly where authored, so corners never get the crossed-tick,
sketched look. Extend the spine a few px past each end before ribboning; the existing taper turns
the overrun into a fading tail.

**Misapplication 5 — the boil is in unison.** Section 8's own warning: give each part its own
clock (`fps .85–1.6`, offset) "or the whole character would boil in unison and read as a video."
We bake whole-character frames and flip everything on one 1.15fps clock. The root cause is
architectural: the reference draws **each part on its own canvas** hung on a `THREE.Group` bone;
we draw all parts into one sheet. That one divergence underlies the unison boil, the pose
blocker (6.6), and the missing lazy faces.

**Misapplication 6 — the ¾ swell is undersized.** The page: a ¾ turn "swells the near side by 10%
and collapses the far side by 28%." Ours: near ×1.02, far ×0.72. The collapse matches; the swell
is 2% where it should be 10% ([head-shape.ts:79](../../src/render/pencil/head-shape.ts:79)).

**Faithful, verified line by line:** the stroke maths (resample `max(2.2, w·.9)`, sines f1 1.5–3.5
/ f2 5–9 / f3 11–17 with .55/.3/.15, grit ±.35, breathing `.38·sin(t·7.3)+.14·sin(t·19)`, rail
jitter `.88–1.14`, 62% ink), crumbs (gate `w ≥ 1.2`, 1–4 per sample, ±1.05 spread, 45% bite —
ours erases instead of painting paper, a justified adaptation for a transparent sprite),
`sline`/`stroke`/`broken` with every contour going through `broken` (30 calls, raw `stroke` 0),
`blobPts` maths with `rot` made required, the double-Chaikin skull, the anchor map, the pinned
floor, and deterministic reseeding per boil frame.

**Known open risk:** hatching on a 120×180 sheet is 1–2px lines under a 2.9× downscale. It may
mush to grey at play zoom. Grey mush *is* roughly what pencil looks like at distance, but judge it
with a real capture at game scale, not from the sheet.

---

## Traps

Each of these has already cost someone a build.

**`head`, `build` and `eyes` are dead fields.** `CharacterLook` declares them, and the shipped
baker never reads them. `headBounds()` takes `_look` and returns a constant
([character-source.ts:293](../../scripts/art/character-source.ts:293)). `portraitExpressionCommands`
ends with `void look;`. Only `hair`, `outfitPattern`, `oddity`, `secondary` and the four colour
ramps change pixels. Writing `head: 'long', build: 'slim', eyes: 'beady'` documents intent and
draws nothing. If you need a different head shape, that is real work in the baker, not a field.
(`scripts/art/hfm-character-pilot.ts` does read `build` and `eyes`, but it is a pilot, not the
shipping path.)

**Missing from `CHARACTER_IDS` fails silently.** It falls back to `generic-resident`. No error.

**`CHARACTER_IDS` and `CHARACTER_LOOKS` must hold the same ids**, not just the same count.

**Colour alone is not an identity.** A porcelain-and-charcoal person is not distinct from another
porcelain-and-charcoal person. Change a shape.

**Do not re-use a full colour set.** Porcelain + ink + charcoal + red is `resident-07`.

**Blink eats anything inside `EYE_COLUMNS`.** Place surviving detail outside 7–10 and 13–16.

**A portrait cannot change the person.** More detail is fine. A different head shape, hair mass,
skin ramp, key facial feature, body build, main clothing shape or signature accessory is not.

---

## Worked example

[docs/specs/2026-08-18-vampire-look.md](../specs/2026-08-18-vampire-look.md) is `vampire-01` done
by these rules: existing ramps only, one new oddity (`fang-mouth`), one reused secondary
(`half-cape`), fangs placed outside the blink band, ceilings raised, `ART_REVISION` bumped.

Note that its `head: long`, `build: slim` and `eyes: beady` lines are intent, not output. See
[Traps](#traps).
