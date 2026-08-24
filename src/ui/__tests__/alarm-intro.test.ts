import { alarmGrade, alarmIntroReady, startAlarmCadence } from '../AlarmIntroOverlay';

jest.mock('expo-audio', () => ({ useAudioPlayer: jest.fn() }));

describe('alarm intro', () => {
  test('grades every possible 2d6 total with exact copy', () => {
    expect(Array.from({ length: 11 }, (_, index) => alarmGrade(index + 2))).toEqual([
      'Bad', 'Bad', 'Bad', 'okay', 'okay', 'okay', 'okay', 'Good', 'Good', 'Good', 'Good',
    ]);
    expect(() => alarmGrade(1)).toThrow('2 through 12');
    expect(() => alarmGrade(13)).toThrow('2 through 12');
  });

  test('holds the settled result for 900 ms in both motion modes', () => {
    expect(alarmIntroReady(2_549, false)).toBe(false);
    expect(alarmIntroReady(2_550, false)).toBe(true);
    expect(alarmIntroReady(1_079, true)).toBe(false);
    expect(alarmIntroReady(1_080, true)).toBe(true);
  });

  test('restarts one player every 2.5 seconds and cancels permanently', async () => {
    jest.useFakeTimers();
    const player = {
      pause: jest.fn(),
      play: jest.fn(),
      seekTo: jest.fn(async () => undefined),
      volume: 0,
    };
    const stop = startAlarmCadence(player, 0.2);
    await Promise.resolve();
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.volume).toBe(0.2);

    jest.advanceTimersByTime(2_500);
    await Promise.resolve();
    expect(player.play).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(2_500);
    await Promise.resolve();
    expect(player.play).toHaveBeenCalledTimes(3);
    stop();
    jest.advanceTimersByTime(5_000);
    await Promise.resolve();
    expect(player.play).toHaveBeenCalledTimes(3);
    const stopResumed = startAlarmCadence(player, 0.2);
    await Promise.resolve();
    expect(player.play).toHaveBeenCalledTimes(4);
    stopResumed();
    jest.useRealTimers();
  });

  test('does not play after cancellation wins a pending seek race', async () => {
    let finishSeek: (() => void) | undefined;
    const player = {
      pause: jest.fn(),
      play: jest.fn(),
      seekTo: jest.fn(() => new Promise<void>((resolve) => { finishSeek = resolve; })),
      volume: 0,
    };
    const stop = startAlarmCadence(player, 0.2);
    stop();
    finishSeek?.();
    await Promise.resolve();
    expect(player.play).not.toHaveBeenCalled();
  });
});
