import type { ReactElement } from 'react';

import type { LoadResult, SaveRequest, SaveResult } from '../effects/PersistencePort';
import { DEFAULT_PRESENTATION_PREFERENCES } from '../presentation/preferences';
import { getSavePort } from '../SavePort';
import { GameScreen } from '../GameScreen';

jest.mock('../SavePort', () => ({ getSavePort: jest.fn() }));
jest.mock('../../audio/halcyra-audio', () => ({
  useAudioEnabled: () => false,
  useInterfaceSounds: () => jest.fn(),
}));
jest.mock('../../audio/volume-store', () => ({ setAudioVolumes: jest.fn() }));
jest.mock('../../render/WorldScene', () => ({ WorldScene: () => null }));
jest.mock('../../ui/WorldErrorBoundary', () => ({
  WorldErrorBoundary: ({ children }: Readonly<{ children: ReactElement }>) => children,
}));
jest.mock('../LoadingShell', () => ({ LoadingShell: () => null }));
jest.mock('../NewGameFlow', () => ({
  NewGameFlow: (props: object) => require('react').createElement('NewGameFlow', props),
}));

type TestRenderer = Readonly<{
  root: Readonly<{
    findByType: (type: string) => Readonly<{ props: Readonly<{ onStart: (displayName: string) => void }> }>;
  }>;
  unmount: () => void;
}>;

const { act, create } = require('react-test-renderer') as Readonly<{
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: ReactElement) => TestRenderer;
}>;

describe('GameScreen new-game startup', () => {
  test('accepts only one save request before busy re-renders', async () => {
    let finishSave: ((result: SaveResult) => void) | undefined;
    const requestSave = jest.fn<Promise<SaveResult>, [SaveRequest]>(() => new Promise<SaveResult>((resolve) => { finishSave = resolve; }));
    jest.mocked(getSavePort).mockReturnValue({
      loadPresentationPreferences: jest.fn(async () => DEFAULT_PRESENTATION_PREFERENCES),
      loadSave: jest.fn(async (): Promise<LoadResult> => ({ status: 'empty', slotId: 'slot-001' })),
      migrateSave: jest.fn(async () => { throw new Error('Migration is not used by this test.'); }),
      requestSave,
      savePresentationPreferences: jest.fn(async () => DEFAULT_PRESENTATION_PREFERENCES),
    });
    let renderer: TestRenderer | undefined;

    try {
      await act(async () => {
        renderer = create(<GameScreen onWorldReady={jest.fn()} rendererKind="threejs-2-5d" surface={{ height: 720, width: 1280 }} />);
        await Promise.resolve();
      });
      const flow = renderer!.root.findByType('NewGameFlow');
      act(() => {
        flow.props.onStart('Rowan');
        flow.props.onStart('Rowan');
      });
      expect(requestSave).toHaveBeenCalledTimes(1);
      await act(async () => {
        finishSave?.({
          status: 'saved',
          slotId: 'slot-001',
          saveGeneration: 1,
          checksum: 'a'.repeat(64),
          maintenanceWarnings: [],
        });
        await Promise.resolve();
      });
    } finally {
      await act(async () => renderer?.unmount());
    }
  });
});
