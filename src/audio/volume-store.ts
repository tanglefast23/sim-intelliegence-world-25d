import { useSyncExternalStore } from 'react';

export type AudioVolumes = Readonly<{ music: number; sfx: number }>;

export const DEFAULT_AUDIO_VOLUMES: AudioVolumes = Object.freeze({ music: 1, sfx: 1 });

let current: AudioVolumes = DEFAULT_AUDIO_VOLUMES;
const listeners = new Set<() => void>();

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, Math.round(value * 20) / 20));
}

export function audioVolumes(): AudioVolumes {
  return current;
}

export function setAudioVolumes(patch: Partial<AudioVolumes>): void {
  const next: AudioVolumes = {
    music: clampVolume(patch.music ?? current.music),
    sfx: clampVolume(patch.sfx ?? current.sfx),
  };
  if (next.music === current.music && next.sfx === current.sfx) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useAudioVolumes(): AudioVolumes {
  return useSyncExternalStore(subscribe, audioVolumes, audioVolumes);
}
