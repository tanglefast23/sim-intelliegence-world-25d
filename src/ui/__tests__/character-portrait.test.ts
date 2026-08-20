import { portraitCharacterId, portraitIdentityId } from '../CharacterPortrait';
import { portraitExpressions } from '../QuestOfferDialogue';

describe('character portrait identity routing', () => {
  test('uses the vampire visual source for the protagonist portrait', () => {
    expect(portraitCharacterId('protagonist')).toBe('vampire-01');
    expect(portraitIdentityId('protagonist')).toBe('protagonist');
  });

  test('keeps ordinary character portrait ids unchanged', () => {
    expect(portraitCharacterId('linda')).toBe('linda');
  });

  test('routes every Elise conversation expression to authored portrait art', () => {
    expect(Object.keys(portraitExpressions['elise-moreau'] ?? {}).sort()).toEqual(['joy', 'rest', 'upset']);
  });
});
