import type { ReactElement } from 'react';

import type { ConversationPort } from '../../application/effects/ConversationPort';
import { createInitialState } from '../../domain/state/initial-state';
import { ConversationPanel } from '../ConversationPanel';

jest.mock('../CharacterPortrait', () => ({ CharacterPortrait: () => null }));
jest.mock('../VerbalMissionFeedback', () => ({
  VerbalMissionConfirmation: () => null,
  VerbalMissionFeedback: () => null,
}));
jest.mock('../../application/accessibility', () => ({ useReducedMotion: () => true }));

const { act, create } = require('react-test-renderer') as Readonly<{
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (
    element: ReactElement,
    options: Readonly<{ createNodeMock: () => unknown }>,
  ) => Readonly<{ unmount: () => void }>;
}>;

describe('ConversationPanel keyboard controls', () => {
  test('uses the panel cancel path for Escape', async () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const keyboardTarget = new EventTarget();
    Object.defineProperty(globalThis, 'document', { configurable: true, value: keyboardTarget });
    const onDismiss = jest.fn();
    let renderer: Readonly<{ unmount: () => void }> | undefined;

    try {
      await act(async () => {
        renderer = create(
          <ConversationPanel
            accent="#fff"
            fixtureDisplayName="Linda"
            fixtureMode
            locationName="Sunward Bay"
            npcId="linda"
            onDismiss={onDismiss}
            onPausedState={jest.fn()}
            onStableState={jest.fn()}
            onVocalCue={jest.fn()}
            port={{} as ConversationPort}
            state={createInitialState()}
            surface={{ height: 720, width: 1280 }}
            uiScale={1}
          />,
          { createNodeMock: () => ({ focus: jest.fn(), scrollToEnd: jest.fn() }) },
        );
      });
      const event = new Event('keydown', { cancelable: true });
      Object.defineProperty(event, 'key', { value: 'Escape' });
      await act(async () => {
        keyboardTarget.dispatchEvent(event);
        await Promise.resolve();
      });
      expect(event.defaultPrevented).toBe(true);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => renderer?.unmount());
      if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
      else delete (globalThis as { document?: unknown }).document;
    }
  });
});
