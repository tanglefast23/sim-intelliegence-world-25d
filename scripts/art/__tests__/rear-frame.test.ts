import { composeFrontFrame, loadCharacterSources } from '../character-source';
import { deriveRearFrame } from '../rear-frame';

describe('rear-frame derivation', () => {
  test.each(loadCharacterSources().map((source) => [source.id, source] as const))(
    '%s preserves the source silhouette and removes the face',
    (_id, source) => {
      const front = composeFrontFrame(source, 0);
      const original = [...front];
      const rear = deriveRearFrame(front, source);

      expect(front).toEqual(original);
      expect(front.slice(8, 13)).not.toEqual(rear.slice(8, 13));
      expect(rear.slice(8, 13).join('')).not.toContain('E');
      const frontAlpha = front.map((row) => [...row].map((token) => token !== '.'));
      const rearAlpha = rear.map((row) => [...row].map((token) => token !== '.'));
      const expectedRearAlpha = source.signatureOddity.id === 'asymmetric-high-collar'
        ? frontAlpha.map((row) => [...row].reverse())
        : frontAlpha;
      expect(rearAlpha).toEqual(expectedRearAlpha);
      expect(rear).not.toEqual(front);
    },
  );
});
