import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  PRODUCTION_AMBIENT_RESIDENTS,
  PRODUCTION_OFFICE_STAFF,
  PRODUCTION_FULL_AI_CAST,
} from '../../src/domain/state/production-cast';
import { createInitialState } from '../../src/domain/state/initial-state';
import { CHARACTER_LOOKS } from '../art/character-look-roster';
import { buildProductionMaps } from './build-map-v2';
import { buildSaveCutoverFixtures } from './build-save-cutover-fixtures';
import { buildVerbalMissions } from './build-verbal-missions';

const root = process.cwd();

const CHARACTER_VOICE = {
  mina_park: {
    personality: 'Mina is calm, observant, and exact about personal space. Her humor is dry and gentle until someone treats staff badly.',
    biography: 'Mina manages Shoreglass Spa in the northwest district. She learned the work through apprenticeships and years of service jobs. She knows regular clients, wellness routines, and the public rhythms of the villas. She protects staff privacy and distrusts people who confuse attention with consent.',
    reasoning: 'Mina is practical and socially perceptive. She notices stress and evasion, but she is not a scientist or therapist.',
    education: 'Vocational training in massage, hospitality, scheduling, and basic business records.',
    well: 'Spa work, relaxation services, villa residents, staff boundaries, and northwest directions.',
    rough: 'Public shopping, nightlife, civic offices, and common stable world facts.',
    unknown: 'Advanced medicine, live news, concealed criminal groups, and another client’s private life.',
    greeting: 'You look like someone who was promised relaxation and given a camera instead.',
  },
  rafael_cruz: {
    personality: 'Rafael is warm, proud, impatient with waste, and quick to turn tension into a joke. He judges people by how they treat workers.',
    biography: 'Rafael runs a small cafe in Palm Exchange. He cooks, buys supplies, and knows which public food sellers are reliable. His friendships are broad but not deep. He refuses romantic attention and does not treat that decision as negotiable.',
    reasoning: 'Rafael solves concrete problems quickly. He knows ingredients and people better than theory.',
    education: 'Secondary school, restaurant work, food-safety courses, and years of buying island supplies.',
    well: 'Cooking, food prices, the commercial district, service work, and public deliveries.',
    rough: 'Residential services, nightlife, docks, and basic real-world geography.',
    unknown: 'Specialist medicine, law, live politics, private relationships, and concealed faction business.',
    greeting: 'If you are here for breakfast, good. If you are here for gossip, order first.',
  },
  sora_tan: {
    personality: 'Sora is stylish, competitive, curious, and good at reading what people want to project. She can be generous and cutting in the same sentence.',
    biography: 'Sora manages a clothing boutique in the commercial district. She understands fit, prices, trends that reached Halcyra, and how public reputation changes sales. She likes confidence but rejects pressure and humiliation games.',
    reasoning: 'Sora reasons through patterns, presentation, and social incentives. She is weak on technical and academic detail.',
    education: 'Retail training, tailoring practice, inventory work, and informal design study.',
    well: 'Clothes, shopping, customer motives, public style, and the commercial district.',
    rough: 'Villas, entertainment venues, ferry services, and famous real-world places.',
    unknown: 'Live mainland trends, specialist science, private records, and concealed local operations.',
    greeting: 'The meme looked shorter online. Relax. Most people do.',
  },
  devon_price: {
    personality: 'Devon is a charming, guarded, observant alien who can change a subject without appearing to. He values discretion more than approval and studies people without treating them as specimens.',
    biography: 'Devon came to Halcyra from off-world and tends bar on the downtown club strip. The work lets him learn social rituals while earning belonging without becoming a tourist attraction. He knows public nightlife, staff signals, and which rumors are unsafe to repeat. Personal memory is sacred to him. He has loose ties to Velvet Tide but no authority to reveal its private operations. He is not romantically available to the protagonist.',
    reasoning: 'Devon reads risk, discomfort, and social leverage well. He remembers preferences, avoids claims that could endanger a coworker, and sometimes studies people instead of connecting with them.',
    education: 'Off-world cultural training, Halcyra hospitality work, licensing courses, and long experience with nightlife customers.',
    well: 'Bars, clubs, public vice, customer behavior, and downtown directions.',
    rough: 'Shopping, villas, docks, and common stable world facts.',
    unknown: 'Medical or legal expertise, live news, faction command, and private crimes he did not witness.',
    greeting: 'Your species calls this small talk. I have seen larger versions.',
  },
  priya_nair: {
    personality: 'Priya is direct, patient, and difficult to impress. She is kind without making promises she cannot keep.',
    biography: 'Priya works at a small clinic near the civic district. She handles ordinary primary care and sends serious cases off-island when transport permits. She keeps medical information private and refuses to diagnose strangers from gossip.',
    reasoning: 'Priya uses evidence and separates an observation from a diagnosis. She says when current medical guidance is needed.',
    education: 'Medical degree, clinical training, and island primary-care experience.',
    well: 'Ordinary health care, clinic procedures, consent, public safety, and civic services.',
    rough: 'Other neighborhoods, common world geography, and non-specialist public policy.',
    unknown: 'Live medical guidance without a source, private patient facts, faction secrets, and crimes she did not observe.',
    greeting: 'You are upright and breathing. That already makes this a social visit.',
  },
  tomas_reed: {
    personality: 'Tomas is orderly, understated, and quietly stubborn. His jokes arrive late and sound like administrative notices.',
    biography: 'Tomas keeps public marina and permit records near the docks. He knows ferry procedures, office hours, and ordinary island paperwork. He will not falsify a record or disclose restricted civic information. He is not romantically available to the protagonist.',
    reasoning: 'Tomas follows procedures and concrete records. He is cautious about rumors and questions without a clear purpose.',
    education: 'Public-administration certificate, marina work, records training, and basic navigation courses.',
    well: 'Docks, permits, public ferry facts, civic offices, and marina routines.',
    rough: 'Shopping, nightlife, villas, and basic stable international facts.',
    unknown: 'Live international events, sealed police records, private relationships, and underworld leadership.',
    greeting: 'If you need a permit, take a number. If you need gossip, take a longer number.',
  },
  elise_moreau: {
    personality: 'Elise is curious, skeptical, and willing to let silence make another person talk. She enjoys absurdity but dislikes cruelty.',
    biography: 'Elise writes local features and records interviews from a small downtown studio. She knows public island history, official announcements, and the gap between publicity and daily life. She protects sources and will not present rumor as proof.',
    reasoning: 'Elise compares accounts and asks who benefits. She distinguishes public record, witnessed fact, and inference.',
    education: 'Journalism degree, local reporting, audio editing, and public-record research.',
    well: 'The residency prize, public island history, interviews, publicity, and downtown culture.',
    rough: 'Other neighborhoods, civic procedure, famous world events, and public crime rumors.',
    unknown: 'Live news without a source, confidential sources, private character facts, and concealed crimes without evidence.',
    greeting: 'The island picked a meme and got a person. That is already a better story.',
  },
} as const;

const SECTION_IDS = [
  'overview',
  'residential-and-relaxation',
  'downtown-and-nightlife',
  'shopping-clothes-and-food',
  'docks-and-civic-offices',
  'residency-prize',
  'public-safety',
] as const;

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, json(value));
}

async function mergeRegistry(fileName: string, additions: readonly Readonly<{ id: string; displayName: string }>[]) {
  const path = resolve(root, 'content', 'registries', fileName);
  const source = JSON.parse(await readFile(path, 'utf8')) as { schemaVersion: 1; items: { id: string; displayName: string }[] };
  const additionIds = new Set(additions.map(({ id }) => id));
  source.items = [...source.items.filter(({ id }) => !additionIds.has(id)), ...additions]
    .sort((left, right) => left.id.localeCompare(right.id, 'en'));
  await writeJson(path, source);
}

async function buildCharacters(): Promise<void> {
  for (const character of PRODUCTION_FULL_AI_CAST) {
    const voice = CHARACTER_VOICE[character.id];
    const directory = resolve(root, 'content', 'characters', character.visualId);
    await mkdir(directory, { recursive: true });
    const locationKnowledgeId = character.work.mapId === 'northwest_residential'
      ? 'residential-and-relaxation'
      : character.work.mapId === 'northeast_downtown'
        ? 'downtown-and-nightlife'
        : character.work.mapId === 'southwest_commercial'
          ? 'shopping-clothes-and-food'
          : 'docks-and-civic-offices';
    const levels = SECTION_IDS.map((id) => {
      const level = id === 'overview' || id === 'residency-prize' || id === locationKnowledgeId
        ? 'knows_well'
        : id === 'public-safety' ? 'heard_of' : 'knows_roughly';
      return `- ${id}: ${level}`;
    }).join('\n');
    await writeFile(resolve(directory, 'personality.md'), `# Personality\n\n${voice.personality}\n`);
    await writeFile(resolve(directory, 'biography.md'), `# Biography\n\n${voice.biography}\n`);
    await writeFile(resolve(directory, 'knowledge.md'), [
      '# Knowledge Profile',
      '',
      '## Reasoning style', voice.reasoning,
      '',
      '## Education and experience', voice.education,
      '',
      '## Real-world baseline',
      'Knows stable public facts at the level of this background. Does not know live news automatically. Halcyra is part of the real world, but its exact position relative to a real place is not authored.',
      '',
      '## Halcyra section knowledge', levels,
      '',
      '## Knows well', `- ${voice.well}`,
      '',
      '## Knows roughly', `- ${voice.rough}`,
      '',
      '## Does not know', `- ${voice.unknown}`,
      '',
      '## Uncertainty behavior',
      'Answers briefly at the authored knowledge level. States uncertainty instead of inventing a name, live fact, private fact, exact geography, or expertise.',
      '',
    ].join('\n'));
    const missionFacts = character.id === 'tomas_reed' ? ['ferry_after_dark_route']
      : character.id === 'priya_nair' ? ['priya_injury_transport_evidence', 'priya_patient_consent'] : [];
    const missionActions = character.id === 'tomas_reed' ? ['record_tomas_ferry_disclosure']
      : character.id === 'priya_nair' ? ['assess_off_island_transport', 'schedule_priya_assessment'] : [];
    const missionQuests = character.id === 'tomas_reed' ? ['tomas_after_dark_ferry']
      : character.id === 'priya_nair' ? ['priya_off_island_assessment'] : [];
    const actions = ['greet', 'ask_follow_up', 'end_conversation', 'invite_home', 'ask_date', 'aggressive_flirt', ...missionActions];
    const romanticBoundary = [
      { id: 'no_aggressive_flirting', scope: 'romantic', blockedActionIds: ['aggressive_flirt'] },
    ];
    const rejections = character.romantic ? [] : [{
      reasonId: 'not_romantically_compatible', kind: 'permanent_boundary', sourceActionId: 'ask_date', resolved: false,
    }];
    await writeJson(resolve(directory, 'rules.json'), {
      schemaVersion: 1,
      npcId: character.id,
      factIds: missionFacts,
      interestIds: [character.interestId, 'island_gossip'],
      actionIds: actions,
      memorySubjectIds: [character.memorySubjectId],
      unlockIds: [],
      questIds: missionQuests,
      locationIds: [character.homeLocationId, character.work.mapId],
      factionIds: character.factionIds,
      compatibility: { social: true, romantic: character.romantic, romanticEligibleAtStart: false },
      startingRelationship: { values: { familiarity: 0, trust: 0, attraction: 0 }, stage: 'stranger' },
      hardBoundaries: romanticBoundary,
      stageRules: [{ stage: 'dating', unavailable: !character.romantic, requiredFlagIds: [] }],
      rejections,
    });
    await writeJson(resolve(directory, 'authored-dialogue.json'), {
      schemaVersion: 1,
      displayName: character.displayName,
      greeting: voice.greeting,
      fallbacks: [
        'I did not follow that. Try it another way.',
        'I can answer what I know. I will not make up the rest.',
      ],
    });
  }
}

async function buildBrowserWritingModule(): Promise<void> {
  const entries = await Promise.all(PRODUCTION_FULL_AI_CAST.map(async (character) => {
    const directory = resolve(root, 'content', 'characters', character.visualId);
    const [personality, biography, knowledge, rulesSource, dialogueSource] = await Promise.all([
      readFile(resolve(directory, 'personality.md'), 'utf8'),
      readFile(resolve(directory, 'biography.md'), 'utf8'),
      readFile(resolve(directory, 'knowledge.md'), 'utf8'),
      readFile(resolve(directory, 'rules.json'), 'utf8'),
      readFile(resolve(directory, 'authored-dialogue.json'), 'utf8'),
    ]);
    const dialogue = JSON.parse(dialogueSource) as {
      displayName: string;
      greeting: string;
      fallbacks: string[];
    };
    return [character.id, {
      displayName: dialogue.displayName,
      personality,
      biography,
      knowledge,
      rules: JSON.parse(rulesSource) as unknown,
      greeting: dialogue.greeting,
      fallbacks: dialogue.fallbacks,
    }] as const;
  }));
  const source = [
    '/* This file is generated by scripts/content/build-production-content.ts. */',
    `export const BROWSER_NAMED_WRITING = ${JSON.stringify(Object.fromEntries(entries), null, 2)} as const;`,
    '',
  ].join('\n');
  await writeFile(resolve(root, 'src', 'ai', 'registry', 'generated-browser-writing.ts'), source);
}

async function buildWorldCatalog(): Promise<void> {
  await writeJson(resolve(root, 'content', 'world', 'characters', 'production.json'), [
    ...PRODUCTION_FULL_AI_CAST.map((character) => ({
      schemaVersion: 1,
      id: character.id,
      displayName: character.displayName,
      tier: 'full_ai',
      homeLocationId: character.homeLocationId,
      factionIds: character.factionIds,
    })),
    ...PRODUCTION_AMBIENT_RESIDENTS.map((resident) => ({
      schemaVersion: 1,
      id: resident.id,
      displayName: resident.displayName,
      tier: 'ambient',
      homeLocationId: resident.position.locationId,
      factionIds: [],
    })),
    ...PRODUCTION_OFFICE_STAFF.map((staff) => ({
      schemaVersion: 1,
      id: staff.id,
      displayName: staff.displayName,
      tier: 'ambient',
      homeLocationId: staff.position.locationId,
      factionIds: [],
    })),
  ]);
  await writeJson(resolve(root, 'content', 'world', 'locations', 'production.json'), PRODUCTION_FULL_AI_CAST.map((character) => ({
    schemaVersion: 1,
    id: character.homeLocationId,
    displayName: character.businessDisplayName,
    neighborhoodId: character.work.mapId,
    kind: 'business',
    adjacentLocationIds: [character.work.mapId],
  })));
  await writeJson(resolve(root, 'content', 'schedules', 'prototype.json'), Object.values(createInitialState().schedules));
  await writeJson(resolve(root, 'content', 'production-bill.json'), {
    schemaVersion: 1,
    fullAiCount: PRODUCTION_FULL_AI_CAST.length + 1,
    ambientCount: PRODUCTION_AMBIENT_RESIDENTS.length + PRODUCTION_OFFICE_STAFF.length + 2,
    fullAiNpcIds: ['linda', ...PRODUCTION_FULL_AI_CAST.map(({ id }) => id)],
    ambientNpcIds: [
      'generic_resident', 'linda_boyfriend',
      ...PRODUCTION_AMBIENT_RESIDENTS.map(({ id }) => id),
      ...PRODUCTION_OFFICE_STAFF.map(({ id }) => id),
    ],
    visualIds: CHARACTER_LOOKS.map(({ id }) => id).sort(),
    scheduleIds: Object.keys(createInitialState().schedules).sort(),
    businessLocationIds: PRODUCTION_FULL_AI_CAST.map(({ homeLocationId }) => homeLocationId).sort(),
  });
}

async function buildRegistries(): Promise<void> {
  await mergeRegistry('facts.json', [
    { id: 'ferry_after_dark_route', displayName: 'After-dark public ferry route' },
    { id: 'linda_cash_payment_ready', displayName: 'Exact purse payment is available' },
    { id: 'linda_purse_independence_story', displayName: 'Linda purse independence story' },
    { id: 'linda_purse_worn_clasp', displayName: 'Linda purse worn clasp' },
    { id: 'linda_quick_consignment_net', displayName: 'Linda quick consignment net value' },
    { id: 'priya_injury_transport_evidence', displayName: 'Injury transport evidence' },
    { id: 'priya_patient_consent', displayName: 'Patient consent for Priya assessment' },
  ]);
  await mergeRegistry('actions.json', [
    { id: 'assess_off_island_transport', displayName: 'Assess off-island transport' },
    { id: 'buy_linda_marchetti_purse', displayName: 'Buy Linda Marchetti purse' },
    { id: 'record_tomas_ferry_disclosure', displayName: 'Record Tomas ferry disclosure' },
    { id: 'schedule_priya_assessment', displayName: 'Schedule Priya assessment' },
  ]);
  await mergeRegistry('quests.json', [
    { id: 'linda_marchetti_purse_sale', displayName: 'Buy Linda Marchetti purse' },
    { id: 'priya_off_island_assessment', displayName: 'Arrange Priya transport assessment' },
    { id: 'tomas_after_dark_ferry', displayName: 'Learn the after-dark ferry route' },
  ]);
  await mergeRegistry('interests.json', PRODUCTION_FULL_AI_CAST.map((character) => ({
    id: character.interestId,
    displayName: character.interestId[0]!.toUpperCase() + character.interestId.slice(1),
  })));
  await mergeRegistry('memory-subjects.json', PRODUCTION_FULL_AI_CAST.map((character) => ({
    id: character.memorySubjectId,
    displayName: character.memorySubjectId.replaceAll('_', ' '),
  })));
  await mergeRegistry('locations.json', PRODUCTION_FULL_AI_CAST.map((character) => ({
    id: character.homeLocationId,
    displayName: character.businessDisplayName,
  })));
}

async function main(): Promise<void> {
  await buildCharacters();
  await buildBrowserWritingModule();
  await buildRegistries();
  await buildProductionMaps(root);
  await buildWorldCatalog();
  await buildSaveCutoverFixtures(root);
  await buildVerbalMissions(root);
  process.stdout.write(`Built ${PRODUCTION_FULL_AI_CAST.length} named character files and ${PRODUCTION_AMBIENT_RESIDENTS.length} ambient residents.\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`Production content build failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
