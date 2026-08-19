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

### 6.5 The profile is not the front view squashed

Two things break a profile, and both were wrong here:

- **The head must not narrow when he turns.** The side skull spanned `-18..+22` against a front
  `-30..+30`, so he lost a third of his head width mid-walk and read as a thin man. Both facings
  use the same envelope; only the weight shifts forward.
- **The mouth pushes forward, off the eye.** In a cartoon profile the eye sits back toward the ear
  and the mouth sits at the leading edge of the face. Eye and mouth in the same column reads as a
  flattened front view. Here the eye is at `dir * 5` and the fangs at `dir * 17..25`.

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
