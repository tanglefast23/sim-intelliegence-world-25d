// Authoring-only adapter. It runs the pinned upstream generator and prints JSON.
// It does not import KinderGrimm's renderer into SI World.
import { ensureParams, newRecipe } from '../../vendor/kindergrimm-upstream/src/rig.js';

const DEFAULT_PARTS = ['skull', 'eyes', 'nose', 'mouth', 'hair', 'torso', 'arms', 'legs'];
const seed = Number(process.argv[2]);
const species = process.argv[3] ?? 'human';
const base = process.argv[4] ?? 'biped';
const selectedParts = process.argv.slice(5);

if (!Number.isSafeInteger(seed)) {
  throw new Error('Usage: node scripts/art/generate-kindergrimm-recipe.mjs <integer-seed> [species] [base] [part...]');
}

const recipe = newRecipe(seed);
recipe.species = species;
recipe.base = base;
ensureParams(recipe);

const ids = selectedParts.length > 0 ? selectedParts : DEFAULT_PARTS;
const parts = Object.fromEntries(ids.map((id) => {
  const slot = recipe.parts[id];
  if (!slot?.params) throw new Error(`KinderGrimm did not generate part ${id}.`);
  return [id, { params: slot.params }];
}));

process.stdout.write(`${JSON.stringify({
  upstreamCommit: 'de339ad739d8cbd28ff2dd4a940af38c0ede86c8',
  seed,
  species: recipe.species,
  base: recipe.base,
  media: recipe.media,
  color: recipe.color,
  parts,
}, null, 2)}\n`);
