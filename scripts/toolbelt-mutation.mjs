#!/usr/bin/env node
/**
 * Mutation controls for tests/toolbelt-inspect-run.test.ts: remove one protection, run the test that should catch
 * it, and require that test to go RED. A negative test that stays green with its protection gone measures nothing.
 *
 *   node scripts/toolbelt-mutation.mjs [--out <file.json>]
 *
 * Each mutation edits a COPY (of dist/ and the harness, under the OS temp folder), never this checkout. The copy is
 * first run unmutated and must be green, else every mutation is NOT_CHECKED: a red that the copy causes on its own
 * proves nothing. EXIT 0 every mutation caught · 1 one was not · 2 NOT_CHECKED.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
const TEST = 'tests/toolbelt-inspect-run.test.ts';

/** where: 'harness' (scripts/toolbelt-harness.cjs) or a path under dist/. find must occur exactly once. */
const MUTATIONS = [
  { id: 'M1a', test: 'tamper:', where: 'harness', what: 'the belt file is not compared with its manifest sha256', find: 'else if (sha256(fs.readFileSync(f)) !== want) problems.push(', replace: 'else if (false) problems.push(' },
  { id: 'M1b', test: 'tamper:', where: 'harness', what: "the belt version is not compared with the owner-signed bundle's pointers", find: "if (!pl.evidence.some((e) => e.kind === 'file' && e.name === name && e.sha256 === sha)) {", replace: 'if (false) {' },
  { id: 'M2', test: 'expiry:', where: 'dist/lib/guardrails.js', what: 'the guard does not check expires_at (product code)', find: 'if (nowS >= policy.expires_at)', replace: 'if (false)' },
  { id: 'M3a', test: 'no grant:', where: 'harness', what: 'the belt runtime does not set TRUSTSHELL_REQUIRE_POLICY', find: "...(manifest.grant?.require_policy ? { TRUSTSHELL_REQUIRE_POLICY: '1' } : {}),", replace: '' },
  { id: 'M3b', test: 'no grant:', where: 'dist/mcp/index.js', what: 'trustshell-mcp ignores TRUSTSHELL_REQUIRE_POLICY (product code)', find: 'if ((0, guardrails_1.requirePolicy)(env)) {', replace: 'if (false) {' },
  { id: 'M4a', test: 'scope:', where: 'harness', what: "the owner's grant is not narrowed to the manifest (guard kill skipped)", find: "if (narrow) must(cli('guard', 'kill'), 0);", replace: '' },
  { id: 'M4b', test: 'scope:', where: 'dist/lib/guardrails.js', what: 'the guard does not check the action list (product code)', find: 'if (!permitted(policy.actions, req))', replace: 'if (false)' },
  { id: 'M4c', test: 'scope:', where: 'harness', what: 'attach does not refuse a grant wider than the manifest', find: 'if (outside.length) problems.push(', replace: 'if (false) problems.push(' },
  { id: 'M5', test: 'known answer: the right result', where: 'harness', what: 'the known-answer check does not compare claim statuses', find: 'if (seen[t] !== s) p.push(', replace: 'if (false) p.push(' },
  { id: 'M6', test: 'receipt:', where: 'harness', what: 'a sealed receipt or passport is not signature-checked', find: 'if (!L.key.verifyValue(s.body, s.signer, s.signature)) e.push(', replace: 'if (false) e.push(' },
  { id: 'M7', test: 'discovery:', where: 'harness', what: 'a skill name is not compared with its directory', find: 'if (n !== dirName) p.push(', replace: 'if (false) p.push(' },
];

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'toolbelt-mutation-'));
const JEST = path.join(ROOT, 'node_modules', 'jest', 'bin', 'jest.js');

/** A fresh copy: <dir>/pkg/{package.json, dist/} and <dir>/scripts/{harness, egress}. Packages resolve via NODE_PATH. */
function copy(name) {
  const dir = path.join(TMP, name);
  fs.cpSync(path.join(ROOT, 'dist'), path.join(dir, 'pkg', 'dist'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(dir, 'pkg', 'package.json'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  for (const f of ['toolbelt-harness.cjs', 'toolbelt-egress.cjs']) fs.copyFileSync(path.join(ROOT, 'scripts', f), path.join(dir, 'scripts', f));
  return dir;
}

function jest(dir, pattern) {
  const out = path.join(dir, 'jest.json');
  const env = {
    ...process.env,
    TOOLBELT_HARNESS: path.join(dir, 'scripts', 'toolbelt-harness.cjs'),
    TOOLBELT_DIST: path.join(dir, 'pkg', 'dist'),
    TOOLBELT_NODE_PATH: path.join(ROOT, 'node_modules'),
    NODE_PATH: path.join(ROOT, 'node_modules'),
  };
  const args = [JEST, TEST, '--json', '--outputFile', out, ...(pattern ? ['-t', pattern] : [])];
  const r = spawnSync(process.execPath, args, { cwd: ROOT, env, encoding: 'utf8', timeout: 900000, windowsHide: true });
  let results = [];
  try {
    results = JSON.parse(fs.readFileSync(out, 'utf8')).testResults.flatMap((t) => t.assertionResults.map((a) => ({ title: a.title, status: a.status, why: (a.failureMessages ?? []).join('\n').split('\n').find((l) => /Expected|Received|toMatch|toBe/.test(l))?.trim() ?? null })));
  } catch {
    /* no JSON: reported below as NOT_CHECKED */
  }
  return { exit: r.status, results };
}

const rows = [];
const say = (s) => console.log(s);
const control = jest(copy('control'), null);
const controlGreen = control.exit === 0 && control.results.length > 0 && control.results.every((x) => x.status === 'passed' || x.status === 'pending');
say(`control (unmutated copy): exit ${control.exit}, ${control.results.filter((x) => x.status === 'passed').length} passed, ${control.results.filter((x) => x.status === 'failed').length} failed, ${control.results.filter((x) => x.status === 'pending').length} skipped`);
for (const mu of MUTATIONS) {
  if (!controlGreen) {
    rows.push({ ...mu, result: 'NOT_CHECKED', detail: 'the unmutated copy is not green' });
    continue;
  }
  const dir = copy(mu.id);
  const file = mu.where === 'harness' ? path.join(dir, 'scripts', 'toolbelt-harness.cjs') : path.join(dir, 'pkg', mu.where);
  const text = fs.readFileSync(file, 'utf8');
  const n = text.split(mu.find).length - 1;
  if (n !== 1) {
    rows.push({ ...mu, result: 'NOT_CHECKED', detail: `the protection's text occurs ${n} times in ${mu.where}, not once` });
    continue;
  }
  fs.writeFileSync(file, text.replace(mu.find, mu.replace));
  const r = jest(dir, mu.test);
  const target = r.results.filter((x) => x.title.startsWith(mu.test) && x.status !== 'pending');
  const red = target.length > 0 && target.every((x) => x.status === 'failed');
  rows.push({ ...mu, result: target.length === 0 ? 'NOT_CHECKED' : red ? 'CAUGHT' : 'NOT CAUGHT', detail: target.map((x) => `${x.status}: ${x.why ?? ''}`).join(' | ') });
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
for (const r of rows) say(`${r.id.padEnd(4)} ${r.result.padEnd(11)} ${r.where.padEnd(22)} ${r.what}  [${r.test}]  ${r.detail}`);
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), control: { exit: control.exit, results: control.results }, mutations: rows }, null, 2) + '\n');
fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
process.exit(!controlGreen || rows.some((r) => r.result === 'NOT_CHECKED') ? 2 : rows.some((r) => r.result !== 'CAUGHT') ? 1 : 0);
