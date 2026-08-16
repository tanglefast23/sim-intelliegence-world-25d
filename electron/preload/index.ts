import { contextBridge, ipcRenderer } from 'electron';

import type { RendererReadyReport, RuntimeInfo } from '../ipc/contracts';
import type {
  LoadResult,
  MigrationRequest,
  MigrationResult,
  SaveRequest,
  SaveResult,
  SaveSlotId,
} from '../../src/application/effects/PersistencePort';
import type {
  BeginConversationRequest,
  BeginConversationResult,
  CloseConversationRequest,
  CloseConversationResult,
  CompleteVerbalMissionTurnRequest,
  CompleteVerbalMissionTurnResult,
  ConfirmVerbalMissionGoalRequest,
  ConfirmVerbalMissionGoalResult,
  ConversationTurnRequest,
  ConversationTurnResult,
  ReadVerbalMissionTurnRequest,
  ReadVerbalMissionTurnResult,
} from '../../src/application/effects/ConversationPort';
import type {
  PresentationPreferences,
  RendererPresentationPatch,
} from '../../src/application/presentation/preferences';

// A sandboxed preload is bundled by Electron's restricted loader. Keep its runtime
// surface self-contained; the security tests lock these values to the main contract.
const IPC_CHANNELS = Object.freeze({
  abortConversation: 'si-world:abort-conversation',
  beginConversation: 'si-world:begin-conversation',
  completeVerbalMissionTurn: 'si-world:complete-verbal-mission-turn',
  confirmVerbalMissionGoal: 'si-world:confirm-verbal-mission-goal',
  endConversation: 'si-world:end-conversation',
  getRuntimeInfo: 'si-world:get-runtime-info',
  loadPresentationPreferences: 'si-world:load-presentation-preferences',
  loadSave: 'si-world:load-save',
  migrateSave: 'si-world:migrate-save',
  reportRendererReady: 'si-world:report-renderer-ready',
  requestSave: 'si-world:request-save',
  readVerbalMissionTurn: 'si-world:read-verbal-mission-turn',
  savePresentationPreferences: 'si-world:save-presentation-preferences',
  sendConversationTurn: 'si-world:send-conversation-turn',
});

const desktopBridge = Object.freeze({
  abortConversation: (request: CloseConversationRequest): Promise<CloseConversationResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.abortConversation, request),
  beginConversation: (request: BeginConversationRequest): Promise<BeginConversationResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.beginConversation, request),
  completeVerbalMissionTurn: (request: CompleteVerbalMissionTurnRequest): Promise<CompleteVerbalMissionTurnResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.completeVerbalMissionTurn, request),
  confirmVerbalMissionGoal: (request: ConfirmVerbalMissionGoalRequest): Promise<ConfirmVerbalMissionGoalResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.confirmVerbalMissionGoal, request),
  endConversation: (request: CloseConversationRequest): Promise<CloseConversationResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.endConversation, request),
  getRuntimeInfo: (): Promise<RuntimeInfo> => ipcRenderer.invoke(IPC_CHANNELS.getRuntimeInfo),
  loadPresentationPreferences: (): Promise<PresentationPreferences> =>
    ipcRenderer.invoke(IPC_CHANNELS.loadPresentationPreferences),
  loadSave: (slotId: SaveSlotId): Promise<LoadResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.loadSave, slotId),
  migrateSave: (request: MigrationRequest): Promise<MigrationResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.migrateSave, request),
  reportRendererReady: (
    report: RendererReadyReport,
  ): Promise<Readonly<{ accepted: true }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.reportRendererReady, report),
  requestSave: (request: SaveRequest): Promise<SaveResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.requestSave, request),
  readVerbalMissionTurn: (request: ReadVerbalMissionTurnRequest): Promise<ReadVerbalMissionTurnResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.readVerbalMissionTurn, request),
  savePresentationPreferences: (patch: RendererPresentationPatch): Promise<PresentationPreferences> =>
    ipcRenderer.invoke(IPC_CHANNELS.savePresentationPreferences, patch),
  sendConversationTurn: (request: ConversationTurnRequest): Promise<ConversationTurnResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.sendConversationTurn, request),
});

contextBridge.exposeInMainWorld('siWorldDesktop', desktopBridge);
contextBridge.exposeInMainWorld(
  'siWorldDevHarnessMode',
  process.argv.includes('--si-world-dev-harness=1'),
);
contextBridge.exposeInMainWorld(
  'siWorldSmokeMode',
  process.argv.includes('--si-world-smoke-mode=1'),
);
if (
  process.argv.includes('--si-world-smoke-mode=1') &&
  process.argv.includes('--si-world-freeze-npc-motion=1')
) {
  contextBridge.exposeInMainWorld('siWorldFreezeNpcMotion', true);
}
const smokeArtMode = process.argv.find((argument) => argument.startsWith('--si-world-art-mode='))?.split('=')[1];
if (process.argv.includes('--si-world-smoke-mode=1') && (smokeArtMode === 'legacy' || smokeArtMode === 'enhanced')) {
  contextBridge.exposeInMainWorld('siWorldArtMode', smokeArtMode);
}
const smokeVfxMode = process.argv.find((argument) => argument.startsWith('--si-world-vfx-mode='))?.split('=')[1];
if (process.argv.includes('--si-world-smoke-mode=1') && (smokeVfxMode === 'circle' || smokeVfxMode === 'procedural')) {
  contextBridge.exposeInMainWorld('siWorldVfxMode', smokeVfxMode);
}
const smokeRenderer = process.argv.find((argument) => argument.startsWith('--si-world-test-renderer='))?.split('=')[1];
if (process.argv.includes('--si-world-smoke-mode=1') && (smokeRenderer === 'threejs-2d' || smokeRenderer === 'threejs-2-5d')) {
  contextBridge.exposeInMainWorld('siWorldTestRenderer', smokeRenderer);
}
const smokeShadowPath = process.argv.find((argument) => argument.startsWith('--si-world-shadow-path='))?.split('=')[1];
if (process.argv.includes('--si-world-smoke-mode=1') && (smokeShadowPath === 'lit' || smokeShadowPath === 'fallback')) {
  contextBridge.exposeInMainWorld('siWorldShadowPath', smokeShadowPath);
}
const smokeToneMapping = process.argv.find((argument) => argument.startsWith('--si-world-test-tone-mapping='))?.split('=')[1];
if (process.argv.includes('--si-world-smoke-mode=1') && (smokeToneMapping === 'none' || smokeToneMapping === 'aces')) {
  contextBridge.exposeInMainWorld('siWorldTestToneMapping', smokeToneMapping);
}
