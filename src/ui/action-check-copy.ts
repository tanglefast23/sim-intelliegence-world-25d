import { INJURED_ESCAPE_HEALTH_COST, INJURED_ESCAPE_TIME_MINUTES } from '../domain/consequences/defeat';
import { LINDA_QUEST, type ContextQuestAction } from '../domain/quests/quest-machine';

export type ActionCheckPreview = Readonly<{
  checkId: 'protect_linda';
  title: string;
  rule: string;
  range: string;
  readiness: string;
  chance: string;
  inputs: string;
  successStakes: string;
  failureStakes: string;
  accessibilityText: string;
  modifier: number;
  target: number;
  successesOutOf36: number;
}>;

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`;
}

export function actionCheckPreview(action: ContextQuestAction): ActionCheckPreview | undefined {
  const check = action.actionCheck;
  if (!check || action.id !== 'protect_linda') return undefined;
  const approach = LINDA_QUEST.approaches.find(({ id }) => id === 'protect_linda')!;
  const success = approach.success;
  const failure = approach.defeat!;
  const percent = (check.successesOutOf36 / 36 * 100).toFixed(1);
  const witness = check.witnessCount > 0
    ? `${check.witnessCount} witness${check.witnessCount === 1 ? '' : 'es'}; evidence noticed; police attention becomes noticed`
    : 'no independent witness; evidence unnoticed; police attention does not rise';
  const successFaction = success.factionDelta
    ? ` Velvet Tide ${signed(success.factionDelta.delta)} and revealed.`
    : '';
  const successStakes = `SUCCESS · Linda protected; $${success.reward?.amount ?? 0}; Linda familiarity ${signed(success.relationshipDelta.familiarity)}, trust ${signed(success.relationshipDelta.trust)}, attraction ${signed(success.relationshipDelta.attraction)}; boyfriend ${success.npcEffect.condition}; ${witness}.${successFaction}`;
  const failureStakes = `FAILURE · Injured escape; -${INJURED_ESCAPE_HEALTH_COST} Health; +${INJURED_ESCAPE_TIME_MINUTES / 60} hours; $0; Linda familiarity ${signed(failure.relationshipDelta.familiarity)}, trust ${signed(failure.relationshipDelta.trust)}, attraction ${signed(failure.relationshipDelta.attraction)}; boyfriend ${failure.npcEffect.condition}; ${witness}.`;
  const inputs = `HEALTH ${check.healthReady ? 'READY' : 'LOW'} · CONFIDENCE ${check.confidenceReady ? 'READY' : 'LOW'} · FIRST AID ${check.equipmentReady ? 'READY' : 'MISSING'} · SECURITY REPORT ${check.preparationReady ? 'READY' : 'MISSING'}`;
  const preview = {
    checkId: 'protect_linda' as const,
    title: 'PROTECT LINDA · ACTION CHECK',
    rule: `SUCCEED IF 2d6 + ${check.modifier} >= ${check.target}`,
    range: 'ROLL 2d6 · RANGE 2–12',
    readiness: `READINESS +${check.modifier} · TARGET ${check.target}`,
    chance: `CHANCE ${check.successesOutOf36}/36 · ${percent}%`,
    inputs,
    successStakes,
    failureStakes,
    modifier: check.modifier,
    target: check.target,
    successesOutOf36: check.successesOutOf36,
  };
  return {
    ...preview,
    accessibilityText: [preview.title, preview.range, preview.readiness, preview.rule, preview.chance, inputs, successStakes, failureStakes].join('. '),
  };
}
