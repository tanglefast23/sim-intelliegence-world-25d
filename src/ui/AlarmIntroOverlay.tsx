import { useAudioPlayer, useAudioPlayerStatus, type AudioPlayer } from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useReducedMotion } from '../application/accessibility';
import { useAudioVolumes } from '../audio/volume-store';
import type { ViewportSize } from '../render/camera';
import { ALARM_CLOCK_HEIGHT, ALARM_CLOCK_WIDTH, bakeAlarmClockFrame } from '../render/pencil/alarm-clock';
import { DiceRollFlow, type DiceRollCommitResult } from './DiceRollFlow';

const alarmSound = require('../../assets/source/audio/sfx_alarm_clock.webm') as number;
const REPEAT_MS = 2_500;
const GRADE_HOLD_MS = 900;

export type AlarmIntroRoll = Readonly<{ dice: [number, number]; total: number }>;

export function alarmGrade(total: number): 'Bad' | 'okay' | 'Good' {
  if (!Number.isSafeInteger(total) || total < 2 || total > 12) throw new RangeError('Alarm roll total must be from 2 through 12.');
  return total <= 4 ? 'Bad' : total <= 8 ? 'okay' : 'Good';
}

export function alarmIntroReady(elapsedMs: number): boolean {
  return elapsedMs >= GRADE_HOLD_MS;
}

export function startAlarmCadence(
  player: Pick<AudioPlayer, 'pause' | 'play' | 'seekTo' | 'volume'>,
  volume: number,
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout> = setTimeout,
  cancel: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const restart = async () => {
    player.pause();
    try { await player.seekTo(0); } catch { return; }
    if (stopped) return;
    player.volume = volume; player.play();
    timer = schedule(() => { void restart(); }, REPEAT_MS);
  };
  void restart();
  return () => {
    stopped = true;
    if (timer !== undefined) cancel(timer);
    player.pause(); void player.seekTo(0).catch(() => undefined);
  };
}

function AlarmClockCanvas({ width }: Readonly<{ width: number }>) {
  const frame = useMemo(() => bakeAlarmClockFrame('front'), []);
  useEffect(() => {
    const host = document.querySelector('#alarm-clock-canvas');
    if (!(host instanceof HTMLElement)) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = ALARM_CLOCK_WIDTH; canvas.height = ALARM_CLOCK_HEIGHT;
    Object.assign(canvas.style, { display: 'block', height: '100%', imageRendering: 'pixelated', width: '100%' });
    canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(frame), ALARM_CLOCK_WIDTH, ALARM_CLOCK_HEIGHT), 0, 0);
    host.append(canvas);
    return () => canvas.remove();
  }, [frame]);
  return <View nativeID="alarm-clock-canvas" pointerEvents="none" style={{ aspectRatio: ALARM_CLOCK_WIDTH / ALARM_CLOCK_HEIGHT, width }} />;
}

function SoundLines({ opacity, side }: Readonly<{ opacity: Animated.Value; side: 'left' | 'right' }>) {
  return <Animated.View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[styles.soundLines, side === 'left' ? styles.soundLeft : styles.soundRight, { opacity }]}>
    {[0, 1, 2].map((line) => <View key={line} style={[styles.soundLine, { width: 18 + line * 12 }, side === 'left' && styles.soundLineLeft]} />)}
  </Animated.View>;
}

function focusAlarmTarget(): void {
  for (const selector of ['#alarm-intro-snooze', '#dice-roll-flow-roll', '#alarm-intro-retry', '#dice-roll-flow-root']) {
    const target = document.querySelector<HTMLElement>(selector);
    if (target) { target.focus(); return; }
  }
  document.querySelector<HTMLElement>('#alarm-intro-overlay')?.focus();
}

export function AlarmIntroOverlay({
  audioEnabled, onComplete, onRetry, onRoll, onSnooze, roll, saveError,
  saveGeneration, saveStatus, snoozed, surface,
}: Readonly<{
  audioEnabled: boolean;
  onComplete: () => void;
  onRetry: () => void;
  onRoll: () => DiceRollCommitResult;
  onSnooze: () => void;
  roll?: AlarmIntroRoll;
  saveError?: string;
  saveGeneration?: number;
  saveStatus: 'idle' | 'saving' | 'saved' | 'failed';
  snoozed: boolean;
  surface: ViewportSize;
}>) {
  const reducedMotion = useReducedMotion();
  const player = useAudioPlayer(alarmSound);
  const playerStatus = useAudioPlayerStatus(player);
  const { sfx } = useAudioVolumes();
  const [flowComplete, setFlowComplete] = useState(false);
  const [gradeReady, setGradeReady] = useState(false);
  const completed = useRef(false);
  const fade = useRef(new Animated.Value(1)).current;
  const soundPulse = useRef(new Animated.Value(1)).current;
  const clockWidth = Math.max(260, Math.min(surface.width * 0.88, 860, surface.height * 0.58 * ALARM_CLOCK_WIDTH / ALARM_CLOCK_HEIGHT));
  const grade = roll ? alarmGrade(roll.total) : undefined;

  useEffect(() => {
    if (snoozed || !audioEnabled || sfx <= 0 || !playerStatus.isLoaded) {
      player.pause(); void player.seekTo(0).catch(() => undefined); return undefined;
    }
    return startAlarmCadence(player, 0.34 * sfx);
  }, [audioEnabled, player, playerStatus.isLoaded, sfx, snoozed]);
  useEffect(() => {
    if (snoozed || reducedMotion) { soundPulse.setValue(1); return undefined; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(soundPulse, { duration: 500, toValue: 0.35, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(soundPulse, { duration: 500, toValue: 1, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    animation.start(); return () => animation.stop();
  }, [reducedMotion, snoozed, soundPulse]);
  useEffect(() => {
    if (!flowComplete) return undefined;
    const timer = setTimeout(() => setGradeReady(true), GRADE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [flowComplete]);
  useEffect(() => {
    if (!gradeReady || saveStatus !== 'saved' || completed.current) return;
    completed.current = true;
    if (reducedMotion) { onComplete(); return; }
    Animated.timing(fade, { duration: 500, easing: Easing.inOut(Easing.quad), toValue: 0, useNativeDriver: Platform.OS !== 'web' })
      .start(({ finished }) => { if (finished) onComplete(); });
  }, [fade, gradeReady, onComplete, reducedMotion, saveStatus]);
  useEffect(() => {
    focusAlarmTarget();
  }, [flowComplete, gradeReady, saveStatus, snoozed]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); return; }
      if (event.key !== 'Tab') return;
      event.preventDefault(); event.stopPropagation();
      focusAlarmTarget();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);
  useEffect(() => {
    if (window.siWorldSmokeMode !== true) return undefined;
    window.siWorldPinAlarmIntro = (timeMs: number) => window.siWorldPinDiceRollFlow?.(timeMs) ?? 0;
    window.siWorldAlarmAudioEvidence = () => ({
      audioEnabled, currentTime: player.currentTime, loaded: player.isLoaded, playing: player.playing,
      userActivation: navigator.userActivation?.hasBeenActive === true, visibilityState: document.visibilityState,
    });
    return () => { delete window.siWorldPinAlarmIntro; delete window.siWorldAlarmAudioEvidence; };
  }, [audioEnabled, player]);

  const saveLabel = saveStatus === 'saving' ? 'SAVING…' : saveStatus === 'saved' ? `SAVED GEN ${saveGeneration}` : saveStatus === 'failed' ? 'SAVE FAILED' : snoozed ? '' : 'WAITING FOR SNOOZE';
  const dialogLabel = !snoozed ? 'Alarm clock showing 7:00. Hit snooze.' : flowComplete && grade ? grade : 'Dice cup ready. Roll the dice.';

  return <Animated.View accessibilityLabel={dialogLabel} aria-modal nativeID="alarm-intro-overlay" role="dialog" style={[styles.screen, { height: surface.height, opacity: fade, width: surface.width }]} tabIndex={-1}>
    <View pointerEvents="none" style={styles.glow} />
    {!snoozed ? <>
      <View aria-hidden pointerEvents="none" style={styles.prompt}><Text style={styles.hitSnooze}>HIT SNOOZE!</Text><Text style={styles.arrow}>↓</Text></View>
      <View style={[styles.clockWrap, { width: clockWidth }]}>
        <SoundLines opacity={soundPulse} side="left" /><SoundLines opacity={soundPulse} side="right" />
        <AlarmClockCanvas width={clockWidth} />
        <Pressable accessibilityLabel="Snooze alarm" nativeID="alarm-intro-snooze" onPress={onSnooze} role="button" style={styles.snoozeButton} />
      </View>
    </> : !flowComplete ? <DiceRollFlow audioEnabled={audioEnabled} dice={roll?.dice} onComplete={() => setFlowComplete(true)} onRoll={onRoll} reducedMotion={reducedMotion} surface={surface} /> : <View style={styles.gradePanel}>
      <Text accessibilityLiveRegion="assertive" nativeID="alarm-intro-grade" style={styles.grade}>{grade}</Text>
    </View>}
    <Text nativeID="alarm-intro-save-status" style={[styles.saveStatus, !saveLabel && styles.hiddenStatus]}>{saveLabel}</Text>
    {gradeReady && saveStatus === 'failed' ? <Pressable accessibilityLabel="Retry save" nativeID="alarm-intro-retry" onPress={onRetry} role="button" style={styles.retryButton}>
      <Text style={styles.retryText}>RETRY SAVE</Text>
    </Pressable> : null}
    <Text accessibilityLiveRegion="assertive" style={styles.liveRegion}>{gradeReady && saveError ? saveError : ''}</Text>
  </Animated.View>;
}

const styles = StyleSheet.create({
  arrow: { color: '#FFCF76', fontFamily: 'Silkscreen', fontSize: 52, lineHeight: 48, textAlign: 'center' },
  clockWrap: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  glow: { backgroundColor: '#6B3F1A45', borderRadius: 999, height: '78%', position: 'absolute', width: '78%' },
  grade: { color: '#FFCF76', fontFamily: 'HFMSilkscreenBold', fontSize: 58, textAlign: 'center' },
  gradePanel: { alignItems: 'center', justifyContent: 'center', minHeight: 250 },
  hitSnooze: { color: '#FFF0C7', fontFamily: 'HFMSilkscreenBold', fontSize: 22, textAlign: 'center', textShadowColor: '#000', textShadowOffset: { height: 3, width: 3 }, textShadowRadius: 0 },
  hiddenStatus: { height: 0, marginBottom: 0, marginTop: 0, opacity: 0 },
  liveRegion: { height: 1, opacity: 0, overflow: 'hidden', width: 1 },
  prompt: { marginBottom: -20, zIndex: 2 },
  retryButton: { alignItems: 'center', backgroundColor: '#6F3827', borderColor: '#FFCF76', borderWidth: 2, justifyContent: 'center', minHeight: 48, minWidth: 180, paddingHorizontal: 20 },
  retryText: { color: '#FFF0C7', fontFamily: 'HFMSilkscreenBold', fontSize: 11 },
  saveStatus: { color: '#C9AA79', fontFamily: 'Silkscreen', fontSize: 9, marginBottom: 10, marginTop: 6 },
  screen: { alignItems: 'center', backgroundColor: '#100D0D', justifyContent: 'center', left: 0, overflow: 'hidden', position: 'absolute', top: 0 },
  snoozeButton: { height: '12.12%', left: '32.29%', minHeight: 44, minWidth: 44, position: 'absolute', right: '32.29%', top: '15.15%' },
  soundLeft: { right: '92%' },
  soundLine: { borderTopColor: '#FFB64D', borderTopWidth: 3, marginVertical: 7, transform: [{ rotate: '-8deg' }] },
  soundLineLeft: { alignSelf: 'flex-end', transform: [{ rotate: '8deg' }] },
  soundLines: { position: 'absolute', top: '38%', zIndex: 2 },
  soundRight: { left: '92%' },
});
