/**
 * Run trustshell verify on the first eight HAL calibration claims.
 * Prints one family-host-verdict line per claim.
 * OFFLINE=1 prints NOT_CHECKED for every claim and exits 0.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLAIMS = [
  'The capital of France is Paris.',
  'The chemical symbol for gold is Au.',
  'A triangle has three sides and three angles.',
  'DNA has a double-helix structure discovered by Watson and Crick.',
  'Mount Everest is the highest mountain above sea level on Earth.',
  'The human body has 206 bones in adulthood.',
  'Water boils at 100°C at standard atmospheric pressure.',
  'Pluto is a planet.',
];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'dist', 'cli', 'index.js');

function familyHostLine(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const named = lines.find((line) => /^[^\s]+ [^\s]+ (PASS|FLAG|VETO)$/.test(line));
  if (named) return named;
  return 'NOT_CHECKED';
}

if (process.env.OFFLINE === '1') {
  for (const _claim of CLAIMS) console.log('NOT_CHECKED');
  process.exit(0);
}

let failed = false;
for (const claim of CLAIMS) {
  const result = spawnSync(process.execPath, [CLI, 'verify', claim], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  console.log(familyHostLine(text));
  if (result.status !== 0 && result.status !== 1) failed = true;
}
process.exit(failed ? 1 : 0);
