import { createInitialState } from '../../../domain/state/initial-state';
import { DEFAULT_PRESENTATION_PREFERENCES } from '../../presentation/preferences';
import { browserPersistence } from '../browser-persistence';

// The suite runs on `testEnvironment: 'node'`, so the web build's only storage API is absent.
// A map-backed stub keeps this test free of a jsdom dependency.
function installStorageStub(): Map<string, string> {
  const entries = new Map<string, string>();
  const stub: Storage = {
    get length() { return entries.size; },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => { entries.delete(key); },
    setItem: (key: string, value: string) => { entries.set(key, value); },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: stub, writable: true });
  return entries;
}

describe('browser persistence', () => {
  let entries: Map<string, string>;

  // `browser-persistence` reads `localStorage` per call, so a fresh stub per test is enough.
  beforeEach(() => {
    entries = installStorageStub();
  });

  test('reports an empty slot before anything is saved', async () => {
    await expect(browserPersistence.loadSave('slot-001')).resolves.toEqual({ status: 'empty', slotId: 'slot-001' });
  });

  test('round-trips a saved world state and counts generations up', async () => {
    const state = createInitialState('Rowan');

    const first = await browserPersistence.requestSave({
      slotId: 'slot-001', expectedSaveGeneration: null, trigger: 'manual', state,
    });
    expect(first.status).toBe('saved');
    if (first.status !== 'saved') throw new Error('unreachable');
    expect(first.saveGeneration).toBe(1);
    expect(first.checksum).toMatch(/^[a-f0-9]{64}$/u);

    const loaded = await browserPersistence.loadSave('slot-001');
    expect(loaded.status).toBe('unchanged');
    if (loaded.status !== 'unchanged') throw new Error('unreachable');
    expect(loaded.state.protagonist.displayName).toBe('Rowan');
    expect(loaded.saveGeneration).toBe(1);

    const second = await browserPersistence.requestSave({
      slotId: 'slot-001', expectedSaveGeneration: 1, trigger: 'sleep', state,
    });
    if (second.status !== 'saved') throw new Error('unreachable');
    expect(second.saveGeneration).toBe(2);
  });

  test('detects a damaged entry instead of returning a broken world', async () => {
    const state = createInitialState('Rowan');
    await browserPersistence.requestSave({
      slotId: 'slot-001', expectedSaveGeneration: null, trigger: 'manual', state,
    });

    const key = 'si-world:save:slot-001';
    const stored = JSON.parse(entries.get(key) ?? '{}') as { state: { protagonist: { displayName: string } } };
    stored.state.protagonist.displayName = 'Tampered';
    entries.set(key, JSON.stringify(stored));

    await expect(browserPersistence.loadSave('slot-001')).resolves.toEqual({
      status: 'corrupt', slotId: 'slot-001', corruptCandidateCount: 1,
    });
  });

  test('keeps presentation preferences across a reload', async () => {
    await expect(browserPersistence.loadPresentationPreferences())
      .resolves.toEqual(DEFAULT_PRESENTATION_PREFERENCES);

    const saved = await browserPersistence.savePresentationPreferences({
      worldZoom: 1.5, uiScale: 1.25, camera: null,
    });
    expect(saved.worldZoom).toBe(1.5);
    await expect(browserPersistence.loadPresentationPreferences()).resolves.toEqual(saved);
  });

  test('falls back to default preferences when the stored entry is unreadable', async () => {
    entries.set('si-world:preferences', '{ not json');
    await expect(browserPersistence.loadPresentationPreferences())
      .resolves.toEqual(DEFAULT_PRESENTATION_PREFERENCES);
  });
});
