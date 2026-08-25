import { createInitialState } from '../../domain/state/initial-state';
import { lindaContextActions } from '../../domain/quests/quest-machine';
import { actionCheckPreview } from '../action-check-copy';
import { actionCheckEntryProgress, actionCheckResultAnnouncement, escapeActionForPhase, sampleActionCheckTimeline } from '../ActionCheckOverlay';

jest.mock('expo-audio', () => ({ useAudioPlayer: jest.fn(), useAudioPlayerStatus: jest.fn() }));

describe('Action Check player surface', () => {
  test('the preview gives the complete rule, odds, inputs, and both stakes', () => {
    const action = lindaContextActions(createInitialState()).find(({ id }) => id === 'protect_linda');
    expect(action).toBeUndefined();

    const discovered = createInitialState();
    const authored = {
      id: 'protect_linda', label: 'Protect Linda', cause: 'cause', result: 'result',
      socialConsequence: 'social', routeConsequence: 'route', enabled: true,
      actionCheck: {
        dice: '2d6' as const, modifier: 4, target: 9, successesOutOf36: 30,
        healthReady: true, confidenceReady: true, equipmentReady: true,
        preparationReady: true, witnessCount: 1,
      },
    };
    const preview = actionCheckPreview(authored)!;
    expect(discovered.prng.cursor).toBeGreaterThanOrEqual(0);
    expect(preview.rule).toBe('SUCCEED IF 2d6 + 4 >= 9');
    expect(preview.chance).toBe('CHANCE 30/36 · 83.3%');
    expect(preview.inputs).toContain('FIRST AID READY');
    expect(preview.successStakes).toContain('Linda protected');
    expect(preview.failureStakes).toContain('-25 Health');
  });

  test('the timeline locks each die before revealing the final result', () => {
    expect(sampleActionCheckTimeline(999, false).leftLanded).toBe(false);
    expect(sampleActionCheckTimeline(1_000, false).leftLanded).toBe(true);
    expect(sampleActionCheckTimeline(1_149, false).rightLanded).toBe(false);
    expect(sampleActionCheckTimeline(1_150, false).rightLanded).toBe(true);
    expect(sampleActionCheckTimeline(1_949, false).showArithmetic).toBe(false);
    expect(sampleActionCheckTimeline(1_950, false).showArithmetic).toBe(true);
    expect(sampleActionCheckTimeline(4_850, false).canContinue).toBe(true);
    expect(sampleActionCheckTimeline(179, true).showArithmetic).toBe(false);
    expect(sampleActionCheckTimeline(180, true).showResult).toBe(true);
    expect(sampleActionCheckTimeline(2_980, true).canContinue).toBe(true);
    expect(actionCheckEntryProgress(180, true, true)).toBe(1);
    expect(actionCheckEntryProgress(180, false, false)).toBe(0);
    expect(actionCheckResultAnnouncement({ dice: [3, 5], modifier: 4, target: 9, total: 12, success: true }))
      .toBe('3 + 5 + 4 = 12. Target 9. Success.');
    expect(escapeActionForPhase('preview')).toBe('cancel');
    expect(escapeActionForPhase('rolling')).toBe('none');
    expect(escapeActionForPhase('result')).toBe('continue');
  });
});
