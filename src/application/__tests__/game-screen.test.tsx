import type { ReactElement } from 'react';

import type { LoadResult, SaveRequest, SaveResult } from '../effects/PersistencePort';
import { DEFAULT_PRESENTATION_PREFERENCES } from '../presentation/preferences';
import { getSavePort } from '../SavePort';
import { GameScreen, newGameSeed } from '../GameScreen';
import { createInitialState, INITIAL_STATE_SEED } from '../../domain/state/initial-state';

jest.mock('../SavePort', () => ({ getSavePort: jest.fn() }));
jest.mock('../../audio/halcyra-audio', () => ({
  useAudioEnabled: () => false,
  useInterfaceSounds: () => jest.fn(),
}));
jest.mock('../../audio/volume-store', () => ({ setAudioVolumes: jest.fn() }));
jest.mock('../../render/WorldScene', () => ({
  WorldScene: (props: object) => require('react').createElement('WorldScene', props),
}));
jest.mock('../../ui/AlarmIntroOverlay', () => ({
  AlarmIntroOverlay: (props: object) => require('react').createElement('AlarmIntroOverlay', props),
}));
jest.mock('../../ui/WorldErrorBoundary', () => ({
  WorldErrorBoundary: ({ children }: Readonly<{ children: ReactElement }>) => children,
}));
jest.mock('../LoadingShell', () => ({ LoadingShell: () => null }));
jest.mock('../NewGameFlow', () => ({
  NewGameFlow: (props: object) => require('react').createElement('NewGameFlow', props),
}));

type TestRenderer = Readonly<{
  root: Readonly<{ findByType: (type: string) => Readonly<{ props: Record<string, any> }> }>;
  unmount: () => void;
}>;

const { act, create } = require('react-test-renderer') as Readonly<{
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: ReactElement) => TestRenderer;
}>;

function installSavePort(
  requestSave: (request: SaveRequest) => Promise<SaveResult>,
  loadResult: LoadResult = { status: 'empty', slotId: 'slot-001' },
) {
  jest.mocked(getSavePort).mockReturnValue({
    loadPresentationPreferences: jest.fn(async () => DEFAULT_PRESENTATION_PREFERENCES),
    loadSave: jest.fn(async (): Promise<LoadResult> => loadResult),
    migrateSave: jest.fn(async () => { throw new Error('Migration is not used by this test.'); }),
    requestSave: jest.fn(requestSave),
    savePresentationPreferences: jest.fn(async () => DEFAULT_PRESENTATION_PREFERENCES),
  });
}

async function mountGame(): Promise<TestRenderer> {
  let renderer: TestRenderer | undefined;
  await act(async () => {
    renderer = create(<GameScreen onWorldReady={jest.fn()} rendererKind="threejs-2-5d" surface={{ height: 720, width: 1280 }} />);
    await Promise.resolve();
  });
  return renderer!;
}

describe('GameScreen new-game alarm intro', () => {
  test('uses the fixed smoke seed and injected cryptographic bytes in production', () => {
    const getRandomValues = jest.fn((values: Uint32Array<ArrayBuffer>) => { values[0] = 0xDEADBEEF; return values; });
    expect(newGameSeed(true, getRandomValues)).toBe(INITIAL_STATE_SEED);
    expect(getRandomValues).not.toHaveBeenCalled();
    expect(newGameSeed(false, getRandomValues)).toBe(0xDEADBEEF);
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });
  test('START waits for snooze, commits one roll, saves once, then mounts the world', async () => {
    let finishSave: ((result: SaveResult) => void) | undefined;
    const requestSave = jest.fn<Promise<SaveResult>, [SaveRequest]>(() => new Promise((resolve) => { finishSave = resolve; }));
    installSavePort(requestSave);
    const renderer = await mountGame();

    try {
      const flow = renderer.root.findByType('NewGameFlow');
      act(() => {
        flow.props.onStart('Rowan');
        flow.props.onStart('Rowan');
      });
      expect(requestSave).not.toHaveBeenCalled();

      const alarm = renderer.root.findByType('AlarmIntroOverlay');
      act(() => {
        alarm.props.onSnooze();
        alarm.props.onSnooze();
      });
      expect(requestSave).not.toHaveBeenCalled();
      const cup = renderer.root.findByType('AlarmIntroOverlay');
      expect(cup.props.snoozed).toBe(true);
      act(() => {
        expect(cup.props.onRoll()).toBe('committed');
        expect(cup.props.onRoll()).toBe('retry');
      });
      expect(requestSave).toHaveBeenCalledTimes(1);
      expect(requestSave.mock.calls[0]![0].state.clock.absoluteMinute).toBe(420);

      await act(async () => {
        finishSave?.({
          status: 'saved', slotId: 'slot-001', saveGeneration: 1,
          checksum: 'a'.repeat(64), maintenanceWarnings: [],
        });
        await Promise.resolve();
      });
      const savedAlarm = renderer.root.findByType('AlarmIntroOverlay');
      expect(savedAlarm.props.saveStatus).toBe('saved');
      act(() => savedAlarm.props.onComplete());
      const world = renderer.root.findByType('WorldScene');
      expect(world.props.initialSaveStatus).toBe('SAVED GEN 1');
      expect(world.props.initialState.prng).toBe(requestSave.mock.calls[0]![0].state.prng);
    } finally {
      await act(async () => renderer.unmount());
    }
  });

  test('a failed save retries the same committed state without rerolling', async () => {
    const requestSave = jest.fn<Promise<SaveResult>, [SaveRequest]>()
      .mockResolvedValueOnce({ status: 'deferred', slotId: 'slot-001', blockingPauseTokens: ['pause:test'] })
      .mockResolvedValueOnce({
        status: 'saved', slotId: 'slot-001', saveGeneration: 1,
        checksum: 'b'.repeat(64), maintenanceWarnings: [],
      });
    installSavePort(requestSave);
    const renderer = await mountGame();

    try {
      act(() => renderer.root.findByType('NewGameFlow').props.onStart('Rowan'));
      act(() => renderer.root.findByType('AlarmIntroOverlay').props.onSnooze());
      await act(async () => {
        renderer.root.findByType('AlarmIntroOverlay').props.onRoll();
        await Promise.resolve();
      });
      expect(renderer.root.findByType('AlarmIntroOverlay').props.saveStatus).toBe('failed');
      await act(async () => {
        renderer.root.findByType('AlarmIntroOverlay').props.onRetry();
        await Promise.resolve();
      });
      expect(requestSave).toHaveBeenCalledTimes(2);
      expect(requestSave.mock.calls[1]![0].state).toBe(requestSave.mock.calls[0]![0].state);
      expect(renderer.root.findByType('AlarmIntroOverlay').props.saveStatus).toBe('saved');
    } finally {
      await act(async () => renderer.unmount());
    }
  });

  test('a loaded save skips the alarm intro', async () => {
    const state = createInitialState('Rowan');
    installSavePort(jest.fn(), {
      status: 'unchanged', slotId: 'slot-001', saveGeneration: 4,
      checksum: 'c'.repeat(64), source: 'main', state,
      incompatibleCandidateCount: 0, corruptCandidateCount: 0,
    });
    const renderer = await mountGame();
    try {
      expect(renderer.root.findByType('WorldScene').props.initialSaveStatus).toBe('LOADED GEN 4');
      expect(() => renderer.root.findByType('AlarmIntroOverlay')).toThrow();
    } finally {
      await act(async () => renderer.unmount());
    }
  });
});
