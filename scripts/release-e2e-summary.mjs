#!/usr/bin/env node
// Prints a release-e2e result as Markdown, listing every step that did not pass.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'e2e-out';
const name = readdirSync(dir).find((f) => f.startsWith('e2e-') && f.endsWith('.json'));
if (!name) {
  console.log('### NOT_CHECKED: the E2E wrote no result file');
  process.exit(0);
}
const s = JSON.parse(readFileSync(join(dir, name), 'utf8'));
console.log(`### ${s.platform}: ${s.pass} passed, ${s.fail} failed, ${s.not_checked} not checked (shells: ${s.shells.join(', ')})\n`);
if (s.github) {
  console.log(`GitHub, no token: ${s.github.requests} requests, ${s.github.with_auth_header} with an auth header.`);
  for (const b of s.github.budget) console.log(`- budget before ${b.before}: ${b.note}${b.waited_s ? `; ${b.remaining_after ?? '?'} left after the wait` : ''}`);
  console.log('');
}
for (const r of s.results.filter((x) => x.status !== 'PASS')) console.log(`- **${r.status}** ${r.id}: ${r.what}`);
