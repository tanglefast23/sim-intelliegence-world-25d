---
title: Vampire protagonist redesign
status: approved
approved-by: Joe
date: 2026-08-20
entrypoint: docs/art/character-sprite-authoring.md
---

# Vampire protagonist redesign

## Identity

- Existing protagonist world visual: `vampire-01`
- Male, age 25
- Ordinary introvert in an otherwise normal world
- Clearly supernatural vampire
- Original character; no copied costume, badge, emblem, or exact known silhouette

## Surfaces

- Shipping 2.5D pencil body
- Matching atlas portrait and 2D rollback visual
- One approved brief controls all surfaces

## Body and motion

- Compact chibi biped
- `tall` head family
- `HEAD_SHARE = 0.56`
- Front, rear, left, and right idle; stopping preserves the last facing
- Front, rear, left, and right two-state walk
- Reduced motion pins the current-facing idle and boil frame 0
- No extra poses

## Hair and face

- Smooth near-black hair swept backward
- Deep central widow's peak
- Short outward temple points
- No silver, white, blue, or grey streaks
- Natural pale skin
- Red irises
- Pointed ears
- Visible small fangs
- Cool under-eye shadows
- Sharp brows
- Shy, observant, slightly guarded resting expression; not angry
- Portrait joy is a restrained smile
- Portrait upset is worried, not furious

## Clothing and silhouette

Primary signature oddity:

- Oversized slouchy charcoal cardigan
- Anatomical left collar is high; it appears on screen-right in the front view
- Anatomical right collar is lower and slouched
- Subtle crimson inner lining
- Plain ash-grey shirt
- Heavy black boots

Supporting feature:

- Visible fangs

No logo, badge, jewelry, luggage strap, gold bag, or copied costume details.

## Verification

- Black silhouette
- Pencil front, rear, left, and right
- Front idle and both walk states
- Atlas rest, joy, and upset portraits
- Portrait and pencil-front identity comparison
- Bright and dark ground
- Motion value edges
- All three boil frames preserve identity
- Hidden 2.5D lit and fallback captures
- Reduced-motion frame check
