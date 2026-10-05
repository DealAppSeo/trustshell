#!/usr/bin/env node
/**
 * Send each home sample to production POST /api/v1/classify.
 *
 * Pace is 20 seconds between calls, one at a time, under the Cerebras budget
 * of about 4 a minute. The default is 3 runs of each sentence.
 *
 * Exit 1 when a sample that carries a why did not get why.when on every run.
 * Exit 2 (NOT_CHECKED) when a call fails, times out, or returns no contract label.
 * A sample with no why is still sent. Its label cannot fail the run.
 *
 * Not part of pull-request CI. `npm run test:home-samples`, or the
 * home-samples workflow, which is workflow_dispatch only.
 */
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const PACE_MS = 20000;
export const DEFAULT_RUNS = 3;
const DEFAULT_API = 'https://repid-engine-production.up.railway.app';

export function classifyRequest(text, env) {
  const base = String(env.TRUSTSHELL_API_URL ?? '').trim() || DEFAULT_API;
  return {
    url: `${base.replace(/\/+$/, '')}/api/v1/classify`,
    body: { text, labels: ['pass', 'veto', 'not-checked'] },
  };
}

export function labelOf(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (body.label !== 'pass' && body.label !== 'veto' && body.label !== 'not-checked') return null;
  return body.label;
}

export async function measure(samples, { n, paceMs, sleep, post }) {
  const rows = [];
  let calls = 0;
  for (const sample of samples) {
    const labels = [];
    for (let i = 0; i < n; i++) {
      if (calls > 0) await sleep(paceMs);
      calls += 1;
      let body;
      try {
        body = await post(sample.text);
      } catch {
        return { exit: 2, rows };
      }
      const label = labelOf(body);
      if (!label) return { exit: 2, rows };
      labels.push(label);
    }
    rows.push({
      label: sample.label,
      text: sample.text,
      when: sample.why ? sample.why.when : null,
      labels,
    });
  }
  const missed = rows.filter((row) => row.when && row.labels.some((label) => label !== row.when));
  return { exit: missed.length > 0 ? 1 : 0, rows };
}

export function formatReport(result) {
  const lines = [];
  if (result.exit === 2) lines.push('NOT_CHECKED');
  else {
    const missed = result.rows.filter((row) => row.when && row.labels.some((label) => label !== row.when));
    lines.push(`why did not match every time: ${missed.length}`);
  }
  for (const row of result.rows) {
    const got = row.labels.join(', ');
    lines.push(row.when ? `${row.label}: expected ${row.when}, got ${got}` : `${row.label}: got ${got}`);
  }
  return `${lines.join('\n')}\n`;
}

function runsOf(argv) {
  let n = DEFAULT_RUNS;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--runs') n = Number(argv[i + 1]);
  }
  if (!Number.isInteger(n) || n < 1) return DEFAULT_RUNS;
  return n;
}

async function postLive(text, env) {
  const req = classifyRequest(text, env);
  try {
    const res = await fetch(req.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    return JSON.parse(await res.text());
  } catch {
    return null;
  }
}

async function main() {
  const samplesUrl = pathToFileURL(resolve('lib/home-samples.ts')).href;
  const { HOME_SAMPLES } = await import(samplesUrl);
  const result = await measure(HOME_SAMPLES, {
    n: runsOf(process.argv.slice(2)),
    paceMs: PACE_MS,
    sleep: delay,
    post: (text) => postLive(text, process.env),
  });
  process.stdout.write(formatReport(result));
  process.exit(result.exit);
}

const invoked = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invoked) {
  main().catch(() => {
    process.stdout.write('NOT_CHECKED\n');
    process.exit(2);
  });
}
