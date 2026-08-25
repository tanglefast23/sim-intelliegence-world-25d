import { diceRollFlowEnd, diceRollFlowPhase, diceRollImpactAt } from '../DiceRollFlow';
import { sampleDiceRollTimeline } from '../DiceRollCanvas';

jest.mock('expo-audio', () => ({ useAudioPlayer: jest.fn(), useAudioPlayerStatus: jest.fn() }));

test('normal dice flow settles, holds for 2.5 seconds, then exits', () => {
  expect(sampleDiceRollTimeline(1_949, false).showResult).toBe(false);
  expect(diceRollFlowPhase(1_950, false)).toBe('result-hold');
  expect(diceRollFlowPhase(4_449, false)).toBe('result-hold');
  expect(diceRollFlowPhase(4_450, false)).toBe('exiting');
  expect(diceRollFlowEnd(false)).toBe(4_850);
  expect(diceRollImpactAt(false)).toBe(1_150);
});

test('reduced motion keeps the same 2.5 second result hold', () => {
  expect(diceRollFlowPhase(180, true)).toBe('result-hold');
  expect(diceRollFlowPhase(2_679, true)).toBe('result-hold');
  expect(diceRollFlowPhase(2_680, true)).toBe('exiting');
  expect(diceRollFlowEnd(true)).toBe(2_980);
  expect(diceRollImpactAt(true)).toBe(80);
});
