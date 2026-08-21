import { randomBytes } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
} from 'node:fs/promises';
import { basename, join } from 'node:path';

import {
  LoadResultSchema,
  MigrationRequestSchema,
  MigrationResultSchema,
  SaveRequestSchema,
  SaveSlotIdSchema,
  SaveResultSchema,
  type LoadResult,
  type MigrationRequest,
  type MigrationResult,
  type SaveRequest,
  type SaveResult,
  type SaveSlotId,
} from '../../src/application/effects/PersistencePort';
import { WORLD_MAP_CATALOG } from '../../src/application/runtime/map-catalog';
import { migrateStateCopy } from '../../src/domain/state/migrations';
import { insertMissingProductionCast, refreshProductionSchedules } from '../../src/domain/state/production-cast';
import { resolveDueCommitments } from '../../src/domain/commands/reducer';
import type { WorldMapV2Catalog } from '../../src/world/maps/catalog';
import { LayoutMigrationError, recoverWorldLayout } from '../../src/world/maps/layout-recovery';
import {
  parseSaveEnvelope,
  parseSupportedSaveEnvelope,
  serializeSaveEnvelope,
  createSaveEnvelope,
  manifestForEnvelope,
  SaveManifestSchema,
} from './save-format';
import { inspectSaveCandidate, recoverSlot } from './recovery';
import { SerializedWriteQueue } from './write-queue';

export type SaveFaultStage =
  | 'before-write'
  | 'after-write'
  | 'after-flush'
  | 'after-validation'
  | 'after-backup'
  | 'after-replacement'
  | 'before-autosave-maintenance'
  | 'before-manifest-maintenance';

export type SaveFaultInjector = (stage: SaveFaultStage) => void | Promise<void>;

const AUTOSAVE_TRIGGERS = new Set(['sleep', 'travel', 'major_quest']);

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSuffix(): string {
  return randomBytes(12).toString('hex');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function writeFlushedFile(path: string, data: string): Promise<void> {
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(data, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeDerivedManifest(slotPath: string, serialized: string): Promise<void> {
  const target = join(slotPath, 'manifest.json');
  const temporary = join(slotPath, `manifest.json.tmp-${uniqueSuffix()}`);
  await writeFlushedFile(temporary, serialized);
  SaveManifestSchema.parse(JSON.parse(await readFile(temporary, 'utf8')) as unknown);
  await rename(temporary, target);
}

async function archiveInvalidCandidate(slotPath: string, candidatePath: string, label: string): Promise<void> {
  const recoveryPath = join(slotPath, 'recovery');
  await mkdir(recoveryPath, { recursive: true, mode: 0o700 });
  await rename(candidatePath, join(recoveryPath, `corrupt-${label}-${uniqueSuffix()}.json`));
}

function blockingSaveTokens(request: SaveRequest): string[] {
  return request.state.clock.pauseTokens.filter((token) => (
    token.startsWith('pause:conversation:') || token.startsWith('pause:transition:')
  )).sort(compareAscii);
}

export function saveRootForUserData(userDataPath: string): string {
  return join(userDataPath, 'si-world');
}

export class SaveRepository {
  readonly #queue = new SerializedWriteQueue();
  readonly #catalog: WorldMapV2Catalog;
  readonly #faultInjector?: SaveFaultInjector;

  constructor(
    private readonly rootPath: string,
    catalogOrFault: WorldMapV2Catalog | SaveFaultInjector = WORLD_MAP_CATALOG,
    faultInjector?: SaveFaultInjector,
  ) {
    if (typeof catalogOrFault === 'function') {
      this.#catalog = WORLD_MAP_CATALOG;
      this.#faultInjector = catalogOrFault;
    } else {
      this.#catalog = catalogOrFault;
      this.#faultInjector = faultInjector;
    }
  }

  async load(slotCandidate: SaveSlotId): Promise<LoadResult> {
    const slotId = SaveSlotIdSchema.parse(slotCandidate);
    return this.#queue.enqueue(() => this.loadSlot(slotId));
  }

  private async loadSlot(slotId: SaveSlotId): Promise<LoadResult> {
    const recovery = await recoverSlot(this.slotPath(slotId), slotId);
    const incompatibleCandidateCount = recovery.invalidCandidates.filter(
      ({ classification }) => classification === 'incompatible',
    ).length;
    const corruptCandidateCount = recovery.invalidCandidates.length - incompatibleCandidateCount;
    if (!recovery.selected) {
      if (recovery.invalidCandidates.length === 0) return LoadResultSchema.parse({ status: 'empty', slotId });
      if (incompatibleCandidateCount > 0) {
        return LoadResultSchema.parse({
          status: 'incompatible', slotId, incompatibleCandidateCount, corruptCandidateCount,
        });
      }
      return LoadResultSchema.parse({ status: 'corrupt', slotId, corruptCandidateCount });
    }
    const sourceSchemaVersion = recovery.selected.envelope.state.schemaVersion;
    try {
      const currentState = sourceSchemaVersion === 7
        ? recovery.selected.envelope.state
        : migrateStateCopy(recovery.selected.envelope.state, recovery.selected.envelope.state.generationId);
      /**
       * Layout recovery FIRST, then the production-cast repair. Both halves run after.
       *
       * A review argued the opposite: recovery relocates a schedule block whose tile a layout
       * change has blocked, and refreshing afterwards writes the authored tile back over that
       * repair. Measured, the reverse order is worse. Recovery treats every block on a map whose
       * saved revision is stale as a candidate, and a map the save has never seen is stale by
       * definition — so refreshing first let recovery scatter the office workers off the
       * desks they are authored to stand at.
       *
       * Writing the authored tile back is safe by construction anyway: `content:build` validates
       * that every authored schedule tile is reachable and unblocked, so the tile this restores
       * cannot be the one inside a new wall.
       */
      const layout = recoverWorldLayout(currentState, this.#catalog);
      const scheduledState = insertMissingProductionCast(refreshProductionSchedules(layout.state));
      // NPCs are compared as well as schedules: the repair now INSERTS a missing production actor
      // alongside its schedule, and a schedules-only comparison would call that "unchanged" and
      // hand back a state it never saved.
      const scheduleChanged = JSON.stringify(layout.state.schedules) !== JSON.stringify(scheduledState.schedules)
        || JSON.stringify(layout.state.npcs) !== JSON.stringify(scheduledState.npcs);
      const migratedState = scheduleChanged ? scheduledState : layout.state;
      const settledState = resolveDueCommitments(migratedState);
      if (
        sourceSchemaVersion === 7 && layout.migratedMapIds.length === 0 &&
        !scheduleChanged && settledState === migratedState
      ) {
        return LoadResultSchema.parse({
          status: 'unchanged',
          slotId,
          saveGeneration: recovery.selected.envelope.saveGeneration,
          checksum: recovery.selected.envelope.payloadChecksum,
          source: recovery.selected.source,
          state: settledState,
          incompatibleCandidateCount,
          corruptCandidateCount,
        });
      }
      const saved = await this.writeSave(SaveRequestSchema.parse({
        slotId,
        expectedSaveGeneration: recovery.selected.envelope.saveGeneration,
        trigger: 'manual',
        state: settledState,
      }));
      if (saved.status !== 'saved') throw new Error('A load-time migration save was deferred.');
      return LoadResultSchema.parse({
        status: 'migrated',
        slotId,
        saveGeneration: saved.saveGeneration,
        checksum: saved.checksum,
        source: recovery.selected.source,
        state: settledState,
        incompatibleCandidateCount,
        corruptCandidateCount,
        migratedFromSchemaVersion: sourceSchemaVersion,
        migratedMapIds: layout.migratedMapIds,
      });
    } catch (error) {
      if (!(error instanceof LayoutMigrationError)) throw error;
      return LoadResultSchema.parse({
        status: 'unrecoverable',
        slotId,
        reason: 'layout_migration_failed',
        incompatibleCandidateCount,
        corruptCandidateCount,
      });
    }
  }

  save(candidate: SaveRequest): Promise<SaveResult> {
    const request = SaveRequestSchema.parse(candidate);
    const blockers = blockingSaveTokens(request);
    if (blockers.length > 0) {
      return Promise.resolve(SaveResultSchema.parse({
        status: 'deferred',
        slotId: request.slotId,
        blockingPauseTokens: blockers,
      }));
    }
    return this.#queue.enqueue(() => this.writeSave(request));
  }

  migrate(candidate: MigrationRequest): Promise<MigrationResult> {
    const request = MigrationRequestSchema.parse(candidate);
    return this.#queue.enqueue(() => this.migrateSlot(request));
  }

  private slotPath(slotId: SaveSlotId): string {
    return join(this.rootPath, 'save-slots', slotId);
  }

  private async inject(stage: SaveFaultStage): Promise<void> {
    await this.#faultInjector?.(stage);
  }

  private async migrateSlot(request: MigrationRequest): Promise<MigrationResult> {
    const sourcePath = join(this.slotPath(request.sourceSlotId), 'state.json');
    const stats = await lstat(sourcePath);
    if (stats.isSymbolicLink() || !stats.isFile() || stats.size > 8 * 1_024 * 1_024) {
      throw new Error('Migration source must be a regular bounded state file.');
    }
    const sourceBytes = await readFile(sourcePath, 'utf8');
    const sourceCandidate = JSON.parse(sourceBytes) as unknown;
    if (
      typeof sourceCandidate === 'object' &&
      sourceCandidate !== null &&
      'formatVersion' in sourceCandidate
    ) {
      throw new Error('No registered envelope migration supports this source format.');
    }
    const migratedState = recoverWorldLayout(
      migrateStateCopy(sourceCandidate, request.nextGenerationId),
      this.#catalog,
    ).state;
    const targetRecovery = await recoverSlot(this.slotPath(request.targetSlotId), request.targetSlotId);
    if (targetRecovery.selected || targetRecovery.invalidCandidates.length > 0) {
      throw new Error('Migration target slot is not empty.');
    }
    if (await readFile(sourcePath, 'utf8') !== sourceBytes) {
      throw new Error('Migration source changed during copy.');
    }
    const saved = await this.writeSave(SaveRequestSchema.parse({
      slotId: request.targetSlotId,
      expectedSaveGeneration: null,
      trigger: 'manual',
      state: migratedState,
    }));
    if (saved.status !== 'saved') throw new Error('Migration target save was deferred.');
    return MigrationResultSchema.parse({
      status: 'migrated',
      sourceSlotId: request.sourceSlotId,
      targetSlotId: request.targetSlotId,
      saveGeneration: saved.saveGeneration,
      checksum: saved.checksum,
      stateSchemaVersion: migratedState.schemaVersion,
      maintenanceWarnings: saved.maintenanceWarnings,
    });
  }

  private async writeSave(request: SaveRequest): Promise<SaveResult> {
    const slotPath = this.slotPath(request.slotId);
    const autosavePath = join(slotPath, 'autosaves');
    await mkdir(autosavePath, { recursive: true, mode: 0o700 });
    const recovery = await recoverSlot(slotPath, request.slotId);
    if (!recovery.selected && recovery.invalidCandidates.length > 0) {
      throw new Error('No compatible save candidate exists; existing candidates were preserved.');
    }
    const currentGeneration = recovery.selected?.envelope.saveGeneration ?? null;
    const retryingRecoveredWrite = recovery.selected?.source === 'temporary' &&
      (request.expectedSaveGeneration === null ||
        recovery.selected.envelope.saveGeneration > request.expectedSaveGeneration);
    if (request.expectedSaveGeneration !== currentGeneration && !retryingRecoveredWrite) {
      throw new Error(`Stale save writer: expected ${String(request.expectedSaveGeneration)}, current ${String(currentGeneration)}.`);
    }
    if (recovery.selected) {
      if (recovery.selected.envelope.state.generationId !== request.state.generationId) {
        throw new Error('Stale save lineage: state generation ID does not match the slot.');
      }
      if (request.state.revision < recovery.selected.envelope.state.revision) {
        throw new Error('Stale save state revision.');
      }
    }

    const saveGeneration = (currentGeneration ?? 0) + 1;
    const envelope = createSaveEnvelope(request.slotId, saveGeneration, request.trigger, request.state);
    const serialized = serializeSaveEnvelope(envelope);
    if (Buffer.byteLength(serialized, 'utf8') > 8 * 1_024 * 1_024) {
      throw new Error('Serialized save exceeds the save size limit.');
    }
    const mainPath = join(slotPath, 'state.json');
    const temporaryPath = join(slotPath, `state.json.tmp-${String(saveGeneration).padStart(12, '0')}-${uniqueSuffix()}`);
    let temporaryValidated = false;

    try {
      await this.inject('before-write');
      const handle = await open(temporaryPath, 'wx', 0o600);
      try {
        await handle.writeFile(serialized, 'utf8');
        await this.inject('after-write');
        await handle.sync();
        await this.inject('after-flush');
      } finally {
        await handle.close();
      }
      parseSaveEnvelope(JSON.parse(await readFile(temporaryPath, 'utf8')) as unknown);
      temporaryValidated = true;
      await this.inject('after-validation');

      const backupPath = join(slotPath, 'state.json.bak');
      if (recovery.selected) {
        if (await pathExists(backupPath)) {
          const backup = await inspectSaveCandidate(backupPath, 'backup', request.slotId);
          if (backup && !('envelope' in backup)) {
            await archiveInvalidCandidate(slotPath, backupPath, 'backup');
          }
        }
        const backupTemporary = join(slotPath, `state.json.bak.tmp-${uniqueSuffix()}`);
        await copyFile(recovery.selected.path, backupTemporary);
        const backupHandle = await open(backupTemporary, 'r+');
        try {
          await backupHandle.sync();
        } finally {
          await backupHandle.close();
        }
        parseSupportedSaveEnvelope(JSON.parse(await readFile(backupTemporary, 'utf8')) as unknown);
        await rename(backupTemporary, backupPath);
      }
      if (await pathExists(mainPath)) {
        const main = await inspectSaveCandidate(mainPath, 'main', request.slotId);
        if (main && !('envelope' in main)) await archiveInvalidCandidate(slotPath, mainPath, 'main');
      }
      await this.inject('after-backup');
      await rename(temporaryPath, mainPath);
    } catch (error) {
      if (!temporaryValidated) {
        await unlink(temporaryPath).catch((unlinkError: NodeJS.ErrnoException) => {
          if (unlinkError.code !== 'ENOENT') throw unlinkError;
        });
      }
      throw error;
    }
    const maintenanceWarnings: Array<
      | 'post_commit_observer_failed'
      | 'autosave_maintenance_failed'
      | 'manifest_maintenance_failed'
    > = [];
    try {
      await this.inject('after-replacement');
      await Promise.all(recovery.validCandidates
        .filter(({ source }) => source === 'temporary')
        .map(({ path }) => unlink(path)));
    } catch {
      maintenanceWarnings.push('post_commit_observer_failed');
    }
    if (AUTOSAVE_TRIGGERS.has(request.trigger)) {
      try {
        await this.inject('before-autosave-maintenance');
        await this.writeAutosave(autosavePath, envelope, serialized);
      } catch {
        maintenanceWarnings.push('autosave_maintenance_failed');
      }
    }
    try {
      await this.inject('before-manifest-maintenance');
      await writeDerivedManifest(
        slotPath,
        `${JSON.stringify(manifestForEnvelope(envelope))}\n`,
      );
    } catch {
      maintenanceWarnings.push('manifest_maintenance_failed');
    }
    return SaveResultSchema.parse({
      status: 'saved',
      slotId: request.slotId,
      saveGeneration,
      checksum: envelope.payloadChecksum,
      maintenanceWarnings,
    });
  }

  private async writeAutosave(
    autosavePath: string,
    envelope: ReturnType<typeof createSaveEnvelope>,
    serialized: string,
  ): Promise<void> {
    const fileName = `autosave-${String(envelope.saveGeneration).padStart(12, '0')}.json`;
    const target = join(autosavePath, fileName);
    const temporary = join(autosavePath, `${fileName}.tmp-${uniqueSuffix()}`);
    await writeFlushedFile(temporary, serialized);
    parseSaveEnvelope(JSON.parse(await readFile(temporary, 'utf8')) as unknown);
    await rename(temporary, target);

    const names = (await readdir(autosavePath)).filter((name) => /^autosave-[0-9]{12}\.json$/u.test(name));
    const valid: Array<Readonly<{ name: string; generation: number }>> = [];
    for (const name of names) {
      const candidate = await inspectSaveCandidate(join(autosavePath, name), 'autosave', envelope.slotId);
      if (candidate && 'envelope' in candidate) {
        valid.push({ name, generation: candidate.envelope.saveGeneration });
      }
    }
    valid.sort((left, right) => right.generation - left.generation || compareAscii(left.name, right.name));
    await Promise.all(valid.slice(3).map(({ name }) => unlink(join(autosavePath, basename(name)))));
  }
}
