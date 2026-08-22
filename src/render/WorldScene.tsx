import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';


import { getDesktopBridge } from '../application/DesktopBridge';
import { getSavePort } from '../application/SavePort';
import { useReducedMotion } from '../application/accessibility';
import type {
  PresentationPreferences,
  RendererPresentationPatch,
} from '../application/presentation/preferences';
import { createBrowserConversationPort } from '../ai/conversation/browser-port';
import { autosaveStableState } from '../application/runtime/autosave';
import { WORLD_MAP_CATALOG } from '../application/runtime/map-catalog';
import { jumpWorldToMinute, setWorldSpeed, sleepWorld, tickWorld } from '../application/runtime/tick';
import { nextMinuteOfDay } from '../domain/clock/clock';
import { canStartPortalTransition, transitionNeighborhood } from '../application/runtime/transitions';
import { advanceMovementFrame } from '../application/runtime/movement-frame';
import { effectiveSpeed } from '../domain/clock/clock';
import { reduceCommand } from '../domain/commands/reducer';
import { DomainCommandSchema } from '../domain/commands/types';
import { lindaContextActions, type ContextQuestAction } from '../domain/quests/quest-machine';
import {
  VERBAL_MISSION_DISCOVERY_FACTS,
  verbalMissionContextActions,
  verbalMissionDiscoveryRecord,
} from '../domain/verbal-missions/discovery';
import { parseWorldState, type WorldState } from '../domain/state/schema';
import { VOCAL_CUE_CAPTIONS, type VocalCueId } from '../audio/vocal-cue-policy';
import { useVocalCues } from '../audio/vocal-cues';
import { relationshipSound } from '../audio/halcyra-audio-policy';
import { useWorldAudio, type InterfaceSoundId } from '../audio/halcyra-audio';
import { setAudioVolumes, useAudioVolumes } from '../audio/volume-store';
import { BedActions } from '../ui/BedActions';
import { ConversationPanel } from '../ui/ConversationPanel';
import { Hud } from '../ui/Hud';
import { JournalPanel } from '../ui/JournalPanel';
import { QuestOfferDialogue } from '../ui/QuestOfferDialogue';
import { RelationshipPanel } from '../ui/RelationshipPanel';
import { SelectedCharacterCard } from '../ui/SelectedCharacterCard';
import { SelectionMarker } from '../ui/SelectionMarker';
import { selectedCharacterSummary } from '../ui/selected-character';
import { sleepCompletionFeedback } from '../ui/sleep-feedback';
import { WorldInput } from '../ui/WorldInput';
import { WorldMarkerOverlay, type WorldMarkerVisuals } from '../ui/WorldMarkers';
import { ZoneGateOverlay } from '../ui/ZoneGate';
import { UI_LAYER } from '../ui/ui-layers';
import { uiMetrics } from '../ui/ui-metrics';
import type { CompiledMapV2 } from '../world/maps/compiled-v2';
import { selectOwnerInteractionApproach } from '../world/maps/compiler';
import { resolveClickTarget, worldClickCandidates } from '../world/maps/hit-testing';
import { presentationGroundAt } from '../world/presentation/art-presentation';
import { tileKey, type TilePoint } from '../world/maps/schema';
import type { MapId } from '../world/maps/catalog';
import {
  cancelMovement,
  createMovementState,
  doorMotionPhases,
  movementEasing,
  requestMovement,
  type MovementState,
} from '../world/pathfinding/movement';
import {
  activeNpcTile,
  movementForNpc,
} from '../world/schedules/active-movement';
import { portalAtTile, portalZoneTiles } from '../world/transfers/portal-zone';
import {
  ATLAS_INDEX,
  CHARACTER_IDS,
  type AtlasRectangle,
  type CharacterId,
} from './atlas';
import { idleFacingForNpc, isOfficeSeatNpc, visualIdForNpc } from './character-visuals';
import {
  assertWorldZoom,
  MAX_WORLD_ZOOM,
  MIN_WORLD_ZOOM,
  stepWorldZoom,
  worldZoomPercentage,
} from '../domain/presentation/world-zoom';
import { mapEffectVisible } from './atmosphere';
import { snapWorldPoint, tileFootPoint } from '../world/movement/motion-clock';
import {
  centerCameraOnWorld,
  centerCameraOnTile,
  clampCamera,
  isScreenPointInsideMap,
  panCamera,
  resizeCameraPreservingCenter,
  screenToTile,
  worldToScreen,
  zoomCameraAt,
  type CameraState,
  type ViewportSize,
} from './camera';
import {
  applyImpulse,
  armFollow,
  cameraMotionLabel,
  cancelShots,
  INITIAL_CAMERA_MOTION,
  playShots,
  pushShot,
  sampleCameraDirector,
  suspendFollow,
  type CameraDirector,
  type CameraMotion,
} from './camera-motion';
import { automaticUiScale, automaticWorldZoom, type UiScale } from './responsive-layout';
import { ThreeWorldSurface } from './ThreeWorldSurface';
import type { RendererKind } from './renderer-selection';
import { inflatedFrameOrigin, inflatedViewport } from './three25/inflation';
import { clampCameraTilted, panCameraTilted } from './three25/clamp';
import {
  GROUND_TILE_TRANSFORM,
  GROUND_Z_SCALE,
  isScreenPointInsideMapTilted,
  screenToTileTilted,
  tiltedFacing,
  worldToScreenTilted,
} from './three25/projection';

/**
 * `worldToScreenTilted` deliberately does not round — rounding mid-chain would break its inverse.
 * `worldToScreen` does, because these values become CSS `left`/`top` on pixel-art overlays and a
 * fractional position blurs them off the pixel grid. This wrapper puts the rounding back at the
 * boundary, so both renderers position overlays the same way.
 *
 * Module scope, so the reference is stable in a dependency array.
 */
function worldToScreenTiltedRounded(
  camera: CameraState,
  world: Readonly<{ x: number; y: number }>,
): Readonly<{ x: number; y: number }> {
  const screen = worldToScreenTilted(camera, world);
  return { x: Math.round(screen.x), y: Math.round(screen.y) };
}
import { measureResponsiveEvidence } from './responsive-evidence';
import { buildSmokeGeometryEvidence } from './smoke-geometry';
import { parseVfxEvidence } from './vfx/evidence';
import { PROCEDURAL_VFX_RENDER_NODE_COUNT } from './vfx/types';
import { advanceAmbientVfxClock, INITIAL_AMBIENT_VFX_CLOCK } from './vfx/clock';
import {
  admitTransientCue,
  createTransientVfxCue,
  DUSTY_FOOTSTEP_SURFACES,
  EMPTY_TRANSIENT_VFX_FRAME,
  expireTransientCues,
  sampleTransientVfx,
  transientVfxPalette,
  TRANSIENT_VFX_REVISION,
  TRANSIENT_VFX_STEP_MILLISECONDS,
  WATER_GROUND_SPRITES,
  type TransientVfxCue,
} from './vfx/transient';
import { districtLighting } from './district-lighting';
import { footstepSurface } from '../audio/halcyra-audio-policy';
import {
  VFX_KINDS,
  VFX_REVISION,
  VFX_STEP_MILLISECONDS,
  VFX_SUSPENSION_GAP_MILLISECONDS,
} from './vfx/types';
import { actorFootPlant } from './gait';
import { bottomPivotTransform, protagonistWobbleDegrees } from './protagonist-wobble';
import {
  buildWorldFrameState,
  DESTINATION_PULSE_MS,
  type WorldActors,
  type CharacterPose,
  type WorldCharacterPlacement,
  type WorldGroundedEntry,
  type WorldLayer,
  type WorldPropPlacement,
} from './world-frame';

const atlasImage = require('../../assets/generated/world-atlas.png') as number;
const MAP_PIXELS = { width: 64 * 32, height: 48 * 32 } as const;
const TILE_SIZE = 32;
/** How long the player stands on a portal zone before the world jumps to the next neighborhood. */
const PORTAL_GATE_DELAY_MS = 1_000;
type GroundedVisual = Readonly<{
  groundY: number;
  id: string;
  kind: 'character' | 'prop';
  placement: WorldPropPlacement | WorldCharacterPlacement;
}>;
type RuntimeViewState = Readonly<{
  movement: MovementState;
  npcMovements: Readonly<Record<string, MovementState>>;
  worldState: WorldState;
}>;


function groundedBatches(visuals: readonly GroundedVisual[]): readonly GroundedVisual[][] {
  return visuals.reduce<GroundedVisual[][]>((batches, visual) => {
    const batch = batches.at(-1);
    if (batch?.[0]?.kind === visual.kind) batch.push(visual);
    else batches.push([visual]);
    return batches;
  }, []);
}

function areaName(map: CompiledMapV2, tile: TilePoint): string {
  const area = map.source.areas.find(({ bounds }) => (
    tile.x >= bounds.x && tile.x < bounds.x + bounds.width &&
    tile.y >= bounds.y && tile.y < bounds.y + bounds.height
  ));
  return (area?.id ?? map.source.displayName).replaceAll('-', ' ').toUpperCase();
}


/**
 * Progress through the route's FINAL segment, for the deceleration lean, or undefined anywhere else.
 *
 * `movementEasing` is the simulation's own rule, exported so this lean cannot drift away from the
 * positional easing it accompanies.
 */
function gaitStopProgress(movement: MovementState): number | undefined {
  const segment = movement.segment;
  if (!segment) return undefined;
  return movementEasing(movement, segment).easeOut
    ? Math.max(0, Math.min(1, segment.elapsedMs / segment.durationMs))
    : undefined;
}

const OPENING_CAST_TILES = {
  linda: { x: 22, y: 25 },
  mina_park: { x: 24, y: 25 },
  devon_price: { x: 26, y: 25 },
  rafael_cruz: { x: 28, y: 25 },
  linda_boyfriend: { x: 30, y: 25 },
  tomas_reed: { x: 22, y: 27 },
  priya_nair: { x: 24, y: 27 },
  sora_tan: { x: 26, y: 27 },
  elise_moreau: { x: 28, y: 27 },
  resident_01: { x: 30, y: 27 },
} as const;

const OPENING_CAST_IDS = new Set<string>(Object.keys(OPENING_CAST_TILES));
type AuthoredDialogueFixtureId = Exclude<CharacterId, 'protagonist' | 'vampire-01'>;

function actorTiles(
  state: WorldState,
  mapId: string,
  movements: Readonly<Record<string, MovementState>>,
  zoom: number,
  dpr: number,
  reducedMotion: boolean,
  selectedId: string,
  conversationNpcId: string | undefined,
  reactionId: string | undefined,
  poseFrame: 0 | 1,
  tilted: boolean,
  openingShowcase: boolean,
): WorldActors {
  const output: Record<string, WorldActors[string]> = {};
  for (const [stateId, npc] of Object.entries(state.npcs)) {
    const tile = activeNpcTile(state, stateId, mapId);
    if (tile) {
      const movement = movements[stateId];
      const seatedOfficeWorker = mapId === 'west_office'
        && isOfficeSeatNpc(stateId)
        && movement?.segment === undefined;
      // A moving actor keeps its movement direction. A STILL one may name its own idle facing:
      // an office clerk who never walks would otherwise stand with their back to their desk.
      const facing = movement?.direction ?? idleFacingForNpc(stateId) ?? 'down';
      output[stateId] = {
        tile,
        visualId: visualIdForNpc(stateId),
        direction: seatedOfficeWorker ? 'up' : tilted ? tiltedFacing(facing, movement) : facing,
        visualFoot: snapWorldPoint(movement?.visualFoot ?? tileFootPoint(tile), zoom, dpr),
        walkFrame: movement?.walkFrame ?? 0,
        moving: movement?.segment !== undefined,
        reducedMotion,
        horizontalRunDistance: movement?.horizontalRunDistance ?? 0,
        pose: stateId === reactionId
          ? 'reaction'
          : seatedOfficeWorker
            ? 'seated'
            : stateId === conversationNpcId ? 'talk' : 'idle',
        poseFrame: stateId === selectedId || stateId === conversationNpcId ? poseFrame : 0,
        travelDistance: movement?.travelDistance ?? 0,
        turnCurve: movement?.latchedTurnCurve,
        stopProgress: movement ? gaitStopProgress(movement) : undefined,
      };
    }
  }
  if (openingShowcase && mapId === 'northwest_residential') {
    for (const [stateId, tile] of Object.entries(OPENING_CAST_TILES)) {
      output[stateId] = {
        tile,
        visualId: visualIdForNpc(stateId),
        direction: tilted ? tiltedFacing('down') : 'down',
        visualFoot: snapWorldPoint(tileFootPoint(tile), zoom, dpr),
        walkFrame: 0,
        moving: false,
        reducedMotion,
        horizontalRunDistance: 0,
        pose: stateId === reactionId ? 'reaction' : stateId === conversationNpcId ? 'talk' : 'idle',
        poseFrame: stateId === selectedId || stateId === conversationNpcId ? poseFrame : 0,
        travelDistance: 0,
        poseProgress: 0,
        poseDirection: 1,
      };
    }
  }
  return output;
}

function npcMovementState(state: WorldState): Readonly<Record<string, MovementState>> {
  const movements: Record<string, MovementState> = {};
  for (const stateId of Object.keys(state.npcs).sort()) {
    const movement = movementForNpc(state, stateId);
    if (movement) movements[stateId] = movement;
  }
  return movements;
}

function npcBlockers(state: WorldState, mapId: string, excludedNpcId?: string): Set<string> {
  const blockers = new Set<string>();
  for (const stateId of Object.keys(state.npcs).sort()) {
    if (stateId === excludedNpcId) continue;
    const presence = state.npcs[stateId]?.presence;
    if (presence?.kind === 'active_local' && presence.mapId === mapId) {
      blockers.add(tileKey({ x: presence.tileX, y: presence.tileY }));
    }
  }
  return blockers;
}

function stateNpcId(selectedId: string, state: WorldState): string | undefined {
  return state.npcs[selectedId] ? selectedId : undefined;
}

function npcLabel(selectedId: string, actors: WorldActors): string {
  const actor = actors[selectedId];
  if (!actor || selectedId === 'generic_resident') return 'Resident';
  if (actor.visualId === 'generic-resident') {
    return selectedId.split('_').map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`).join(' ');
  }
  return ATLAS_INDEX.characters[actor.visualId].displayName;
}

type WorldSceneProps = Readonly<{
  audioEnabled?: boolean;
  forceAmbientMotion?: boolean;
  initialConversationFixtureId?: CharacterId;
  initialFeedback: string;
  initialOpenPanel?: 'journal' | 'relationships';
  initialPresentationPreferences: PresentationPreferences;
  initialSaveGeneration: number | null;
  initialSaveStatus: string;
  initialState: WorldState;
  newGame: boolean;
  /** Hands a scripted scene the camera director once, on mount. */
  onCameraDirector?: (director: CameraDirector) => void;
  onPresentationPreferencesChange: (patch: RendererPresentationPatch) => void;
  onWorldReady?: () => void;
  playInterfaceSound?: (sound: InterfaceSoundId) => void;
  persistenceDisabled?: boolean;
  rendererKind?: RendererKind;
  surface: ViewportSize;
}>;

export function WorldScene({
  audioEnabled = false,
  forceAmbientMotion = false,
  initialConversationFixtureId,
  initialFeedback,
  initialOpenPanel,
  initialPresentationPreferences,
  initialSaveGeneration,
  initialSaveStatus,
  initialState,
  newGame,
  onCameraDirector,
  onPresentationPreferencesChange,
  onWorldReady = () => undefined,
  playInterfaceSound = () => undefined,
  persistenceDisabled = false,
  rendererKind = 'threejs-2d',
  surface,
}: WorldSceneProps) {
  // Declared once, above every consumer. The tilted renderer needs a taller frame request, a
  // different projection for picking, and a different camera clamp; each of those branches off
  // this one flag rather than calling the selector again.
  const renderer2_5d = rendererKind === 'threejs-2-5d';
  // Screen space is not the same shape in the two renderers: the tilted view compresses the depth
  // axis, so a click at the same pixel lands on a different tile. Every projection, unprojection
  // and hit test goes through one of these three, chosen once. All six are module-level functions,
  // so the chosen reference is stable and safe in a dependency array.
  const project = renderer2_5d ? worldToScreenTiltedRounded : worldToScreen;
  const unproject = renderer2_5d ? screenToTileTilted : screenToTile;
  const insideMap = renderer2_5d ? isScreenPointInsideMapTilted : isScreenPointInsideMap;
  // The tilted view sees further down the map, so it has to stop panning sooner. Threaded into
  // every camera helper rather than branched inside them, so `camera.ts` never learns that a
  // second renderer exists.
  const clamp = renderer2_5d ? clampCameraTilted : clampCamera;
  // A screen drag maps onto both world axes once the camera is yawed, so pan is threaded like the
  // other four rather than left on the flat rule.
  const pan = renderer2_5d ? panCameraTilted : panCamera;
  const reducedMotion = useReducedMotion();
  const playVocalCue = useVocalCues();
  const initialTile = useMemo(() => ({
    x: initialState.protagonist.worldPosition.tileX,
    y: initialState.protagonist.worldPosition.tileY,
  }), [initialState]);
  const initialMapId = initialState.protagonist.worldPosition.mapId as MapId;
  const initialMap = WORLD_MAP_CATALOG[initialMapId];
  const automaticZoom = automaticWorldZoom(surface);
  const initialZoom = initialPresentationPreferences.worldZoom
    ?? (newGame && initialMapId === 'northwest_residential' ? Math.max(2, automaticZoom) : automaticZoom);
  const initialAnchor = newGame
    ? (initialMapId === 'northwest_residential' ? { x: 22, y: 27 } : initialMap.source.startComposition?.cameraAnchor ?? initialTile)
    : initialTile;
  const [runtime, setRuntime] = useState<RuntimeViewState>(() => ({
    movement: createMovementState(initialTile),
    npcMovements: npcMovementState(initialState),
    worldState: initialState,
  }));
  const [camera, setCamera] = useState<CameraState>(() => {
    const saved = initialPresentationPreferences.camera;
    return !newGame && saved?.mapId === initialMapId
      ? clamp({ x: saved.x, y: saved.y, zoom: initialZoom }, surface, MAP_PIXELS)
      : centerCameraOnTile(initialAnchor, initialZoom, surface, MAP_PIXELS, clamp);
  });
  const [explicitWorldZoom, setExplicitWorldZoom] = useState(initialPresentationPreferences.worldZoom !== null);
  const [uiScale, setUiScale] = useState<UiScale>(() => initialPresentationPreferences.uiScale ?? automaticUiScale(surface));
  const [explicitUiScale, setExplicitUiScale] = useState(initialPresentationPreferences.uiScale !== null);
  const [hudCollapsed, setHudCollapsed] = useState(initialPresentationPreferences.hudCollapsed);
  const volumes = useAudioVolumes();
  const [selected, setSelected] = useState<string>(initialConversationFixtureId ?? 'protagonist');
  const [openingShowcase, setOpeningShowcase] = useState(newGame && initialMapId === 'northwest_residential');
  const [reactionId, setReactionId] = useState<string>();
  const [poseFrame, setPoseFrame] = useState<0 | 1>(0);
  const [playerPoseFixture, setPlayerPoseFixture] = useState<CharacterPose>();
  const [playerVisualFixture, setPlayerVisualFixture] = useState<CharacterId>();
  const [selectionFixtureVisible, setSelectionFixtureVisible] = useState(true);
  const [saveStatus, setSaveStatus] = useState(initialSaveStatus);
  const [transitioning, setTransitioning] = useState(false);
  // Dev tool. React state only: never saved, never in presentation preferences, resets on reload.
  const [devMode, setDevMode] = useState(false);
  const [armedPortalId, setArmedPortalId] = useState<string>();
  const [arrivalLock, setArrivalLock] = useState<string>();
  const [worldFeedback, setWorldFeedback] = useState<string | undefined>(initialFeedback);
  const [conversationNpcId, setConversationNpcId] = useState<string | undefined>(initialConversationFixtureId);
  const [conversationFixtureId, setConversationFixtureId] = useState<CharacterId | undefined>(initialConversationFixtureId);
  const [questOfferOpen, setQuestOfferOpen] = useState(false);
  const [authoredDialogueFixtureId, setAuthoredDialogueFixtureId] = useState<AuthoredDialogueFixtureId>();
  const [openPanel, setOpenPanel] = useState<'journal' | 'relationships' | undefined>(initialOpenPanel);
  const [audioCaption, setAudioCaption] = useState<string>();
  const [responsiveEvidence, setResponsiveEvidence] = useState('');
  const [vfxAgeStep, setVfxAgeStep] = useState(0);
  /** Set by the smoke hook only. While it holds a step, the ambient loop must not move off it. */
  const pinnedVfxStep = useRef<number | undefined>(undefined);
  const [destinationMarker, setDestinationMarker] = useState<TilePoint>();
  const [destinationPulseElapsedMs, setDestinationPulseElapsedMs] = useState(0);
  const [rendererParityPulseFrozen, setRendererParityPulseFrozen] = useState(false);
  const [rendererContextState, setRendererContextState] = useState<'ready' | 'lost' | 'timed-out'>('ready');
  const rendererSuspended = rendererContextState !== 'ready';
  const conversationPort = useMemo(
    () => persistenceDisabled ? createBrowserConversationPort() : getDesktopBridge() ?? createBrowserConversationPort(),
    [persistenceDisabled],
  );
  const saveGeneration = useRef<number | null>(initialSaveGeneration);
  const vfxClock = useRef(INITIAL_AMBIENT_VFX_CLOCK);
  // One-shot VFX. The cue list is a ref because a click must not re-render on its own; the step
  // counter is state because the frame has to rebuild while a cue is alive.
  const transientClock = useRef(INITIAL_AMBIENT_VFX_CLOCK);
  const transientCues = useRef<readonly TransientVfxCue[]>([]);
  const transientDropped = useRef(0);
  const transientCueSerial = useRef(0);
  const lastFootPlantIndex = useRef<number | undefined>(undefined);
  const [transientStep, setTransientStep] = useState(0);
  const [transientLive, setTransientLive] = useState(false);
  const handledSleepEventId = useRef<string | undefined>(undefined);
  const captionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previousSurface = useRef(surface);
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const cameraMotionRef = useRef<CameraMotion>(INITIAL_CAMERA_MOTION);
  const cameraClockRef = useRef(0);
  const followPointRef = useRef(runtime.movement.visualFoot);
  followPointRef.current = runtime.movement.visualFoot;
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  // The director runs inside a requestAnimationFrame loop whose effect does not re-subscribe on
  // every render, so it reads the clamp through a ref like every other live value in there.
  const clampRef = useRef(clamp);
  clampRef.current = clamp;
  const [cameraMotionView, setCameraMotionView] = useState(() => ({
    offset: { x: 0, y: 0 },
    label: cameraMotionLabel(INITIAL_CAMERA_MOTION),
  }));
  /**
   * The camera clock. It is scheduled only while something is actually moving — an unsettled
   * follow, a live impact, or a queued shot — and stops itself otherwise, so a still camera costs
   * nothing. Its callback shares the animation-frame task with the movement loop, so React batches
   * both into one render.
   */
  const wakeCameraClock = useCallback(() => {
    if (cameraClockRef.current !== 0 || typeof window === 'undefined') return;
    let previousTime: number | undefined;
    const step = (time: number) => {
      const deltaMs = previousTime === undefined ? 0 : time - previousTime;
      previousTime = time;
      const sample = sampleCameraDirector(cameraMotionRef.current, cameraRef.current, {
        deltaMs,
        followPoint: followPointRef.current,
        viewport: surfaceRef.current,
        mapPixels: MAP_PIXELS,
        reducedMotion: reducedMotionRef.current,
        clamp: clampRef.current,
      });
      cameraMotionRef.current = sample.motion;
      if (sample.camera !== cameraRef.current) {
        cameraRef.current = sample.camera;
        setCamera(sample.camera);
      }
      const label = cameraMotionLabel(sample.motion);
      setCameraMotionView((current) => current.offset.x === sample.offset.x &&
        current.offset.y === sample.offset.y && current.label === label
        ? current
        : { offset: sample.offset, label });
      cameraClockRef.current = sample.active ? requestAnimationFrame(step) : 0;
    };
    cameraClockRef.current = requestAnimationFrame(step);
  }, []);
  const updateCameraMotion = useCallback((change: (motion: CameraMotion) => CameraMotion) => {
    cameraMotionRef.current = change(cameraMotionRef.current);
    wakeCameraClock();
  }, [wakeCameraClock]);
  useEffect(() => () => {
    if (cameraClockRef.current !== 0) cancelAnimationFrame(cameraClockRef.current);
  }, []);
  const mapId = runtime.worldState.protagonist.worldPosition.mapId as MapId;
  const map = WORLD_MAP_CATALOG[mapId];
  const movementMaterialId = runtime.movement.segment
    ? presentationGroundAt(map.presentation, runtime.movement.segment.to, map.source.width).materialId
    : undefined;
  const doorPhases = useMemo(() => doorMotionPhases(runtime.movement), [runtime.movement]);
  useWorldAudio({
    absoluteMinute: runtime.worldState.clock.absoluteMinute,
    doorPhases,
    enabled: audioEnabled && !rendererSuspended,
    mapId,
    materialId: movementMaterialId,
    segment: runtime.movement.segment,
  });
  const artMode = typeof window !== 'undefined' && window.siWorldSmokeMode === true && window.siWorldArtMode === 'legacy'
    ? 'legacy' as const
    : 'enhanced' as const;
  const smokeMode = typeof window !== 'undefined' && window.siWorldSmokeMode === true;
  const vfxMode = smokeMode && window.siWorldVfxMode === 'circle'
    ? 'circle' as const
    : 'procedural' as const;
  // On in real play and in the dev harness; off in every existing packaged smoke unless a smoke
  // opts in. A footfall puff must never appear inside a locked frame comparison.
  const transientVfxEnabled = vfxMode === 'procedural' &&
    (!smokeMode || (typeof window !== 'undefined' && window.siWorldTransientVfx === 'on'));
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
  const npcTiles = useMemo(() => actorTiles(
    runtime.worldState,
    mapId,
    runtime.npcMovements,
    camera.zoom,
    dpr,
    reducedMotion,
    selected,
    conversationNpcId,
    reactionId,
    poseFrame,
    renderer2_5d,
    openingShowcase,
  ), [camera.zoom, conversationNpcId, dpr, mapId, openingShowcase, poseFrame, reactionId, reducedMotion, renderer2_5d, runtime.npcMovements, runtime.worldState, selected]);
  const speed = effectiveSpeed(runtime.worldState.clock);
  const selectedNpcId = stateNpcId(selected, runtime.worldState);
  const lindaQuestActions = lindaContextActions(runtime.worldState, selectedNpcId);
  const contextualMissionActions = verbalMissionContextActions(runtime.worldState, selectedNpcId);
  const lindaOfferAction = lindaQuestActions.find(({ id }) => id === 'start');
  const lindaOfferReady = lindaOfferAction?.enabled ?? false;
  const metrics = useMemo(() => uiMetrics(uiScale), [uiScale]);

  useEffect(() => {
    // A pinned step survives a map change. Without this a capture that pins and then travels drops
    // silently back to step 0 - the phase where no steam has risen - and reports it as pinned.
    const pinned = pinnedVfxStep.current;
    vfxClock.current = pinned === undefined
      ? INITIAL_AMBIENT_VFX_CLOCK
      : { ...INITIAL_AMBIENT_VFX_CLOCK, ageMilliseconds: pinned * VFX_STEP_MILLISECONDS };
    setVfxAgeStep(pinned ?? 0);
    // Spec section 3.3: a map transition clears transient one-shots. The destination rebuilds only
    // its ambient emitters.
    transientClock.current = INITIAL_AMBIENT_VFX_CLOCK;
    transientCues.current = [];
    transientDropped.current = 0;
    lastFootPlantIndex.current = undefined;
    setTransientStep(0);
    setTransientLive(false);
  }, [mapId]);

  const emitTransientCue = useCallback((
    kind: 'ripple' | 'dust',
    origin: Readonly<{ x: number; y: number }>,
    strength: 'subtle' | 'strong',
  ) => {
    if (!transientVfxEnabled) return;
    transientCueSerial.current += 1;
    const nowMs = transientClock.current.ageMilliseconds;
    const result = admitTransientCue(transientCues.current, createTransientVfxCue({
      id: `${kind}-${transientCueSerial.current}`,
      kind,
      startMs: nowMs,
      origin,
      strength,
    }), nowMs);
    transientCues.current = result.cues;
    if (result.dropped) transientDropped.current += 1;
    setTransientLive(result.cues.length > 0);
  }, [transientVfxEnabled]);

  /**
   * Footfall dust and water displacement.
   *
   * `undefined` is a GAP, not an event: a replan frame has no segment, so the plant sequence reads
   * N-1 -> undefined -> 0. Comparing against the last DEFINED index is what stops a puff firing at
   * every click. Protagonist only — eight walking NPCs would multiply the cue rate by eight for no
   * visible gain, since the camera follows the player.
   */
  useEffect(() => {
    if (!transientVfxEnabled) return;
    const plant = actorFootPlant('protagonist', runtime.movement);
    if (!plant) return;
    if (lastFootPlantIndex.current === plant.index) return;
    lastFootPlantIndex.current = plant.index;
    const tile = { x: Math.floor(plant.worldX / TILE_SIZE), y: Math.floor(plant.worldY / TILE_SIZE) };
    if (tile.x < 0 || tile.y < 0 || tile.x >= map.source.width || tile.y >= map.source.height) return;
    const ground = presentationGroundAt(map.presentation, tile, map.source.width);
    if (WATER_GROUND_SPRITES.has(ground.sprite)) {
      emitTransientCue('ripple', { x: plant.worldX, y: plant.worldY }, 'subtle');
      return;
    }
    // Spec section 8.5: no dust on wood or clean interior tile.
    if (!DUSTY_FOOTSTEP_SURFACES.has(footstepSurface(ground.materialId))) return;
    emitTransientCue('dust', { x: plant.worldX, y: plant.worldY }, 'subtle');
  }, [emitTransientCue, map, runtime.movement, transientVfxEnabled]);

  useEffect(() => {
    const running = !rendererSuspended && vfxMode === 'procedural' && (forceAmbientMotion || speed > 0);
    // One-shot cues keep ageing while the world is paused. Spec section 3.3 requires exactly that:
    // a committed result must not become invisible because the movement loop stopped.
    const transientRunning = !rendererSuspended && transientVfxEnabled && transientLive;
    if (!running && !transientRunning) {
      vfxClock.current = advanceAmbientVfxClock(vfxClock.current, 0, { running: false });
      transientClock.current = advanceAmbientVfxClock(transientClock.current, 0, { running: false });
      return undefined;
    }
    let animationFrame = 0;
    let previousTime: number | undefined;
    const animate = (time: number) => {
      const rawDelta = previousTime === undefined ? 0 : time - previousTime;
      previousTime = time;
      const resumedFromSuspension = rawDelta > VFX_SUSPENSION_GAP_MILLISECONDS;
      // `running`, NOT `true`. A transient cue can start this loop while the world is paused, and
      // the packaged smoke throws if the AMBIENT age advances across a pause.
      vfxClock.current = advanceAmbientVfxClock(vfxClock.current, rawDelta, {
        running,
        resumedFromSuspension,
      });
      transientClock.current = advanceAmbientVfxClock(transientClock.current, rawDelta, {
        running: transientRunning,
        resumedFromSuspension,
      });
      // A pinned step wins outright. Without this the loop overwrites it on the very next frame.
      const nextAgeStep = pinnedVfxStep.current
        ?? Math.floor(vfxClock.current.ageMilliseconds / VFX_STEP_MILLISECONDS);
      setVfxAgeStep((current) => current === nextAgeStep ? current : nextAgeStep);
      const nextTransientStep = Math.floor(
        transientClock.current.ageMilliseconds / TRANSIENT_VFX_STEP_MILLISECONDS,
      );
      setTransientStep((current) => current === nextTransientStep ? current : nextTransientStep);
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [forceAmbientMotion, mapId, rendererSuspended, speed, transientLive, transientVfxEnabled, vfxMode]);

  useEffect(() => {
    if (reducedMotion) {
      setPoseFrame(0);
      return undefined;
    }
    if (rendererSuspended) return undefined;
    const timer = setInterval(() => setPoseFrame((current) => current === 0 ? 1 : 0), 720);
    return () => clearInterval(timer);
  }, [reducedMotion, rendererSuspended]);

  const selectCharacter = useCallback((id: string) => {
    setSelected(id);
    setReactionId(id);
    setTimeout(() => setReactionId((current) => current === id ? undefined : current), 520);
  }, []);

  useLayoutEffect(() => {
    const previous = previousSurface.current;
    if (previous.width === surface.width && previous.height === surface.height) return;
    // Zoom is picked ONCE, at mount, by `automaticWorldZoom`. A resize keeps it, so going
    // fullscreen shows more world at the same pixel scale instead of re-picking a chunkier zoom
    // and rescaling the picture under the player.
    setCamera((current) => resizeCameraPreservingCenter(current, previous, surface, camera.zoom, MAP_PIXELS, clamp));
    if (!explicitUiScale) setUiScale(automaticUiScale(surface));
    previousSurface.current = surface;
  }, [camera.zoom, clamp, explicitUiScale, surface]);

  useEffect(() => {
    // A director shot must never be persisted. A `hold` keeps the camera still, so a queue holding
    // for 160 ms or more would otherwise settle the debounce and write a mid-scene composition —
    // and a mid-ramp zoom with it — into presentation preferences, restoring it on next launch.
    const timer = setTimeout(() => {
      if (cameraMotionRef.current.shots.length > 0) return;
      onPresentationPreferencesChange({
        worldZoom: explicitWorldZoom ? camera.zoom : null,
        uiScale: explicitUiScale ? uiScale : null,
        musicVolume: volumes.music,
        sfxVolume: volumes.sfx,
        hudCollapsed,
        camera: { mapId, x: Math.round(camera.x), y: Math.round(camera.y) },
      });
    }, 160);
    return () => clearTimeout(timer);
  }, [camera, explicitUiScale, explicitWorldZoom, hudCollapsed, mapId, onPresentationPreferencesChange, uiScale, volumes]);

  const triggerVocalCue = useCallback((cue: VocalCueId) => {
    playVocalCue(cue);
    setAudioCaption(VOCAL_CUE_CAPTIONS[cue]);
    if (captionTimer.current) clearTimeout(captionTimer.current);
    captionTimer.current = setTimeout(() => setAudioCaption(undefined), 1_500);
  }, [playVocalCue]);

  useEffect(() => () => {
    if (captionTimer.current) clearTimeout(captionTimer.current);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || window.siWorldSmokeMode !== true) return undefined;
    window.siWorldOpenConversationFixture = (characterId) => {
      if (!CHARACTER_IDS.includes(characterId)) throw new Error(`Unknown conversation fixture ${characterId}.`);
      setOpenPanel(undefined);
      setConversationFixtureId(characterId);
      setConversationNpcId(characterId);
    };
    window.siWorldCloseConversationFixture = () => {
      setConversationFixtureId(undefined);
      setConversationNpcId(undefined);
    };
    window.siWorldFreezeRendererParityFrame = () => {
      vfxClock.current = INITIAL_AMBIENT_VFX_CLOCK;
      setVfxAgeStep(0);
      setDestinationPulseElapsedMs(420);
      setRendererParityPulseFrozen(true);
    };
    window.siWorldSetRendererTestZoom = (zoom) => {
      setExplicitWorldZoom(true);
      setCamera((current) => zoomCameraAt(
        current,
        assertWorldZoom(zoom),
        { x: surfaceRef.current.width / 2, y: surfaceRef.current.height / 2 },
        surfaceRef.current,
        MAP_PIXELS,
        clamp,
      ));
    };
    window.siWorldSetAuthoredDialogueFixture = (characterId) => {
      if (characterId === undefined || !CHARACTER_IDS.includes(characterId)) {
        throw new Error(`Unknown authored dialogue fixture ${String(characterId)}.`);
      }
      setOpenPanel(undefined);
      setConversationFixtureId(undefined);
      setConversationNpcId(undefined);
      setAuthoredDialogueFixtureId(characterId);
      setQuestOfferOpen(true);
    };
    window.siWorldStartNaturalMovementFixture = () => {
      setRuntime((current) => {
        const linda = current.worldState.npcs.linda;
        if (!linda || linda.presence.kind !== 'active_local') {
          throw new Error('Natural-movement fixture requires active Linda.');
        }
        const worldState = parseWorldState({
          ...current.worldState,
          npcs: {
            ...current.worldState.npcs,
            linda: {
              ...linda,
              scheduleGoal: {
                mapId: 'northwest_residential',
                locationId: 'linda_villa',
                activityId: 'smoke-walk',
                tileX: 23,
                tileY: 28,
                scheduledMinute: current.worldState.clock.absoluteMinute,
              },
            },
          },
        });
        return { ...current, npcMovements: npcMovementState(worldState), worldState };
      });
      return { npcId: 'linda', source: 'fixture', target: { x: 23, y: 28 } };
    };
    window.siWorldOpenRendererFeedbackFixture = () => {
      setOpenPanel(undefined);
      setConversationFixtureId(undefined);
      setConversationNpcId(undefined);
      setSelected('protagonist');
      setReactionId(undefined);
      setDestinationMarker({ x: 22, y: 28 });
      setDestinationPulseElapsedMs(420);
      setRendererParityPulseFrozen(true);
      setRuntime((current) => ({
        movement: { ...current.movement, feedbackTile: { x: 24, y: 28 } },
        npcMovements: current.npcMovements,
        worldState: parseWorldState({
          ...current.worldState,
          journal: {
            ...current.worldState.journal,
            journal_renderer_parity: {
              id: 'journal_renderer_parity',
              subject: { kind: 'quest', questId: 'linda_boyfriend_check' },
              summary: 'Renderer parity marker.',
              locationPrecision: 'exact',
              locationId: 'linda_villa',
              markerVisible: true,
              source: { type: 'scene_observation', sourceId: 'renderer_parity_fixture' },
              resolutionState: 'open',
              outcomeReceipts: [],
            },
          },
        }),
      }));
      setCamera((current) => centerCameraOnTile({ x: 23, y: 28 }, current.zoom, surfaceRef.current, MAP_PIXELS, clamp));
      updateCameraMotion(suspendFollow);
    };
    window.siWorldOpenRendererMotionFixture = (fixture) => {
      const start = { x: 17, y: 23 };
      const target = fixture === 'door-transition' ? { x: 14, y: 23 } : { x: 20, y: 23 };
      const fixtureMap = WORLD_MAP_CATALOG.northwest_residential;
      setOpenPanel(undefined);
      setConversationFixtureId(undefined);
      setConversationNpcId(undefined);
      setSelected('protagonist');
      setDestinationMarker(target);
      setDestinationPulseElapsedMs(420);
      setRendererParityPulseFrozen(true);
      setRuntime((current) => {
        const worldState = parseWorldState({
          ...current.worldState,
          protagonist: {
            ...current.worldState.protagonist,
            locationId: 'protagonist_villa',
            worldPosition: { mapId: 'northwest_residential', tileX: start.x, tileY: start.y },
          },
        });
        let staged: RuntimeViewState = {
          movement: requestMovement(fixtureMap, createMovementState(start), target),
          npcMovements: npcMovementState(worldState),
          worldState,
        };
        for (let step = 0; step < 120; step += 1) {
          staged = advanceMovementFrame(staged, 16, 1, false);
          const activeDoor = Object.values(doorMotionPhases(staged.movement)).some((phase) => phase === 'opening');
          const walkingEast = staged.movement.status === 'moving' && staged.movement.direction === 'right' && staged.movement.walkFrame === 1;
          if ((fixture === 'door-transition' && activeDoor) || (fixture === 'walk-east-frame-1' && walkingEast)) return staged;
        }
        throw new Error(`Renderer motion fixture did not reach ${fixture}.`);
      });
      setCamera((current) => centerCameraOnTile(
        fixture === 'door-transition' ? { x: 15, y: 23 } : { x: 18, y: 23 },
        current.zoom,
        surfaceRef.current,
        MAP_PIXELS,
        clamp,
      ));
      updateCameraMotion(suspendFollow);
    };
    // Clock only. The player stays where they are, so an interior stays framed while the sun moves.
    window.siWorldSetSmokeMinute = (absoluteMinute) => {
      setRuntime((current) => ({
        ...current,
        worldState: parseWorldState({
          ...current.worldState,
          clock: { ...current.worldState.clock, absoluteMinute },
        }),
      }));
    };
    /**
     * Pin the ambient VFX phase, for captures.
     *
     * The ambient clock only advances while time is running, so a paused capture always sees step
     * 0 — the phase where a steam plume has not risen and a fire has not flickered. Forcing the
     * clock to run instead would make the captured frame depend on when the screenshot landed,
     * which is exactly the timing noise a frame-diffing scorer must not have. Setting the step
     * directly is deterministic and representative at the same time.
     */
    window.siWorldSetVfxStep = (step) => {
      // Write the CLOCK, not just the React state, and latch it. Setting the state alone lasted
      // exactly one frame: the ambient loop below recomputes the step from `vfxClock` every frame
      // while the world is running, so a capture that pinned step 2 was still scored at whatever
      // step the clock had wandered to — and the lamp flicker rides the same step, so the numbers
      // included a random blink.
      pinnedVfxStep.current = step;
      vfxClock.current = { ...vfxClock.current, ageMilliseconds: step * VFX_STEP_MILLISECONDS };
      setVfxAgeStep(step);
    };
    window.siWorldSetPlayerPose = setPlayerPoseFixture;
    window.siWorldSetPlayerVisual = setPlayerVisualFixture;
    window.siWorldSetSelectionVisible = setSelectionFixtureVisible;
    window.siWorldSetPlayerFacing = (facing) => {
      const step = facing === 'front' ? { x: 1, y: 1 }
        : facing === 'rear' ? { x: -1, y: -1 }
          : facing === 'left' ? { x: -1, y: 1 }
            : { x: 1, y: -1 };
      setRuntime((current) => ({
        ...current,
        movement: {
          ...current.movement,
          previousTile: {
            x: current.movement.player.x - step.x,
            y: current.movement.player.y - step.y,
          },
        },
      }));
    };
    window.siWorldSetNpcsVisible = (visible) => {
      setRuntime((current) => ({
        ...current,
        worldState: parseWorldState({
          ...current.worldState,
          npcs: Object.fromEntries(Object.entries(current.worldState.npcs).map(([id, npc]) => [id, {
            ...npc,
            presence: npc.presence.kind === 'in_transit' || visible
              ? npc.presence
              : { ...npc.presence, kind: 'inactive' },
          }])),
        }),
      }));
    };
    window.siWorldCenterOnPlayer = () => {
      setCamera((current) => centerCameraOnWorld(
        runtimeRef.current.movement.visualFoot,
        current.zoom,
        surfaceRef.current,
        MAP_PIXELS,
        clampRef.current,
      ));
      updateCameraMotion(suspendFollow);
    };
    /**
     * Stand the protagonist on a chosen tile of the map they are already on.
     *
     * The district captures reach a map through `siWorldOpenVfxFixture`, which stands the player
     * next to the effect it opened. That framed the harbour on 70% empty yard with its cargo half
     * out of shot, and put the villa's protagonist in half-dark at the frame's edge while the warm
     * pocket sat centre-right. Where an effect happens to be is not where a district photographs
     * best, and composition is a rubric criterion.
     */
    window.siWorldStandOnTile = (tileX, tileY) => {
      setRuntime((current) => {
        const mapId = current.worldState.protagonist.worldPosition.mapId;
        // Fail loudly. A blocked tile used to be accepted silently and the capture came back framed
        // on somewhere else entirely - which is how a VFX fixture ended up photographed with its
        // effect out of shot and nobody could tell that from an effect that does not render.
        const standing = WORLD_MAP_CATALOG[mapId as MapId];
        if (standing.blockedKeys.has(tileKey({ x: tileX, y: tileY }))) {
          throw new Error(`siWorldStandOnTile: ${mapId} tile ${String(tileX)},${String(tileY)} is blocked.`);
        }
        return {
          ...current,
          movement: createMovementState({ x: tileX, y: tileY }),
          worldState: parseWorldState({
            ...current.worldState,
            protagonist: {
              ...current.worldState.protagonist,
              worldPosition: { mapId, tileX, tileY },
            },
          }),
        };
      });
    };
    window.siWorldOpenVfxFixture = (fixtureMapId, effectId, forcedMinute) => {
      const fixtureMap = WORLD_MAP_CATALOG[fixtureMapId];
      const effect = fixtureMap.source.effects.find(({ id }) => id === effectId);
      if (!effect) throw new Error(`Unknown VFX fixture ${fixtureMapId}/${effectId}.`);
      const effectTile = { ...effect.tile };
      const tile = [
        { x: effectTile.x, y: effectTile.y + 3 },
        { x: effectTile.x + 3, y: effectTile.y },
        { x: effectTile.x, y: effectTile.y - 3 },
        { x: effectTile.x - 3, y: effectTile.y },
      ].find((candidate) => (
        candidate.x >= 0 && candidate.x < fixtureMap.source.width &&
        candidate.y >= 0 && candidate.y < fixtureMap.source.height &&
        !fixtureMap.blockedKeys.has(tileKey(candidate))
      ));
      if (!tile) throw new Error(`VFX fixture ${fixtureMapId}/${effectId} has no nearby player tile.`);
      setOpenPanel(undefined);
      setConversationFixtureId(undefined);
      setConversationNpcId(undefined);
      setDestinationMarker(undefined);
      setSelected('protagonist');
      setArrivalLock(`${fixtureMapId}:${tile.x},${tile.y}`);
      setWorldFeedback(`VFX FIXTURE · ${effectId.toUpperCase()}`);
      setRuntime((current) => {
        const absoluteMinute = current.worldState.clock.absoluteMinute;
        const worldState = parseWorldState({
          ...current.worldState,
          clock: {
            ...current.worldState.clock,
            // A forced minute wins outright, so a day-sweep capture can hold one scene and move
            // only the sun. Without one, the existing rule stands: nudge to dusk if and only if
            // the effect would otherwise be invisible.
            absoluteMinute: forcedMinute
              ?? (mapEffectVisible(effect.kind, absoluteMinute) ? absoluteMinute : 1_260),
          },
          protagonist: {
            ...current.worldState.protagonist,
            locationId: fixtureMapId,
            worldPosition: {
              mapId: fixtureMapId,
              tileX: tile.x,
              tileY: tile.y,
            },
          },
          maps: Object.fromEntries(Object.entries(current.worldState.maps).map(([id, state]) => [id, {
            ...state,
            active: id === fixtureMapId,
          }])),
          npcs: Object.fromEntries(Object.entries(current.worldState.npcs).map(([id, npc]) => [id, {
            ...npc,
            presence: npc.presence.kind === 'in_transit' ? npc.presence : {
              ...npc.presence,
              kind: npc.presence.mapId === fixtureMapId ? 'active_local' : 'inactive',
            },
          }])),
        });
        return {
          movement: createMovementState(tile),
          npcMovements: npcMovementState(worldState),
          worldState,
        };
      });
      setCamera((current) => centerCameraOnTile(effectTile, current.zoom, surfaceRef.current, MAP_PIXELS, clamp));
      updateCameraMotion(suspendFollow);
    };
    return () => {
      delete window.siWorldOpenConversationFixture;
      delete window.siWorldCloseConversationFixture;
      delete window.siWorldSetAuthoredDialogueFixture;
      delete window.siWorldOpenVfxFixture;
      delete window.siWorldSetSmokeMinute;
      delete window.siWorldSetVfxStep;
      delete window.siWorldStandOnTile;
      delete window.siWorldSetPlayerPose;
      delete window.siWorldSetPlayerVisual;
      delete window.siWorldSetPlayerFacing;
      delete window.siWorldSetSelectionVisible;
      delete window.siWorldSetNpcsVisible;
      delete window.siWorldCenterOnPlayer;
      delete window.siWorldStartNaturalMovementFixture;
      delete window.siWorldOpenRendererFeedbackFixture;
      delete window.siWorldOpenRendererMotionFixture;
      delete window.siWorldFreezeRendererParityFrame;
      delete window.siWorldSetRendererTestZoom;
    };
  }, []);

  const requestAutosave = useCallback(async (
    state: WorldState,
    trigger: 'sleep' | 'travel' | 'major_quest' | 'manual',
  ) => {
    if (rendererSuspended) return;
    if (persistenceDisabled) {
      setSaveStatus('DEV HARNESS · NO DISK SAVE');
      return;
    }
    const savePort = getSavePort();
    setSaveStatus('SAVING…');
    try {
      const result = trigger === 'manual'
        ? await savePort.requestSave({
          slotId: 'slot-001', expectedSaveGeneration: saveGeneration.current, trigger, state,
        })
        : await autosaveStableState({
          persistence: savePort,
          state,
          trigger,
          expectedSaveGeneration: saveGeneration.current,
        });
      if (result.status === 'saved') {
        saveGeneration.current = result.saveGeneration;
        setSaveStatus(`SAVED GEN ${result.saveGeneration}`);
        playInterfaceSound('save-complete');
      } else {
        setSaveStatus(`SAVE DEFERRED · ${result.blockingPauseTokens.length} BLOCK`);
      }
    } catch {
      setSaveStatus('SAVE FAILED');
    }
  }, [persistenceDisabled, playInterfaceSound, rendererSuspended]);

  useEffect(() => {
    if (rendererSuspended) return undefined;
    const timer = setInterval(() => {
      setRuntime((current) => questOfferOpen || effectiveSpeed(current.worldState.clock) === 0
        ? current
        : { ...current, worldState: tickWorld(current.worldState, 1_000) });
    }, 1_000);
    return () => clearInterval(timer);
  }, [questOfferOpen, rendererSuspended]);

  useEffect(() => {
    if (rendererSuspended || speed === 0 || transitioning || conversationNpcId || questOfferOpen || openPanel) return;
    let animationFrame = 0;
    let previousTime: number | undefined;
    const animate = (time: number) => {
      const elapsedMs = previousTime === undefined ? 0 : time - previousTime;
      previousTime = time;
      if (elapsedMs > 0) {
        setRuntime((current) => advanceMovementFrame(
          current,
          elapsedMs,
          effectiveSpeed(current.worldState.clock),
          window.siWorldFreezeNpcMotion !== true,
        ));
        // A walking hero is the only thing that can push the camera out of its dead zone, so the
        // camera clock is woken from here rather than from an effect of its own.
        if (cameraMotionRef.current.followArmed) wakeCameraClock();
      }
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [conversationNpcId, openPanel, questOfferOpen, rendererSuspended, speed, transitioning, wakeCameraClock]);

  // Arms the portal zone the player stands on. The zone stays armed while the player is on it,
  // so the travel timer below runs once instead of restarting on every world tick.
  useEffect(() => {
    const position = runtime.worldState.protagonist.worldPosition;
    const portal = portalAtTile(map, { x: position.tileX, y: position.tileY });
    const key = portal ? `${position.mapId}:${portal.id}` : undefined;
    if (arrivalLock && arrivalLock !== key) setArrivalLock(undefined);
    const ready = portal !== undefined && !rendererSuspended && canStartPortalTransition({
      arrivalLocked: arrivalLock === key,
      transitioning,
      conversationOpen: conversationNpcId !== undefined || questOfferOpen,
      panelOpen: openPanel !== undefined,
    });
    setArmedPortalId(ready ? portal?.id : undefined);
  }, [arrivalLock, conversationNpcId, map, openPanel, questOfferOpen, rendererSuspended, runtime.worldState, transitioning]);

  useEffect(() => {
    if (armedPortalId === undefined) return undefined;
    const timer = setTimeout(() => {
      const state = runtimeRef.current.worldState;
      const portal = WORLD_MAP_CATALOG[state.protagonist.worldPosition.mapId as MapId].portalById.get(armedPortalId);
      if (!portal) return;
      setTransitioning(true);
      setWorldFeedback('TRAVELLING…');
      setRuntime((current) => ({ ...current, movement: cancelMovement(current.movement) }));
      const destinationBlockers = npcBlockers(state, portal.destinationMapId);
      void transitionNeighborhood({
        state,
        catalog: WORLD_MAP_CATALOG,
        sourcePortalId: portal.id,
        loadMap: async (destinationMapId) => WORLD_MAP_CATALOG[destinationMapId],
        destinationBlockers,
        onPaused: (paused) => setRuntime((current) => ({ ...current, worldState: paused })),
      }).then((result) => {
        const tile = { x: result.state.protagonist.worldPosition.tileX, y: result.state.protagonist.worldPosition.tileY };
        setRuntime({ movement: createMovementState(tile), npcMovements: npcMovementState(result.state), worldState: result.state });
        setCamera((current) => centerCameraOnTile(tile, current.zoom, surfaceRef.current, MAP_PIXELS, clamp));
        setSelected('protagonist');
        setDestinationMarker(undefined);
        const arrivalPortal = portalAtTile(result.map, tile);
        setArrivalLock(`${result.state.protagonist.worldPosition.mapId}:${arrivalPortal?.id ?? `${tile.x},${tile.y}`}`);
        setWorldFeedback(result.completed ? (result.feedback ?? 'NEIGHBORHOOD ARRIVED') : `TRAVEL FAILED · ${result.feedback}`);
        if (result.completed) void requestAutosave(result.state, 'travel');
      }).finally(() => setTransitioning(false));
    }, PORTAL_GATE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [armedPortalId, requestAutosave]);

  const requestTile = useCallback((target: TilePoint) => {
    setSelected('protagonist');
    setWorldFeedback(undefined);
    setRendererParityPulseFrozen(false);
    setDestinationMarker({ ...target });
    setRuntime((current) => {
      const currentMap = WORLD_MAP_CATALOG[current.worldState.protagonist.worldPosition.mapId as MapId];
      return {
        ...current,
        movement: requestMovement(
          currentMap,
          current.movement,
          target,
          npcBlockers(current.worldState, currentMap.source.id),
        ),
      };
    });
  }, []);

  const handlePrimary = useCallback((point: Readonly<{ x: number; y: number }>) => {
    if (conversationNpcId || questOfferOpen || openPanel) return;
    if (!insideMap(camera, point, MAP_PIXELS)) return;
    const visibleNpc = Object.entries(npcTiles)
      .sort(([, left], [, right]) => {
        const leftScreen = project(camera, left.visualFoot ?? tileFootPoint(left.tile));
        const rightScreen = project(camera, right.visualFoot ?? tileFootPoint(right.tile));
        return Math.hypot(point.x - leftScreen.x, point.y - leftScreen.y) -
          Math.hypot(point.x - rightScreen.x, point.y - rightScreen.y);
      })
      .find(([, actor]) => {
        const foot = actor.visualFoot ?? tileFootPoint(actor.tile);
        const screen = project(camera, foot);
        return point.x >= screen.x - 12 * camera.zoom && point.x <= screen.x + 12 * camera.zoom &&
          point.y >= screen.y - 27 * camera.zoom && point.y <= screen.y + 3 * camera.zoom;
      });
    if (visibleNpc) {
      selectCharacter(visibleNpc[0]);
      setRuntime((current) => ({ ...current, movement: cancelMovement(current.movement) }));
      if (openingShowcase && OPENING_CAST_IDS.has(visibleNpc[0])) setConversationNpcId(visibleNpc[0]);
      return;
    }
    const tile = unproject(camera, point);
    if (tile.x < 0 || tile.y < 0 || tile.x >= map.source.width || tile.y >= map.source.height) return;
    const candidates = worldClickCandidates(
      map,
      Object.fromEntries(Object.entries(npcTiles).map(([id, actor]) => [id, actor.tile])),
      tile,
    );
    const resolved = resolveClickTarget(candidates);
    if (!resolved) return;
    if (resolved.kind === 'npc') {
      selectCharacter(resolved.id);
      setRuntime((current) => ({ ...current, movement: cancelMovement(current.movement) }));
      if (openingShowcase && OPENING_CAST_IDS.has(resolved.id)) setConversationNpcId(resolved.id);
      return;
    }
    if (resolved.kind === 'object') {
      const interactions = [...map.interactionById.values()].filter(({ ownerId }) => ownerId === resolved.id);
      if (interactions.length > 0) {
        const target = selectOwnerInteractionApproach(
          map,
          resolved.id,
          runtime.movement.player,
          npcBlockers(runtime.worldState, map.source.id),
        );
        if (target) requestTile(target.tile);
        else {
          setRuntime((current) => ({
            ...current,
            movement: { ...cancelMovement(current.movement), status: 'unreachable', feedbackTile: tile },
          }));
          setWorldFeedback('NO USABLE APPROACH');
        }
      } else requestTile(tile);
      return;
    }
    // Click feedback, floor branch only.
    //
    // `worldClickCandidates` ALWAYS pushes a floor candidate, so `resolved` is never undefined for
    // an in-bounds tile and reachability is decided later inside `requestMovement`. The blockedKeys
    // guard is what stops a ripple appearing on a wall, where it would be a lie. An object click is
    // excluded because a puff on a table is wrong; its approach pulse is the right answer there.
    //
    // Open ground that pathfinding cannot reach deliberately shows BOTH this mark and the failure X:
    // the click was heard on real ground, and the route is impossible. Two true statements.
    if (resolved.kind === 'floor' && resolved.tile && !map.blockedKeys.has(tileKey(resolved.tile))) {
      const ground = presentationGroundAt(map.presentation, resolved.tile, map.source.width);
      const center = { x: resolved.tile.x * TILE_SIZE + 16, y: resolved.tile.y * TILE_SIZE + 24 };
      emitTransientCue(WATER_GROUND_SPRITES.has(ground.sprite) ? 'ripple' : 'dust', center, 'strong');
    }
    if (resolved.tile) requestTile(resolved.tile);
    setOpeningShowcase(false);
  }, [camera, conversationNpcId, emitTransientCue, insideMap, map, npcTiles, openPanel, openingShowcase, project, questOfferOpen, requestTile, runtime.movement.player, runtime.worldState, selectCharacter, unproject]);

  useEffect(() => {
    if (!destinationMarker || rendererSuspended || rendererParityPulseFrozen) return;
    let animationFrame = 0;
    let startedAt: number | undefined;
    const animate = (time: number) => {
      startedAt ??= time;
      const elapsedMs = time - startedAt;
      setDestinationPulseElapsedMs(elapsedMs);
      if (elapsedMs < DESTINATION_PULSE_MS) animationFrame = requestAnimationFrame(animate);
      else setDestinationMarker((current) => current === destinationMarker ? undefined : current);
    };
    setDestinationPulseElapsedMs(0);
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [destinationMarker, rendererParityPulseFrozen, rendererSuspended]);

  const handlePan = useCallback((delta: Readonly<{ x: number; y: number }>) => {
    if (conversationNpcId || questOfferOpen || openPanel) return;
    // Panning means the player is looking at something. Follow stays off until Center says
    // otherwise; an idle timer would yank the view back out from under them.
    updateCameraMotion(suspendFollow);
    setCamera((current) => pan(current, delta, surface, MAP_PIXELS, clamp));
  }, [clamp, conversationNpcId, openPanel, pan, questOfferOpen, surface, updateCameraMotion]);
  const handleZoom = useCallback((direction: -1 | 1, anchor: Readonly<{ x: number; y: number }>) => {
    if (conversationNpcId || questOfferOpen || openPanel) return;
    setExplicitWorldZoom(true);
    setCamera((current) => zoomCameraAt(
      current,
      stepWorldZoom(current.zoom, direction),
      anchor,
      surface,
      MAP_PIXELS,
      clamp,
    ));
  }, [clamp, conversationNpcId, openPanel, questOfferOpen, surface]);
  const center = useCallback(() => {
    if (conversationNpcId || questOfferOpen || openPanel) return;
    setCamera((current) => centerCameraOnWorld(runtime.movement.visualFoot, current.zoom, surface, MAP_PIXELS, clamp));
    updateCameraMotion(armFollow);
  }, [clamp, conversationNpcId, openPanel, questOfferOpen, runtime.movement.visualFoot, surface, updateCameraMotion]);
  const changeWorldZoom = useCallback((direction: -1 | 1) => {
    setExplicitWorldZoom(true);
    setCamera((current) => zoomCameraAt(
      current,
      stepWorldZoom(current.zoom, direction),
      { x: surface.width / 2, y: surface.height / 2 },
      surface,
      MAP_PIXELS,
      clamp,
    ));
  }, [clamp, surface]);
  const selectUiScale = useCallback((scale: UiScale) => {
    setExplicitUiScale(true);
    setUiScale(scale);
  }, []);
  const cameraDirector = useMemo<CameraDirector>(() => ({
    play: (shots) => updateCameraMotion((motion) => playShots(motion, shots)),
    push: (shot) => updateCameraMotion((motion) => pushShot(motion, shot)),
    impulse: (trauma, direction) => updateCameraMotion((motion) => applyImpulse(motion, trauma, direction)),
    cancel: () => updateCameraMotion(cancelShots),
    isPlaying: () => cameraMotionRef.current.shots.length > 0,
  }), [updateCameraMotion]);
  useEffect(() => {
    onCameraDirector?.(cameraDirector);
    if (typeof window === 'undefined' || window.siWorldSmokeMode !== true) return undefined;
    window.siWorldCameraDirector = cameraDirector;
    return () => {
      delete window.siWorldCameraDirector;
    };
  }, [cameraDirector, onCameraDirector]);
  const isPointInteractive = useCallback(
    (point: Readonly<{ x: number; y: number }>) => insideMap(camera, point, MAP_PIXELS),
    [camera, insideMap],
  );
  const cancel = useCallback(() => {
    if (questOfferOpen) {
      setAuthoredDialogueFixtureId(undefined);
      setQuestOfferOpen(false);
      setWorldFeedback(authoredDialogueFixtureId
        ? 'MARCUS CONVERSATION ENDED · LINDA QUEST NOT ACCEPTED'
        : 'LINDA QUEST NOT ACCEPTED · TALK TO HER AGAIN ANY TIME');
      playInterfaceSound('panel-close');
      return;
    }
    if (openPanel) {
      setOpenPanel(undefined);
      playInterfaceSound('panel-close');
      return;
    }
    if (conversationNpcId) return;
    playInterfaceSound('cancel');
    setRuntime((current) => ({ ...current, movement: cancelMovement(current.movement) }));
  }, [authoredDialogueFixtureId, conversationNpcId, openPanel, playInterfaceSound, questOfferOpen]);
  const toggleQuests = useCallback(() => {
    if (conversationNpcId || questOfferOpen) return;
    playInterfaceSound(openPanel === 'journal' ? 'panel-close' : 'panel-open');
    setOpenPanel((current) => current === 'journal' ? undefined : 'journal');
  }, [conversationNpcId, openPanel, playInterfaceSound, questOfferOpen]);
  const changeSpeed = useCallback((nextSpeed: 0 | 1 | 2) => {
    setRuntime((current) => ({ ...current, worldState: setWorldSpeed(current.worldState, nextSpeed) }));
  }, []);
  // Dev tool. The jump, the pause and both feedback writes stay OUTSIDE the setRuntime updater:
  // updaters must be pure, and React can call them twice.
  const jumpToAbsoluteMinute = useCallback((toMinute: number) => {
    const from = runtime.worldState.clock.absoluteMinute;
    if (transitioning || runtime.worldState.clock.pauseTokens.length > 0) return;
    try {
      const jumped = jumpWorldToMinute(runtime.worldState, toMinute);
      // Pause, or the next tick moves the clock off the preset and the capture is not repeatable.
      const next = jumped.clock.selectedSpeed === 0 ? jumped : setWorldSpeed(jumped, 0);
      setRuntime((current) => ({
        movement: cancelMovement(current.movement),
        npcMovements: npcMovementState(next),
        worldState: next,
      }));
      const wrapsDay = Math.floor(toMinute / 1_440) !== Math.floor(from / 1_440);
      setWorldFeedback(wrapsDay ? 'TIME JUMPED · NEXT DAY · WORLD ADVANCED' : 'TIME JUMPED');
    } catch (error) {
      setWorldFeedback(`TIME JUMP FAILED · ${(error instanceof Error ? error.message : String(error)).toUpperCase()}`);
    }
  }, [runtime.worldState, transitioning]);
  const jumpToMinuteOfDay = useCallback((minuteOfDay: number) => {
    jumpToAbsoluteMinute(nextMinuteOfDay(runtime.worldState.clock.absoluteMinute, minuteOfDay));
  }, [jumpToAbsoluteMinute, runtime.worldState.clock.absoluteMinute]);
  const jumpForwardHour = useCallback(() => {
    jumpToAbsoluteMinute(runtime.worldState.clock.absoluteMinute + 60);
  }, [jumpToAbsoluteMinute, runtime.worldState.clock.absoluteMinute]);
  const sleep = useCallback((mode: 'nap' | 'overnight') => {
    setRuntime((current) => {
      const next = sleepWorld(current.worldState, mode);
      return {
        movement: cancelMovement(current.movement),
        npcMovements: npcMovementState(next),
        worldState: next,
      };
    });
  }, []);
  const applyConversationPause = useCallback((state: WorldState) => {
    setRuntime((current) => ({
      ...current,
      movement: cancelMovement(current.movement),
      worldState: state,
    }));
  }, []);
  const applyConversationStableState = useCallback((state: WorldState, committed: boolean) => {
    const sound = committed
      ? relationshipSound(runtime.worldState.relationships, state.relationships)
      : undefined;
    if (sound) playInterfaceSound(sound);
    setRuntime((current) => ({
      movement: cancelMovement(current.movement),
      npcMovements: npcMovementState(state),
      worldState: state,
    }));
    setWorldFeedback(committed ? 'CONVERSATION SAVED' : 'CONVERSATION CANCELLED');
    if (committed) void requestAutosave(state, 'manual');
  }, [playInterfaceSound, requestAutosave, runtime.worldState.relationships]);
  const purchaseSecurityReport = useCallback(() => {
    if (conversationNpcId) return;
    try {
      const result = reduceCommand(runtime.worldState, DomainCommandSchema.parse({
        type: 'purchase-social-option',
        commandId: `command-security-report-r${runtime.worldState.revision}`,
        eventId: `event-security-report-r${runtime.worldState.revision}`,
        scheduledMinute: runtime.worldState.clock.absoluteMinute,
        priority: 50,
        offerId: 'security_report',
      }));
      setRuntime((current) => ({ ...current, worldState: result.state }));
      setWorldFeedback(result.event?.type === 'social-option-purchased' && result.event.changed
        ? 'SECURITY REPORT PURCHASED · QUEST ADVANTAGE READY'
        : 'SECURITY REPORT ALREADY OWNED');
      void requestAutosave(result.state, 'manual');
    } catch {
      setWorldFeedback('SECURITY REPORT PURCHASE FAILED');
    }
  }, [conversationNpcId, requestAutosave, runtime.worldState]);
  const runQuestAction = useCallback((actionId: ContextQuestAction['id']) => {
    if (conversationNpcId || openPanel === 'relationships') return;
    try {
      const stableActionId = actionId.replaceAll('_', '-');
      if (actionId in VERBAL_MISSION_DISCOVERY_FACTS) {
        const record = verbalMissionDiscoveryRecord(runtime.worldState, actionId);
        const result = reduceCommand(runtime.worldState, DomainCommandSchema.parse({
          type: 'record-player-knowledge',
          commandId: `command-discover-${stableActionId}-r${runtime.worldState.revision}`,
          eventId: `event-discover-${stableActionId}-r${runtime.worldState.revision}`,
          scheduledMinute: runtime.worldState.clock.absoluteMinute,
          priority: 70,
          record,
        }));
        setRuntime((current) => ({ ...current, worldState: result.state }));
        setWorldFeedback(`${record.factId.replaceAll('_', ' ').toUpperCase()} · RECORDED`);
        void requestAutosave(result.state, 'manual');
        return;
      }
      const base = {
        commandId: `command-linda-quest-${stableActionId}-r${runtime.worldState.revision}`,
        eventId: `event-linda-quest-${stableActionId}-r${runtime.worldState.revision}`,
        scheduledMinute: runtime.worldState.clock.absoluteMinute,
        priority: 75,
      };
      const candidate = actionId === 'start'
        ? { ...base, type: 'start-linda-quest' as const, requestNpcId: 'linda' }
        : actionId === 'discover'
          ? { ...base, type: 'discover-linda-villa' as const }
          : { ...base, type: 'resolve-linda-quest' as const, approachId: actionId };
      const result = reduceCommand(runtime.worldState, DomainCommandSchema.parse(candidate));
      const sound = relationshipSound(runtime.worldState.relationships, result.state.relationships);
      if (sound) playInterfaceSound(sound);
      setRuntime((current) => ({
        movement: cancelMovement(current.movement),
        npcMovements: npcMovementState(result.state),
        worldState: result.state,
      }));
      if (result.event?.type === 'linda-quest-started') {
        setQuestOfferOpen(false);
        setWorldFeedback('LINDA QUEST STARTED · VAGUE LEAD ADDED');
      } else if (result.event?.type === 'linda-villa-discovered') {
        setWorldFeedback('LINDA VILLA CONFIRMED · THREE CHOICES READY');
      } else if (result.event?.type === 'linda-quest-resolved') {
        setWorldFeedback(`${result.event.resultId.replaceAll('_', ' ').toUpperCase()} · CONSEQUENCES SAVED`);
        triggerVocalCue('consequence');
      }
      void requestAutosave(
        result.state,
        result.event?.type === 'linda-quest-resolved' ? 'major_quest' : 'manual',
      );
    } catch (error) {
      setWorldFeedback(error instanceof Error ? `QUEST BLOCKED · ${error.message.toUpperCase()}` : 'QUEST ACTION FAILED');
    }
  }, [conversationNpcId, openPanel, playInterfaceSound, requestAutosave, runtime.worldState, triggerVocalCue]);
  const advancePoliceHook = useCallback(() => {
    const hook = runtime.worldState.policeAttention === 'noticed'
      ? 'officer_contact'
      : runtime.worldState.policeAttention === 'questioned'
        ? 'ignored_summons'
        : runtime.worldState.policeAttention === 'wanted'
          ? 'wanted_encounter'
          : undefined;
    const evidence = Object.values(runtime.worldState.evidence).find((record) => (
      record.witnessNpcIds.length > 0 && ['noticed', 'linked'].includes(record.status)
    ));
    if (!hook || !evidence) {
      setWorldFeedback('POLICE HOOK BLOCKED · NO MATCHING WITNESSED EVIDENCE');
      return;
    }
    try {
      const stableHook = hook.replaceAll('_', '-');
      const result = reduceCommand(runtime.worldState, DomainCommandSchema.parse({
        type: 'advance-police-attention',
        commandId: `command-police-${stableHook}-r${runtime.worldState.revision}`,
        eventId: `event-police-${stableHook}-r${runtime.worldState.revision}`,
        scheduledMinute: runtime.worldState.clock.absoluteMinute,
        priority: 75,
        evidenceId: evidence.id,
        hook,
      }));
      setRuntime((current) => ({ ...current, worldState: result.state }));
      setWorldFeedback(`POLICE ATTENTION · ${result.state.policeAttention.replaceAll('-', ' ').toUpperCase()}`);
      void requestAutosave(result.state, 'manual');
    } catch (error) {
      setWorldFeedback(error instanceof Error ? `POLICE HOOK FAILED · ${error.message.toUpperCase()}` : 'POLICE HOOK FAILED');
    }
  }, [requestAutosave, runtime.worldState]);

  useEffect(() => {
    const event = runtime.worldState.eventLedger.at(-1);
    if (!event || event.type !== 'sleep-completed' || handledSleepEventId.current === event.eventId) return;
    handledSleepEventId.current = event.eventId;
    setWorldFeedback(sleepCompletionFeedback(event));
    if (event.mode === 'overnight') void requestAutosave(runtime.worldState, 'sleep');
  }, [requestAutosave, runtime.worldState]);

  /**
   * Everything drawn on screen uses this; everything persisted, hit-tested or reported as camera
   * evidence uses `camera`. Keeping the impact offset out of `camera` is what stops a shake from
   * firing the debounced preference write ten times a second and saving a shaken position.
   */
  const renderCamera = useMemo(
    () => cameraMotionView.offset.x === 0 && cameraMotionView.offset.y === 0
      ? camera
      : clamp({
        ...camera,
        x: camera.x + cameraMotionView.offset.x,
        y: camera.y + cameraMotionView.offset.y,
      }, surface, MAP_PIXELS),
    [camera, cameraMotionView.offset, clamp, surface],
  );
  /**
   * Sampled here rather than in the animation loop so the palette comes from the same lighting the
   * frame is composed against. `transientStep` is the dependency that makes a live cue rebuild the
   * frame at 20 Hz; an idle queue costs nothing because the loop is not running.
   */
  const transientFrame = useMemo(() => {
    // Expire FIRST, before any early return. Bailing out without pruning would leave a stale cue in
    // the ref for ever, which keeps `transientLive` true and spins the animation loop at 60 Hz with
    // nothing to draw.
    const nowMs = transientClock.current.ageMilliseconds;
    transientCues.current = expireTransientCues(transientCues.current, nowMs);
    if (!transientVfxEnabled || rendererParityPulseFrozen) return EMPTY_TRANSIENT_VFX_FRAME;
    if (transientCues.current.length === 0) return EMPTY_TRANSIENT_VFX_FRAME;
    return sampleTransientVfx(
      transientCues.current,
      nowMs,
      reducedMotion,
      transientVfxPalette(districtLighting(mapId, runtime.worldState.clock.absoluteMinute)),
    );
    // `transientStep` is a deliberate dependency: it is the clock tick that drives resampling.
  }, [mapId, reducedMotion, rendererParityPulseFrozen, runtime.worldState.clock.absoluteMinute, transientStep, transientVfxEnabled]);

  // Stops the animation loop once the last cue has expired. Without this the loop would keep
  // running at 60 Hz after the final puff faded.
  useEffect(() => {
    if (transientCues.current.length === 0) setTransientLive(false);
  }, [transientFrame]);

  const playerVisualFoot = snapWorldPoint(runtime.movement.visualFoot, camera.zoom, dpr);
  const selectedFoot = !selectionFixtureVisible ? { x: -100_000, y: -100_000 } : selected === 'protagonist'
    ? playerVisualFoot
    : npcTiles[selected]?.visualFoot ?? tileFootPoint(npcTiles[selected]?.tile ?? runtime.movement.player);
  const worldFrame = useMemo(
    () => buildWorldFrameState(map, runtime.worldState, npcTiles, renderer2_5d
      ? tiltedFacing(runtime.movement.direction, runtime.movement)
      : runtime.movement.direction, 0, {
      visualFoot: playerVisualFoot,
      visualId: playerVisualFixture,
      walkFrame: runtime.movement.walkFrame,
      moving: runtime.movement.segment !== undefined,
      reducedMotion,
      horizontalRunDistance: runtime.movement.horizontalRunDistance,
      pose: playerPoseFixture
        ?? (selected === 'protagonist' ? (reactionId === 'protagonist' ? 'reaction' : 'idle') : 'idle'),
      poseFrame: selected === 'protagonist' ? poseFrame : 0,
      travelDistance: runtime.movement.travelDistance,
      turnCurve: runtime.movement.latchedTurnCurve,
      stopProgress: gaitStopProgress(runtime.movement),
    }, {
      // The 2.5D path asks for a bigger window AND a shifted origin: `renderCamera.x/y` is the
      // world point at screen (0,0), which under rotation is not the north-west corner of the
      // visible ground, and `world-frame.ts` only ever extends forward from the camera it is given.
      camera: renderer2_5d
        ? { ...renderCamera, ...inflatedFrameOrigin(renderCamera, surface) }
        : renderCamera,
      viewport: renderer2_5d ? inflatedViewport(surface, renderCamera.zoom) : surface,
      devicePixelRatio: dpr,
      artMode,
      movements: [runtime.movement, ...Object.values(runtime.npcMovements)],
      selectedFoot,
      destinationMarker,
      destinationPulseElapsedMs: rendererParityPulseFrozen ? 420 : destinationPulseElapsedMs,
      failureTile: runtime.movement.feedbackTile,
      reducedMotion,
      animationTimestampMilliseconds: rendererParityPulseFrozen ? 0 : vfxClock.current.ageMilliseconds,
      vfxAgeStep: rendererParityPulseFrozen ? 0 : vfxAgeStep,
      vfxMode,
      transientEffects: transientFrame.rects,
      transientGlows: transientFrame.glows,
    }),
    [artMode, renderCamera, destinationMarker, destinationPulseElapsedMs, dpr, map, npcTiles, playerPoseFixture, playerVisualFixture, playerVisualFoot, poseFrame, reactionId, reducedMotion, renderer2_5d, rendererParityPulseFrozen, runtime.movement, runtime.npcMovements, runtime.worldState, selected, selectedFoot, surface, transientFrame, vfxAgeStep, vfxMode],
  );
  const propById = new Map(worldFrame.props.map((prop) => [prop.id, prop]));
  const characterById = new Map(worldFrame.characters.map((character) => [character.id, character]));
  const groundedVisuals = worldFrame.groundedOrder.flatMap((entry: WorldGroundedEntry): GroundedVisual[] => {
    const placement = entry.kind === 'prop' ? propById.get(entry.id) : characterById.get(entry.id);
    return placement ? [{ ...entry, placement }] : [];
  });
  const groundBatches = groundedBatches(groundedVisuals);
  const vfxCamera = useMemo(() => ({
    x: renderCamera.x,
    y: renderCamera.y,
    zoom: renderCamera.zoom,
    dpr,
  }), [renderCamera.x, renderCamera.y, renderCamera.zoom, dpr]);
  const drawCounts = worldFrame.drawCounts;
  const staticBatchCount = 1 + (worldFrame.groundDetails.length > 0 ? 1 : 0);
  const responsiveEvidenceInput = useRef({
    camera,
    mapId,
    artMode,
    presentationHash: map.presentation.hash,
    roofGroupId: worldFrame.hiddenRoofGroupId,
    uiScale,
    drawCounts,
    staticBatchCount,
  });
  responsiveEvidenceInput.current = {
    camera,
    mapId,
    artMode,
    presentationHash: map.presentation.hash,
    roofGroupId: worldFrame.hiddenRoofGroupId,
    uiScale,
    drawCounts,
    staticBatchCount,
  };
  const vfxEvidence = useMemo(() => {
    if (!smokeMode) return '';
    const primitiveCount = (kind: typeof VFX_KINDS[number]) => vfxMode === 'procedural'
      ? worldFrame.effects.filter((geometry) => geometry.kind === kind).reduce((total, geometry) => total + geometry.rects.length, 0) +
        worldFrame.fallbackEffects.filter((effect) => effect.kind === kind).length
      : worldFrame.fallbackEffects.filter((effect) => effect.kind === kind).length;
    const primitiveCounts = Object.fromEntries(VFX_KINDS.map((kind) => [kind, primitiveCount(kind)])) as Record<typeof VFX_KINDS[number], number>;
    const transientRects = worldFrame.transientEffects ?? [];
    return JSON.stringify(parseVfxEvidence({
      schemaVersion: 2,
      mode: vfxMode,
      mapId,
      vfxRevision: VFX_REVISION,
      ageStep: vfxAgeStep,
      reducedMotion,
      visibleEmitterIds: worldFrame.visibleEffectIds,
      culledEmitterIds: worldFrame.culledEffectIds,
      fallbackEmitterIds: worldFrame.fallbackEmitterIds,
      primitiveCounts: {
        ...primitiveCounts,
        total: Object.values(primitiveCounts).reduce((total, count) => total + count, 0),
      },
      renderNodeCount: vfxMode === 'procedural'
        ? PROCEDURAL_VFX_RENDER_NODE_COUNT + worldFrame.fallbackEffects.length
        : worldFrame.fallbackEffects.length,
      updateRateHz: vfxMode === 'procedural' && !reducedMotion ? 1_000 / VFX_STEP_MILLISECONDS : 0,
      transient: {
        revision: TRANSIENT_VFX_REVISION,
        enabled: transientVfxEnabled,
        activeCueIds: transientFrame.activeCueIds,
        liveRects: transientFrame.liveRects,
        groundRects: transientRects.filter(({ layer }) => layer === 'ground').length,
        aerialRects: transientRects.filter(({ layer }) => layer === 'aerial').length,
        glows: (worldFrame.transientGlows ?? []).length,
        droppedCues: transientDropped.current,
        updateRateHz: transientVfxEnabled ? 1_000 / TRANSIENT_VFX_STEP_MILLISECONDS : 0,
      },
    }));
  }, [mapId, reducedMotion, smokeMode, transientFrame, transientVfxEnabled, vfxAgeStep, vfxMode, worldFrame]);
  const smokeGeometry = useMemo(
    () => smokeMode && map.source.id === 'northwest_residential' ? buildSmokeGeometryEvidence(map) : undefined,
    [map, smokeMode],
  );
  const rendererParityEvidence = useMemo(() => smokeMode ? JSON.stringify({
    mapId: worldFrame.mapId,
    mapHash: worldFrame.mapHash,
    presentationHash: worldFrame.presentationHash,
    atlasHash: worldFrame.atlasHash,
    camera: worldFrame.camera,
    viewport: worldFrame.viewport,
    devicePixelRatio: worldFrame.devicePixelRatio,
    hiddenRoofGroupId: worldFrame.hiddenRoofGroupId ?? null,
    characters: worldFrame.characters.filter(({ id }) => ['protagonist', 'linda', 'generic_resident'].includes(id)),
    doors: worldFrame.doors,
    doorPhases,
    movement: {
      direction: runtime.movement.direction,
      status: runtime.movement.status,
      walkFrame: runtime.movement.walkFrame,
      visualFoot: runtime.movement.visualFoot,
    },
    selectionRing: worldFrame.selectionRing,
    destinationPulse: worldFrame.destinationPulse ?? null,
    journalMarkers: worldFrame.journalMarkers,
    failureMarker: worldFrame.failureMarker ?? null,
    visibleEffectIds: worldFrame.visibleEffectIds,
    fallbackEmitterIds: worldFrame.fallbackEmitterIds,
    // Stage 3 amendment 2026-08-15: proves which effects the fallback-circle batch actually draws.
    fallbackEffectIds: worldFrame.fallbackEffects
      .map(({ id }) => id)
      .sort((left, right) => left.localeCompare(right, 'en')),
  }) : '', [doorPhases, runtime.movement, smokeMode, worldFrame]);
  const selectedScreen = project(renderCamera, {
    x: worldFrame.selectionRing.worldX,
    y: worldFrame.selectionRing.worldY,
  });
  const selectedName = selected === 'protagonist'
    ? runtime.worldState.protagonist.displayName
    : npcLabel(selected, npcTiles);
  const selectedSubtitle = selected === 'protagonist'
    ? 'YOU'
    : runtime.worldState.relationships[selected]?.stage.replaceAll('_', ' ') ?? 'RESIDENT';
  const selectedSummary = selectedCharacterSummary(
    runtime.worldState,
    selected,
    selected === 'protagonist'
      ? runtime.movement.status === 'moving'
      : runtime.npcMovements[selected]?.status === 'moving',
  );
  /**
   * Only the 2.5D path. The 2D renderer draws all three of these as composite batches of its own;
   * `three25` draws world geometry and never reads these frame fields, so without this overlay a
   * journal entry reads `PINNED` with no pin on the map, a click shows no pulse and a rejected
   * click shows no X. Projected here so `WorldMarkers` never learns which renderer is mounted.
   * Radii are world pixels in the frame, hence the zoom.
   *
   * The selection ring is NOT one of them: it composites under characters, which an overlay cannot
   * do, so `three25` bakes it into its own ground batch.
   */
  const markerVisuals = useMemo((): WorldMarkerVisuals | undefined => {
    if (!renderer2_5d) return undefined;
    const { zoom } = renderCamera;
    const pulse = worldFrame.destinationPulse;
    const pulseScreen = pulse ? project(renderCamera, { x: pulse.worldX, y: pulse.worldY }) : undefined;
    const failureMarker = worldFrame.failureMarker;
    const failureScreen = failureMarker
      ? project(renderCamera, { x: failureMarker.worldX, y: failureMarker.worldY })
      : undefined;
    return {
      destinationPulse: pulse && pulseScreen
        ? {
          color: pulse.color,
          opacity: pulse.opacity,
          radiusX: pulse.radius * zoom,
          radiusY: pulse.radius * zoom * GROUND_Z_SCALE,
          x: pulseScreen.x,
          y: pulseScreen.y,
        }
        : undefined,
      // `radiusPixels` is already screen pixels: the 2D path divides it by zoom so the camera
      // multiplies it straight back out, which is what keeps the X the same size at every zoom.
      failure: failureMarker && failureScreen
        ? { color: failureMarker.color, radius: failureMarker.radiusPixels, x: failureScreen.x, y: failureScreen.y }
        : undefined,
      journalPins: worldFrame.journalMarkers.map((marker) => {
        const foot = project(renderCamera, {
          x: marker.tile.x * TILE_SIZE + 16,
          y: marker.tile.y * TILE_SIZE + 29,
        });
        return {
          darkColor: marker.darkColor,
          key: `${marker.tile.x},${marker.tile.y}`,
          lightColor: marker.lightColor,
          x: foot.x,
          y: foot.y,
        };
      }),
    };
  }, [project, renderCamera, renderer2_5d, worldFrame]);
  const portalZones = useMemo(() => map.source.portals.map((portal) => ({
    id: portal.id,
    label: WORLD_MAP_CATALOG[portal.destinationMapId as MapId]?.source.displayName ?? portal.destinationMapId,
    tiles: portalZoneTiles(map, portal),
  })), [map]);
  const zoneGates = portalZones.map((zone) => {
    const top = Math.min(...zone.tiles.map(({ y }) => y));
    const centerX = (Math.min(...zone.tiles.map(({ x }) => x)) + Math.max(...zone.tiles.map(({ x }) => x)) + 1) / 2;
    const anchor = project(renderCamera, { x: centerX * TILE_SIZE, y: top * TILE_SIZE });
    return {
      id: zone.id,
      label: zone.label,
      armed: armedPortalId === zone.id,
      // A tile is an axis-aligned square on the 2D path, so its north-west corner IS its top-left
      // on screen. Under the tilted camera it projects to a diamond, so the pad is positioned from
      // the tile CENTRE and sheared into that diamond by `cellTransform` below. Painting the square
      // at the projected corner left the pad off the tile it marks and the wrong shape.
      cells: zone.tiles.map((tile) => {
        const screen = renderer2_5d
          ? project(renderCamera, { x: tile.x * TILE_SIZE + TILE_SIZE / 2, y: tile.y * TILE_SIZE + TILE_SIZE / 2 })
          : project(renderCamera, { x: tile.x * TILE_SIZE, y: tile.y * TILE_SIZE });
        const offset = renderer2_5d ? (TILE_SIZE * renderCamera.zoom) / 2 : 0;
        return { key: `${tile.x},${tile.y}`, left: screen.x - offset, top: screen.y - offset };
      }),
      labelX: anchor.x,
      labelY: anchor.y - 30,
    };
  });
  const currentAreaName = areaName(map, runtime.movement.player);
  const inBedroom = mapId === 'northwest_residential' && currentAreaName === 'BEDROOM';
  const lighting = worldFrame.lighting;
  const shelterCells = worldFrame.shelterCells;

  useEffect(() => {
    if (!smokeMode || typeof document === 'undefined') return undefined;
    window.siWorldMeasureResponsiveEvidence = () => {
      const evidence = measureResponsiveEvidence(document, responsiveEvidenceInput.current);
      if (evidence) setResponsiveEvidence(JSON.stringify(evidence));
      return evidence;
    };
    window.siWorldMeasureResponsiveEvidence();
    return () => {
      delete window.siWorldMeasureResponsiveEvidence;
    };
  }, [smokeMode]);

  const handleRendererContextState = useCallback((state: 'lost' | 'restored' | 'timed-out') => {
    setRendererContextState(state === 'restored' ? 'ready' : state);
  }, []);

  return (
    <WorldInput
      disabled={rendererSuspended}
      isPointInteractive={isPointInteractive}
      onCancel={cancel}
      onCenter={center}
      onPan={handlePan}
      onPrimary={handlePrimary}
      onQuests={toggleQuests}
      onZoom={handleZoom}
    >
      <View
        accessibilityLabel={`${map.source.displayName}; tile ${runtime.movement.player.x},${runtime.movement.player.y}; minute ${runtime.worldState.clock.absoluteMinute}; speed ${runtime.worldState.clock.selectedSpeed}; world zoom ${worldZoomPercentage(camera.zoom)} percent; interface ${Math.round(uiScale * 100)} percent`}
        nativeID="world-state"
        style={[styles.frame, surface]}
      >
        <View nativeID="world-input-viewport" style={[styles.viewport, surface]}>
          <View nativeID="world-canvas" style={[styles.canvasHost, surface]}>
            <ThreeWorldSurface
              camera={renderCamera}
              frame={worldFrame}
              onContextStateChange={handleRendererContextState}
              onReady={onWorldReady}
              surface={surface}
            />
            <ZoneGateOverlay
              accent={lighting.accent}
              cellTransform={renderer2_5d ? GROUND_TILE_TRANSFORM : undefined}
              gates={zoneGates}
              size={TILE_SIZE * camera.zoom}
              viewport={surface}
            />
            {markerVisuals ? <WorldMarkerOverlay markers={markerVisuals} zoom={camera.zoom} /> : null}
            <SelectionMarker
              color={lighting.accent}
              label={selected === 'protagonist' ? undefined : selectedName}
              subtitle={selected === 'protagonist' ? undefined : selectedSubtitle}
              viewportWidth={surface.width}
              x={selectedScreen.x}
              y={selectedScreen.y}
              zoom={camera.zoom}
            />
          </View>
        </View>
        <View
          accessibilityLabel={`Art mode ${artMode}; presentation ${map.presentation.hash}`}
          nativeID="world-art-presentation"
          pointerEvents="none"
          style={styles.proofState}
        />
        <View
          accessibilityLabel={worldFrame.hiddenRoofGroupId ? 'Villa roof hidden' : 'Villa roof restored'}
          nativeID="world-roof-state"
          pointerEvents="none"
          style={styles.proofState}
        />
        <View
          accessibilityLabel={responsiveEvidence}
          nativeID="world-responsive-state"
          pointerEvents="none"
          style={styles.proofState}
        />
        <View
          accessibilityLabel={`Surface prop ${surface.width}x${surface.height}`}
          nativeID="world-surface-state"
          pointerEvents="none"
          style={styles.proofState}
        />
        <View
          accessibilityLabel={vfxEvidence}
          nativeID="world-vfx-state"
          pointerEvents="none"
          style={styles.proofState}
        />
        {smokeGeometry ? (
          <View
            accessibilityLabel={JSON.stringify(smokeGeometry)}
            nativeID="world-geometry-state"
            pointerEvents="none"
            style={styles.proofState}
          />
        ) : null}
        <View
          accessibilityLabel={`World camera ${camera.x},${camera.y} at ${camera.zoom}x`}
          nativeID="world-camera-state"
          pointerEvents="none"
          style={styles.proofState}
        />
        <View
          accessibilityLabel={cameraMotionView.label}
          nativeID="world-camera-motion-state"
          pointerEvents="none"
          style={styles.proofState}
        />
        <View
          accessibilityLabel={`Linda ${npcTiles.linda?.tile.x ?? -1},${npcTiles.linda?.tile.y ?? -1}; Resident ${npcTiles.generic_resident?.tile.x ?? -1},${npcTiles.generic_resident?.tile.y ?? -1}; NPC count ${Object.keys(npcTiles).length}`}
          nativeID="world-npc-state"
          pointerEvents="none"
          style={styles.proofState}
        />
        {typeof window !== 'undefined' && window.siWorldSmokeMode === true ? (
          <View
            accessibilityLabel={JSON.stringify({
              reducedMotion,
              player: {
                committed: runtime.movement.player,
                visualFoot: runtime.movement.visualFoot,
                direction: runtime.movement.direction,
                walkFrame: runtime.movement.walkFrame,
                status: runtime.movement.status,
                target: runtime.movement.pendingTarget ?? runtime.movement.target ?? null,
                curveActive: Boolean(runtime.movement.latchedTurnCurve),
                horizontalRunDistance: runtime.movement.horizontalRunDistance,
                protagonistWobbleDegrees: protagonistWobbleDegrees({
                  direction: runtime.movement.direction,
                  status: runtime.movement.status,
                  horizontalRunDistance: runtime.movement.horizontalRunDistance,
                  reducedMotion,
                }),
                // Read off the built frame, never recomputed, so the evidence is the screen truth.
                // Null means the actor was culled from this frame and nothing was drawn for it.
                gaitBobPixels: characterById.get('protagonist')?.gaitBobPixels ?? null,
                renderedAngleDegrees: characterById.get('protagonist')?.angleDegrees ?? null,
                footPlantIndex: actorFootPlant('protagonist', runtime.movement)?.index ?? null,
              },
              npcs: Object.fromEntries(Object.entries(runtime.npcMovements).map(([id, movement]) => [id, {
                committed: movement.player,
                visualFoot: movement.visualFoot,
                direction: movement.direction,
                walkFrame: movement.walkFrame,
                status: movement.status,
                curveActive: Boolean(movement.latchedTurnCurve),
                horizontalRunDistance: movement.horizontalRunDistance,
                wobbleDegrees: protagonistWobbleDegrees({
                  direction: movement.direction,
                  status: movement.status,
                  horizontalRunDistance: movement.horizontalRunDistance,
                  reducedMotion,
                }),
                gaitBobPixels: characterById.get(id)?.gaitBobPixels ?? null,
                renderedAngleDegrees: characterById.get(id)?.angleDegrees ?? null,
                footPlantIndex: actorFootPlant(id, movement)?.index ?? null,
              }])),
            })}
            nativeID="world-movement-state"
            pointerEvents="none"
            style={styles.proofState}
          />
        ) : null}
        {smokeMode ? (
          <View
            accessibilityLabel={rendererParityEvidence}
            nativeID="world-renderer-parity-state"
            pointerEvents="none"
            style={styles.proofState}
          />
        ) : null}
        <View
          accessibilityLabel={`Linda quest ${runtime.worldState.quests.linda_boyfriend_check?.status ?? 'missing'}; flags ${(runtime.worldState.quests.linda_boyfriend_check?.flagIds ?? []).join(',') || 'none'}; police ${runtime.worldState.policeAttention}; evidence ${Object.keys(runtime.worldState.evidence).length}`}
          nativeID="world-quest-state"
          pointerEvents="none"
          style={styles.proofState}
        />
        <View
          accessibilityLabel={`Protagonist ${runtime.worldState.protagonist.id}; name ${runtime.worldState.protagonist.displayName}; allowance ${runtime.worldState.economy.weeklyAllowance}; money ${runtime.worldState.inventory.money}`}
          nativeID="world-protagonist-state"
          pointerEvents="none"
          style={styles.proofState}
        />
        <View nativeID="world-ui-location" pointerEvents="none" style={styles.proofState}>
          <Text>{`${map.source.displayName} TILE ${runtime.movement.player.x},${runtime.movement.player.y}`}</Text>
        </View>
        <Hud
          accent={lighting.accent}
          areaName={currentAreaName}
          availableWidth={surface.width}
          collapsed={hudCollapsed}
          devMode={devMode}
          hidden={questOfferOpen}
          jumpDisabled={transitioning || runtime.worldState.clock.pauseTokens.length > 0}
          mapName={map.source.displayName}
          onCollapsed={() => setHudCollapsed((value) => !value)}
          onDevMode={() => setDevMode((open) => !open)}
          onJournal={toggleQuests}
          onJumpForwardHour={jumpForwardHour}
          onJumpToMinute={jumpToMinuteOfDay}
          onMusicVolume={(value) => setAudioVolumes({ music: value })}
          onPressSound={() => playInterfaceSound('press')}
          onSave={() => void requestAutosave(runtime.worldState, 'manual')}
          onSocial={() => { playInterfaceSound('panel-open'); setOpenPanel('relationships'); }}
          onSfxVolume={(value) => setAudioVolumes({ sfx: value })}
          onSpeed={changeSpeed}
          onUiScale={selectUiScale}
          onZoom={changeWorldZoom}
          saveStatus={saveStatus}
          saveDisabled={transitioning || runtime.movement.status === 'moving' || runtime.worldState.clock.pauseTokens.length > 0}
          musicVolume={volumes.music}
          sfxVolume={volumes.sfx}
          state={runtime.worldState}
          uiScale={uiScale}
          zoom={camera.zoom}
          zoomInDisabled={camera.zoom >= MAX_WORLD_ZOOM}
          zoomOutDisabled={camera.zoom <= MIN_WORLD_ZOOM}
        />
        {!questOfferOpen ? <SelectedCharacterCard
          accent={lighting.accent}
          availableWidth={surface.width}
          compact={selected === 'protagonist' && reactionId !== 'protagonist'}
          onCenter={() => {
            setCamera((current) => centerCameraOnWorld(selectedFoot, current.zoom, surface, MAP_PIXELS, clamp));
            updateCameraMotion(selected === 'protagonist' ? armFollow : suspendFollow);
          }}
          onTalk={selectedNpcId && !conversationNpcId && !questOfferOpen && !openPanel
            ? () => {
              if (selectedNpcId === 'linda' && lindaOfferReady) {
                setRuntime((current) => ({ ...current, movement: cancelMovement(current.movement) }));
                setQuestOfferOpen(true);
                playInterfaceSound('panel-open');
              } else if (selectedNpcId === 'linda' && lindaOfferAction?.disabledReason) {
                setWorldFeedback(lindaOfferAction.disabledReason.toUpperCase());
              } else setConversationNpcId(selectedNpcId);
            }
            : undefined}
          summary={selectedSummary}
          pose={reactionId === selected ? 'reaction' : conversationNpcId === selected ? 'talk' : 'idle'}
          uiScale={uiScale}
        /> : null}
        <Text
          accessibilityLiveRegion="polite"
          nativeID="world-ui-zoom-announcement"
          style={styles.proofState}
        >
          {`World zoom ${worldZoomPercentage(camera.zoom)} percent`}
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          nativeID="world-ui-scale-announcement"
          style={styles.proofState}
        >
          {`Interface scale ${Math.round(uiScale * 100)} percent`}
        </Text>
        {inBedroom && !questOfferOpen ? (
          <BedActions
            disabled={transitioning || runtime.worldState.clock.pauseTokens.length > 0}
            minuteOfDay={runtime.worldState.clock.absoluteMinute % 1_440}
            onSleep={sleep}
            uiScale={uiScale}
          />
        ) : null}
        {!questOfferOpen ? <View nativeID="world-ui-help" pointerEvents="none" style={styles.bottomPlate}>
          <Text
            key={worldFeedback ?? runtime.movement.status}
            nativeID="world-ui-feedback"
            style={[styles.statusStrong, { fontSize: metrics.persistentText }]}
          >
            {worldFeedback ?? (runtime.movement.status === 'unreachable' ? 'NO ROUTE' : runtime.movement.status.toUpperCase())}
          </Text>
          <Text style={[styles.status, { fontSize: metrics.secondaryText }]}>CLICK MOVE · DRAG PAN · WHEEL ZOOM · F CENTER · Q QUESTS · ESC STOP</Text>
        </View> : null}
        {audioCaption ? (
          <Text accessibilityLiveRegion="polite" nativeID="world-audio-caption" style={styles.audioCaption}>{audioCaption}</Text>
        ) : null}
        {transitioning ? <View nativeID="world-transition-overlay" style={styles.transitionOverlay}><Text style={styles.transitionText}>CROSSING NEIGHBORHOOD…</Text></View> : null}
        {rendererContextState !== 'ready' ? (
          <View nativeID="world-renderer-recovery-overlay" style={styles.transitionOverlay}>
            <Text style={styles.transitionText}>{rendererContextState === 'lost' ? 'RESTORING GRAPHICS…' : 'GRAPHICS RESTART REQUIRED'}</Text>
          </View>
        ) : null}
        {conversationNpcId ? (
          <ConversationPanel
            accent={lighting.accent}
            fixtureDisplayName={conversationFixtureId ? ATLAS_INDEX.characters[conversationFixtureId].displayName : undefined}
            fixtureMode={conversationFixtureId === conversationNpcId}
            locationName={map.source.displayName}
            npcId={conversationNpcId}
            onDismiss={() => {
              setConversationFixtureId(undefined);
              setConversationNpcId(undefined);
            }}
            onPausedState={applyConversationPause}
            onStableState={applyConversationStableState}
            onVocalCue={triggerVocalCue}
            port={conversationPort}
            state={runtime.worldState}
            surface={surface}
            uiScale={uiScale}
          />
        ) : null}
        {questOfferOpen ? (
          <QuestOfferDialogue
            accent={lighting.accent}
            onAccept={() => {
              if (!authoredDialogueFixtureId) {
                runQuestAction('start');
                return;
              }
              setAuthoredDialogueFixtureId(undefined);
              setQuestOfferOpen(false);
              setWorldFeedback('MARCUS SHARED HIS SIDE · LINDA QUEST NOT ACCEPTED');
              playInterfaceSound('panel-close');
            }}
            onDecline={() => {
              setAuthoredDialogueFixtureId(undefined);
              setQuestOfferOpen(false);
              setWorldFeedback(authoredDialogueFixtureId
                ? 'MARCUS CONVERSATION ENDED · LINDA QUEST NOT ACCEPTED'
                : 'LINDA QUEST NOT ACCEPTED · TALK TO HER AGAIN ANY TIME');
              playInterfaceSound('panel-close');
            }}
            playerName={runtime.worldState.protagonist.displayName}
            speakerId={authoredDialogueFixtureId ?? 'linda'}
            speakerName={authoredDialogueFixtureId
              ? ATLAS_INDEX.characters[authoredDialogueFixtureId].displayName
              : 'Linda'}
            speakerText={authoredDialogueFixtureId === 'linda-boyfriend'
              ? 'Linda told you I frightened her? You have heard only one side. Ask what happened before you judge me.'
              : authoredDialogueFixtureId
                ? `${ATLAS_INDEX.characters[authoredDialogueFixtureId].displayName}'s large conversation portrait is ready for review.`
                : undefined}
            surface={surface}
            uiScale={uiScale}
          />
        ) : null}
        {openPanel === 'journal' ? (
          <JournalPanel
            accent={lighting.accent}
            actions={lindaQuestActions}
            contextActions={contextualMissionActions}
            onAction={runQuestAction}
            onDismiss={() => { playInterfaceSound('panel-close'); setOpenPanel(undefined); }}
            onAdvancePolice={advancePoliceHook}
            onPurchaseSecurityReport={purchaseSecurityReport}
            state={runtime.worldState}
            surface={surface}
            uiScale={uiScale}
          />
        ) : null}
        {openPanel === 'relationships' ? (
          <RelationshipPanel
            accent={lighting.accent}
            npcId={runtime.worldState.relationships[selected] ? selected : 'linda'}
            onDismiss={() => { playInterfaceSound('panel-close'); setOpenPanel(undefined); }}
            state={runtime.worldState}
            surface={surface}
            uiScale={uiScale}
          />
        ) : null}
      </View>
    </WorldInput>
  );
}

const styles = StyleSheet.create({
  // The vocal-cue caption has to clear every panel that can be open while a cue fires. It carried no
  // zIndex, so the conversation overlay hid it outright and the character card covered it.
  audioCaption: { backgroundColor: '#181512dd', bottom: 48, color: '#fff0c7', fontFamily: 'Silkscreen', fontSize: 10, left: 12, paddingHorizontal: 8, paddingVertical: 5, position: 'absolute', zIndex: UI_LAYER.caption },
  bottomPlate: {
    alignItems: 'center', backgroundColor: '#181914e8', borderColor: '#ad7640', borderTopWidth: 2,
    bottom: 0, flexDirection: 'row', gap: 16, left: 0, paddingHorizontal: 14, paddingVertical: 8,
    position: 'absolute', right: 0, zIndex: UI_LAYER.statusStrip,
  },
  canvas: { backgroundColor: '#b77945' },
  buttonPressed: { opacity: 0.78, transform: [{ translateY: 1 }] },
      canvasHost: { overflow: 'hidden' },
      feedbackCanvas: { left: 0, position: 'absolute', top: 0 },
  frame: { overflow: 'hidden', position: 'relative' },
  loading: { alignItems: 'center', justifyContent: 'center' },
  proofState: { height: 1, left: 0, opacity: 0, position: 'absolute', top: 0, width: 1 },
  // The keybind legend is a one-time lesson sharing a band with the transient feedback line, so it
  // steps back rather than competing with it.
  status: { color: '#c3b18f', fontFamily: 'Silkscreen', fontSize: 9, opacity: 0.55 },
  statusStrong: { color: '#f1c65b', fontFamily: 'Silkscreen', fontSize: 10 },
  shelterShade: { position: 'absolute' },
  // Shared by #world-transition-overlay and #world-renderer-recovery-overlay. Staying below
  // UI_LAYER.conversation preserves the existing behaviour where an open conversation covers both.
  transitionOverlay: { alignItems: 'center', backgroundColor: '#171411dd', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0, zIndex: UI_LAYER.transition },
  transitionText: { color: '#f1c65b', fontFamily: 'Silkscreen', fontSize: 16 },
  talkButton: { alignItems: 'center', backgroundColor: '#f1c65b', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  talkLabel: { color: '#d6c19a', fontFamily: 'Silkscreen', fontSize: 8 },
  talkPlate: { alignItems: 'center', backgroundColor: '#211d1aee', bottom: 42, flexDirection: 'row', gap: 10, padding: 6, position: 'absolute', right: 14 },
  talkText: { color: '#211d1a', fontFamily: 'Silkscreen', fontSize: 10 },
  viewport: { overflow: 'hidden' },
  zoomButtonDisabled: { opacity: 0.35 },
});
