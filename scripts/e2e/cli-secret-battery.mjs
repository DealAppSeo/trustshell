#!/usr/bin/env node
// CLI secret battery. Runs `<TRUSTSHELL_BIN> check "<sentence containing a fake secret>"` once per shape against a LOCAL
// capture server (TRUSTSHELL_API_URL), and reports whether the secret VALUE appears in the bytes the CLI would send.
// Nothing leaves this machine. Usage:
//   TRUSTSHELL_BIN=/path/to/trustshell node cli-secret-battery.mjs [--mode regress|fixed]
//   (TRUSTSHELL_BIN may be a command with args, e.g. "node /path/to/dist/cli/index.js")
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHAPES, sentenceWith, classifySent } from './secret-shapes.mjs';
import { startCapture } from './capture-server.mjs';
import { makeReporter, parseMode } from './lib.mjs';

const mode = parseMode(process.argv.slice(2).length ? undefined : ['--mode', 'fixed']);
// Default: THIS tree's committed build, which is what `npm i github:DealAppSeo/trustshell` and a pack ship.
const here = dirname(fileURLToPath(import.meta.url));
const bin = (process.env.TRUSTSHELL_BIN || `${process.execPath} ${join(here, '..', '..', 'dist', 'cli', 'index.js')}`).split(/\s+/);
const probe = spawnSync(bin[0], [...bin.slice(1), '--version'], { encoding: 'utf8' });
if (probe.error || probe.status !== 0) { console.error(`NOT_CHECKED: cannot run "${bin.join(' ')}" (${probe.error?.message ?? 'exit ' + probe.status})`); process.exit(2); }
console.log(`CLI under test: ${bin.join(' ')}  version ${probe.stdout.trim()}   mode=${mode}\n`);

const cap = await startCapture();
const r = makeReporter(mode);
const tally = {};
/**
 * Run the CLI ASYNCHRONOUSLY. The capture server lives in THIS process, so a spawnSync here blocks the
 * event loop, the server never answers, the CLI waits out its own timeout (6 s), and the body is read
 * back as `null` before the server has handled it. `null` then reads as "nothing was sent", which is
 * the SECURE outcome, so the whole battery would pass vacuously (measured 2026-10-12: 6 s per call and
 * a null capture right after it). Awaiting the child's exit lets the server run.
 */
function runCli(args, env) {
  return new Promise((resolve) => {
    const c = spawn(bin[0], [...bin.slice(1), ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('close', (code) => resolve({ code, out }));
  });
}

for (const shape of SHAPES) {
  cap.reset();
  const run = await runCli(['check', sentenceWith(shape)], { ...process.env, TRUSTSHELL_API_URL: `http://127.0.0.1:${cap.port}` });
  // A short wait: the server handles the request on its own tick.
  await new Promise((r) => setTimeout(r, 25));
  const text = cap.lastClassifyText();
  // "Nothing sent" counts as secure ONLY when the CLI says it refused to send (exit 3, nothing left to check).
  // Any other silence is a harness fault, not a pass: the capture did not see the request.
  const refused = text === null && run.code === 3 && /nothing to check/.test(run.out);
  const out = text === null && !refused ? 'NOT_CAPTURED' : classifySent(shape, text);
  tally[out] = (tally[out] ?? 0) + 1;
  // SECURE = the value did not go out. PARTIAL counts as a leak: a run of the secret still travelled.
  r.check(`cli/${shape.id}`, out === 'SCRUBBED' || out === 'REFUSED', out + (out === 'NOT_CAPTURED' ? ` (exit ${run.code})` : ''), { knownOpen: shape.leaksToday });
}
await cap.close();
r.finish(`outcomes ${JSON.stringify(tally)}`);
