import type {
  RendererReadyReport,
  RuntimeInfo,
} from '../../electron/ipc/contracts';
import type {
  LoadResult,
  MigrationRequest,
  MigrationResult,
  SaveRequest,
  SaveResult,
  SaveSlotId,
} from './effects/PersistencePort';
import type { ConversationPort } from './effects/ConversationPort';
import type {
  PresentationPreferences,
  RendererPresentationPatch,
} from './presentation/preferences';
import type { CharacterId } from '../render/atlas';
import type { CharacterPose } from '../render/world-frame';
import type { CameraDirector } from '../render/camera-motion';
import type { MapId } from '../world/maps/catalog';
import type { RendererKind, ToneMappingKind } from '../render/renderer-selection';
import type { ThreeRendererEvidence } from '../render/three/world-renderer';
import type { ShadowPath } from '../render/three25/lighting';
import type { WorldRenderer25Evidence } from '../render/three25/world-renderer-25';

export type DesktopBridge = ConversationPort & Readonly<{
  getRuntimeInfo: () => Promise<RuntimeInfo>;
  loadPresentationPreferences: () => Promise<PresentationPreferences>;
  loadSave: (slotId: SaveSlotId) => Promise<LoadResult>;
  migrateSave: (request: MigrationRequest) => Promise<MigrationResult>;
  reportRendererReady: (
    report: RendererReadyReport,
  ) => Promise<Readonly<{ accepted: true }>>;
  requestSave: (request: SaveRequest) => Promise<SaveResult>;
  savePresentationPreferences: (patch: RendererPresentationPatch) => Promise<PresentationPreferences>;
}>;

declare global {
  interface Window {
    siWorldDesktop?: DesktopBridge;
    siWorldArtMode?: 'legacy' | 'enhanced';
    siWorldDevHarnessMode?: boolean;
    siWorldVfxMode?: 'circle' | 'procedural';
    /** Opts a smoke run into one-shot VFX, which is otherwise off so locked captures cannot move. */
    siWorldTransientVfx?: 'on';
    /**
     * Pins the scripted shooting scene to one instant and returns the clamped time.
     * A hidden window throttles rAF to a standstill, so a capture steps the scene instead of
     * watching it.
     */
    siWorldPinShootingScene?: (timeMs: number) => number;
    siWorldSmokeMode?: boolean;
    siWorldTestRenderer?: RendererKind;
    /** Explicit 2.5D shadow path for a packaged smoke. Never an FPS probe. */
    siWorldShadowPath?: ShadowPath;
    siWorldTestToneMapping?: ToneMappingKind;
    siWorldFreezeNpcMotion?: true;
    siWorldOpenConversationFixture?: (characterId: CharacterId) => void;
    siWorldCloseConversationFixture?: () => void;
    siWorldSetAuthoredDialogueFixture?: (
      characterId?: Exclude<CharacterId, 'protagonist' | 'vampire-01'>,
    ) => void;
    siWorldMeasureResponsiveEvidence?: () => Readonly<Record<string, unknown>> | undefined;
    /** Scripted camera control for dev-harness scenes and smokes. See src/render/camera-motion.ts. */
    siWorldCameraDirector?: CameraDirector;
    /**
     * `absoluteMinute` forces the world clock, so a smoke can capture the same scene at several
     * times of day. Omitted, the fixture keeps the existing behaviour of nudging the clock only
     * far enough to make a neon effect visible.
     */
    siWorldOpenVfxFixture?: (mapId: MapId, effectId: string, absoluteMinute?: number) => void;
    /**
     * Moves the world clock and NOTHING else, so a smoke can hold one camera and one scene while
     * only the sun changes. The VFX fixture also sets the clock, but it relocates the player to
     * its effect, which is no use for capturing an interior.
     */
    siWorldSetSmokeMinute?: (absoluteMinute: number) => void;
    /** Pin the ambient VFX phase so a paused capture shows a representative frame, not step 0. */
    siWorldSetVfxStep?: (step: number) => void;
    /** Stand the protagonist on a chosen tile, so a capture can frame a district's dense part. */
    siWorldStandOnTile?: (tileX: number, tileY: number) => void;
    /** Capture-only pose override. It is React state and never enters a save. */
    siWorldSetPlayerPose?: (pose?: CharacterPose) => void;
    /** Capture-only character-art override. It is React state and never enters a save. */
    siWorldSetPlayerVisual?: (visualId?: CharacterId) => void;
    /** Capture-only screen-facing override for four-view art proof. */
    siWorldSetPlayerFacing?: (facing: 'front' | 'rear' | 'left' | 'right') => void;
    siWorldSetSelectionVisible?: (visible: boolean) => void;
    /** Capture-only crowd control. It is never exposed outside smoke mode. */
    siWorldSetNpcsVisible?: (visible: boolean) => void;
    siWorldCenterOnPlayer?: () => void;
    siWorldStartNaturalMovementFixture?: () => Readonly<{
      npcId: 'linda';
      source: 'fixture';
      target: Readonly<{ x: 23; y: 28 }>;
    }>;
    siWorldOpenRendererFeedbackFixture?: () => void;
    siWorldOpenRendererMotionFixture?: (fixture: 'door-transition' | 'walk-east-frame-1') => void;
    siWorldFreezeRendererParityFrame?: () => void;
    siWorldSetRendererTestZoom?: (zoom: number) => void;
    siWorldThreeRendererEvidence?: () => ThreeRendererEvidence;
    /**
     * The 2.5D renderer's own evidence hook. Separate from `siWorldThreeRendererEvidence` because
     * `ThreeRendererEvidence.rendererKind` is the literal `'threejs-2d'` in a frozen file, and main
     * only collects that hook for the 2D renderer.
     */
    siWorld25dEvidence?: () => WorldRenderer25Evidence;
  }
}

export function getDesktopBridge(): DesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.siWorldDesktop;
}
