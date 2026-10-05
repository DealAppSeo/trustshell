#!/usr/bin/env node
/**
 * Run examples/traps/traps.jsonl through POST /api/v1/classify.
 *
 * A row is reported only when both checkers agreed on a pass or a veto that is
 * not the row's expected label. A not-checked, a single voter, or an arithmetic
 * answer is not that finding: one of those is how a miss already looks.
 *
 * Pace is 15 seconds between calls, about 4 a minute, under the public free-tier
 * budget. A replay reads saved bodies and does not wait or dial out.
 *
 * The file holds the measured sentences whose full text is in this repo. The
 * abridged rows in trustshell PR 450 (50% chance, 23 people, ropes, ravens,
 * two envelopes, Berlin) are not here, because a shorter wording would be a
 * different claim.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACE_MS = 15000;
const DEFAULT_API = 'https://repid-engine-production.up.railway.app';
const EXPECTED = {
  'Checks out': 'pass',
  Caught: 'veto',
  'Not checked': 'not-checked',
};

export function classifyRequest(text, env) {
  const base = String(env.TRUSTSHELL_API_URL ?? '').trim() || DEFAULT_API;
  return {
    url: `${base.replace(/\/+$/, '')}/api/v1/classify`,
    body: { text, labels: ['pass', 'veto', 'not-checked'] },
  };
}

function answerOf(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (body.label !== 'pass' && body.label !== 'veto' && body.label !== 'not-checked') return null;
  return body;
}

/** True only when two or more voters agreed on a pass or veto other than expected. */
export function agreedWrong(expected, body) {
  const want = EXPECTED[expected];
  const answer = answerOf(body);
  if (!want || !answer) return false;
  if (answer.by !== 'votes' || !Array.isArray(answer.voters) || answer.voters.length < 2) return false;
  if (answer.label !== 'pass' && answer.label !== 'veto') return false;
  return answer.label !== want;
}

export async function runRows(rows, { paceMs, sleep, post }) {
  const bodies = [];
  for (let i = 0; i < rows.length; i++) {
    if (i > 0) await sleep(paceMs);
    bodies.push(await post(rows[i]));
  }
  return bodies;
}

export function formatReport(rows, bodies) {
  const hits = [];
  for (let i = 0; i < rows.length; i++) {
    const answer = answerOf(bodies[i]);
    if (!answer) return { exit: 2, text: `NOT_CHECKED\n${rows[i].statement}\n` };
    if (agreedWrong(rows[i].expected, answer)) hits.push({ row: rows[i], answer });
  }
  const lines = [`both checkers agreed on the wrong answer: ${hits.length}`];
  for (const hit of hits) {
    lines.push(`expected ${hit.row.expected}, got ${hit.answer.label}, voters ${hit.answer.voters.join(', ')}`);
    lines.push(hit.row.statement);
  }
  return { exit: hits.length > 0 ? 1 : 0, text: `${lines.join('\n')}\n` };
}

function loadJsonl(file) {
  return readFileSync(file, 'utf8')
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function argsOf(argv) {
  let file = resolve('examples/traps/traps.jsonl');
  let replay = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file') file = resolve(argv[++i] ?? '');
    else if (argv[i] === '--replay') replay = resolve(argv[++i] ?? '');
  }
  return { file, replay };
}

async function postLive(row, env) {
  const req = classifyRequest(row.statement, env);
  try {
    const res = await fetch(req.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(20000),
    });
    return JSON.parse(await res.text());
  } catch {
    return null;
  }
}

async function main() {
  const { file, replay } = argsOf(process.argv.slice(2));
  const rows = loadJsonl(file);
  let bodies;
  if (replay) {
    const raw = loadJsonl(replay);
    if (raw.length !== rows.length) {
      process.stdout.write('NOT_CHECKED\n');
      process.exit(2);
    }
    bodies = raw;
  } else {
    bodies = await runRows(rows, {
      paceMs: PACE_MS,
      sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
      post: (row) => postLive(row, process.env),
    });
  }
  const report = formatReport(rows, bodies);
  process.stdout.write(report.text);
  process.exit(report.exit);
}

const invoked = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invoked) {
  main().catch(() => {
    process.stdout.write('NOT_CHECKED\n');
    process.exit(2);
  });
}
