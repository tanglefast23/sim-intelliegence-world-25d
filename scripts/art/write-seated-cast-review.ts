import { writeSeatedCastReview, writeSeatedCharacterFourFacingReview } from './build-pencil-cast-review';

const tag = process.argv[2] ?? 'pass-1';
const ids = [
  'linda-boyfriend', 'devon-price', 'rafael-cruz', 'tomas-reed', 'priya-nair',
  'sora-tan', 'resident-01', 'resident-02', 'elise-moreau',
] as const;

process.stdout.write(`${writeSeatedCastReview(tag)}\n`);
for (const visualId of ids) process.stdout.write(`${writeSeatedCharacterFourFacingReview(visualId, tag)}\n`);
