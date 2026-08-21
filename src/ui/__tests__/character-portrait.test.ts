import { portraitCharacterId, portraitIdentityId } from '../CharacterPortrait';
import { cinematicPortraits, portraitExpressions, portraits } from '../QuestOfferDialogue';

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

  test('routes every Tomas conversation expression to authored portrait art', () => {
    expect(Object.keys(portraitExpressions['tomas-reed'] ?? {}).sort()).toEqual(['joy', 'rest', 'upset']);
  });

  test('routes every Mina conversation expression to authored portrait art', () => {
    expect(Object.keys(portraitExpressions['mina-park'] ?? {}).sort()).toEqual(['joy', 'rest', 'upset']);
  });

  test('routes Devon expressions and cinematic conversations to separate portrait art', () => {
    expect(Object.keys(portraitExpressions['devon-price'] ?? {}).sort()).toEqual(['joy', 'rest', 'upset']);
    expect(cinematicPortraits['devon-price']).toBeDefined();
    expect(cinematicPortraits['devon-price']).not.toBe(portraits['devon-price']);
  });

  test('routes Linda expressions and cinematic conversations to separate portrait art', () => {
    expect(Object.keys(portraitExpressions.linda ?? {}).sort()).toEqual(['joy', 'rest', 'upset']);
    expect(cinematicPortraits.linda).toBeDefined();
    expect(cinematicPortraits.linda).not.toBe(portraits.linda);
  });

  test('routes Marcus expressions and cinematic conversations to separate portrait art', () => {
    expect(Object.keys(portraitExpressions['linda-boyfriend'] ?? {}).sort()).toEqual(['joy', 'rest', 'upset']);
    expect(cinematicPortraits['linda-boyfriend']).toBeDefined();
    expect(cinematicPortraits['linda-boyfriend']).not.toBe(portraits['linda-boyfriend']);
  });

  test('routes Mina cinematic conversations to separate portrait art', () => {
    expect(cinematicPortraits['mina-park']).toBeDefined();
    expect(cinematicPortraits['mina-park']).not.toBe(portraits['mina-park']);
  });

  test('routes Rafael expressions and cinematic conversations to separate portrait art', () => {
    expect(Object.keys(portraitExpressions['rafael-cruz'] ?? {}).sort()).toEqual(['joy', 'rest', 'upset']);
    expect(cinematicPortraits['rafael-cruz']).toBeDefined();
    expect(cinematicPortraits['rafael-cruz']).not.toBe(portraits['rafael-cruz']);
  });

  test('routes Sora expressions and cinematic conversations to separate portrait art', () => {
    expect(Object.keys(portraitExpressions['sora-tan'] ?? {}).sort()).toEqual(['joy', 'rest', 'upset']);
    expect(cinematicPortraits['sora-tan']).toBeDefined();
    expect(cinematicPortraits['sora-tan']).not.toBe(portraits['sora-tan']);
  });

  test('routes Calder expressions and cinematic conversations to separate Robot art', () => {
    expect(Object.keys(portraitExpressions['resident-01'] ?? {}).sort()).toEqual(['joy', 'rest', 'upset']);
    expect(cinematicPortraits['resident-01']).toBeDefined();
    expect(cinematicPortraits['resident-01']).not.toBe(portraits['resident-01']);
  });
});
