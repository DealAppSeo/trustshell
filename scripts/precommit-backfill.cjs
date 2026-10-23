#!/usr/bin/env node
/**
 * Dry-run backfill of learn episodes into pre-action / outcome records. SHADOW ONLY: not a
 * trustshell command, not in the npm package, writes no database. The logic and its rules live in
 * src/learn/precommit-backfill.ts; this file only loads that TypeScript and runs it.
 *
 *   node scripts/precommit-backfill.cjs --memory <memory.sqlite> [--out <new-file.jsonl>] [--min N]
 *
 * WHY A LOADER. The source is TypeScript with extensionless imports, which Node's own type
 * stripping cannot resolve, and the repo has no tsx or ts-node. So `.ts` is compiled on require
 * with the `typescript` devDependency, transpile-only (types are checked by `npm run verify`).
 * Needs `npm ci` first.
 */
'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

let ts;
try {
  ts = require('typescript');
} catch {
  process.stderr.write('precommit-backfill: NOT_CHECKED the typescript devDependency is not installed; run npm ci in this repo first\n');
  process.exit(2);
}

require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  module._compile(outputText, filename);
};

const { runBackfill } = require(join(__dirname, '..', 'src', 'learn', 'precommit-backfill.ts'));
process.exitCode = runBackfill(process.argv.slice(2), {
  out: (s) => process.stdout.write(s + '\n'),
  err: (s) => process.stderr.write(s + '\n'),
});
