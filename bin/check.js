#!/usr/bin/env node
/**
 * trustshell check — local dogfood entry point.
 *
 * A THIN SHIM. The logic lives in `src/lib/check.ts` → `dist/lib/check.js`,
 * because `package.json` `files[]` ships `dist/` only: anything implemented
 * here would be absent from the npm tarball, and
 * `npx @hyperdag/trustshell check <url>` — the command the invite tells people
 * to run — would fail. Same command, same output, one implementation.
 *
 * Kept because `node bin/check.js <url>` is the morning dogfood path and does
 * not require a global install. This one also writes `trustshell-card.txt`;
 * the published CLI does not write files into your working directory.
 */
'use strict';
const { writeFileSync } = require('node:fs');

let mod;
try {
  mod = require('../dist/lib/check.js');
} catch (e) {
  process.stderr.write('error: dist/ is not built. Run `npm run sdk:build` first.\n');
  process.exit(3);
}
const { runCheck, formatCheckCard, checkExitCode, CheckError } = mod;

async function main() {
  const url = process.argv[2];
  const json = process.argv.includes('--json');
  if (!url || url === '-h' || url === '--help') {
    process.stderr.write('usage: node bin/check.js <github-actions-run-url> [--json]\n');
    process.exit(2);
  }
  let result;
  try {
    result = await runCheck(url);
  } catch (e) {
    process.stderr.write((e && e.message ? e.message : String(e)) + '\n');
    process.exit(e instanceof CheckError && e.usage ? 2 : 3);
  }
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    const text = formatCheckCard(result);
    process.stdout.write(text + '\n');
    try { writeFileSync('trustshell-card.txt', text); } catch (_) {}
  }
  process.exit(checkExitCode(result.verdict));
}

main().catch((e) => { process.stderr.write(String((e && e.stack) || e) + '\n'); process.exit(3); });
