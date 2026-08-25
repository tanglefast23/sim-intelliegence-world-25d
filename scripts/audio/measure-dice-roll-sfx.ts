import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

type RecordFile = Readonly<{
  source: Readonly<{ integratedLufs: number }>;
  production: Readonly<{ path: string; sha256: string; integratedLufs: number; truePeakDbfs: number }>;
}>;
const record = JSON.parse(readFileSync('docs/audio/dice-roll-sfx-measurement.json', 'utf8')) as Readonly<{
  target: Readonly<{ maxTruePeakDbfs: number; minimumGainLu: number }>;
  files: Readonly<Record<string, RecordFile>>;
}>;

for (const [name, file] of Object.entries(record.files)) {
  const bytes = readFileSync(file.production.path);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== file.production.sha256) throw new Error(`${name} production hash changed.`);
  const result = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file.production.path, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${name} did not decode.`);
  const output = `${result.stdout}\n${result.stderr}`;
  const loudness = [...output.matchAll(/^\s*I:\s*(-?\d+(?:\.\d+)?) LUFS$/gm)].at(-1)?.[1];
  const peak = [...output.matchAll(/^\s*Peak:\s*(-?\d+(?:\.\d+)?) dBFS$/gm)].at(-1)?.[1];
  if (!loudness || !peak) throw new Error(`${name} measurement output was incomplete.`);
  const measuredLoudness = Number(loudness);
  const measuredPeak = Number(peak);
  if (Math.abs(measuredLoudness - file.production.integratedLufs) > 0.11 || Math.abs(measuredPeak - file.production.truePeakDbfs) > 0.11) {
    throw new Error(`${name} measurement changed: ${measuredLoudness} LUFS, ${measuredPeak} dBFS.`);
  }
  if (measuredLoudness - file.source.integratedLufs < record.target.minimumGainLu) throw new Error(`${name} gained less than 3 LU.`);
  if (measuredPeak > record.target.maxTruePeakDbfs) throw new Error(`${name} exceeds the true-peak ceiling.`);
  process.stdout.write(`${name}: ${measuredLoudness} LUFS, ${measuredPeak} dBFS, hash verified\n`);
}
