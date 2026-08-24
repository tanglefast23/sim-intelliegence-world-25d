export const KINDERGRIMM_UPSTREAM_COMMIT = 'de339ad739d8cbd28ff2dd4a940af38c0ede86c8';

type JsonObject = Readonly<Record<string, unknown>>;

export type KinderGrimmPartSlot = Readonly<{
  params: JsonObject;
  /** Approved SI World changes applied after upstream generation. */
  overrides?: JsonObject;
}>;

export type KinderGrimmShippingRecipe = Readonly<{
  version: 1;
  status: 'review' | 'shipping';
  visualId: string;
  upstreamCommit: typeof KINDERGRIMM_UPSTREAM_COMMIT;
  seed: number;
  species: string;
  base: string;
  media: 'graphite';
  color: string;
  parts: Readonly<Record<string, KinderGrimmPartSlot>>;
  rig?: JsonObject;
}>;

type KinderGrimmRecipeRequirements = Readonly<{
  visualId: string;
  species: string;
  base: string;
  partIds: readonly string[];
  requireRig?: boolean;
}>;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

export function validateKinderGrimmShippingRecipe(
  value: unknown,
  requirements: KinderGrimmRecipeRequirements = {
    visualId: 'vampire-01',
    species: 'nightmare',
    base: 'biped',
    partIds: ['skull', 'eyes', 'nose', 'mouth', 'hair', 'torso', 'arms', 'legs'],
  },
): KinderGrimmShippingRecipe {
  const recipe = object(value, 'KinderGrimm recipe');
  if (recipe.version !== 1 || !['review', 'shipping'].includes(recipe.status as string)) {
    throw new Error('KinderGrimm recipe is not version 1 review or shipping data.');
  }
  if (recipe.visualId !== requirements.visualId) throw new Error('KinderGrimm recipe has the wrong visual ID.');
  if (recipe.upstreamCommit !== KINDERGRIMM_UPSTREAM_COMMIT) throw new Error('KinderGrimm recipe uses an unreviewed upstream commit.');
  if (!Number.isSafeInteger(recipe.seed)) throw new Error('KinderGrimm recipe seed must be an integer.');
  if (recipe.species !== requirements.species || recipe.base !== requirements.base) {
    throw new Error(`${requirements.visualId} requires the reviewed ${requirements.species} ${requirements.base} casting.`);
  }
  if (recipe.media !== 'graphite') throw new Error(`${requirements.visualId} requires graphite.`);
  const parts = object(recipe.parts, 'KinderGrimm recipe parts');
  for (const id of requirements.partIds) {
    const slot = object(parts[id], `KinderGrimm part ${id}`);
    object(slot.params, `KinderGrimm part ${id} params`);
    if (slot.overrides !== undefined) object(slot.overrides, `KinderGrimm part ${id} overrides`);
  }
  if (requirements.requireRig) {
    const rig = object(recipe.rig, 'KinderGrimm rig');
    if (!Array.isArray(rig.partOrder) || !Array.isArray(rig.bones)) throw new Error('KinderGrimm rig needs part order and bones.');
    object(rig.anchors, 'KinderGrimm rig anchors');
  }
  return value as KinderGrimmShippingRecipe;
}

export function kinderGrimmPartParams<T extends JsonObject>(
  recipe: KinderGrimmShippingRecipe,
  id: string,
): T {
  const slot = recipe.parts[id];
  if (!slot) throw new Error(`${recipe.visualId} is missing KinderGrimm part ${id}.`);
  return { ...slot.params, ...slot.overrides } as T;
}

export function kinderGrimmRigData<T extends object>(recipe: KinderGrimmShippingRecipe): T {
  if (!recipe.rig) throw new Error(`${recipe.visualId} is missing KinderGrimm rig data.`);
  return recipe.rig as T;
}
