import type { CharacterId } from '../atlas';
import type { HeadShape } from './head-shape';
import { buildPencilLayout, type PencilLayout, type PencilPalette } from './layout';
import { drawArms } from './parts/arms';
import { drawEyes } from './parts/eyes';
import { drawLegs } from './parts/legs';
import { drawNose } from './parts/nose';
import { drawConstructedCorpse } from './parts/constructed-corpse';
import { drawLiteralBigfoot } from './parts/bigfoot';
import { drawClassicSheetGhost } from './parts/ghost';
import { drawPriyaSkeleton } from './parts/skeleton';
import { drawClassicWitch } from './parts/witch';
import { drawLiteralAlien } from './parts/alien';
import { drawLiteralOrc } from './parts/orc';
import { drawLiteralRobot } from './parts/robot';
import { drawLiteralWerewolf } from './parts/werewolf';
import { drawLiteralGhoul } from './parts/ghoul';
import { drawLiteralGoblin } from './parts/goblin';
import { drawSkull } from './parts/skull';
import { BOIL_FRAMES, PENCIL_HEIGHT, PENCIL_WIDTH } from './vampire';
import { hashSeed, type Point, Sketch } from './sketch';
import { VAMPIRE_FACINGS, type VampirePose } from './pose';

export const PENCIL_RECIPE_VERSION = 2;

export type PencilVisualId = Extract<CharacterId,
  | 'vampire-01'
  | 'linda'
  | 'linda-boyfriend'
  | 'mina-park'
  | 'devon-price'
  | 'rafael-cruz'
  | 'tomas-reed'
  | 'priya-nair'
  | 'resident-01'
  | 'resident-02'
  | 'sora-tan'
  | 'elise-moreau'
>;

type CreatureKind = Exclude<PencilVisualId, 'vampire-01'>;

export type CreatureArchetype =
  | 'vampire'
  | 'bigfoot'
  | 'werewolf'
  | 'witch'
  | 'alien'
  | 'goblin'
  | 'orc'
  | 'robot'
  | 'ghost'
  | 'skeleton'
  | 'ghoul'
  | 'constructed-corpse';

export type CreatureArtStatus = 'approved-literal-anatomy' | 'rejected-human-template';

export type LiteralAnatomyContract = Readonly<{
  base: string;
  skullOrFace: string;
  torso: string;
  limbsAndContact: string;
  surfaceOrMaterial: string;
  canonicalFeatures: readonly string[];
  absentHumanFeatures: readonly string[];
}>;

export type PencilCharacterRecipe = Readonly<{
  version: typeof PENCIL_RECIPE_VERSION;
  visualId: PencilVisualId;
  kind: PencilVisualId;
  archetype: CreatureArchetype;
  anatomy: LiteralAnatomyContract;
  artStatus: Readonly<{
    worldBody: CreatureArtStatus;
    dialoguePortrait: CreatureArtStatus;
  }>;
  shape: HeadShape;
  palette: PencilPalette;
}>;

const APPROVED_LITERAL_ART = Object.freeze({
  worldBody: 'approved-literal-anatomy',
  dialoguePortrait: 'approved-literal-anatomy',
} as const);

const REJECTED_HUMAN_TEMPLATE_ART = Object.freeze({
  worldBody: 'rejected-human-template',
  dialoguePortrait: 'rejected-human-template',
} as const);

const palette = (
  surface: readonly [number, number, number],
  hair: readonly [number, number, number],
  cloth: readonly [number, number, number],
  accent: readonly [number, number, number],
): PencilPalette => ({
  pale: surface,
  ash: [145, 135, 128],
  hollow: [70, 62, 59],
  hair,
  hairEdge: [62, 54, 52],
  cloak: cloth,
  cloakLift: [74, 66, 68],
  shirt: cloth,
  lining: accent,
  fang: [245, 238, 216],
  red: accent,
  white: [248, 244, 235],
});

export const PENCIL_CHARACTER_RECIPES: Readonly<Record<PencilVisualId, PencilCharacterRecipe>> = {
  'vampire-01': {
    version: 2, visualId: 'vampire-01', kind: 'vampire-01', archetype: 'vampire',
    anatomy: {
      base: 'upright undead biped', skullOrFace: 'pale undead face with fang mouth',
      torso: 'small cloaked undead torso', limbsAndContact: 'two arms and two booted legs',
      surfaceOrMaterial: 'pale undead skin, hair, cloth, and exposed fangs',
      canonicalFeatures: ['undead pallor', 'fang mouth', 'high nocturnal collar'],
      absentHumanFeatures: ['healthy skin tone', 'ordinary tooth row'],
    },
    artStatus: APPROVED_LITERAL_ART, shape: 'tall',
    palette: palette([232, 230, 226], [22, 20, 26], [24, 22, 30], [182, 16, 22]),
  },
  linda: {
    version: 2, visualId: 'linda', kind: 'linda', archetype: 'bigfoot',
    anatomy: {
      base: 'furred hominid', skullOrFace: 'low crown, heavy brow, and short muzzle',
      torso: 'furred barrel torso with buried neck',
      limbsAndContact: 'long arms, broad hands, bowed legs, and oversized bare feet',
      surfaceOrMaterial: 'dense umber fur over the full body',
      canonicalFeatures: ['full-body fur', 'long reach', 'broad hands', 'oversized bare feet'],
      absentHumanFeatures: ['human skin face', 'styled human hair', 'normal shoes'],
    },
    artStatus: REJECTED_HUMAN_TEMPLATE_ART, shape: 'lump',
    palette: {
      ...palette([132, 84, 56], [78, 50, 33], [78, 50, 33], [184, 166, 91]),
      ash: [153, 112, 78],
      hollow: [49, 32, 24],
      hairEdge: [78, 50, 33],
      cloakLift: [105, 69, 45],
    },
  },
  'linda-boyfriend': {
    version: 2, visualId: 'linda-boyfriend', kind: 'linda-boyfriend', archetype: 'werewolf',
    anatomy: {
      base: 'largest top-heavy werewolf biped', skullOrFace: 'upright ears, long wolf muzzle, black nose, and lower fangs',
      torso: 'buried neck, huge shoulders, massive chest, and narrow athletic waist',
      limbsAndContact: 'powerful clawed hands, digitigrade legs, heavy paws, and an attached shaggy tail',
      surfaceOrMaterial: 'deep reddish-brown fur with a charcoal mane and lower limbs',
      canonicalFeatures: ['wolf skull', 'upright ears', 'long muzzle', 'digitigrade legs', 'shaggy tail', 'massive jock build'],
      absentHumanFeatures: ['human face', 'human ears', 'flat human feet', 'small human shoulders'],
    },
    artStatus: REJECTED_HUMAN_TEMPLATE_ART, shape: 'wide',
    palette: {
      ...palette([126, 72, 52], [60, 46, 39], [54, 48, 55], [231, 205, 48]),
      ash: [49, 48, 48],
      hollow: [28, 32, 31],
      hairEdge: [101, 58, 44],
      cloakLift: [74, 68, 74],
      shirt: [54, 48, 55],
      lining: [231, 205, 48],
      red: [118, 38, 36],
    },
  },
  'mina-park': {
    version: 2, visualId: 'mina-park', kind: 'mina-park', archetype: 'witch',
    anatomy: {
      base: 'stooped supernatural biped', skullOrFace: 'angular skull, hooked nose, and pointed chin',
      torso: 'narrow shoulders and bent spine',
      limbsAndContact: 'long fingers and controlled short steps',
      surfaceOrMaterial: 'weathered supernatural skin and cloth',
      canonicalFeatures: ['hooked profile', 'long hands', 'bent posture', 'bent cone hat'],
      absentHumanFeatures: ['smooth ordinary face', 'short fingers', 'neutral upright posture'],
    },
    artStatus: REJECTED_HUMAN_TEMPLATE_ART, shape: 'drop',
    palette: {
      ...palette([128, 151, 96], [76, 72, 82], [42, 34, 48], [181, 142, 52]),
      ash: [101, 126, 78],
      hollow: [54, 67, 48],
      hairEdge: [45, 42, 51],
      cloakLift: [73, 57, 79],
      shirt: [67, 51, 74],
    },
  },
  'devon-price': {
    version: 2, visualId: 'devon-price', kind: 'devon-price', archetype: 'alien',
    anatomy: {
      base: 'slim inquisitive alien biped', skullOrFace: 'huge bare cranium, black almond eyes, tiny nostrils, and narrow jaw',
      torso: 'narrow alien torso and long neck',
      limbsAndContact: 'long arms, three-fingered hands, slim legs, and small planted feet',
      surfaceOrMaterial: 'cool blue-grey skin without hair or external ears',
      canonicalFeatures: ['huge cranium', 'black almond eyes', 'tiny nostrils', 'long arms', 'three-fingered hands'],
      absentHumanFeatures: ['human ears', 'human hair', 'human eye whites', 'human nose', 'five-fingered hands'],
    },
    artStatus: APPROVED_LITERAL_ART, shape: 'drop',
    palette: {
      ...palette([132, 158, 172], [41, 43, 50], [105, 43, 54], [188, 115, 56]),
      ash: [102, 128, 143],
      hollow: [29, 31, 38],
      hairEdge: [72, 32, 40],
      cloakLift: [143, 61, 72],
      shirt: [226, 216, 190],
      lining: [188, 115, 56],
      fang: [226, 216, 190],
      red: [143, 61, 72],
    },
  },
  'rafael-cruz': {
    version: 2, visualId: 'rafael-cruz', kind: 'rafael-cruz', archetype: 'orc',
    anatomy: {
      base: 'heavy grounded orc biped', skullOrFace: 'low forehead, broad nose, and massive tusked jaw',
      torso: 'thick neck, high shoulders, and deep chest',
      limbsAndContact: 'large hands, bowed legs, and heavy feet',
      surfaceOrMaterial: 'olive leathery skin with sparse hair',
      canonicalFeatures: ['massive lower jaw', 'rooted tusks', 'heavy shoulders', 'large hands'],
      absentHumanFeatures: ['normal human jaw', 'narrow neck', 'small human hands'],
    },
    artStatus: APPROVED_LITERAL_ART, shape: 'square',
    palette: {
      ...palette([130, 157, 72], [55, 42, 30], [220, 209, 176], [184, 136, 44]),
      ash: [91, 119, 58],
      hollow: [48, 54, 34],
      hairEdge: [83, 57, 37],
      cloakLift: [184, 166, 128],
      shirt: [73, 58, 44],
      red: [132, 75, 42],
    },
  },
  'tomas-reed': {
    version: 2, visualId: 'tomas-reed', kind: 'tomas-reed', archetype: 'ghost',
    anatomy: {
      base: 'floating classic bedsheet ghost', skullOrFace: 'rounded sheet crown with two black eye holes',
      torso: 'one continuous white draped sheet',
      limbsAndContact: 'wing-like sheet arms and a rippling hem that hovers above the ground',
      surfaceOrMaterial: 'warm white spectral cloth with graphite folds',
      canonicalFeatures: ['white sheet silhouette', 'black eye holes', 'draped arms', 'floating scalloped hem'],
      absentHumanFeatures: ['visible human body', 'skin', 'hands', 'ordinary legs', 'shoes', 'ground contact'],
    },
    artStatus: APPROVED_LITERAL_ART, shape: 'tall',
    palette: {
      ...palette([244, 242, 232], [41, 40, 46], [238, 237, 230], [198, 199, 194]),
      ash: [211, 213, 208],
      hollow: [39, 39, 47],
      cloak: [238, 237, 230],
      cloakLift: [218, 220, 216],
      shirt: [244, 242, 232],
      white: [250, 248, 240],
    },
  },
  'resident-01': {
    version: 2, visualId: 'resident-01', kind: 'resident-01', archetype: 'robot',
    anatomy: {
      base: 'compact retro office robot', skullOrFace: 'rounded rectangular metal head, amber display eyes, and voice grille',
      torso: 'cabinet torso with an inset filing drawer and brass label slot',
      limbsAndContact: 'segmented piston arms, three-pronged clamps, jointed legs, and broad rubber feet',
      surfaceOrMaterial: 'warm ivory enamel, steel-blue panels, brass joints, and charcoal rubber',
      canonicalFeatures: ['metal box head', 'amber display eyes', 'voice grille', 'filing drawer torso', 'clamp hands', 'jointed legs'],
      absentHumanFeatures: ['human skin', 'human hair', 'human face', 'human fingers', 'human clothing'],
    },
    artStatus: APPROVED_LITERAL_ART, shape: 'square',
    palette: {
      ...palette([204, 198, 176], [48, 52, 56], [65, 88, 103], [222, 160, 54]),
      ash: [104, 127, 139],
      hollow: [34, 38, 43],
      cloak: [65, 88, 103],
      cloakLift: [91, 119, 133],
      shirt: [217, 207, 181],
      lining: [222, 160, 54],
      fang: [235, 229, 207],
    },
  },
  'resident-02': {
    version: 2, visualId: 'resident-02', kind: 'resident-02', archetype: 'goblin',
    anatomy: {
      base: 'compact broad goblin biped', skullOrFace: 'wide green face, rear-mounted pointed ears, and small lower fang',
      torso: 'short round torso with a buried neck',
      limbsAndContact: 'long arms, clawed hands, short bowed legs, and broad bare feet',
      surfaceOrMaterial: 'warm moss-green skin, dark umber hair, and work cloth',
      canonicalFeatures: ['green skin', 'rear-mounted pointed ears', 'small lower fang', 'broad bare feet'],
      absentHumanFeatures: ['human skin tone', 'human ear placement', 'ordinary human feet'],
    },
    artStatus: REJECTED_HUMAN_TEMPLATE_ART, shape: 'wide',
    palette: {
      ...palette([139, 174, 92], [61, 48, 39], [224, 217, 192], [190, 142, 50]),
      ash: [105, 142, 72],
      hollow: [43, 49, 34],
      hairEdge: [83, 60, 42],
      cloakLift: [187, 177, 145],
      lining: [190, 142, 50],
    },
  },
  'priya-nair': {
    version: 2, visualId: 'priya-nair', kind: 'priya-nair', archetype: 'skeleton',
    anatomy: {
      base: 'articulated skeleton', skullOrFace: 'bare cranium, sockets, nasal cavity, cheekbones, and jaw',
      torso: 'neck vertebrae, spine, sternum, ribs, and pelvis',
      limbsAndContact: 'separate arm, hand, thigh, shin, and foot bones with visible joints',
      surfaceOrMaterial: 'clean warm ivory bone with graphite cavities, magical hair, and cloth',
      canonicalFeatures: ['oversized bare skull', 'empty sockets with magical pupils', 'separate jaw', 'rib cage', 'pelvis', 'long bones'],
      absentHumanFeatures: ['skin', 'scalp', 'flesh face', 'human eyeballs', 'human nose', 'printed ribs'],
    },
    artStatus: REJECTED_HUMAN_TEMPLATE_ART, shape: 'tall',
    palette: palette([235, 224, 194], [44, 36, 70], [75, 130, 132], [60, 220, 224]),
  },
  'sora-tan': {
    version: 2, visualId: 'sora-tan', kind: 'sora-tan', archetype: 'ghoul',
    anatomy: {
      base: 'crouched ghoul scavenger', skullOrFace: 'oversized corpse skull, hollow sockets, and broad jagged maw',
      torso: 'narrow hunched torso',
      limbsAndContact: 'long hanging arms, clawed hands, bent legs, and broad splayed feet',
      surfaceOrMaterial: 'mottled corpse-green skin with dark plum cloth',
      canonicalFeatures: ['oversized skull', 'hollow sockets', 'jagged maw', 'long arms', 'clawed hands', 'splayed feet'],
      absentHumanFeatures: ['healthy human face', 'ordinary jaw', 'human hands', 'upright runway posture'],
    },
    artStatus: APPROVED_LITERAL_ART, shape: 'wide',
    palette: {
      ...palette([154, 181, 68], [38, 35, 40], [88, 48, 91], [180, 138, 67]),
      ash: [116, 142, 54],
      hollow: [30, 29, 32],
      cloakLift: [121, 68, 122],
    },
  },
  'elise-moreau': {
    version: 2, visualId: 'elise-moreau', kind: 'elise-moreau', archetype: 'constructed-corpse',
    anatomy: {
      base: 'assembled corpse biped', skullOrFace: 'broad flat cranium, slab brow, heavy jaw, and seams',
      torso: 'thick neck and mismatched stitched torso planes',
      limbsAndContact: 'oversized hands and stiff assembled limbs',
      surfaceOrMaterial: 'muted green-gray stitched flesh with metal neck hardware',
      canonicalFeatures: ['flat crown', 'slab brow', 'stitched flesh', 'neck hardware', 'large hands'],
      absentHumanFeatures: ['smooth skin', 'round human skull', 'narrow neck', 'small hands'],
    },
    artStatus: REJECTED_HUMAN_TEMPLATE_ART, shape: 'square',
    palette: {
      ...palette([142, 154, 130], [116, 55, 39], [172, 126, 44], [180, 45, 42]),
      ash: [159, 166, 154],
      hollow: [106, 118, 96],
      hairEdge: [88, 46, 36],
      cloak: [55, 50, 59],
      cloakLift: [80, 72, 84],
      shirt: [172, 126, 44],
      fang: [190, 194, 186],
    },
  },
};

export const PENCIL_VISUAL_IDS = Object.freeze(Object.keys(PENCIL_CHARACTER_RECIPES) as PencilVisualId[]);

export function isPencilVisualId(id: string): id is PencilVisualId {
  return id in PENCIL_CHARACTER_RECIPES;
}

function mass(sketch: Sketch, F: PencilLayout, points: readonly Point[], color: keyof PencilPalette, style: 'black' | 'hatch' | 'scribble' | 'light' = 'scribble'): void {
  F.media.tone(sketch, points, { style });
  F.media.skin(sketch, points, F.colors[color], { paper: false, underdraw: false, alpha: 0.45 });
  sketch.broken(points, F.lwMain);
}

function body(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const sway = pose.moving ? (pose.gait === 0 ? -3 : 3) : 0;
  const coat = sketch.smooth([
    F.body(-24, 132), F.body(24, 132), F.body(39 + sway, 235),
    F.body(22 + sway, 263), F.body(-22 + sway, 263), F.body(-39 + sway, 235),
  ]);
  mass(sketch, F, coat, 'cloak', 'hatch');
}

function mouth(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  if (pose.facing === 'rear') return;
  const dir = pose.facing === 'right' ? 1 : pose.facing === 'left' ? -1 : 0;
  const x = F.head(dir * 13, 108).x;
  const y = F.head(0, 108).y;
  sketch.sline([{ x: x - 5 * F.hs, y }, { x: x + 5 * F.hs, y: y + F.hs }], F.lwMain, 0.78);
}

function hairCap(sketch: Sketch, F: PencilLayout, pose: VampirePose): void {
  const dir = pose.facing === 'right' ? 1 : pose.facing === 'left' ? -1 : 0;
  const cap = sketch.smooth([
    F.head(-30 + dir * 4, 66), F.head(-25 + dir * 3, 35), F.head(0 + dir * 4, 25),
    F.head(26 + dir * 4, 38), F.head(30 + dir * 4, 69), F.head(17 + dir * 4, 55), F.head(-18 + dir * 4, 55),
  ]);
  mass(sketch, F, cap, 'hair', 'black');
}

function feature(sketch: Sketch, F: PencilLayout, pose: VampirePose, kind: CreatureKind): void {
  const dir = pose.facing === 'right' ? 1 : pose.facing === 'left' ? -1 : 0;
  const front = pose.facing !== 'rear';
  if (kind === 'linda') {
    const shag = sketch.smooth([
      F.head(-36 + dir * 3, 34), F.head(31 + dir * 3, 30), F.head(37 + dir * 4, 114),
      F.body(31, 200), F.body(16, 225), F.head(8, 115), F.head(-2, 82),
      F.head(-14, 116), F.body(-18, 226), F.body(-36, 197),
    ]);
    mass(sketch, F, shag, 'hair', 'scribble');
    return;
  }
  if (kind === 'mina-park') {
    const brim = [F.head(-42, 38), F.head(37, 38), F.head(31, 48), F.head(-37, 48)];
    const hat = [F.head(-23, 39), F.head(-7, -31), F.head(18, 3), F.head(8, 13), F.head(29, 42)];
    mass(sketch, F, brim, 'cloak', 'black');
    mass(sketch, F, hat, 'cloak', 'hatch');
    return;
  }
  if (kind === 'devon-price') {
    for (const side of [-1, 1] as const) {
      const earDir = dir || side;
      const ear = [F.head(side * 22, 66), F.head(side * 58 + dir * 5, 56), F.head(side * 31, 82)];
      mass(sketch, F, ear, 'pale', 'light');
      sketch.sline([F.head(side * 26, 68), F.head(earDir * 49, 59)], F.lwThin, 0.65);
    }
    return;
  }
  if (kind === 'rafael-cruz' && front) {
    for (const side of [-1, 1] as const) {
      const tusk = [F.head(side * 8, 111), F.head(side * 15, 91), F.head(side * 20, 116)];
      mass(sketch, F, tusk, 'fang', 'light');
    }
    const apron = [F.body(-18, 151), F.body(18, 151), F.body(23, 248), F.body(-23, 248)];
    mass(sketch, F, apron, 'white', 'light');
    sketch.broken([F.body(28, 160), F.body(43, 246)], F.lwThin * 1.5);
    return;
  }
  if (kind === 'tomas-reed') {
    const shroud = sketch.smooth([
      F.head(-40, 29), F.head(37, 28), F.body(47 + dir * 3, 172),
      F.body(39 + dir * 7, 279), F.body(8, 251), F.body(-8, 273), F.body(-43, 226),
    ]);
    mass(sketch, F, shroud, 'cloak', 'scribble');
    if (front) mass(sketch, F, [F.body(18, 188), F.body(36, 188), F.body(36, 223), F.body(18, 223)], 'lining', 'light');
    return;
  }
  if (kind === 'priya-nair' && front) {
    for (let row = 0; row < 4; row += 1) {
      const y = 164 + row * 18;
      sketch.broken([F.body(-20, y), F.body(0, y + 7), F.body(20, y)], F.lwMain * 1.3);
    }
    const bowLeft = [F.body(-2, 146), F.body(-22, 136), F.body(-22, 160)];
    const bowRight = [F.body(2, 146), F.body(22, 136), F.body(22, 160)];
    mass(sketch, F, bowLeft, 'lining', 'black');
    mass(sketch, F, bowRight, 'lining', 'black');
    return;
  }
  if (kind === 'sora-tan' && front) {
    const maw = sketch.smooth([F.head(-28, 100), F.head(28, 100), F.head(31, 119), F.head(0, 130), F.head(-31, 119)]);
    mass(sketch, F, maw, 'hair', 'black');
    for (let x = -22; x <= 22; x += 11) {
      mass(sketch, F, [F.head(x - 3, 103), F.head(x, 112), F.head(x + 3, 103)], 'fang', 'light');
    }
    return;
  }
  if (kind === 'elise-moreau') {
    const brow = [F.head(-38 + dir * 4, 66), F.head(38 + dir * 4, 66), F.head(31 + dir * 4, 78), F.head(-34 + dir * 4, 78)];
    mass(sketch, F, brow, 'hair', 'black');
    const recorder = [F.body(24, 137), F.body(47, 137), F.body(47, 188), F.body(24, 188)];
    mass(sketch, F, recorder, 'lining', 'hatch');
  }
}

function drawRejectedHumanTemplatePrototype(
  sketch: Sketch,
  recipe: PencilCharacterRecipe,
  pose: VampirePose,
  kind: CreatureKind,
): void {
  const F = buildPencilLayout(recipe.shape, recipe.palette);
  drawLegs(sketch, F, pose);
  body(sketch, F, pose);
  drawArms(sketch, F, pose);
  drawSkull(sketch, F, pose);
  if (!['linda', 'mina-park', 'tomas-reed'].includes(recipe.kind)) hairCap(sketch, F, pose);
  drawEyes(sketch, F, pose);
  drawNose(sketch, F, pose);
  mouth(sketch, F, pose);
  feature(sketch, F, pose, kind);
}

export type PencilCharacterRenderOptions = Readonly<{
  hidePersonalLayers?: boolean;
  seated?: boolean;
}>;

export function drawPencilCharacter(
  sketch: Sketch,
  recipe: PencilCharacterRecipe,
  pose: VampirePose,
  options: PencilCharacterRenderOptions = {},
): void {
  if (recipe.kind === 'vampire-01') throw new Error('The vampire keeps its existing authored renderer.');
  if (recipe.kind === 'priya-nair') {
    drawPriyaSkeleton(sketch, buildPencilLayout(recipe.shape, recipe.palette), pose, {
      dressed: options.hidePersonalLayers !== true,
      seated: options.seated === true,
    });
    return;
  }
  if (recipe.kind === 'linda') {
    drawLiteralBigfoot(sketch, buildPencilLayout(recipe.shape, recipe.palette), pose);
    return;
  }
  if (recipe.kind === 'linda-boyfriend') {
    drawLiteralWerewolf(sketch, buildPencilLayout(recipe.shape, recipe.palette), pose, {
      dressed: options.hidePersonalLayers !== true,
      seated: options.seated === true,
    });
    return;
  }
  if (recipe.kind === 'elise-moreau') {
    drawConstructedCorpse(sketch, buildPencilLayout(recipe.shape, recipe.palette), pose, {
      dressed: options.hidePersonalLayers !== true,
      seated: options.seated === true,
    });
    return;
  }
  if (recipe.kind === 'tomas-reed') {
    drawClassicSheetGhost(sketch, buildPencilLayout(recipe.shape, recipe.palette), pose, {
      adorned: options.hidePersonalLayers !== true,
      seated: options.seated === true,
    });
    return;
  }
  if (recipe.kind === 'resident-01') {
    drawLiteralRobot(sketch, buildPencilLayout(recipe.shape, recipe.palette), pose, {
      adorned: options.hidePersonalLayers !== true,
      seated: options.seated === true,
    });
    return;
  }
  if (recipe.kind === 'mina-park') {
    drawClassicWitch(sketch, buildPencilLayout(recipe.shape, recipe.palette), pose, {
      dressed: options.hidePersonalLayers !== true,
    });
    return;
  }
  if (recipe.kind === 'devon-price') {
    drawLiteralAlien(sketch, buildPencilLayout(recipe.shape, recipe.palette), pose, {
      dressed: options.hidePersonalLayers !== true,
      seated: options.seated === true,
    });
    return;
  }
  if (recipe.kind === 'rafael-cruz') {
    drawLiteralOrc(sketch, buildPencilLayout(recipe.shape, recipe.palette), pose, {
      dressed: options.hidePersonalLayers !== true,
      seated: options.seated === true,
    });
    return;
  }
  if (recipe.kind === 'sora-tan') {
    drawLiteralGhoul(sketch, buildPencilLayout(recipe.shape, recipe.palette), pose, {
      dressed: options.hidePersonalLayers !== true,
      seated: options.seated === true,
    });
    return;
  }
  if (recipe.kind === 'resident-02') {
    drawLiteralGoblin(sketch, buildPencilLayout(recipe.shape, recipe.palette), pose, {
      dressed: options.hidePersonalLayers !== true,
      seated: options.seated === true,
    });
    return;
  }
  if (recipe.artStatus.worldBody !== 'rejected-human-template') {
    throw new Error(`${recipe.visualId} needs a literal ${recipe.archetype} anatomy renderer before approval.`);
  }
  drawRejectedHumanTemplatePrototype(sketch, recipe, pose, recipe.kind);
}

export function bakePencilCharacterFrames(
  recipe: PencilCharacterRecipe,
  options: PencilCharacterRenderOptions = {},
): readonly Uint8ClampedArray[] {
  const frames: Uint8ClampedArray[] = [];
  for (const facing of VAMPIRE_FACINGS) {
    for (const moving of [false, true] as const) {
      const gaits = moving ? [0, 1] as const : [0] as const;
      for (const gait of gaits) {
        for (let boil = 0; boil < BOIL_FRAMES; boil += 1) {
          const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
          sketch.boil(hashSeed(recipe.visualId, facing, moving ? gait : 'idle', boil));
          drawPencilCharacter(sketch, recipe, { facing, gait, moving }, options);
          frames.push(sketch.data);
        }
      }
    }
  }
  return frames;
}

export function bakeSeatedPencilCharacterFrames(
  recipe: PencilCharacterRecipe,
): readonly Uint8ClampedArray[] {
  return VAMPIRE_FACINGS.flatMap((facing) => Array.from({ length: BOIL_FRAMES }, (_, boil) => {
    const sketch = new Sketch(PENCIL_WIDTH, PENCIL_HEIGHT);
    sketch.boil(hashSeed(recipe.visualId, 'seated', facing, boil));
    drawPencilCharacter(sketch, recipe, { facing, gait: 0, moving: false }, { seated: true });
    return sketch.data;
  }));
}
