import { createInitialState } from '../../domain/state/initial-state';
import { selectedCharacterSummary } from '../selected-character';

describe('selected character summary', () => {
  test('shows the protagonist identity and live condition', () => {
    const summary = selectedCharacterSummary(createInitialState('Mara Vale'), 'protagonist', false);
    expect(summary).toMatchObject({
      activity: 'EXPLORING',
      displayName: 'Mara Vale',
      id: 'protagonist',
      relationship: expect.stringContaining('CONFIDENCE'),
    });
  });

  test('shows an NPC schedule, relationship, and destination', () => {
    const summary = selectedCharacterSummary(createInitialState(), 'linda', true);
    expect(summary).toMatchObject({
      activity: 'ON THE WAY',
      displayName: 'LINDA',
      destination: 'LINDA VILLA',
      relationship: expect.stringContaining('TRUST'),
    });
  });
});
