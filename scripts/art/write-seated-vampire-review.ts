import { writeSeatedVampireFourFacingReview } from './build-pencil-cast-review';

process.stdout.write(`${writeSeatedVampireFourFacingReview(process.argv[2] ?? 'pass-1')}\n`);
