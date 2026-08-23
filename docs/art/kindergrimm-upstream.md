# KinderGrimm upstream source

SI World keeps the complete KinderGrimm repository at `vendor/kindergrimm-upstream`.

- Origin: `https://github.com/albertobeiz/kindergrimm.git`
- Pinned commit: `de339ad739d8cbd28ff2dd4a940af38c0ede86c8`
- License: Unlicense, kept inside the upstream repository
- Rule: never edit the submodule

Restore it after a fresh clone:

```bash
git submodule update --init --recursive
```

Update it only in a separate review:

```bash
git -C vendor/kindergrimm-upstream fetch origin
git -C vendor/kindergrimm-upstream checkout <reviewed-commit>
```

The separate full-history backup is `/Users/joemacprom5/Documents/Vibecode/kindergrimm`.
SI World imports the pinned generator only in `scripts/art/generate-kindergrimm-recipe.mjs`.
The game renderer reads a reviewed, locked recipe and keeps SI World's existing 2.5D path.
