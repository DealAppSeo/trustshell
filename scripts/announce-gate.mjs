#!/usr/bin/env node
/**
 * SAY SO WHEN THE SCHEDULED HONESTY GATE IS RED. Open a tracking issue; close it when it is green.
 *
 * WHY THIS EXISTS. e2e-honesty.yml says of itself: "a red here NEVER blocks a merge; it is a signal
 * to a human". Nothing delivered the signal. The gate was red on every scheduled run from
 * 2026-09-30 to 2026-10-11 (12 of 12), and the logs sampled across that window name different
 * causes (repid.read and zkrepid.freshness, then x402.payment_header). The only trace was a red
 * tick on a page nobody had a reason to open. A gate that cannot reach a human is a log file with
 * a schedule. Sean, verbatim: "Fix the gate so a red scheduled check posts, or it is not a gate."
 *
 * WHAT IT DOES, given the two job results from the run it is part of:
 *
 *   red,   no open tracking issue   -> OPEN one, listing the legs that put the gate red
 *   red,   tracking issue is open   -> COMMENT on it and refresh its body (does not open a second)
 *   green, tracking issue is open   -> COMMENT "green again" and CLOSE it
 *   green, none open                -> nothing, and says so
 *
 * "Red" is anything but `success` from either job: cancelled and skipped count. This repo's rule
 * for the acceptance job is that a NOT_CHECKED is a failure of the job rather than an absence of
 * signal, and a run that never finished is the same class — it looked at nothing.
 *
 * ONE ISSUE, FOUND BY A MARKER IN ITS BODY. Not by title (the title carries the date it opened),
 * and not by label (a label must exist first, and a missing label is a silent failure). If a human
 * closes the issue while the gate is still red, the next red scheduled run opens a fresh one: the
 * red has not been resolved just because somebody dismissed the notice.
 *
 * ONLY A SCHEDULED RUN WRITES. A manual workflow_dispatch run executes this too, in DRY RUN: it
 * does every read and prints what it WOULD have posted, so the plumbing can be rehearsed on a real
 * runner without a stray issue. The decision is one env var, ANNOUNCE_WRITE, set from the event
 * name in the workflow; tests/announce-gate.test.ts pins that expression.
 *
 * THIS SCRIPT MUST NOT FAIL QUIETLY. If it cannot post, it exits 1, which turns the announce job
 * red. A red that is announced by a mechanism that can itself fail silently has moved the problem,
 * not solved it. It does not fall back to anything else and does not swallow an API error.
 *
 * KNOWN LIMIT, STATED SO IT IS NOT DISCOVERED LATER: if the scheduled run does not happen at all —
 * GitHub drops queued crons under load, and disables schedules on a repository with no activity —
 * nothing here runs and nothing is announced. That is a dead-man's switch problem and is not
 * solved by this file. The header of e2e-honesty.yml picks :20 past the hour partly to make it rarer.
 *
 * Env (set by the workflow): GITHUB_TOKEN, ACCEPTANCE_RESULT, HONESTY_RESULT, ANNOUNCE_WRITE,
 * RECEIPT_DIR. Set by the runner: GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_SHA, GITHUB_SERVER_URL,
 * GITHUB_API_URL, GITHUB_STEP_SUMMARY.
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Hidden marker in the body of the tracking issue. The ONLY thing that identifies it. */
const MARKER = '<!-- e2e-honesty-gate:tracking-issue -->';
/** The file tests/e2e/acceptance-baseline.mjs writes into RECEIPT_DIR. Same literal there. */
const VERDICT_FILE = 'acceptance-baseline.json';

const env = process.env;
const need = (name) => {
  const v = env[name];
  if (!v) { console.error(`announce-gate: ${name} is not set — the workflow did not wire this in, and guessing would announce the wrong thing`); process.exit(1); }
  return v;
};

/** Anything inside a code fence must not be able to close it. */
const fenced = (text) => '```\n' + String(text).replace(/`{3,}/g, "'''").slice(0, 700) + '\n```';

/** Read the comparator's verdict. Absence is reported as absence, never as "no problems". */
function readVerdict(dir) {
  const file = join(dir, VERDICT_FILE);
  if (!existsSync(file)) return { found: false, note: `no ${VERDICT_FILE} in ${dir} — the acceptance job died before the comparator wrote one, or the receipt artifact was not downloaded` };
  try {
    const v = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(v.problems)) return { found: false, note: `${VERDICT_FILE} has no problems array` };
    return { found: true, ...v };
  } catch (e) {
    return { found: false, note: `${VERDICT_FILE} is unreadable: ${String(e.message).slice(0, 120)}` };
  }
}

/** Steps that failed in the run's jobs. Enrichment only: the red is announced even if this throws. */
function failedSteps(jobs, names) {
  return jobs
    .filter((j) => names.includes(j.name) && j.conclusion !== 'success')
    .map((j) => ({
      job: j.name,
      conclusion: j.conclusion ?? 'unknown',
      steps: (j.steps ?? []).filter((s) => s.conclusion === 'failure' || s.conclusion === 'cancelled').map((s) => s.name),
    }));
}

function renderBody({ results, verdict, steps, stepsNote, runUrl, sha, firstRed, now }) {
  const lines = [MARKER, `<!-- first-red:${firstRed} -->`, ''];
  lines.push('**The scheduled `e2e-honesty` gate is RED.** This issue is opened by the scheduled run and closed by the first scheduled run that is green again, so it stays open exactly as long as the gate does. A manual re-run does not close it.', '');
  lines.push(`- First red: ${firstRed}`, `- Latest red: ${now}`, `- Latest run: ${runUrl} (commit \`${String(sha).slice(0, 7)}\`)`);
  lines.push(`- Job results: acceptance \`${results.acceptance}\`, honesty \`${results.honesty}\``, '');

  lines.push('### Cold-install acceptance gate (job `acceptance`)', '');
  if (results.acceptance === 'success') lines.push('Passed.', '');
  else if (!verdict.found) lines.push(`The job did not succeed, and its legs cannot be listed: ${verdict.note}.`, '');
  else {
    if (verdict.installed || verdict.version) lines.push(`Tested \`${verdict.installed ?? verdict.version}\` as installed from npm.`, '');
    if (verdict.problems.length === 0) lines.push(`The comparator reported no mismatch, yet the job result was \`${results.acceptance}\`. Read the run log.`, '');
    for (const p of verdict.problems) lines.push(`- **${p.kind}** \`${p.leg}\``, fenced(p.detail).replace(/^/gm, '  '), '');
    lines.push('The baseline\'s known gaps (legs that FAILED as expected) are not listed: they match the baseline and did not turn the gate red.', '');
  }

  lines.push('### Browser honesty suites (job `honesty`)', '');
  if (results.honesty === 'success') lines.push('Passed.', '');
  else {
    const h = steps.find((s) => s.job === 'honesty');
    if (h && h.steps.length) for (const s of h.steps) lines.push(`- failed step: ${s}`);
    else lines.push(`The job did not succeed (\`${results.honesty}\`) and no failed step could be listed${stepsNote ? `: ${stepsNote}` : ''}.`);
    lines.push('');
  }
  lines.push('Logs and the receipts artifacts are on the run page above. NOT_CHECKED is not a pass.');
  return lines.join('\n');
}

async function main() {
  const repo = need('GITHUB_REPOSITORY');
  const token = need('GITHUB_TOKEN');
  const results = { acceptance: need('ACCEPTANCE_RESULT'), honesty: need('HONESTY_RESULT') };
  const runId = need('GITHUB_RUN_ID');
  const api = (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
  const runUrl = `${(env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/$/, '')}/${repo}/actions/runs/${runId}`;
  const write = env.ANNOUNCE_WRITE === 'true';
  const red = Object.values(results).some((r) => r !== 'success');
  const today = new Date().toISOString().slice(0, 10);

  const call = async (method, path, body) => {
    const res = await fetch(`${api}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28', 'user-agent': 'trustshell-announce-gate',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  };

  const findOpen = async () => {
    for (let page = 1; page <= 5; page++) {
      const batch = await call('GET', `/repos/${repo}/issues?state=open&per_page=100&page=${page}`);
      const hit = batch.find((i) => !i.pull_request && typeof i.body === 'string' && i.body.includes(MARKER));
      if (hit) return hit;
      if (batch.length < 100) return null;
    }
    return null;
  };

  const summary = [];
  const say = (line) => { console.log(line); summary.push(line); };
  const open = await findOpen();
  say(`announce-gate: acceptance=${results.acceptance} honesty=${results.honesty} -> ${red ? 'RED' : 'GREEN'}; ` +
    `${open ? `tracking issue #${open.number} is open` : 'no tracking issue is open'}; ${write ? 'WRITING (scheduled run)' : 'DRY RUN (not a scheduled run — nothing is posted)'}`);

  if (red) {
    const verdict = readVerdict(env.RECEIPT_DIR || 'receipts');
    let steps = [];
    let stepsNote = '';
    try {
      steps = failedSteps((await call('GET', `/repos/${repo}/actions/runs/${runId}/jobs?per_page=100`)).jobs ?? [], ['acceptance', 'honesty']);
    } catch (e) { stepsNote = String(e.message).slice(0, 160); }

    const firstRed = open ? (/<!-- first-red:(\d{4}-\d{2}-\d{2}) -->/.exec(open.body)?.[1] ?? today) : today;
    const body = renderBody({ results, verdict, steps, stepsNote, runUrl, sha: env.GITHUB_SHA ?? '', firstRed, now: today });
    const nightly = `Still red on ${today}: ${runUrl}` +
      (verdict.found && verdict.problems.length ? '\n\n' + verdict.problems.map((p) => `- ${p.kind} \`${p.leg}\``).join('\n') : '');
    summary.push('', body);

    if (!write) say(open ? `would comment on and refresh #${open.number}` : 'would open a new tracking issue');
    else if (open) {
      await call('PATCH', `/repos/${repo}/issues/${open.number}`, { body });
      await call('POST', `/repos/${repo}/issues/${open.number}/comments`, { body: nightly });
      say(`updated #${open.number} and commented`);
    } else {
      const made = await call('POST', `/repos/${repo}/issues`, { title: `🔴 e2e-honesty RED — since ${today}`, body });
      say(`opened #${made.number}`);
    }
  } else if (open) {
    if (!write) say(`would comment on and close #${open.number}`);
    else {
      await call('POST', `/repos/${repo}/issues/${open.number}/comments`, { body: `Green again on ${today}: ${runUrl}. Closing.` });
      await call('PATCH', `/repos/${repo}/issues/${open.number}`, { state: 'closed', state_reason: 'completed' });
      say(`commented on and closed #${open.number}`);
    }
  } else say('green, and nothing is open: nothing to do');

  if (env.GITHUB_STEP_SUMMARY) { try { appendFileSync(env.GITHUB_STEP_SUMMARY, summary.join('\n') + '\n'); } catch { /* the log above already has it */ } }
}

main().catch((e) => { console.error(`announce-gate FAILED — the red could not be announced: ${e.message}`); process.exit(1); });
