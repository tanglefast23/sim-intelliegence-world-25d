import { useAudioPlayer } from 'expo-audio';
import { useCallback } from 'react';

import type { VocalCueId } from './vocal-cue-policy';
import { useAudioVolumes } from './volume-store';

const greeting = require('../../assets/generated/audio/greeting.wav') as number;
const laugh = require('../../assets/generated/audio/laugh.wav') as number;
const sigh = require('../../assets/generated/audio/sigh.wav') as number;
const consequence = require('../../assets/generated/audio/consequence.wav') as number;

export const VOCAL_CUE_ASSETS = [greeting, laugh, sigh, consequence] as const;

export function useVocalCues(): (cue: VocalCueId) => void {
  const greetingPlayer = useAudioPlayer(greeting);
  const laughPlayer = useAudioPlayer(laugh);
  const sighPlayer = useAudioPlayer(sigh);
  const consequencePlayer = useAudioPlayer(consequence);
  const { sfx } = useAudioVolumes();

  return useCallback((cue: VocalCueId) => {
    if (sfx <= 0) return;
    const player = {
      greeting: greetingPlayer,
      laugh: laughPlayer,
      sigh: sighPlayer,
      consequence: consequencePlayer,
    }[cue];
    player.volume = sfx;
    void player.seekTo(0).then(() => player.play()).catch(() => undefined);
  }, [consequencePlayer, greetingPlayer, laughPlayer, sfx, sighPlayer]);
}
