export const CHARACTER_KINDS = ['named', 'ambient'] as const;
export type CharacterKind = typeof CHARACTER_KINDS[number];

export const SKIN_RAMPS = ['porcelain', 'sand', 'warm', 'copper', 'deep'] as const;
export type SkinRamp = typeof SKIN_RAMPS[number];

export const HAIR_RAMPS = ['ink', 'espresso', 'umber', 'auburn', 'gold', 'silver', 'teal'] as const;
export type HairRamp = typeof HAIR_RAMPS[number];

export const CLOTHING_RAMPS = [
  'teal', 'coral', 'plum', 'mustard', 'navy', 'rose', 'cream', 'rust', 'sage', 'charcoal',
] as const;
export type ClothingRamp = typeof CLOTHING_RAMPS[number];

export const ACCENT_RAMPS = ['gold', 'cyan', 'red', 'pink', 'lime', 'cream', 'violet'] as const;
export type AccentRamp = typeof ACCENT_RAMPS[number];

export const HEAD_SHAPES = ['round', 'square', 'long', 'wide', 'pear'] as const;
export type HeadShape = typeof HEAD_SHAPES[number];

export const BODY_BUILDS = ['tiny', 'slim', 'normal', 'wide', 'round', 'top-heavy', 'pear'] as const;
export type BodyBuild = typeof BODY_BUILDS[number];

export const HAIR_STYLES = [
  'bald', 'swept', 'side-cloud', 'stacked-bun', 'crop', 'bob', 'flat-top', 'high-bun',
  'low-part', 'question', 'quiff', 'pompadour', 'twin-buns', 'long', 'mohawk', 'braids',
  'bowl', 'spikes', 'side-fan', 'ponytail',
] as const;
export type HairStyle = typeof HAIR_STYLES[number];

export type OddityLayer = 'torsoAndClothing' | 'hair' | 'accessory' | 'heldItem';
export type PortraitExpression = 'rest' | 'joy' | 'upset';
export type EyeStyle = 'normal' | 'large' | 'beady' | 'angled-small';

export const SECONDARY_FEATURES = [
  'tiny-waist-jacket', 'shoulder-recorder', 'long-scarf', 'flared-dress', 'towel-sleeve',
  'clinic-pockets', 'luggage-strap', 'cook-apron-ladle', 'asymmetric-sleeves', 'permit-pouch',
  'bow-tie', 'rain-cape', 'big-black-boots', 'bright-cuff', 'guitar-case', 'short-jacket',
  'double-braids', 'flared-coat', 'opposite-ponytail', 'split-tunic', 'round-vest-button',
  'side-fastened-jacket', 'tiny-waist-belt', 'charm-bracelet', 'half-cape', 'suspenders',
  'pearl-necklace', 'star-cuff', 'large-necklace', 'thin-ponytail',
] as const;
export type SecondaryFeature = typeof SECONDARY_FEATURES[number];

export type CharacterLook = Readonly<{
  id: string;
  displayName: string;
  kind: CharacterKind;
  skin: SkinRamp;
  hairColor: HairRamp;
  clothing: ClothingRamp;
  accent: AccentRamp;
  head: HeadShape;
  build: BodyBuild;
  hair: HairStyle;
  eyes?: EyeStyle;
  oddity: string;
  oddityLayer: OddityLayer;
  secondary: SecondaryFeature;
  secondaryLayer: OddityLayer;
  signatureOddity: string;
  supportingFeature: string;
  outfitPattern: 0 | 1 | 2 | 3 | 4 | 5;
  expressions: readonly PortraitExpression[];
}>;

const NAMED_EXPRESSIONS = ['rest', 'joy', 'upset'] as const;
const AMBIENT_EXPRESSION = ['rest'] as const;

export const CHARACTER_LOOKS = [
  {
    id: 'devon-price', displayName: 'Devon Price', kind: 'named', skin: 'copper', hairColor: 'ink', clothing: 'plum', accent: 'cyan',
    head: 'square', build: 'top-heavy', hair: 'flat-top', oddity: 'tower-flat-top', oddityLayer: 'hair',
    secondary: 'tiny-waist-jacket', secondaryLayer: 'torsoAndClothing',
    signatureOddity: 'A towering flat-top makes his head look like a nightclub doorway.',
    supportingFeature: 'An absurdly broad bartender jacket narrows to a tiny waist.', outfitPattern: 5, expressions: NAMED_EXPRESSIONS,
  },
  {
    id: 'elise-moreau', displayName: 'Elise Moreau', kind: 'named', skin: 'porcelain', hairColor: 'auburn', clothing: 'mustard', accent: 'red',
    head: 'long', build: 'slim', hair: 'question', oddity: 'question-forelock', oddityLayer: 'hair',
    secondary: 'shoulder-recorder', secondaryLayer: 'heldItem',
    signatureOddity: 'A question-mark forelock curls above her head.',
    supportingFeature: 'An oversized shoulder recorder hangs beside her narrow coat.', outfitPattern: 2, expressions: NAMED_EXPRESSIONS,
  },
  {
    id: 'generic-resident', displayName: 'Resident', kind: 'ambient', skin: 'warm', hairColor: 'espresso', clothing: 'mustard', accent: 'cyan',
    head: 'wide', build: 'normal', hair: 'quiff', oddity: 'window-glasses', oddityLayer: 'accessory',
    secondary: 'long-scarf', secondaryLayer: 'accessory',
    signatureOddity: 'Two broad square lenses look like apartment windows.',
    supportingFeature: 'A long scarf drops down one side of the body.', outfitPattern: 0, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'linda', displayName: 'Linda', kind: 'named', skin: 'copper', hairColor: 'espresso', clothing: 'coral', accent: 'gold',
    head: 'round', build: 'pear', hair: 'side-cloud', eyes: 'large', oddity: 'cloud-side-hair', oddityLayer: 'hair',
    secondary: 'flared-dress', secondaryLayer: 'torsoAndClothing',
    signatureOddity: 'A cloud-sized side hair mass is almost as large as her torso.',
    supportingFeature: 'A flared dress widens below her cloud-sized hair.', outfitPattern: 1, expressions: NAMED_EXPRESSIONS,
  },
  {
    id: 'mina-park', displayName: 'Mina Park', kind: 'named', skin: 'sand', hairColor: 'ink', clothing: 'rose', accent: 'cyan',
    head: 'pear', build: 'wide', hair: 'stacked-bun', oddity: 'spa-stone-bun', oddityLayer: 'hair',
    secondary: 'towel-sleeve', secondaryLayer: 'torsoAndClothing',
    signatureOddity: 'Her bun rises in three rounded layers like stacked spa stones.',
    supportingFeature: 'One towel sleeve is much larger than the other and a small supply bag hangs at her hip.', outfitPattern: 4, expressions: NAMED_EXPRESSIONS,
  },
  {
    id: 'priya-nair', displayName: 'Priya Nair', kind: 'named', skin: 'deep', hairColor: 'ink', clothing: 'cream', accent: 'cyan',
    head: 'long', build: 'normal', hair: 'high-bun', oddity: 'crossed-hair-sticks', oddityLayer: 'accessory',
    secondary: 'clinic-pockets', secondaryLayer: 'torsoAndClothing',
    signatureOddity: 'Two long hair sticks cross through a high bun like antennae.',
    supportingFeature: 'Her clinic coat has two oversized square pockets.', outfitPattern: 3, expressions: NAMED_EXPRESSIONS,
  },
  {
    id: 'protagonist', displayName: 'Protagonist', kind: 'named', skin: 'warm', hairColor: 'ink', clothing: 'teal', accent: 'gold',
    head: 'wide', build: 'normal', hair: 'swept', eyes: 'angled-small', oddity: 'prize-forelock', oddityLayer: 'hair',
    secondary: 'luggage-strap', secondaryLayer: 'accessory',
    signatureOddity: 'An enormous wind-swept prizewinner forelock points forward like a wave.',
    supportingFeature: 'A large diagonal luggage strap makes the accidental tourist silhouette.', outfitPattern: 1, expressions: NAMED_EXPRESSIONS,
  },
  {
    id: 'rafael-cruz', displayName: 'Rafael Cruz', kind: 'named', skin: 'copper', hairColor: 'umber', clothing: 'rust', accent: 'gold',
    head: 'round', build: 'round', hair: 'crop', oddity: 'curl-moustache', oddityLayer: 'accessory',
    secondary: 'cook-apron-ladle', secondaryLayer: 'heldItem',
    signatureOddity: 'A broad moustache curls upward beyond both cheeks.',
    supportingFeature: 'A cook apron and long ladle sit across his round build.', outfitPattern: 2, expressions: NAMED_EXPRESSIONS,
  },
  {
    id: 'sora-tan', displayName: 'Sora Tan', kind: 'named', skin: 'porcelain', hairColor: 'ink', clothing: 'teal', accent: 'pink',
    head: 'square', build: 'slim', hair: 'bob', oddity: 'blade-collar', oddityLayer: 'accessory',
    secondary: 'asymmetric-sleeves', secondaryLayer: 'torsoAndClothing',
    signatureOddity: 'An enormous angular fashion collar points past both shoulders.',
    supportingFeature: 'One sleeve reaches the wrist while the other stops high on the arm.', outfitPattern: 5, expressions: NAMED_EXPRESSIONS,
  },
  {
    id: 'tomas-reed', displayName: 'Tomas Reed', kind: 'named', skin: 'deep', hairColor: 'silver', clothing: 'navy', accent: 'gold',
    head: 'long', build: 'tiny', hair: 'low-part', oddity: 'square-ear-defenders', oddityLayer: 'accessory',
    secondary: 'permit-pouch', secondaryLayer: 'accessory',
    signatureOddity: 'Square ear defenders are wider than his head.',
    supportingFeature: 'A long narrow clerk body carries a rigid permit pouch.', outfitPattern: 0, expressions: NAMED_EXPRESSIONS,
  },
  {
    // porcelain+silver+charcoal+gold, not resident-07's porcelain+ink+charcoal+red
    id: 'vampire-01', displayName: 'Vampire', kind: 'named', skin: 'porcelain', hairColor: 'silver', clothing: 'charcoal', accent: 'gold',
    head: 'long', build: 'slim', hair: 'swept', eyes: 'beady', oddity: 'fang-mouth', oddityLayer: 'accessory',
    secondary: 'half-cape', secondaryLayer: 'accessory',
    signatureOddity: 'Two tiny fangs sit at the corners of a thin mouth.',
    supportingFeature: 'A half cape falls from one shoulder.', outfitPattern: 4, expressions: NAMED_EXPRESSIONS,
  },
  {
    id: 'linda-boyfriend', displayName: "Linda's Boyfriend", kind: 'ambient', skin: 'sand', hairColor: 'auburn', clothing: 'sage', accent: 'pink',
    head: 'long', build: 'slim', hair: 'pompadour', oddity: 'tiny-pompadour', oddityLayer: 'hair',
    secondary: 'bow-tie', secondaryLayer: 'accessory',
    signatureOddity: 'A tiny perfect pompadour perches on an unusually long head.',
    supportingFeature: 'A nervous bow tie is almost as wide as his shoulders.', outfitPattern: 2, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-01', displayName: 'Resident 01', kind: 'ambient', skin: 'deep', hairColor: 'ink', clothing: 'coral', accent: 'gold',
    head: 'round', build: 'wide', hair: 'bald', oddity: 'umbrella-hat', oddityLayer: 'accessory',
    secondary: 'rain-cape', secondaryLayer: 'torsoAndClothing',
    signatureOddity: 'A tiny wearable umbrella spreads wider than the shoulders.', supportingFeature: 'A wide rain cape completes the shape.', outfitPattern: 4, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-02', displayName: 'Resident 02', kind: 'ambient', skin: 'porcelain', hairColor: 'teal', clothing: 'plum', accent: 'pink',
    head: 'wide', build: 'tiny', hair: 'twin-buns', oddity: 'planet-buns', oddityLayer: 'hair',
    secondary: 'big-black-boots', secondaryLayer: 'torsoAndClothing',
    signatureOddity: 'Two round buns orbit the head like small planets.', supportingFeature: 'Two large black boots anchor the tiny body.', outfitPattern: 0, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-03', displayName: 'Resident 03', kind: 'ambient', skin: 'sand', hairColor: 'silver', clothing: 'navy', accent: 'cyan',
    head: 'pear', build: 'normal', hair: 'bowl', oddity: 'moon-cap', oddityLayer: 'accessory',
    secondary: 'bright-cuff', secondaryLayer: 'torsoAndClothing',
    signatureOddity: 'A crescent cap leans far past one side of the head.', supportingFeature: 'A short square tunic uses one bright cuff.', outfitPattern: 3, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-04', displayName: 'Resident 04', kind: 'ambient', skin: 'copper', hairColor: 'espresso', clothing: 'mustard', accent: 'red',
    head: 'square', build: 'slim', hair: 'crop', oddity: 'giant-satchel', oddityLayer: 'accessory',
    secondary: 'guitar-case', secondaryLayer: 'heldItem',
    signatureOddity: 'A giant satchel hangs from shoulder to ankle.', supportingFeature: 'A rigid guitar case rises behind the free shoulder.', outfitPattern: 1, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-05', displayName: 'Resident 05', kind: 'ambient', skin: 'warm', hairColor: 'gold', clothing: 'rose', accent: 'violet',
    head: 'long', build: 'top-heavy', hair: 'swept', oddity: 'lantern-chin', oddityLayer: 'accessory',
    secondary: 'short-jacket', secondaryLayer: 'torsoAndClothing',
    signatureOddity: 'A lantern-shaped chin extends below a tiny mouth.', supportingFeature: 'A short jacket makes the head look even longer.', outfitPattern: 5, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-06', displayName: 'Resident 06', kind: 'ambient', skin: 'deep', hairColor: 'umber', clothing: 'cream', accent: 'gold',
    head: 'round', build: 'round', hair: 'braids', oddity: 'wide-straw-hat', oddityLayer: 'accessory',
    secondary: 'double-braids', secondaryLayer: 'hair',
    signatureOddity: 'A flat straw hat spans almost the full sprite.', supportingFeature: 'Two short braids hang below the brim.', outfitPattern: 2, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-07', displayName: 'Resident 07', kind: 'ambient', skin: 'porcelain', hairColor: 'ink', clothing: 'charcoal', accent: 'red',
    head: 'wide', build: 'pear', hair: 'low-part', oddity: 'tiny-hat-high-collar', oddityLayer: 'accessory',
    secondary: 'flared-coat', secondaryLayer: 'torsoAndClothing',
    signatureOddity: 'A coin-sized hat sits above a collar that covers both cheeks.', supportingFeature: 'The coat widens toward the feet.', outfitPattern: 4, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-08', displayName: 'Resident 08', kind: 'ambient', skin: 'copper', hairColor: 'auburn', clothing: 'teal', accent: 'cream',
    head: 'square', build: 'normal', hair: 'ponytail', oddity: 'single-bell-sleeve', oddityLayer: 'torsoAndClothing',
    secondary: 'opposite-ponytail', secondaryLayer: 'hair',
    signatureOddity: 'One bell sleeve is wider than the torso while the other arm is bare.', supportingFeature: 'A short ponytail points the opposite way.', outfitPattern: 3, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-09', displayName: 'Resident 09', kind: 'ambient', skin: 'sand', hairColor: 'espresso', clothing: 'coral', accent: 'pink',
    head: 'pear', build: 'tiny', hair: 'bob', oddity: 'giant-head-bow', oddityLayer: 'accessory',
    secondary: 'big-black-boots', secondaryLayer: 'torsoAndClothing',
    signatureOddity: 'A giant bow is wider than the head.', supportingFeature: 'Two large black boots make the tiny body look grounded.', outfitPattern: 0, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-10', displayName: 'Resident 10', kind: 'ambient', skin: 'deep', hairColor: 'silver', clothing: 'sage', accent: 'violet',
    head: 'long', build: 'slim', hair: 'bald', oddity: 'tower-beanie', oddityLayer: 'accessory',
    secondary: 'long-scarf', secondaryLayer: 'accessory',
    signatureOddity: 'A soft beanie rises in a tall crooked tower.', supportingFeature: 'A very long scarf falls down the back.', outfitPattern: 1, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-11', displayName: 'Resident 11', kind: 'ambient', skin: 'deep', hairColor: 'gold', clothing: 'plum', accent: 'cyan',
    head: 'round', build: 'wide', hair: 'side-fan', oddity: 'side-fan-hair', oddityLayer: 'hair',
    secondary: 'split-tunic', secondaryLayer: 'torsoAndClothing',
    signatureOddity: 'Hair opens into a stiff fan on one side only.', supportingFeature: 'A broad split tunic balances the opposite side.', outfitPattern: 5, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-12', displayName: 'Resident 12', kind: 'ambient', skin: 'porcelain', hairColor: 'umber', clothing: 'mustard', accent: 'red',
    head: 'wide', build: 'round', hair: 'crop', oddity: 'spiral-moustache', oddityLayer: 'accessory',
    secondary: 'round-vest-button', secondaryLayer: 'torsoAndClothing',
    signatureOddity: 'A spiral moustache ends in two square curls.', supportingFeature: 'A round vest uses one tiny central button.', outfitPattern: 2, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-13', displayName: 'Resident 13', kind: 'ambient', skin: 'copper', hairColor: 'ink', clothing: 'navy', accent: 'gold',
    head: 'long', build: 'normal', hair: 'low-part', oddity: 'monocle-chain', oddityLayer: 'accessory',
    secondary: 'side-fastened-jacket', secondaryLayer: 'torsoAndClothing',
    signatureOddity: 'An oversized monocle chain loops from eye to waist.', supportingFeature: 'The jacket closes on one side only.', outfitPattern: 4, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-14', displayName: 'Resident 14', kind: 'ambient', skin: 'sand', hairColor: 'auburn', clothing: 'rose', accent: 'cream',
    head: 'square', build: 'top-heavy', hair: 'quiff', oddity: 'wing-collar', oddityLayer: 'accessory',
    secondary: 'tiny-waist-belt', secondaryLayer: 'torsoAndClothing',
    signatureOddity: 'Two pale collar wings rise above the shoulders.', supportingFeature: 'A tiny waist belt sits under the wide upper body.', outfitPattern: 3, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-15', displayName: 'Resident 15', kind: 'ambient', skin: 'warm', hairColor: 'teal', clothing: 'charcoal', accent: 'lime',
    head: 'pear', build: 'slim', hair: 'spikes', oddity: 'loop-backpack', oddityLayer: 'accessory',
    secondary: 'charm-bracelet', secondaryLayer: 'accessory',
    signatureOddity: 'A rigid loop backpack arches above the head.', supportingFeature: 'A loose charm bracelet hangs from one wrist.', outfitPattern: 1, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-16', displayName: 'Resident 16', kind: 'ambient', skin: 'deep', hairColor: 'espresso', clothing: 'teal', accent: 'pink',
    head: 'round', build: 'tiny', hair: 'bowl', oddity: 'giant-gloves', oddityLayer: 'accessory',
    secondary: 'big-black-boots', secondaryLayer: 'torsoAndClothing',
    signatureOddity: 'Two giant square gloves hang beside a tiny torso.', supportingFeature: 'Two large black boots mirror the heavy gloves.', outfitPattern: 0, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-17', displayName: 'Resident 17', kind: 'ambient', skin: 'porcelain', hairColor: 'gold', clothing: 'coral', accent: 'cyan',
    head: 'wide', build: 'pear', hair: 'long', oddity: 'one-ear-cap', oddityLayer: 'accessory',
    secondary: 'half-cape', secondaryLayer: 'accessory',
    signatureOddity: 'A cap has one tall ear flap and one missing flap.', supportingFeature: 'A half cape falls from the uncovered side.', outfitPattern: 5, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-18', displayName: 'Resident 18', kind: 'ambient', skin: 'copper', hairColor: 'teal', clothing: 'mustard', accent: 'red',
    head: 'long', build: 'wide', hair: 'mohawk', oddity: 'soft-mohawk', oddityLayer: 'hair',
    secondary: 'suspenders', secondaryLayer: 'torsoAndClothing',
    signatureOddity: 'A tall soft mohawk bends over like a tired plant.', supportingFeature: 'A wide shirt carries two narrow suspenders.', outfitPattern: 2, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-19', displayName: 'Resident 19', kind: 'ambient', skin: 'sand', hairColor: 'silver', clothing: 'plum', accent: 'gold',
    head: 'round', build: 'normal', hair: 'high-bun', oddity: 'veil-cap', oddityLayer: 'accessory',
    secondary: 'pearl-necklace', secondaryLayer: 'accessory',
    signatureOddity: 'A tiny cap trails a stiff square veil behind the head.', supportingFeature: 'A pearl necklace loops below the veil.', outfitPattern: 3, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-20', displayName: 'Resident 20', kind: 'ambient', skin: 'warm', hairColor: 'ink', clothing: 'sage', accent: 'pink',
    head: 'square', build: 'slim', hair: 'swept', oddity: 'star-glasses', oddityLayer: 'accessory',
    secondary: 'star-cuff', secondaryLayer: 'accessory',
    signatureOddity: 'Two blocky star glasses cover most of the face.', supportingFeature: 'A narrow shirt has one star-shaped cuff.', outfitPattern: 4, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-21', displayName: 'Resident 21', kind: 'ambient', skin: 'deep', hairColor: 'umber', clothing: 'cream', accent: 'lime',
    head: 'pear', build: 'round', hair: 'braids', oddity: 'shoulder-bird', oddityLayer: 'heldItem',
    secondary: 'large-necklace', secondaryLayer: 'accessory',
    signatureOddity: 'A square tropical bird sits permanently on one shoulder.', supportingFeature: 'A large necklace fills the front of the coat.', outfitPattern: 1, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-22', displayName: 'Resident 22', kind: 'ambient', skin: 'porcelain', hairColor: 'auburn', clothing: 'navy', accent: 'violet',
    head: 'wide', build: 'normal', hair: 'braids', oddity: 'triple-braid', oddityLayer: 'hair',
    secondary: 'guitar-case', secondaryLayer: 'heldItem',
    signatureOddity: 'Three stiff braids form a small tripod around the head.', supportingFeature: 'A tall guitar case hangs behind the plain coat.', outfitPattern: 0, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-23', displayName: 'Resident 23', kind: 'ambient', skin: 'copper', hairColor: 'espresso', clothing: 'rust', accent: 'cyan',
    head: 'long', build: 'top-heavy', hair: 'crop', oddity: 'double-goggles', oddityLayer: 'accessory',
    secondary: 'short-jacket', secondaryLayer: 'torsoAndClothing',
    signatureOddity: 'Two stacked pairs of square goggles cover most of the face.', supportingFeature: 'A broad short jacket makes the long head look even taller.', outfitPattern: 5, expressions: AMBIENT_EXPRESSION,
  },
  {
    id: 'resident-24', displayName: 'Resident 24', kind: 'ambient', skin: 'deep', hairColor: 'gold', clothing: 'teal', accent: 'gold',
    head: 'round', build: 'wide', hair: 'ponytail', oddity: 'shell-shoulders', oddityLayer: 'accessory',
    secondary: 'thin-ponytail', secondaryLayer: 'hair',
    signatureOddity: 'Two spiral shell shoulder pieces make a wide sea-creature silhouette.', supportingFeature: 'A thin ponytail drops between the shells.', outfitPattern: 2, expressions: AMBIENT_EXPRESSION,
  },
] as const satisfies readonly CharacterLook[];

export const NAMED_CHARACTER_IDS = CHARACTER_LOOKS
  .filter(({ kind }) => kind === 'named')
  .map(({ id }) => id);

export const AMBIENT_CHARACTER_IDS = CHARACTER_LOOKS
  .filter(({ kind }) => kind === 'ambient')
  .map(({ id }) => id);
