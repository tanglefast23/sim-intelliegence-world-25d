import { STATE_SCHEMA_VERSION } from '../../domain/state/schema';
import { migrateStateCopy } from '../../domain/state/migrations';
import {
  DEFAULT_PRESENTATION_PREFERENCES,
  PresentationPreferencesSchema,
  type PresentationPreferences,
  type RendererPresentationPatch,
} from '../presentation/preferences';
import type {
  LoadResult,
  MigrationRequest,
  MigrationResult,
  SaveRequest,
  SaveResult,
  SaveSlotId,
} from './PersistencePort';

/**
 * The web build's save store.
 *
 * Electron owns saves through a checksummed write queue on disk. The browser has no such queue, so
 * this port keeps the same `PersistencePort` shape over `localStorage`: one entry per slot, a
 * generation counter, a checksum, and the same v1-v7 migration chain the desktop build runs. That
 * keeps `GameScreen` and `WorldScene` free of "am I on the web" branches.
 *
 * Saves are per-browser and per-device. Clearing site data deletes them.
 */

const SAVE_KEY_PREFIX = 'si-world:save:';
const PREFERENCES_KEY = 'si-world:preferences';

type StoredEnvelope = Readonly<{
  envelopeVersion: 1;
  saveGeneration: number;
  checksum: string;
  state: unknown;
}>;

/**
 * ponytail: FNV-1a across eight lanes, not SHA-256.
 *
 * This only has to notice a damaged or hand-edited `localStorage` entry, and staying synchronous
 * avoids `crypto.subtle`, which is undefined outside a secure context and would break saving for
 * anyone opening the build over plain http. Move to `crypto.subtle.digest` if a save ever has to be
 * trusted across a network rather than read back by the same browser that wrote it.
 */
function checksumOf(serialized: string): string {
  const lanes = [0x811c9dc5, 0x01000193, 0x9dc5811c, 0x0193_0100, 0xc5811c9d, 0x93010001, 0x1c9dc581, 0x00010301];
  for (let index = 0; index < serialized.length; index += 1) {
    const lane = index & 7;
    const current = lanes[lane] ?? 0;
    lanes[lane] = Math.imul((current ^ serialized.charCodeAt(index)) >>> 0, 0x01000193) >>> 0;
  }
  return lanes.map((lane) => (lane >>> 0).toString(16).padStart(8, '0')).join('');
}

function storage(): Storage | undefined {
  // Safari private mode and disabled-storage settings throw on access rather than returning null.
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function saveKey(slotId: SaveSlotId): string {
  return `${SAVE_KEY_PREFIX}${slotId}`;
}

function readEnvelope(slotId: SaveSlotId): StoredEnvelope | 'empty' | 'corrupt' {
  const store = storage();
  if (!store) return 'empty';
  const raw = store.getItem(saveKey(slotId));
  if (raw === null) return 'empty';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 'corrupt';
  }
  if (typeof parsed !== 'object' || parsed === null) return 'corrupt';
  const candidate = parsed as Partial<StoredEnvelope>;
  if (
    candidate.envelopeVersion !== 1 ||
    typeof candidate.saveGeneration !== 'number' ||
    typeof candidate.checksum !== 'string'
  ) {
    return 'corrupt';
  }
  if (checksumOf(JSON.stringify(candidate.state)) !== candidate.checksum) return 'corrupt';
  return {
    envelopeVersion: 1,
    saveGeneration: candidate.saveGeneration,
    checksum: candidate.checksum,
    state: candidate.state,
  };
}

function generationId(saveGeneration: number): string {
  return `generation-browser-${saveGeneration}`;
}

function writeEnvelope(slotId: SaveSlotId, envelope: StoredEnvelope): void {
  const store = storage();
  if (!store) throw new Error('This browser does not allow local storage, so the island cannot save.');
  store.setItem(saveKey(slotId), JSON.stringify(envelope));
}

async function loadSave(slotId: SaveSlotId): Promise<LoadResult> {
  const envelope = readEnvelope(slotId);
  if (envelope === 'empty') return { status: 'empty', slotId };
  if (envelope === 'corrupt') return { status: 'corrupt', slotId, corruptCandidateCount: 1 };

  const storedVersion = typeof envelope.state === 'object' && envelope.state !== null
    ? (envelope.state as { schemaVersion?: unknown }).schemaVersion
    : undefined;

  // The migration chain reaches back to v1, but `migratedFromSchemaVersion` only describes 5, 6 and
  // 7. Web saves have never existed below the current version, so anything older is reported as
  // incompatible rather than squeezed into a field that cannot hold it.
  if (storedVersion !== 5 && storedVersion !== 6 && storedVersion !== STATE_SCHEMA_VERSION) {
    return { status: 'incompatible', slotId, incompatibleCandidateCount: 1, corruptCandidateCount: 0 };
  }

  let state;
  try {
    state = migrateStateCopy(envelope.state, generationId(envelope.saveGeneration));
  } catch {
    return { status: 'incompatible', slotId, incompatibleCandidateCount: 1, corruptCandidateCount: 0 };
  }

  const common = {
    slotId,
    saveGeneration: envelope.saveGeneration,
    checksum: envelope.checksum,
    source: 'main',
    state,
    incompatibleCandidateCount: 0,
    corruptCandidateCount: 0,
  } as const;

  if (storedVersion === STATE_SCHEMA_VERSION) return { status: 'unchanged', ...common };
  return { status: 'migrated', ...common, migratedFromSchemaVersion: storedVersion, migratedMapIds: [] };
}

async function requestSave(request: SaveRequest): Promise<SaveResult> {
  const existing = readEnvelope(request.slotId);
  const previousGeneration = existing === 'empty' || existing === 'corrupt' ? 0 : existing.saveGeneration;
  // ponytail: last write wins on an `expectedSaveGeneration` mismatch. One browser tab cannot race
  // itself; add a real conflict result if two tabs ever share a slot.
  const saveGeneration = previousGeneration + 1;
  const serialized = JSON.stringify(request.state);
  const checksum = checksumOf(serialized);
  writeEnvelope(request.slotId, {
    envelopeVersion: 1,
    saveGeneration,
    checksum,
    state: request.state,
  });
  return { status: 'saved', slotId: request.slotId, saveGeneration, checksum, maintenanceWarnings: [] };
}

async function migrateSave(request: MigrationRequest): Promise<MigrationResult> {
  const source = readEnvelope(request.sourceSlotId);
  if (source === 'empty' || source === 'corrupt') {
    throw new Error(`Slot ${request.sourceSlotId} has no readable save to migrate.`);
  }
  const state = migrateStateCopy(source.state, request.nextGenerationId);
  const serialized = JSON.stringify(state);
  const checksum = checksumOf(serialized);
  const saveGeneration = source.saveGeneration + 1;
  writeEnvelope(request.targetSlotId, { envelopeVersion: 1, saveGeneration, checksum, state });
  return {
    status: 'migrated',
    sourceSlotId: request.sourceSlotId,
    targetSlotId: request.targetSlotId,
    saveGeneration,
    checksum,
    stateSchemaVersion: STATE_SCHEMA_VERSION,
    maintenanceWarnings: [],
  };
}

async function loadPresentationPreferences(): Promise<PresentationPreferences> {
  const store = storage();
  const raw = store?.getItem(PREFERENCES_KEY);
  if (!raw) return DEFAULT_PRESENTATION_PREFERENCES;
  try {
    return PresentationPreferencesSchema.parse(JSON.parse(raw));
  } catch {
    // Stale or hand-edited preferences must never block a boot, so fall back to the defaults.
    return DEFAULT_PRESENTATION_PREFERENCES;
  }
}

async function savePresentationPreferences(patch: RendererPresentationPatch): Promise<PresentationPreferences> {
  const current = await loadPresentationPreferences();
  const next = PresentationPreferencesSchema.parse({ ...current, ...patch });
  const store = storage();
  store?.setItem(PREFERENCES_KEY, JSON.stringify(next));
  return next;
}

export type BrowserPersistence = Readonly<{
  loadPresentationPreferences: () => Promise<PresentationPreferences>;
  loadSave: (slotId: SaveSlotId) => Promise<LoadResult>;
  migrateSave: (request: MigrationRequest) => Promise<MigrationResult>;
  requestSave: (request: SaveRequest) => Promise<SaveResult>;
  savePresentationPreferences: (patch: RendererPresentationPatch) => Promise<PresentationPreferences>;
}>;

export const browserPersistence: BrowserPersistence = Object.freeze({
  loadPresentationPreferences,
  loadSave,
  migrateSave,
  requestSave,
  savePresentationPreferences,
});
