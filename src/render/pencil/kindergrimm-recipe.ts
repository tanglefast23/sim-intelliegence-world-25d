export const KINDERGRIMM_UPSTREAM_COMMIT = 'de339ad739d8cbd28ff2dd4a940af38c0ede86c8';

type JsonObject = Readonly<Record<string, unknown>>;

export type KinderGrimmPartSlot = Readonly<{
  params: JsonObject;
  /** Approved SI World changes applied after upstream generation. */
  overrides?: JsonObject;
}>;

export type KinderGrimmShippingRecipe = Readonly<{
  version: 1;
  status: 'shipping';
  visualId: 'vampire-01';
  upstreamCommit: typeof KINDERGRIMM_UPSTREAM_COMMIT;
  seed: number;
  species: string;
  base: string;
  media: 'graphite';
  color: string;
  parts: Readonly<Record<string, KinderGrimmPartSlot>>;
}>;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

export function validateKinderGrimmShippingRecipe(value: unknown): KinderGrimmShippingRecipe {
  const recipe = object(value, 'KinderGrimm recipe');
  if (recipe.version !== 1 || recipe.status !== 'shipping') throw new Error('KinderGrimm recipe is not shipping version 1.');
  if (recipe.visualId !== 'vampire-01') throw new Error('KinderGrimm recipe has the wrong visual ID.');
  if (recipe.upstreamCommit !== KINDERGRIMM_UPSTREAM_COMMIT) throw new Error('KinderGrimm recipe uses an unreviewed upstream commit.');
  if (!Number.isSafeInteger(recipe.seed)) throw new Error('KinderGrimm recipe seed must be an integer.');
  if (recipe.species !== 'nightmare' || recipe.base !== 'biped') throw new Error('The vampire requires the reviewed nightmare biped casting.');
  if (recipe.media !== 'graphite') throw new Error('The vampire requires graphite.');
  const parts = object(recipe.parts, 'KinderGrimm recipe parts');
  for (const id of ['skull', 'eyes', 'nose', 'mouth', 'hair', 'torso', 'arms', 'legs']) {
    const slot = object(parts[id], `KinderGrimm part ${id}`);
    object(slot.params, `KinderGrimm part ${id} params`);
    if (slot.overrides !== undefined) object(slot.overrides, `KinderGrimm part ${id} overrides`);
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
