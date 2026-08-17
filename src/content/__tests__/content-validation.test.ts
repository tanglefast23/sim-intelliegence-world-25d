import { buildLocationNeighborhoodIndex, loadContentBundle } from '../../../scripts/content/validate-content';
import { buildContentCatalog, type ContentBundleInput } from '../registries/catalog';
import type { NpcRules, RegistryFile } from '../schemas/registry';
import { createInitialState } from '../../domain/state/initial-state';

function copyBundle(bundle: ContentBundleInput): ContentBundleInput {
  return structuredClone(bundle);
}

describe('content validation', () => {
  let validBundle: ContentBundleInput;

  beforeAll(async () => {
    validBundle = await loadContentBundle(process.cwd());
  });

  test('the locked content layout and minimum fixtures validate', () => {
    const catalog = buildContentCatalog(validBundle);
    expect(catalog.characters).toHaveLength(35);
    expect(catalog.characters.filter(({ tier }) => tier === 'full_ai')).toHaveLength(8);
    expect(catalog.characters.filter(({ tier }) => tier === 'ambient')).toHaveLength(26);
    expect(catalog.locations).toHaveLength(16);
    expect(catalog.factions).toHaveLength(2);
    expect(catalog.rules).toHaveLength(10);
    expect(catalog.rules.some(({ npcId }) => npcId === 'resident_01')).toBe(false);
    expect(catalog.rules.find(({ npcId }) => npcId === 'linda')).toEqual(expect.objectContaining({
      compatibility: { social: true, romantic: true, romanticEligibleAtStart: false },
      startingRelationship: {
        values: { familiarity: 5, trust: 0, attraction: 0 },
        stage: 'stranger',
      },
    }));
  });

  test('indexes every world location under one known neighborhood', () => {
    const catalog = buildContentCatalog(validBundle);
    const index = buildLocationNeighborhoodIndex(catalog.locations);
    expect(index.size).toBe(16);
    expect(index.get('protagonist_villa')).toBe('northwest_residential');
    expect(index.get('devon_bar')).toBe('northeast_downtown');
    expect(index.get('sora_boutique')).toBe('southwest_commercial');
    expect(index.get('priya_clinic')).toBe('southeast_docks');
  });

  test('prototype state starts from the same relationship authority as NPC rules', () => {
    const catalog = buildContentCatalog(validBundle);
    const state = createInitialState();
    for (const rule of catalog.rules) {
      expect(state.relationships[rule.npcId]).toEqual(expect.objectContaining({
        values: rule.startingRelationship.values,
        stage: rule.startingRelationship.stage,
        compatibility: {
          social: rule.compatibility.social,
          romantic: rule.compatibility.romantic,
        },
      }));
    }
    expect(state.npcs.linda_boyfriend).toEqual(expect.objectContaining({
      id: 'linda_boyfriend', condition: 'alive', tier: 'ambient',
    }));
  });

  test('every full-AI world character requires a rules file', () => {
    const bundle = copyBundle(validBundle);
    const withoutLinda = { ...bundle, rules: bundle.rules.filter((rule) => (rule as NpcRules).npcId !== 'linda') };
    expect(() => buildContentCatalog(withoutLinda)).toThrow('Unknown required NPC rules reference: linda');
  });

  test('a missing registry fails validation', () => {
    const bundle = copyBundle(validBundle);
    (bundle.registries as Record<string, unknown>).quests = undefined;
    expect(() => buildContentCatalog(bundle)).toThrow();
  });

  test('an invalid stable ID fails validation', () => {
    const bundle = copyBundle(validBundle);
    (bundle.registries.actions as RegistryFile).items[0]!.id = 'Bad ID';
    expect(() => buildContentCatalog(bundle)).toThrow();
  });

  test('a duplicate ID fails validation', () => {
    const bundle = copyBundle(validBundle);
    const actions = bundle.registries.actions as RegistryFile;
    actions.items.push({ ...actions.items[0]! });
    expect(() => buildContentCatalog(bundle)).toThrow('Duplicate actions registry ID');
  });

  test('a cross-file reference to an unknown ID fails validation', () => {
    const bundle = copyBundle(validBundle);
    const resident = bundle.rules.find((rule) => (rule as NpcRules).npcId === 'generic_resident') as NpcRules;
    resident.questIds = ['missing_quest'];
    expect(() => buildContentCatalog(bundle)).toThrow('Unknown generic_resident quest reference: missing_quest');
  });

  test('structured boundaries and stronger stage floors are validated', () => {
    const badActionBundle = copyBundle(validBundle);
    const linda = badActionBundle.rules.find((rule) => (rule as NpcRules).npcId === 'linda') as NpcRules;
    linda.hardBoundaries[0]!.blockedActionIds = ['missing_action'];
    expect(() => buildContentCatalog(badActionBundle)).toThrow('Unknown linda no_aggressive_flirting blocked action reference');

    const weakFloorBundle = copyBundle(validBundle);
    const weakLinda = weakFloorBundle.rules.find((rule) => (rule as NpcRules).npcId === 'linda') as NpcRules;
    weakLinda.stageRules[0]!.floor = { familiarity: 0, trust: 0, attraction: 0 };
    expect(() => buildContentCatalog(weakFloorBundle)).toThrow('linda dating floor weakens the engine floor');
  });

  test('narrative prose cannot create authoritative references', () => {
    const bundle = copyBundle(validBundle);
    const proseOnlyBundle = {
      ...bundle,
      narrative: {
        ...bundle.narrative,
        setting: `${bundle.narrative.setting}\nThe prose mentions nonexistent_authority_id.`,
      },
    };
    expect(() => buildContentCatalog(proseOnlyBundle)).not.toThrow();
  });
});
