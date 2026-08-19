import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  PresentationPreferencesRepository,
  presentationPreferencesPathForUserData,
} from '../../electron/persistence/presentation-preferences';

describe('main-owned presentation preferences', () => {
  test('loads defaults, validates patches, and preserves main-owned window size', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'si-world-presentation-'));
    const path = presentationPreferencesPathForUserData(userData);
    const repository = new PresentationPreferencesRepository(path);
    expect(await repository.load()).toEqual(expect.objectContaining({
      schemaVersion: 1, worldZoom: null, uiScale: null, camera: null, windowSize: null,
    }));
    await repository.saveWindowSize({ width: 1_440, height: 900 });
    const saved = await repository.saveRendererPatch({
      worldZoom: 1.55,
      uiScale: 1.25,
      camera: { mapId: 'northwest_residential', x: 100, y: 200 },
    });
    expect(saved.windowSize).toEqual({ width: 1_440, height: 900 });
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(saved);
    expect(saved.worldZoom).toBe(1.55);
    await expect(repository.saveRendererPatch({ worldZoom: 1.53 })).rejects.toThrow('5% increments');
  });

  test('keeps a collapsed HUD across a restart and defaults older files to expanded', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'si-world-presentation-hud-'));
    const path = presentationPreferencesPathForUserData(userData);
    await new PresentationPreferencesRepository(path).saveRendererPatch({
      worldZoom: null, uiScale: null, camera: null, hudCollapsed: true,
    });
    // A second repository reads from disk, which is what the next launch does.
    expect((await new PresentationPreferencesRepository(path).load()).hudCollapsed).toBe(true);

    const legacy = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    delete legacy.hudCollapsed;
    await writeFile(path, JSON.stringify(legacy), 'utf8');
    expect((await new PresentationPreferencesRepository(path).load()).hudCollapsed).toBe(false);
  });

  test('ignores invalid persisted data without overwriting it', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'si-world-presentation-corrupt-'));
    const path = presentationPreferencesPathForUserData(userData);
    await mkdir(join(userData, 'si-world'));
    await writeFile(path, '{bad json', 'utf8');
    const repository = new PresentationPreferencesRepository(path);
    expect(await repository.load()).toEqual(expect.objectContaining({ worldZoom: null, uiScale: null }));
    expect(await readFile(path, 'utf8')).toBe('{bad json');
  });
});
