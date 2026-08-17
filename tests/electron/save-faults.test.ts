import { readFileSync } from 'node:fs';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

import { SaveRequestSchema, type SaveTrigger } from '../../src/application/effects/PersistencePort';
import { WORLD_MAP_CATALOG } from '../../src/application/runtime/map-catalog';
import { reduceCommand } from '../../src/domain/commands/reducer';
import { DomainCommandSchema } from '../../src/domain/commands/types';
import { createInitialState } from '../../src/domain/state/initial-state';
import { migrateStateCopy } from '../../src/domain/state/migrations';
import { WorldStateSchema, type WorldState } from '../../src/domain/state/schema';
import type { VerbalMissionState } from '../../src/domain/verbal-missions/state';
import {
  PRIYA_ASSESSMENT_COMMITMENT_ID,
  PRIYA_ASSESSMENT_MISSION_ID,
  planOfferVerbalMission,
} from '../../src/domain/verbal-missions/goal-planners';
import type { WorldMapV2Catalog } from '../../src/world/maps/catalog';
import {
  SaveManifestSchema,
  createSaveEnvelope,
  parseSaveEnvelope,
  parseSupportedSaveEnvelope,
} from '../../electron/persistence/save-format';
import {
  SaveRepository,
  saveRootForUserData,
  type SaveFaultStage,
} from '../../electron/persistence/save-repository';

type BoundaryFixture = Readonly<{
  trigger: SaveTrigger;
  blockingPauseTokens: readonly string[];
}>;

const boundaryFixtures = JSON.parse(readFileSync(
  resolve('tests/fixtures/saves/stable-boundaries.json'),
  'utf8',
)) as BoundaryFixture[];

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'si-world-save-test-'));
  temporaryRoots.push(path);
  return path;
}

function stateAtRevision(revision: number, displayName = 'Player'): WorldState {
  return WorldStateSchema.parse({ ...createInitialState(displayName), revision });
}

function request(
  state: WorldState,
  expectedSaveGeneration: number | null,
  trigger: SaveTrigger = 'manual',
) {
  return SaveRequestSchema.parse({
    slotId: 'slot-001',
    expectedSaveGeneration,
    trigger,
    state,
  });
}

async function runCrashChild(root: string, stage: SaveFaultStage): Promise<Readonly<{
  code: number | null;
  signal: NodeJS.Signals | null;
}>> {
  const child = spawn(
    process.execPath,
    [resolve('node_modules/tsx/dist/cli.mjs'), resolve('scripts/persistence/save-crash-child.ts'), root, stage],
    { stdio: 'ignore' },
  );
  return new Promise((resolveClose, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolveClose({ code, signal }));
  });
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe('recoverable save repository', () => {
  test('clean save and load restore byte-identical authority with zero offline catch-up', async () => {
    const root = await temporaryRoot();
    const repository = new SaveRepository(root);
    const state = stateAtRevision(4, 'Joe');
    const saved = await repository.save(request(state, null));
    const loaded = await repository.load('slot-001');

    expect(saved).toEqual(expect.objectContaining({ status: 'saved', saveGeneration: 1 }));
    expect(loaded).toEqual(expect.objectContaining({
      status: 'unchanged',
      saveGeneration: 1,
      source: 'main',
      state,
    }));
    if (loaded.status !== 'unchanged') throw new Error('Expected an unchanged save.');
    if (saved.status !== 'saved') throw new Error('Expected a saved result.');
    expect(loaded.checksum).toBe(saved.checksum);
    expect(saved.maintenanceWarnings).toEqual([]);
    expect(JSON.stringify(loaded.state)).toBe(JSON.stringify(state));
    expect(loaded.state.clock).toEqual(state.clock);
    expect(loaded.state.prng).toEqual(state.prng);
    expect(loaded.state.modelPin).toEqual(state.modelPin);

    const slotPath = join(root, 'save-slots', 'slot-001');
    const envelope = parseSaveEnvelope(JSON.parse(await readFile(join(slotPath, 'state.json'), 'utf8')) as unknown);
    const manifest = SaveManifestSchema.parse(JSON.parse(await readFile(join(slotPath, 'manifest.json'), 'utf8')) as unknown);
    expect(manifest.latestSaveGeneration).toBe(envelope.saveGeneration);
    expect(manifest.payloadChecksum).toBe(envelope.payloadChecksum);
    expect(manifest.pins.modelArtifactSha256).toBe(state.modelPin.artifactSha256);
  });

  test('load resolves due commitments and preserves the pre-resolution save as backup', async () => {
    const root = await temporaryRoot();
    const repository = new SaveRepository(root);
    const initial = WorldStateSchema.parse({
      ...createInitialState(),
      quests: {
        ...createInitialState().quests,
        linda_boyfriend_check: {
          id: 'linda_boyfriend_check', status: 'failed', flagIds: ['linda_protect_failed'],
        },
      },
    });
    const offered = planOfferVerbalMission(initial, PRIYA_ASSESSMENT_MISSION_ID).state;
    const mission = offered.verbalMissions[PRIYA_ASSESSMENT_MISSION_ID]!;
    if (mission.goalKind !== 'schedule_cooperation') throw new Error('Expected Priya schedule mission.');
    const ready: VerbalMissionState = {
      ...mission,
      status: 'active',
      concerns: mission.concerns.map((concern) => ({ ...concern, state: 'resolved' as const })),
      terms: { ...mission.terms, proposedMinute: 600 },
      creditedMoves: [{
        leverId: 'schedule_600', concernId: 'capacity', supportFactIds: [], offerAmount: null,
      }],
    };
    const readyState = WorldStateSchema.parse({
      ...offered,
      verbalMissions: { ...offered.verbalMissions, [PRIYA_ASSESSMENT_MISSION_ID]: ready },
    });
    const agreed = reduceCommand(readyState, DomainCommandSchema.parse({
      type: 'create-scheduled-commitment',
      commandId: 'command-load-priya-agreement',
      eventId: 'event-load-priya-agreement',
      scheduledMinute: 0,
      priority: 0,
      missionId: PRIYA_ASSESSMENT_MISSION_ID,
      commitmentId: PRIYA_ASSESSMENT_COMMITMENT_ID,
      commitmentMinute: 600,
    })).state;
    const due = WorldStateSchema.parse({
      ...agreed,
      clock: { ...agreed.clock, absoluteMinute: 600 },
    });
    await repository.save(request(due, null));

    const loaded = await repository.load('slot-001');
    expect(loaded).toEqual(expect.objectContaining({
      status: 'migrated', saveGeneration: 2, migratedFromSchemaVersion: 7, migratedMapIds: [],
    }));
    if (loaded.status !== 'migrated') throw new Error('Expected load-time commitment settlement.');
    expect(loaded.state.commitments[PRIYA_ASSESSMENT_COMMITMENT_ID]?.status).toBe('honoured');
    expect(loaded.state.verbalMissions[PRIYA_ASSESSMENT_MISSION_ID]?.terminalResultId).toBe(
      'priya_assessment_honoured',
    );

    const backup = parseSaveEnvelope(JSON.parse(await readFile(
      join(root, 'save-slots', 'slot-001', 'state.json.bak'),
      'utf8',
    )) as unknown);
    expect(backup.state.commitments[PRIYA_ASSESSMENT_COMMITMENT_ID]?.status).toBe('agreed');
  });

  test('fixture-driven stable boundaries rotate only the newest three autosaves', async () => {
    const root = await temporaryRoot();
    const repository = new SaveRepository(root);
    const stable = boundaryFixtures.filter(({ blockingPauseTokens }) => blockingPauseTokens.length === 0);
    let generation: number | null = null;
    for (const [index, fixture] of [...stable, stable[0]!].entries()) {
      const result = await repository.save(request(stateAtRevision(index), generation, fixture.trigger));
      if (result.status !== 'saved') throw new Error('Stable boundary was deferred.');
      generation = result.saveGeneration;
    }
    expect((await readdir(join(root, 'save-slots', 'slot-001', 'autosaves'))).sort()).toEqual([
      'autosave-000000000002.json',
      'autosave-000000000003.json',
      'autosave-000000000004.json',
    ]);
  });

  test.each(boundaryFixtures.filter(({ blockingPauseTokens }) => blockingPauseTokens.length > 0))(
    '$trigger is deferred at an unstable fixture boundary',
    async ({ trigger, blockingPauseTokens }) => {
      const root = await temporaryRoot();
      const repository = new SaveRepository(root);
      const state = WorldStateSchema.parse({
        ...createInitialState(),
        clock: { ...createInitialState().clock, pauseTokens: blockingPauseTokens },
      });
      await expect(repository.save(request(state, null, trigger))).resolves.toEqual({
        status: 'deferred',
        slotId: 'slot-001',
        blockingPauseTokens,
      });
      await expect(repository.load('slot-001')).resolves.toEqual({ status: 'empty', slotId: 'slot-001' });
    },
  );

  test('the queue serializes writers and rejects the stale one without poisoning later work', async () => {
    const root = await temporaryRoot();
    const repository = new SaveRepository(root);
    const first = repository.save(request(stateAtRevision(1), null));
    const stale = repository.save(request(stateAtRevision(2), null));
    await expect(first).resolves.toEqual(expect.objectContaining({ status: 'saved', saveGeneration: 1 }));
    await expect(stale).rejects.toThrow('Stale save writer');
    await expect(repository.save(request(stateAtRevision(3), 1))).resolves.toEqual(
      expect.objectContaining({ status: 'saved', saveGeneration: 2 }),
    );
  });

  test.each<SaveFaultStage>([
    'before-write',
    'after-write',
    'after-flush',
    'after-validation',
    'after-backup',
  ])('fault after %s never loses the last complete generation', async (faultStage) => {
    const root = await temporaryRoot();
    let armed = false;
    const repository = new SaveRepository(root, (stage) => {
      if (armed && stage === faultStage) throw new Error(`Injected ${stage}`);
    });
    await repository.save(request(stateAtRevision(1), null));
    armed = true;
    await expect(repository.save(request(stateAtRevision(2), 1))).rejects.toThrow(`Injected ${faultStage}`);
    const loaded = await repository.load('slot-001');
    expect(loaded.status).toBe('unchanged');
    if (loaded.status !== 'unchanged') throw new Error('Expected recovery after injected fault.');
    expect(loaded.saveGeneration).toBeGreaterThanOrEqual(1);
    expect(loaded.saveGeneration).toBeLessThanOrEqual(2);
    expect([1, 2]).toContain(loaded.state.revision);
  });

  test('a failed validated write can retry in the same repository', async () => {
    const root = await temporaryRoot();
    let failuresRemaining = 0;
    const repository = new SaveRepository(root, (stage) => {
      if (failuresRemaining > 0 && stage === 'after-validation') {
        failuresRemaining -= 1;
        throw new Error('Injected after-validation');
      }
    });
    await repository.save(request(stateAtRevision(1), null));
    failuresRemaining = 2;
    await expect(repository.save(request(stateAtRevision(2), 1))).rejects.toThrow('Injected after-validation');
    await expect(repository.save(request(stateAtRevision(3), 1))).rejects.toThrow('Injected after-validation');
    await expect(repository.save(request(stateAtRevision(4), 1))).resolves.toEqual(
      expect.objectContaining({ status: 'saved', saveGeneration: 4 }),
    );
    expect((await readdir(join(root, 'save-slots', 'slot-001')))
      .filter((name) => name.startsWith('state.json.tmp-'))).toEqual([]);
  });

  test('a failed first save can retry without a known generation', async () => {
    const root = await temporaryRoot();
    let failuresRemaining = 2;
    const repository = new SaveRepository(root, (stage) => {
      if (failuresRemaining > 0 && stage === 'after-validation') {
        failuresRemaining -= 1;
        throw new Error('Injected after-validation');
      }
    });
    await expect(repository.save(request(stateAtRevision(1), null))).rejects.toThrow('Injected after-validation');
    await expect(repository.save(request(stateAtRevision(2), null))).rejects.toThrow('Injected after-validation');
    await expect(repository.save(request(stateAtRevision(3), null))).resolves.toEqual(
      expect.objectContaining({ status: 'saved', saveGeneration: 3 }),
    );
    expect((await readdir(join(root, 'save-slots', 'slot-001')))
      .filter((name) => name.startsWith('state.json.tmp-'))).toEqual([]);
  });

  test.each<Readonly<{ stage: SaveFaultStage; warning: string }>>([
    { stage: 'after-replacement', warning: 'post_commit_observer_failed' },
    { stage: 'before-autosave-maintenance', warning: 'autosave_maintenance_failed' },
    { stage: 'before-manifest-maintenance', warning: 'manifest_maintenance_failed' },
  ])('post-commit $stage returns the committed generation with a maintenance warning', async ({ stage, warning }) => {
    const root = await temporaryRoot();
    let armed = false;
    const repository = new SaveRepository(root, (candidate) => {
      if (armed && candidate === stage) throw new Error(`Injected ${candidate}`);
    });
    await repository.save(request(stateAtRevision(1), null));
    armed = true;
    const trigger = stage === 'before-autosave-maintenance' ? 'sleep' : 'manual';
    await expect(repository.save(request(stateAtRevision(2), 1, trigger))).resolves.toEqual(
      expect.objectContaining({
        status: 'saved',
        saveGeneration: 2,
        maintenanceWarnings: [warning],
      }),
    );
    await expect(repository.load('slot-001')).resolves.toEqual(expect.objectContaining({
      status: 'unchanged',
      saveGeneration: 2,
      state: expect.objectContaining({ revision: 2 }),
    }));
  });

  test.each<SaveFaultStage>([
    'after-write',
    'after-flush',
    'after-validation',
    'after-backup',
    'after-replacement',
  ])('forced process death after %s preserves a complete recoverable generation', async (faultStage) => {
    const root = await temporaryRoot();
    const repository = new SaveRepository(root);
    await repository.save(request(stateAtRevision(1), null));
    const death = await runCrashChild(root, faultStage);
    expect(death.code).not.toBe(2);
    expect(death.signal === 'SIGKILL' || death.code !== 0).toBe(true);

    const loaded = await new SaveRepository(root).load('slot-001');
    expect(loaded.status).toBe('unchanged');
    if (loaded.status !== 'unchanged') throw new Error('Forced death lost every valid generation.');
    expect(loaded.saveGeneration).toBeGreaterThanOrEqual(1);
    expect(loaded.saveGeneration).toBeLessThanOrEqual(2);
    expect([1, 2]).toContain(loaded.state.revision);
  }, 20_000);

  test.each([
    { code: 'ENOSPC', label: 'disk full' },
    { code: 'EACCES', label: 'permission failure' },
  ])('$label leaves existing bytes unchanged', async ({ code }) => {
    const root = await temporaryRoot();
    let armed = false;
    const repository = new SaveRepository(root, (stage) => {
      if (armed && stage === 'before-write') {
        const error = new Error(code) as NodeJS.ErrnoException;
        error.code = code;
        throw error;
      }
    });
    await repository.save(request(stateAtRevision(1), null));
    const mainPath = join(root, 'save-slots', 'slot-001', 'state.json');
    const before = await readFile(mainPath, 'utf8');
    armed = true;
    await expect(repository.save(request(stateAtRevision(2), 1))).rejects.toMatchObject({ code });
    expect(await readFile(mainPath, 'utf8')).toBe(before);
    await expect(repository.load('slot-001')).resolves.toEqual(expect.objectContaining({
      status: 'unchanged',
      saveGeneration: 1,
    }));
  });

  test('corrupt main data is preserved and the valid backup is selected', async () => {
    const root = await temporaryRoot();
    const repository = new SaveRepository(root);
    await repository.save(request(stateAtRevision(1), null));
    await repository.save(request(stateAtRevision(2), 1));
    const mainPath = join(root, 'save-slots', 'slot-001', 'state.json');
    const corrupt = JSON.parse(await readFile(mainPath, 'utf8')) as { saveGeneration: number };
    corrupt.saveGeneration = 999;
    const corruptBytes = `${JSON.stringify(corrupt)}\n`;
    await writeFile(mainPath, corruptBytes, 'utf8');

    const loaded = await repository.load('slot-001');
    expect(loaded).toEqual(expect.objectContaining({
      status: 'unchanged',
      saveGeneration: 1,
      source: 'backup',
      corruptCandidateCount: 1,
    }));
    expect(await readFile(mainPath, 'utf8')).toBe(corruptBytes);
  });

  test('a recovered temporary generation becomes the next valid backup', async () => {
    const root = await temporaryRoot();
    let armed = false;
    const crashingRepository = new SaveRepository(root, (stage) => {
      if (armed && stage === 'after-validation') throw new Error('leave complete temporary');
    });
    await crashingRepository.save(request(stateAtRevision(1), null));
    armed = true;
    await expect(crashingRepository.save(request(stateAtRevision(2), 1))).rejects.toThrow();

    const repository = new SaveRepository(root);
    await expect(repository.load('slot-001')).resolves.toEqual(expect.objectContaining({
      status: 'unchanged',
      saveGeneration: 2,
      source: 'temporary',
    }));
    await repository.save(request(stateAtRevision(3), 2));
    const backup = parseSaveEnvelope(JSON.parse(await readFile(
      join(root, 'save-slots', 'slot-001', 'state.json.bak'),
      'utf8',
    )) as unknown);
    expect(backup.saveGeneration).toBe(2);
    expect(backup.state.revision).toBe(2);
  });

  test('generation order wins over future modification time', async () => {
    const root = await temporaryRoot();
    const repository = new SaveRepository(root);
    await repository.save(request(stateAtRevision(1), null));
    await repository.save(request(stateAtRevision(2), 1, 'sleep'));
    const backupPath = join(root, 'save-slots', 'slot-001', 'state.json.bak');
    await utimes(backupPath, new Date('2099-01-01T00:00:00Z'), new Date('2099-01-01T00:00:00Z'));
    await expect(repository.load('slot-001')).resolves.toEqual(expect.objectContaining({
      status: 'unchanged',
      saveGeneration: 2,
      state: expect.objectContaining({ revision: 2 }),
    }));
  });

  test('an incompatible unknown file is reported, preserved, and not overwritten', async () => {
    const root = await temporaryRoot();
    const slotPath = join(root, 'save-slots', 'slot-001');
    await mkdir(slotPath, { recursive: true });
    const mainPath = join(slotPath, 'state.json');
    const unknown = '{"formatVersion":999,"future":true}\n';
    await writeFile(mainPath, unknown, 'utf8');
    const repository = new SaveRepository(root);

    await expect(repository.load('slot-001')).resolves.toEqual({
      status: 'incompatible',
      slotId: 'slot-001',
      incompatibleCandidateCount: 1,
      corruptCandidateCount: 0,
    });
    await expect(repository.save(request(stateAtRevision(1), null))).rejects.toThrow('existing candidates were preserved');
    expect(await readFile(mainPath, 'utf8')).toBe(unknown);
  });

  test('slot IDs cannot traverse outside the save root', async () => {
    const repository = new SaveRepository(await temporaryRoot());
    await expect(repository.load('../escape' as 'slot-001')).rejects.toThrow();
    expect(saveRootForUserData('/user-data')).toBe(join('/user-data', 'si-world'));
  });
});

describe('save migrations and state invariants', () => {
  test('a real v5 envelope migrates through layout recovery and keeps its source as backup', async () => {
    const root = await temporaryRoot();
    const slotPath = join(root, 'save-slots', 'slot-001');
    await mkdir(slotPath, { recursive: true });
    const fixtureBytes = readFileSync(resolve('tests/fixtures/saves/valid-v5-envelope.json'), 'utf8');
    const sourceState = parseSupportedSaveEnvelope(JSON.parse(fixtureBytes) as unknown).state;
    await writeFile(join(slotPath, 'state.json'), fixtureBytes, 'utf8');

    const loaded = await new SaveRepository(root, WORLD_MAP_CATALOG).load('slot-001');
    expect(loaded).toEqual(expect.objectContaining({
      status: 'migrated',
      saveGeneration: 8,
      migratedFromSchemaVersion: 5,
      migratedMapIds: [
        'northeast_downtown',
        'northwest_residential',
        'southeast_docks',
        'southwest_commercial',
        'west_office',
      ],
      state: expect.objectContaining({ schemaVersion: 7 }),
    }));
    const backupBytes = await readFile(join(slotPath, 'state.json.bak'), 'utf8');
    if (loaded.status !== 'migrated') throw new Error('Expected production schedule migration.');
    expect(loaded.state.schedules).toEqual(createInitialState().schedules);
    expect(loaded.state.relationships).toEqual(sourceState.relationships);
    expect(loaded.state.quests).toEqual(sourceState.quests);
    expect(loaded.state.eventLedger).toEqual(sourceState.eventLedger);
    expect(backupBytes).toBe(fixtureBytes);
    expect(parseSupportedSaveEnvelope(JSON.parse(backupBytes) as unknown).state.schemaVersion).toBe(5);
    expect(parseSaveEnvelope(JSON.parse(await readFile(join(slotPath, 'state.json'), 'utf8')) as unknown).saveGeneration).toBe(8);
  });

  test('a real stale v6 envelope runs compiled-catalog recovery before it is returned', async () => {
    const root = await temporaryRoot();
    const slotPath = join(root, 'save-slots', 'slot-001');
    await mkdir(slotPath, { recursive: true });
    const fixtureBytes = readFileSync(resolve('tests/fixtures/saves/stale-v6-envelope.json'), 'utf8');
    await writeFile(join(slotPath, 'state.json'), fixtureBytes, 'utf8');

    const loaded = await new SaveRepository(root, WORLD_MAP_CATALOG).load('slot-001');
    expect(loaded).toEqual(expect.objectContaining({
      status: 'migrated',
      saveGeneration: 12,
      migratedFromSchemaVersion: 6,
      migratedMapIds: [
        'northeast_downtown',
        'northwest_residential',
        'southeast_docks',
        'southwest_commercial',
        'west_office',
      ],
    }));
    if (loaded.status !== 'migrated') throw new Error('Expected stale layout migration.');
    expect(loaded.state.layoutRevisions).toEqual(createInitialState().layoutRevisions);
    expect(await readFile(join(slotPath, 'state.json.bak'), 'utf8')).toBe(fixtureBytes);
  });

  test('a failed first post-migration write preserves the legacy generation byte-for-byte', async () => {
    const root = await temporaryRoot();
    const slotPath = join(root, 'save-slots', 'slot-001');
    await mkdir(slotPath, { recursive: true });
    const fixtureBytes = readFileSync(resolve('tests/fixtures/saves/valid-v5-envelope.json'), 'utf8');
    const mainPath = join(slotPath, 'state.json');
    await writeFile(mainPath, fixtureBytes, 'utf8');
    const repository = new SaveRepository(root, WORLD_MAP_CATALOG, (stage) => {
      if (stage === 'after-validation') throw new Error('migration fault');
    });

    await expect(repository.load('slot-001')).rejects.toThrow('migration fault');
    expect(await readFile(mainPath, 'utf8')).toBe(fixtureBytes);
    const recovered = await new SaveRepository(root, WORLD_MAP_CATALOG).load('slot-001');
    expect(recovered).toEqual(expect.objectContaining({
      status: 'unchanged', saveGeneration: 8, source: 'temporary',
    }));
  });

  test('a newer layout failure never falls back to an older compatible generation', async () => {
    const root = await temporaryRoot();
    const slotPath = join(root, 'save-slots', 'slot-001');
    await mkdir(slotPath, { recursive: true });
    const mainBytes = readFileSync(resolve('tests/fixtures/saves/stale-v6-envelope.json'), 'utf8');
    const backupEnvelope = createSaveEnvelope('slot-001', 10, 'manual', createInitialState('Older Compatible'));
    const backupBytes = `${JSON.stringify(backupEnvelope)}\n`;
    await writeFile(join(slotPath, 'state.json'), mainBytes, 'utf8');
    await writeFile(join(slotPath, 'state.json.bak'), backupBytes, 'utf8');
    const northwest = WORLD_MAP_CATALOG.northwest_residential;
    const bindings = new Map(northwest.locationBindingById);
    bindings.set('protagonist_villa', {
      ...bindings.get('protagonist_villa')!,
      candidateTiles: [{ x: 20, y: 18 }],
      preferredApproachTiles: [],
    });
    const badCatalog: WorldMapV2Catalog = {
      ...WORLD_MAP_CATALOG,
      northwest_residential: { ...northwest, locationBindingById: bindings },
    };

    await expect(new SaveRepository(root, badCatalog).load('slot-001')).resolves.toEqual({
      status: 'unrecoverable',
      slotId: 'slot-001',
      reason: 'layout_migration_failed',
      incompatibleCandidateCount: 0,
      corruptCandidateCount: 0,
    });
    expect(await readFile(join(slotPath, 'state.json'), 'utf8')).toBe(mainBytes);
    expect(await readFile(join(slotPath, 'state.json.bak'), 'utf8')).toBe(backupBytes);
    expect(parseSaveEnvelope(JSON.parse(backupBytes) as unknown).state.layoutRevisions)
      .toEqual(createInitialState().layoutRevisions);
  });

  test('v1 migration copies authority, adds the exact model pin, and leaves its source unchanged', () => {
    const source = JSON.parse(readFileSync(resolve('tests/fixtures/saves/legacy-v1.json'), 'utf8')) as unknown;
    const before = JSON.stringify(source);
    const migrated = migrateStateCopy(source, 'generation-migrated-001');

    expect(JSON.stringify(source)).toBe(before);
    expect(migrated.schemaVersion).toBe(7);
    expect(migrated.generationId).toBe('generation-migrated-001');
    expect(migrated.modelPin).toEqual({
      id: 'qwen3.5-4b',
      sourceRevision: '851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a',
      artifactSha256: '32c8ff2d0972cc26d4c1f99d6655c7e0d4814bae9c23093a9213e23fd36e3d14',
    });
    expect(migrated.npcs.linda?.unlockedIds).toEqual([]);
    expect(migrated.protagonist.worldPosition).toEqual({
      mapId: 'northwest_residential',
      tileX: 18,
      tileY: 18,
    });
    expect(migrated.npcs.linda?.presence).toEqual({
      kind: 'active_local', mapId: 'northwest_residential', locationId: 'linda_villa', tileX: 23, tileY: 28,
    });
    expect(migrated.npcs.generic_resident?.presence).toEqual({
      kind: 'active_local', mapId: 'northwest_residential', locationId: 'northwest_residential', tileX: 29, tileY: 33,
    });
    expect(migrated.economy.nextBasicCostMinute).toBe(1_440);
    expect(migrated.schedules.linda_daily?.blocks).toEqual(createInitialState().schedules.linda_daily?.blocks);
  });

  test('an unavailable migration fails without modifying its source', () => {
    const source = { schemaVersion: 99, data: 'preserve me' };
    const before = JSON.stringify(source);
    expect(() => migrateStateCopy(source, 'generation-migrated-099')).toThrow('No compatible state migration');
    expect(JSON.stringify(source)).toBe(before);
  });

  test('copying a current v5 state also receives the requested new generation ID', () => {
    const source = createInitialState();
    const migrated = migrateStateCopy(source, 'generation-current-copy-001');
    expect(migrated.generationId).toBe('generation-current-copy-001');
    expect(source.generationId).toBe('generation-prototype-001');
  });

  test('v4 migration resolves injected Linda circumstances when the resolving flag already exists', () => {
    const current = createInitialState();
    const source: Partial<WorldState> = { ...current };
    delete source.invitations;
    delete source.layoutRevisions;
    delete source.layoutMigrationEvidence;
    delete source.playerKnowledge;
    delete source.worldObjects;
    delete source.verbalMissions;
    delete source.commitments;
    const legacyRelationships = Object.fromEntries(Object.entries(current.relationships).map(([id, relationship]) => {
      const legacy: Partial<typeof relationship> = { ...relationship };
      delete legacy.policy;
      return [id, id === 'linda' ? { ...legacy, rejections: [] } : legacy];
    }));
    const migrated = migrateStateCopy({
      ...source,
      schemaVersion: 4,
      npcs: {
        ...current.npcs,
        linda: { ...current.npcs.linda, unlockedIds: ['linda_relationship_resolved'] },
      },
      relationships: legacyRelationships,
    }, 'generation-migrated-004');
    expect(migrated.relationships.linda?.rejections.filter(({ kind }) => kind === 'changeable_circumstance')).toEqual([
      expect.objectContaining({ reasonId: 'current_relationship', resolved: true }),
      expect.objectContaining({ reasonId: 'home_visit_not_safe', resolved: true }),
    ]);
  });

  test('repository migration writes a new slot and keeps the old state file byte-identical', async () => {
    const root = await temporaryRoot();
    const sourceSlotPath = join(root, 'save-slots', 'slot-001');
    await mkdir(sourceSlotPath, { recursive: true });
    const sourcePath = join(sourceSlotPath, 'state.json');
    const legacyBytes = readFileSync(resolve('tests/fixtures/saves/legacy-v1.json'), 'utf8');
    await writeFile(sourcePath, legacyBytes, 'utf8');
    const repository = new SaveRepository(root);

    await expect(repository.migrate({
      sourceSlotId: 'slot-001',
      targetSlotId: 'slot-002',
      nextGenerationId: 'generation-migrated-002',
    })).resolves.toEqual(expect.objectContaining({
      status: 'migrated',
      sourceSlotId: 'slot-001',
      targetSlotId: 'slot-002',
      saveGeneration: 1,
      stateSchemaVersion: 7,
    }));
    expect(await readFile(sourcePath, 'utf8')).toBe(legacyBytes);
    // The first load repairs the production cast: a legacy save predates the Ledger Annex, so it
    // has no clerks, and the repair inserts them with their schedules. That makes this load a
    // migration rather than a clean read.
    const firstLoad = await repository.load('slot-002');
    expect(firstLoad).toEqual(expect.objectContaining({
      status: 'migrated',
      state: expect.objectContaining({
        generationId: 'generation-migrated-002',
        schemaVersion: 7,
        protagonist: expect.objectContaining({
          worldPosition: { mapId: 'northwest_residential', tileX: 18, tileY: 18 },
        }),
      }),
    }));
    if (firstLoad.status !== 'migrated') throw new Error('Expected a cast repair on first load.');
    expect(firstLoad.state.npcs.clerk_01?.tier).toBe('ambient');
    expect(firstLoad.state.schedules.clerk_01_daily?.npcId).toBe('clerk_01');
    // The repair runs on EVERY load, so it has to be idempotent: the second read finds nothing to
    // do and reports the save unchanged.
    await expect(repository.load('slot-002')).resolves.toEqual(expect.objectContaining({
      status: 'unchanged',
    }));
  });

  test('duplicate persistent unlocks are rejected before saving', () => {
    const state = createInitialState();
    expect(() => WorldStateSchema.parse({
      ...state,
      npcs: {
        ...state.npcs,
        linda: { ...state.npcs.linda, unlockedIds: ['velvet_tide_lead', 'velvet_tide_lead'] },
      },
    })).toThrow('Unlock IDs must be unique');
  });
});
