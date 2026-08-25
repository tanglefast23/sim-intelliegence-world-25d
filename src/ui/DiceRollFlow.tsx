import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAudioVolumes } from '../audio/volume-store';
import type { ViewportSize } from '../render/camera';
import {
  DICE_ROLL_CUP_HEIGHT,
  DICE_ROLL_CUP_WIDTH,
  bakeDiceRollCupFrame,
} from '../render/pencil/dice-roll-cup';
import { DiceRollCanvas, sampleDiceRollTimeline } from './DiceRollCanvas';

const shakeSound = require('../../assets/source/audio/sfx_dice_cup_shake.mp3') as number;
const landSound = require('../../assets/source/audio/sfx_dice_land.mp3') as number;

export type DiceRollCommitResult = 'committed' | 'retry' | 'abort';
export type DiceRollFlowPhase = 'cup' | 'rolling' | 'result-hold' | 'exiting';

export function diceRollFlowPhase(elapsedMs: number, reducedMotion: boolean): DiceRollFlowPhase {
  const settle = reducedMotion ? 180 : 1_950;
  const exit = reducedMotion ? 2_680 : 4_450;
  return elapsedMs < settle ? 'rolling' : elapsedMs < exit ? 'result-hold' : 'exiting';
}

export function diceRollFlowEnd(reducedMotion: boolean): number {
  return reducedMotion ? 2_980 : 4_850;
}

export function diceRollImpactAt(reducedMotion: boolean): number {
  return reducedMotion ? 80 : 1_150;
}

function CupCanvas() {
  const frame = useMemo(() => bakeDiceRollCupFrame('front'), []);
  useEffect(() => {
    const host = document.querySelector('#dice-roll-flow-cup');
    if (!(host instanceof HTMLElement)) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = DICE_ROLL_CUP_WIDTH; canvas.height = DICE_ROLL_CUP_HEIGHT;
    Object.assign(canvas.style, { display: 'block', height: '100%', imageRendering: 'pixelated', width: '100%' });
    canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(frame), DICE_ROLL_CUP_WIDTH, DICE_ROLL_CUP_HEIGHT), 0, 0);
    host.append(canvas);
    return () => canvas.remove();
  }, [frame]);
  return <View nativeID="dice-roll-flow-cup" pointerEvents="none" style={styles.cupCanvas} />;
}

export function DiceRollFlow({
  active = true,
  audioEnabled,
  dice,
  onComplete,
  onPhaseChange,
  onRoll,
  reducedMotion,
  surface,
}: Readonly<{
  active?: boolean;
  audioEnabled: boolean;
  dice?: readonly [number, number];
  onComplete: () => void;
  onPhaseChange?: (phase: DiceRollFlowPhase) => void;
  onRoll: () => DiceRollCommitResult;
  reducedMotion: boolean;
  surface: ViewportSize;
}>) {
  const shake = useAudioPlayer(shakeSound);
  const land = useAudioPlayer(landSound);
  const shakeStatus = useAudioPlayerStatus(shake);
  const { sfx } = useAudioVolumes();
  const [committed, setCommitted] = useState(false);
  const [cupStep, setCupStep] = useState(0);
  const [diceReady, setDiceReady] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [pinVersion, setPinVersion] = useState(0);
  const [error, setError] = useState('');
  const pinned = useRef(false);
  const elapsedRef = useRef(0);
  const completeOnce = useRef(false);
  const landOnce = useRef(false);
  const rolledOnce = useRef(false);
  const running = committed && !!dice && diceReady;
  const impactAt = diceRollImpactAt(reducedMotion);
  const timeline = sampleDiceRollTimeline(elapsedMs, reducedMotion);
  const phase = committed ? diceRollFlowPhase(elapsedMs, reducedMotion) : 'cup';

  const stop = useCallback((player: typeof shake) => {
    player.pause();
    void player.seekTo(0).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!audioEnabled || committed || sfx <= 0 || !shakeStatus.isLoaded) { stop(shake); return undefined; }
    shake.loop = true; shake.volume = Math.min(1, 0.8 * sfx); shake.play();
    return () => stop(shake);
  }, [audioEnabled, committed, sfx, shake, shakeStatus.isLoaded, stop]);
  useEffect(() => {
    if (committed || reducedMotion) return undefined;
    const timer = setInterval(() => setCupStep((step) => (step + 1) % 3), 130);
    return () => clearInterval(timer);
  }, [committed, reducedMotion]);
  useEffect(() => () => { stop(shake); stop(land); }, [land, shake, stop]);
  useEffect(() => { onPhaseChange?.(phase); }, [onPhaseChange, phase]);
  useEffect(() => {
    document.querySelector<HTMLElement>(committed ? '#dice-roll-flow-root' : '#dice-roll-flow-roll')?.focus();
  }, [committed]);
  useEffect(() => {
    if (!running) return undefined;
    let frame = 0;
    let last = performance.now();
    const step = (time: number) => {
      const clockActive = window.siWorldSmokeMode === true || (active && document.visibilityState === 'visible');
      if (!pinned.current && clockActive) {
        elapsedRef.current = Math.min(diceRollFlowEnd(reducedMotion), elapsedRef.current + Math.max(0, time - last));
        setElapsedMs(elapsedRef.current);
      }
      last = time;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active, reducedMotion, running]);
  useEffect(() => {
    if (!running || elapsedMs < impactAt || landOnce.current || pinned.current) return;
    landOnce.current = true;
    if (audioEnabled && sfx > 0) {
      land.volume = Math.min(1, sfx); land.play();
    }
  }, [audioEnabled, elapsedMs, impactAt, land, running, sfx]);
  useEffect(() => {
    if (!running || elapsedMs < diceRollFlowEnd(reducedMotion) || completeOnce.current || pinned.current) return;
    completeOnce.current = true; onComplete();
  }, [elapsedMs, onComplete, pinVersion, reducedMotion, running]);
  useEffect(() => {
    if (window.siWorldSmokeMode !== true) return undefined;
    window.siWorldPinDiceRollFlow = (timeMs: number | null) => {
      if (timeMs === null) { pinned.current = false; setPinVersion((version) => version + 1); return elapsedRef.current; }
      const next = Math.max(0, Math.min(diceRollFlowEnd(reducedMotion), timeMs));
      if (next >= impactAt) landOnce.current = true;
      pinned.current = true; elapsedRef.current = next; setElapsedMs(next); return next;
    };
    return () => { delete window.siWorldPinDiceRollFlow; };
  }, [impactAt, reducedMotion]);

  const pressRoll = () => {
    if (rolledOnce.current) return;
    rolledOnce.current = true; setError(''); stop(shake);
    let result: DiceRollCommitResult;
    try { result = onRoll(); } catch { result = 'retry'; }
    if (result === 'committed') { setCommitted(true); return; }
    if (result === 'retry') {
      rolledOnce.current = false; setError('ROLL FAILED. TRY AGAIN.');
      requestAnimationFrame(() => document.querySelector<HTMLElement>('#dice-roll-flow-roll')?.focus());
    }
  };

  const total = dice ? dice[0] + dice[1] : undefined;
  const shakeStep = reducedMotion ? 0 : cupStep - 1;
  return <View
    accessibilityLabel={committed ? 'Dice roll in progress' : 'Dice cup ready. Roll the dice.'}
    nativeID="dice-roll-flow-root"
    style={[styles.root, { maxWidth: Math.min(680, surface.width - 24) }]}
    tabIndex={-1}
  >
    {!committed ? <View style={[styles.cupWrap, { transform: [{ rotate: `${shakeStep * 2}deg` }, { translateX: shakeStep * 3 }] }]}>
      <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.motionLeft}><Text style={styles.motionText}>)))</Text></View>
      <CupCanvas />
      <Text aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.cupLabel}>DICE</Text>
      <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.motionRight}><Text style={styles.motionText}>(((</Text></View>
      <Pressable accessibilityLabel="Roll the dice" nativeID="dice-roll-flow-roll" onPress={pressRoll} role="button" style={styles.rollButton}>
        <Text style={styles.rollText}>ROLL IT</Text>
      </Pressable>
    </View> : <>
      <DiceRollCanvas compact={surface.height < 680} dice={dice} elapsedMs={elapsedMs} nativeID="dice-roll-flow-canvas" onReady={() => setDiceReady(true)} reducedMotion={reducedMotion} />
      {timeline.showResult && total !== undefined ? <>
        <Text accessibilityElementsHidden aria-hidden nativeID="dice-roll-flow-total" style={styles.total}>{total}</Text>
        <Text accessibilityLiveRegion="assertive" style={styles.liveRegion}>{dice?.[0]} plus {dice?.[1]} equals {total}</Text>
      </> : null}
      {elapsedMs >= (reducedMotion ? 80 : 1_000) && elapsedMs < (reducedMotion ? 260 : 1_500) ? <View aria-hidden pointerEvents="none" style={styles.impact}><Text style={styles.impactText}>✦  ·  ✦  ·  ✦</Text></View> : null}
    </>}
    {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  cupCanvas: { aspectRatio: 1, width: 320 },
  cupLabel: { color: '#FFF0C7', fontFamily: 'HFMSilkscreenBold', fontSize: 14, left: 94, lineHeight: 20, position: 'absolute', textAlign: 'center', top: 168, width: 132 },
  cupWrap: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  error: { color: '#F3A18F', fontFamily: 'Silkscreen', fontSize: 9, marginTop: 8 },
  impact: { alignItems: 'center', bottom: 24, left: 0, position: 'absolute', right: 0 },
  impactText: { color: '#FFCF76', fontSize: 34, textShadowColor: '#FF8D3A', textShadowRadius: 8 },
  liveRegion: { height: 1, opacity: 0, overflow: 'hidden', width: 1 },
  motionLeft: { left: -25, position: 'absolute', top: 112 },
  motionRight: { position: 'absolute', right: -25, top: 112 },
  motionText: { color: '#FFB64D', fontFamily: 'monospace', fontSize: 26 },
  rollButton: { alignItems: 'center', backgroundColor: '#6F3827', borderColor: '#FFCF76', borderRadius: 14, borderWidth: 2, justifyContent: 'center', marginTop: 8, minHeight: 48, minWidth: 132, paddingHorizontal: 18 },
  rollText: { color: '#FFF0C7', fontFamily: 'HFMSilkscreenBold', fontSize: 12, letterSpacing: 1 },
  root: { alignItems: 'center', justifyContent: 'center', minHeight: 330, position: 'relative', width: '100%' },
  total: { color: '#FFF0C7', fontFamily: 'Silkscreen', fontSize: 76, left: 0, lineHeight: 82, position: 'absolute', right: 0, textAlign: 'center', textShadowColor: '#7D3A24', textShadowOffset: { height: 5, width: 5 }, textShadowRadius: 0, top: '68%' },
});
