import { useAudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { MapId } from '../world/maps/catalog';
import type { MotionSegment } from '../world/movement/motion-clock';
import type { DoorMotionPhase } from '../world/pathfinding/movement';
import {
  ambienceTrackId,
  doorSoundsForTransition,
  footstepSurface,
  musicTrackId,
  type AmbienceTrackId,
  type MusicTrackId,
  type RelationshipSound,
} from './halcyra-audio-policy';

const MUSIC = {
  music_menu: require('../../assets/source/audio/music_menu.mp3') as number,
  music_sunward_day: require('../../assets/source/audio/music_sunward_day.mp3') as number,
  music_sunward_night: require('../../assets/source/audio/music_sunward_night.mp3') as number,
  music_neon_day: require('../../assets/source/audio/music_neon_day.mp3') as number,
  music_neon_night: require('../../assets/source/audio/music_neon_night.mp3') as number,
  music_saffron_day: require('../../assets/source/audio/music_saffron_day.mp3') as number,
  music_saffron_night: require('../../assets/source/audio/music_saffron_night.mp3') as number,
  music_greywake_day: require('../../assets/source/audio/music_greywake_day.mp3') as number,
  music_greywake_night: require('../../assets/source/audio/music_greywake_night.mp3') as number,
  music_office: require('../../assets/source/audio/music_office.mp3') as number,
} as const satisfies Readonly<Record<MusicTrackId | 'music_menu', number>>;

const AMBIENCE = {
  ambience_sunward_loop: require('../../assets/source/audio/ambience_sunward_loop.mp3') as number,
  ambience_neon_loop: require('../../assets/source/audio/ambience_neon_loop.mp3') as number,
  ambience_saffron_loop: require('../../assets/source/audio/ambience_saffron_loop.mp3') as number,
  ambience_greywake_loop: require('../../assets/source/audio/ambience_greywake_loop.mp3') as number,
} as const satisfies Readonly<Record<AmbienceTrackId, number>>;

const FOOTSTEPS = {
  sand: [
    require('../../assets/source/audio/footstep_sand_01.wav') as number,
    require('../../assets/source/audio/footstep_sand_02.wav') as number,
    require('../../assets/source/audio/footstep_sand_03.wav') as number,
  ],
  stone: [
    require('../../assets/source/audio/footstep_stone_01.wav') as number,
    require('../../assets/source/audio/footstep_stone_02.wav') as number,
    require('../../assets/source/audio/footstep_stone_03.wav') as number,
  ],
  asphalt: [
    require('../../assets/source/audio/footstep_asphalt_01.wav') as number,
    require('../../assets/source/audio/footstep_asphalt_02.wav') as number,
    require('../../assets/source/audio/footstep_asphalt_03.wav') as number,
  ],
  wood: [
    require('../../assets/source/audio/footstep_wood_01.wav') as number,
    require('../../assets/source/audio/footstep_wood_02.wav') as number,
    require('../../assets/source/audio/footstep_wood_03.wav') as number,
  ],
  indoor: [
    require('../../assets/source/audio/footstep_indoor_01.wav') as number,
    require('../../assets/source/audio/footstep_indoor_02.wav') as number,
    require('../../assets/source/audio/footstep_indoor_03.wav') as number,
  ],
} as const;

const INTERFACE_SOUNDS = {
  press: [
    require('../../assets/source/audio/sfx_ui_press_01.wav') as number,
    require('../../assets/source/audio/sfx_ui_press_02.wav') as number,
  ],
  confirm: require('../../assets/source/audio/sfx_ui_confirm.wav') as number,
  cancel: require('../../assets/source/audio/sfx_ui_cancel.wav') as number,
  'panel-open': require('../../assets/source/audio/sfx_panel_open.wav') as number,
  'panel-close': require('../../assets/source/audio/sfx_panel_close.wav') as number,
  'save-complete': require('../../assets/source/audio/sfx_save_complete.wav') as number,
  'relationship-positive': require('../../assets/source/audio/sfx_relationship_positive.wav') as number,
  'relationship-negative': require('../../assets/source/audio/sfx_relationship_negative.wav') as number,
} as const;

const doorOpenSound = require('../../assets/source/audio/sfx_door_open.wav') as number;
const doorClose = require('../../assets/source/audio/sfx_door_close.wav') as number;

export type InterfaceSoundId = 'press' | 'confirm' | 'cancel' | 'panel-open' | 'panel-close' |
  'save-complete' | RelationshipSound;

let userGestureReceived = false;

export function useAudioEnabled(): boolean {
  const [armed, setArmed] = useState(userGestureReceived);
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const arm = () => {
      userGestureReceived = true;
      setArmed(true);
    };
    window.addEventListener('pointerdown', arm, { once: true });
    window.addEventListener('keydown', arm, { once: true });
    return () => {
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  return armed && active;
}

function useLoopingTrack(source: number, enabled: boolean, volume: number): void {
  const player = useAudioPlayer(source, { updateInterval: 1_000, preferredForwardBufferDuration: 5 });
  useEffect(() => {
    player.loop = true;
    player.volume = volume;
    if (enabled) player.play();
    else player.pause();
    return () => player.pause();
  }, [enabled, player, volume]);
}

export function useMenuMusic(enabled: boolean): void {
  useLoopingTrack(MUSIC.music_menu, enabled, 0.16);
}

export function useInterfaceSounds(enabled: boolean): (sound: InterfaceSoundId) => void {
  const pressOne = useAudioPlayer(INTERFACE_SOUNDS.press[0]);
  const pressTwo = useAudioPlayer(INTERFACE_SOUNDS.press[1]);
  const confirm = useAudioPlayer(INTERFACE_SOUNDS.confirm);
  const cancel = useAudioPlayer(INTERFACE_SOUNDS.cancel);
  const panelOpen = useAudioPlayer(INTERFACE_SOUNDS['panel-open']);
  const panelClose = useAudioPlayer(INTERFACE_SOUNDS['panel-close']);
  const saveComplete = useAudioPlayer(INTERFACE_SOUNDS['save-complete']);
  const relationshipPositive = useAudioPlayer(INTERFACE_SOUNDS['relationship-positive']);
  const relationshipNegative = useAudioPlayer(INTERFACE_SOUNDS['relationship-negative']);
  const pressIndex = useRef(0);

  return useCallback((sound) => {
    if (!enabled && (!userGestureReceived || AppState.currentState !== 'active')) return;
    const player = sound === 'press'
      ? (pressIndex.current++ % 2 === 0 ? pressOne : pressTwo)
      : {
        confirm,
        cancel,
        'panel-open': panelOpen,
        'panel-close': panelClose,
        'save-complete': saveComplete,
        'relationship-positive': relationshipPositive,
        'relationship-negative': relationshipNegative,
      }[sound];
    player.loop = false;
    player.volume = 0.34;
    void player.seekTo(0).then(() => player.play()).catch(() => undefined);
  }, [cancel, confirm, enabled, panelClose, panelOpen, pressOne, pressTwo, relationshipNegative, relationshipPositive, saveComplete]);
}

type WorldAudioInput = Readonly<{
  absoluteMinute: number;
  doorPhases: Readonly<Record<string, DoorMotionPhase>>;
  enabled: boolean;
  mapId: MapId;
  materialId?: string;
  segment?: MotionSegment;
}>;

export function useWorldAudio({
  absoluteMinute,
  doorPhases,
  enabled,
  mapId,
  materialId,
  segment,
}: WorldAudioInput): void {
  const music = MUSIC[musicTrackId(mapId, absoluteMinute)];
  const ambience = AMBIENCE[ambienceTrackId(mapId)];
  useLoopingTrack(music, enabled, 0.16);
  useLoopingTrack(ambience, enabled, 0.1);

  const footstepPlayer = useAudioPlayer(null);
  const doorOpenPlayer = useAudioPlayer(doorOpenSound);
  const doorClosePlayer = useAudioPlayer(doorClose);
  const previousSegment = useRef<string | undefined>(undefined);
  const previousDoorPhases = useRef<Readonly<Record<string, DoorMotionPhase>>>({});
  const segmentKey = segment
    ? `${mapId}:${segment.from.x},${segment.from.y}:${segment.to.x},${segment.to.y}`
    : undefined;

  useEffect(() => {
    if (!segment || !segmentKey || !materialId) return;
    if (previousSegment.current === segmentKey) return;
    previousSegment.current = segmentKey;
    if (!enabled) return;

    const surface = footstepSurface(materialId);
    const variations = FOOTSTEPS[surface];
    const variation = variations[Math.abs(segment.to.x * 31 + segment.to.y * 17) % variations.length]!;
    footstepPlayer.replace(variation);
    footstepPlayer.loop = false;
    footstepPlayer.volume = 0.3;
    footstepPlayer.play();

    return undefined;
  }, [enabled, footstepPlayer, materialId, segmentKey]);

  useEffect(() => {
    const sounds = doorSoundsForTransition(previousDoorPhases.current, doorPhases);
    previousDoorPhases.current = doorPhases;
    if (!enabled) return;
    for (const sound of sounds) {
      const player = sound === 'open' ? doorOpenPlayer : doorClosePlayer;
      player.loop = false;
      player.volume = sound === 'open' ? 0.28 : 0.24;
      void player.seekTo(0).then(() => player.play()).catch(() => undefined);
    }
  }, [doorClosePlayer, doorOpenPlayer, doorPhases, enabled]);
}
