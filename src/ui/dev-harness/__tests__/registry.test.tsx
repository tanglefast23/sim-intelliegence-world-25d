import { CHARACTER_IDS } from '../../../render/atlas';
import { EXPECTED_VFX_ANCHORS } from '../../../render/vfx/fixtures';
import { DEV_HARNESS_MAP_IDS } from '../scenario-state';

jest.mock('../../../render/WorldScene', () => ({ WorldScene: () => null }));
jest.mock('../../../application/NewGameFlow', () => ({ NewGameFlow: () => null }));
// Pulls in ThreeWorldSurface and therefore three.js; the registry test only reads ids and labels.
jest.mock('../ShootingScene', () => ({ ShootingScene: () => null }));

import { DEV_HARNESS_ENTRIES } from '../registry';

describe('dev harness registry', () => {
  test('has stable, unique, non-empty entry and case ids', () => {
    expect(DEV_HARNESS_ENTRIES.map((entry) => entry.id)).toEqual([
      'locations', 'welcome', 'golden-hour', 'hero-scenes', 'ambient-scenes', 'grounding', 'character-talk', 'procedural-effects', 'shooting-scene', 'conversations', 'panels', 'district-panels',
    ]);
    expect(new Set(DEV_HARNESS_ENTRIES.map((entry) => entry.id)).size).toBe(DEV_HARNESS_ENTRIES.length);
    for (const entry of DEV_HARNESS_ENTRIES) {
      expect(entry.cases.length).toBeGreaterThan(0);
      expect(new Set(entry.cases.map((entryCase) => entryCase.id)).size).toBe(entry.cases.length);
    }
  });

  test('covers every authored conversation portrait', () => {
    const conversations = DEV_HARNESS_ENTRIES.find((entry) => entry.id === 'conversations');
    expect(conversations?.cases.map((entryCase) => entryCase.id)).toEqual(CHARACTER_IDS);
  });

  test('covers every authored procedural effect', () => {
    const effects = DEV_HARNESS_ENTRIES.find((entry) => entry.id === 'procedural-effects');
    expect(effects?.cases.map((entryCase) => entryCase.id)).toEqual(
      EXPECTED_VFX_ANCHORS.map(({ id }) => id),
    );
  });

  test('covers golden hour in every district', () => {
    const goldenHour = DEV_HARNESS_ENTRIES.find((entry) => entry.id === 'golden-hour');
    expect(goldenHour?.cases.map((entryCase) => entryCase.id)).toEqual(DEV_HARNESS_MAP_IDS);
  });

  test('covers grounding in every district', () => {
    const grounding = DEV_HARNESS_ENTRIES.find((entry) => entry.id === 'grounding');
    expect(grounding?.cases.map((entryCase) => entryCase.id)).toEqual(DEV_HARNESS_MAP_IDS);
  });

  test('covers a hero scene in every district', () => {
    const heroScenes = DEV_HARNESS_ENTRIES.find((entry) => entry.id === 'hero-scenes');
    expect(heroScenes?.cases.map((entryCase) => entryCase.id)).toEqual(DEV_HARNESS_MAP_IDS);
  });

  test('covers ambient motion in every district', () => {
    const ambientScenes = DEV_HARNESS_ENTRIES.find((entry) => entry.id === 'ambient-scenes');
    expect(ambientScenes?.cases.map((entryCase) => entryCase.id)).toEqual(DEV_HARNESS_MAP_IDS);
  });

  test('covers the selected-character talk pose in every district', () => {
    const characterTalk = DEV_HARNESS_ENTRIES.find((entry) => entry.id === 'character-talk');
    expect(characterTalk?.cases.map((entryCase) => entryCase.id)).toEqual(DEV_HARNESS_MAP_IDS);
  });

  test('covers both side sheets in every district', () => {
    const panels = DEV_HARNESS_ENTRIES.find((entry) => entry.id === 'district-panels');
    expect(panels?.cases.map((entryCase) => entryCase.id)).toEqual(DEV_HARNESS_MAP_IDS.flatMap((mapId) => [
      `journal-${mapId}`,
      `social-${mapId}`,
    ]));
  });
});
