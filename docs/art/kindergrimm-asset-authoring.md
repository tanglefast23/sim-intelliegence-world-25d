# KinderGrimm asset authoring

This is the canonical route for a new SI World asset when the request says "KinderGrimm."

## Authority

Use these sources in order:

1. the current user brief;
2. this document;
3. `docs/art/kindergrimm-upstream.md`;
4. the pinned repository at `vendor/kindergrimm-upstream`;
5. SI World's active pencil `Sketch`, medium, layout, and part code;
6. `halcyra-art-bible.md` for scale, light, depth, contact, and world placement.

Historical HFM geometry and block-pixel prop rules are not authority for new KinderGrimm assets.
Do not use the non-25d checkout. Do not call generic image-model output final production art.

## Production contract

The final asset must be reproducible from reviewed code or structured recipe data. It must use the
KinderGrimm construction method:

- stable layout anchors;
- simple authored masses;
- medium-owned tone, skin, and edge passes;
- deterministic seeded pencil variation;
- explicit part order;
- flat RGBA output for SI World's existing renderer.

The `32x32` tile is a placement scale. It is not an instruction to use old pixel geometry.

## Object recipe

Record:

- asset ID and short visual brief;
- canvas size and transparent bounds;
- world footprint and ground-contact point;
- front, side, and any required rear view;
- main silhouette masses and material colors;
- upper and lower depth regions when a character can pass behind it;
- named interaction anchors in canvas pixels;
- collision footprint;
- deterministic seed;
- review status.

For example, a digital alarm clock can expose `snooze`, `hour`, `minute`, and `power` anchors. Its
screen, case, buttons, feet, and contact shadow remain separate ordered parts.

## Workflow

1. Inspect the pinned upstream implementation and the nearest SI pencil recipe.
2. Write the asset recipe and the smallest required drawer.
3. Generate the requested views and an anchor overlay.
4. Show a review sheet at native and enlarged scale.
5. Get visual approval before atlas or map integration.
6. After integration, capture the object in the hidden renderer with a character in front and behind when depth matters.

Never replace a deterministic recipe with a hand-edited or image-generated final PNG.
