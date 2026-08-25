import { DICE_ROLL_ALT_DELAY_MS, diceRollFlowEnd, diceRollFlowPhase, startDiceRollPair } from '../DiceRollFlow';
import { sampleDiceRollTimeline } from '../DiceRollCanvas';

jest.mock('expo-audio', () => ({ useAudioPlayer: jest.fn(), useAudioPlayerStatus: jest.fn() }));

test('normal dice flow settles, holds for 2.5 seconds, then exits', () => {
  expect(sampleDiceRollTimeline(1_949, false).showResult).toBe(false);
  expect(diceRollFlowPhase(1_950, false)).toBe('result-hold');
  expect(diceRollFlowPhase(4_449, false)).toBe('result-hold');
  expect(diceRollFlowPhase(4_450, false)).toBe('exiting');
  expect(diceRollFlowEnd(false)).toBe(4_850);
});

test('reduced motion keeps the same 2.5 second result hold', () => {
  expect(diceRollFlowPhase(180, true)).toBe('result-hold');
  expect(diceRollFlowPhase(2_679, true)).toBe('result-hold');
  expect(diceRollFlowPhase(2_680, true)).toBe('exiting');
  expect(diceRollFlowEnd(true)).toBe(2_980);
});

test('layers the altered dice cue after the original and can cancel it', () => {
  jest.useFakeTimers();
  const primary = { pause: jest.fn(), play: jest.fn(), volume: 0 };
  const accent = { pause: jest.fn(), play: jest.fn(), volume: 0 };
  const stop = startDiceRollPair(primary, accent, 0.8);

  expect(primary.play).toHaveBeenCalledTimes(1);
  expect(accent.play).not.toHaveBeenCalled();
  expect(primary.volume).toBe(0.8);
  expect(accent.volume).toBe(0.8);
  jest.advanceTimersByTime(DICE_ROLL_ALT_DELAY_MS);
  expect(accent.play).toHaveBeenCalledTimes(1);

  stop();
  expect(primary.pause).toHaveBeenCalledTimes(1);
  expect(accent.pause).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
