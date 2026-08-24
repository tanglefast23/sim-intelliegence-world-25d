import { useAudioPlayer, useAudioPlayerStatus, type AudioPlayer } from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAudioVolumes } from '../audio/volume-store';
import type { ViewportSize } from '../render/camera';
import {
  ALARM_CLOCK_HEIGHT,
  ALARM_CLOCK_RECIPE,
  ALARM_CLOCK_WIDTH,
  bakeAlarmClockFrame,
} from '../render/pencil/alarm-clock';
import { useReducedMotion } from '../application/accessibility';
import { DiceRollCanvas, sampleDiceRollTimeline } from './DiceRollCanvas';

const alarmSound = require('../../assets/source/audio/sfx_alarm_clock.webm') as number;
const REPEAT_MS = 2_500;
const RESULT_HOLD_MS = 900;

export type AlarmIntroRoll = Readonly<{ dice: [number, number]; total: number }>;

export function alarmGrade(total: number): 'Bad' | 'okay' | 'Good' {
  if (!Number.isSafeInteger(total) || total < 2 || total > 12) throw new RangeError('Alarm roll total must be from 2 through 12.');
  return total <= 4 ? 'Bad' : total <= 8 ? 'okay' : 'Good';
}

export function alarmIntroReady(elapsedMs: number, reducedMotion: boolean): boolean {
  return elapsedMs >= (reducedMotion ? 180 : 1_650) + RESULT_HOLD_MS;
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
    try {
      await player.seekTo(0);
    } catch {
      return;
    }
    if (stopped) return;
    player.volume = volume;
    player.play();
    timer = schedule(() => { void restart(); }, REPEAT_MS);
  };
  void restart();
  return () => {
    stopped = true;
    if (timer !== undefined) cancel(timer);
    player.pause();
    void player.seekTo(0).catch(() => undefined);
  };
}

function AlarmClockCanvas({ width }: Readonly<{ width: number }>) {
  const hostId = 'alarm-clock-canvas';
  const frame = useMemo(() => bakeAlarmClockFrame('front'), []);
  useEffect(() => {
    const host = document.querySelector(`#${hostId}`);
    if (!(host instanceof HTMLElement)) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = ALARM_CLOCK_WIDTH;
    canvas.height = ALARM_CLOCK_HEIGHT;
    Object.assign(canvas.style, { display: 'block', height: '100%', imageRendering: 'pixelated', width: '100%' });
    const context = canvas.getContext('2d');
    const pixels = new Uint8ClampedArray(frame.length);
    pixels.set(frame);
    context?.putImageData(new ImageData(pixels, ALARM_CLOCK_WIDTH, ALARM_CLOCK_HEIGHT), 0, 0);
    host.append(canvas);
    return () => canvas.remove();
  }, [frame]);
  return <View nativeID={hostId} pointerEvents="none" style={{ aspectRatio: ALARM_CLOCK_WIDTH / ALARM_CLOCK_HEIGHT, width }} />;
}

function SoundLines({ opacity, side }: Readonly<{ opacity: Animated.Value; side: 'left' | 'right' }>) {
  return <Animated.View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" nativeID={`alarm-intro-sound-${side}`} pointerEvents="none" style={[styles.soundLines, side === 'left' ? styles.soundLeft : styles.soundRight, { opacity }]}>
    {[0, 1, 2].map((line) => <View key={line} style={[styles.soundLine, { width: 18 + line * 12 }, side === 'left' && styles.soundLineLeft]} />)}
  </Animated.View>;
}

export function AlarmIntroOverlay({
  audioEnabled,
  onComplete,
  onRetry,
  onSnooze,
  roll,
  saveError,
  saveGeneration,
  saveStatus,
  surface,
}: Readonly<{
  audioEnabled: boolean;
  onComplete: () => void;
  onRetry: () => void;
  onSnooze: () => void;
  roll?: AlarmIntroRoll;
  saveError?: string;
  saveGeneration?: number;
  saveStatus: 'idle' | 'saving' | 'saved' | 'failed';
  surface: ViewportSize;
}>) {
  const reducedMotion = useReducedMotion();
  const player = useAudioPlayer(alarmSound);
  const playerStatus = useAudioPlayerStatus(player);
  const { sfx } = useAudioVolumes();
  const [elapsedMs, setElapsedMs] = useState(0);
  const pinned = useRef(false);
  const completed = useRef(false);
  const fade = useRef(new Animated.Value(1)).current;
  const soundPulse = useRef(new Animated.Value(1)).current;
  const clockWidth = Math.max(260, Math.min(surface.width * 0.88, 860, surface.height * 0.58 * ALARM_CLOCK_WIDTH / ALARM_CLOCK_HEIGHT));
  const timeline = sampleDiceRollTimeline(elapsedMs, reducedMotion);
  const rollEnd = reducedMotion ? 180 : 1_650;
  const resultReady = !!roll && alarmIntroReady(elapsedMs, reducedMotion);
  const grade = roll ? alarmGrade(roll.total) : undefined;

  useEffect(() => {
    if (roll || !audioEnabled || sfx <= 0 || !playerStatus.isLoaded) {
      player.pause();
      void player.seekTo(0).catch(() => undefined);
      return undefined;
    }
    return startAlarmCadence(player, 0.34 * sfx);
  }, [audioEnabled, player, playerStatus.isLoaded, roll, sfx]);
  useEffect(() => {
    if (roll || reducedMotion) {
      soundPulse.setValue(1);
      return undefined;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(soundPulse, { duration: 500, toValue: 0.35, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(soundPulse, { duration: 500, toValue: 1, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, roll, soundPulse]);
  useEffect(() => {
    if (!roll) {
      pinned.current = false;
      setElapsedMs(0);
      return undefined;
    }
    pinned.current = false;
    const startedAt = performance.now();
    const endAt = rollEnd + RESULT_HOLD_MS;
    let frame = 0;
    const step = (time: number) => {
      if (pinned.current) return;
      setElapsedMs(Math.min(endAt, time - startedAt));
      if (time - startedAt < endAt) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [roll, rollEnd]);
  useEffect(() => {
    if (!resultReady || saveStatus !== 'saved' || completed.current) return;
    completed.current = true;
    if (reducedMotion) {
      onComplete();
      return;
    }
    Animated.timing(fade, {
      duration: 500,
      easing: Easing.inOut(Easing.quad),
      toValue: 0,
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => { if (finished) onComplete(); });
  }, [fade, onComplete, reducedMotion, resultReady, saveStatus]);
  useEffect(() => {
    document.querySelector<HTMLElement>(saveStatus === 'failed' ? '#alarm-intro-retry' : '#alarm-intro-snooze')?.focus();
  }, [saveStatus]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key !== 'Tab') return;
      event.preventDefault();
      event.stopPropagation();
      document.querySelector<HTMLElement>(saveStatus === 'failed' ? '#alarm-intro-retry' : '#alarm-intro-snooze')?.focus();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [saveStatus]);
  useEffect(() => {
    if (window.siWorldSmokeMode !== true) return undefined;
    window.siWorldPinAlarmIntro = (timeMs: number) => {
      const pinnedTime = Math.max(0, Math.min(rollEnd + RESULT_HOLD_MS, timeMs));
      pinned.current = true;
      setElapsedMs(pinnedTime);
      return pinnedTime;
    };
    window.siWorldAlarmAudioEvidence = () => ({
      audioEnabled,
      currentTime: player.currentTime,
      loaded: player.isLoaded,
      playing: player.playing,
      userActivation: navigator.userActivation?.hasBeenActive === true,
      visibilityState: document.visibilityState,
    });
    return () => {
      delete window.siWorldPinAlarmIntro;
      delete window.siWorldAlarmAudioEvidence;
    };
  }, [audioEnabled, player, rollEnd]);

  const saveLabel = saveStatus === 'saving'
    ? 'SAVING…'
    : saveStatus === 'saved'
      ? `SAVED GEN ${saveGeneration}`
      : saveStatus === 'failed'
        ? 'SAVE FAILED'
        : 'WAITING FOR SNOOZE';
  const dialogLabel = roll
    ? `Alarm roll ${roll.dice[0]} plus ${roll.dice[1]} equals ${roll.total}. ${grade}.`
    : 'Alarm clock showing 7:00. Hit snooze.';

  return <Animated.View
    accessibilityLabel={dialogLabel}
    aria-modal
    nativeID="alarm-intro-overlay"
    role="dialog"
    style={[styles.screen, { height: surface.height, opacity: fade, width: surface.width }]}
  >
    <View pointerEvents="none" style={styles.glow} />
    {!roll ? <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" nativeID="alarm-intro-prompt" pointerEvents="none" style={styles.prompt}>
      <Text style={styles.hitSnooze}>HIT SNOOZE!</Text>
      <Text style={styles.arrow}>↓</Text>
    </View> : null}
    {!roll ? <View style={[styles.clockWrap, { width: clockWidth }]}>
      <SoundLines opacity={soundPulse} side="left" /><SoundLines opacity={soundPulse} side="right" />
      <AlarmClockCanvas width={clockWidth} />
      <Pressable
        accessibilityLabel="Snooze alarm"
        accessibilityRole="button"
        nativeID="alarm-intro-snooze"
        onPress={onSnooze}
        style={styles.snoozeButton}
      />
    </View> : null}
    {roll ? <View style={styles.resultPanel}>
      <DiceRollCanvas dice={roll.dice} elapsedMs={elapsedMs} nativeID="alarm-intro-dice" reducedMotion={reducedMotion} />
      {timeline.showArithmetic ? <Text style={styles.total}>{roll.dice[0]} + {roll.dice[1]} = {roll.total}</Text> : null}
      {timeline.showResult ? <Text style={styles.grade}>{grade}</Text> : null}
      <Text accessibilityLiveRegion="assertive" style={styles.liveRegion}>
        {timeline.showResult ? `${roll.dice[0]} plus ${roll.dice[1]} equals ${roll.total}. ${grade}.` : ''}
        {saveError ? ` ${saveError}` : ''}
      </Text>
    </View> : null}
    <Text nativeID="alarm-intro-save-status" style={styles.saveStatus}>{saveLabel}</Text>
    {saveStatus === 'failed' ? <Pressable accessibilityLabel="Retry save" accessibilityRole="button" nativeID="alarm-intro-retry" onPress={onRetry} style={styles.retryButton}>
      <Text style={styles.retryText}>RETRY SAVE</Text>
    </Pressable> : null}
  </Animated.View>;
}

const styles = StyleSheet.create({
  arrow: { color: '#FFCF76', fontFamily: 'Silkscreen', fontSize: 52, lineHeight: 48, textAlign: 'center' },
  clockWrap: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  glow: { backgroundColor: '#6B3F1A45', borderRadius: 999, height: '78%', position: 'absolute', width: '78%' },
  grade: { color: '#FFCF76', fontFamily: 'monospace', fontSize: 28, fontWeight: '700', marginTop: -4, textAlign: 'center' },
  hitSnooze: { color: '#FFF0C7', fontFamily: 'Silkscreen', fontSize: 22, textAlign: 'center', textShadowColor: '#000', textShadowOffset: { height: 3, width: 3 }, textShadowRadius: 0 },
  liveRegion: { height: 1, opacity: 0, overflow: 'hidden', width: 1 },
  prompt: { marginBottom: -20, zIndex: 2 },
  resultPanel: { alignItems: 'center', maxWidth: 640, width: '90%' },
  retryButton: { alignItems: 'center', backgroundColor: '#6F3827', borderColor: '#FFCF76', borderWidth: 2, justifyContent: 'center', minHeight: 48, minWidth: 180, paddingHorizontal: 20 },
  retryText: { color: '#FFF0C7', fontFamily: 'Silkscreen', fontSize: 11 },
  saveStatus: { color: '#C9AA79', fontFamily: 'Silkscreen', fontSize: 9, marginBottom: 10, marginTop: 6 },
  screen: { alignItems: 'center', backgroundColor: '#100D0D', justifyContent: 'center', left: 0, overflow: 'hidden', position: 'absolute', top: 0 },
  snoozeButton: { height: '12.12%', left: '32.29%', minHeight: 44, minWidth: 44, position: 'absolute', right: '32.29%', top: '15.15%' },
  soundLeft: { right: '92%' },
  soundLine: { borderTopColor: '#FFB64D', borderTopWidth: 3, marginVertical: 7, transform: [{ rotate: '-8deg' }] },
  soundLineLeft: { alignSelf: 'flex-end', transform: [{ rotate: '8deg' }] },
  soundLines: { position: 'absolute', top: '38%', zIndex: 2 },
  soundRight: { left: '92%' },
  total: { color: '#FFF0C7', fontFamily: 'Silkscreen', fontSize: 15, marginTop: -30, textAlign: 'center' },
});
