# Vampire look

Status: draft
Date: 2026-08-18
Repo: Sim Intelliegence World 25d

This is one `CharacterLook` row on the existing baker. Not a new renderer. Not a Kindergrimm canvas.

## Identity

- `id`: `vampire-01`
- `displayName`: Vampire
- `kind`: named
- NPC state id: `vampire_01`
- `visualIdForNpc('vampire_01')` already becomes `vampire-01` via `replaceAll('_', '-')`
- Do not add a `BORROWED_VISUALS` line. Do not borrow a resident sheet.

## Color (existing ramps only)

| Slot | Pick | Why |
|---|---|---|
| skin | porcelain `#f7c9a9 / #d99578 / #ffe0c5` | palest ramp in the game |
| hairColor | silver `#6c6971 / #a9a4a2` | unused with porcelain |
| clothing | charcoal `#3f3b46 / #67616f` | dark coat |
| accent | gold `#d7a62b / #f2cf59` | clasp, not blood |
| head | long | thin skull |
| build | slim | tall, not giant |
| hair | swept | clean, not wild |
| eyes | beady | small dark eyes |
| outfitPattern | 4 | |
| expressions | rest, joy, upset | named tax |

Do not use porcelain + ink + charcoal + red. That is `resident-07`.
Do not invent a blood-red hex.

## Silhouette tells (24×30)

1. Pale long head: porcelain + long + slim.
2. Fangs: new oddity `fang-mouth` on `accessory`. Four accent pixels at `[11,15]`, `[12,15]`, `[11,16]`, `[12,16]`. Those columns sit between the eye boxes (`EYE_COLUMNS` is 7–10 and 13–16). Keep stock lip `[11,14]`. `mouthPass` still needs two `s/K` on row 16 cols 10–13 (cols 10 and 13 stay face).
3. Cape: reuse secondary `half-cape` (already bakes). `supportingFeature` must contain `cape`.

```
oddity: fang-mouth
oddityLayer: accessory
secondary: half-cape
secondaryLayer: accessory
signatureOddity: Two tiny fangs sit at the corners of a thin mouth.
supportingFeature: A half cape falls from one shoulder.
```

## Cells

World 24×30. Portrait 24×29. Walk 145 ms. 2 frames per facing.

- `character.vampire-01.{front,rear,left,right}-{1,2}`
- `character.vampire-01.eyes` — 24×3 blink band, rows 12–14 of idle front
- `portrait.vampire-01`, `.joy`, `.upset`

Blink may rewrite only `W/K/D` in eye columns 7–10 and 13–16. Fangs live at `[11,15]` and `[12,15]`, outside those columns, so they survive. Do not paint `x=0` or `x=23`.

## Baker slot

1. Add the look to `CHARACTER_LOOKS` in `scripts/art/character-look-roster.ts`.
2. Add `'vampire-01'` to `CHARACTER_IDS` in `src/render/atlas.ts` (after `tomas-reed`).
3. Add `case 'fang-mouth'` in the oddity switch in `scripts/art/character-source.ts`. Same `DrawCommand` style as `curl-moustache`.
4. Reuse `half-cape`. Do not add `rain-cape` (umbrella resident).
5. Rebuild atlas. Bump `ART_REVISION` 17→18. Raise category ceilings: world-character 280→288, world-character-eyes 35→36, portrait 53→56. Tests pin 35 people / 9 named / 652 sprites. This named look makes 36 / 10 / 664 (8 walk + 1 eyes + 3 portraits).

If the id is missing from `CHARACTER_IDS`, it silently becomes `generic-resident`. Add the id first.

## Do not draw

- No live Kindergrimm stroke, boil, or THREE plane
- No new palette, no blood hex, no bat form, no glow eyes
- No extra walk direction, no third walk frame, no run sheet
- No full-width opera cape
- No fangs that eat the blink band or the `mouthPass` row
- No replacing `resident-07` or any current sheet
