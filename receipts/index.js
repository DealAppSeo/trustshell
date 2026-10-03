'use strict';
/**
 * Receipts — the GitHub Action entry. Zero dependencies, Node 20+ (global fetch).
 *
 * Reads: the PR (description, commits) and the check runs + statuses on its head commit.
 * Writes: one PR comment, updated in place, or the job summary when it may not comment.
 * Talks to: the GitHub API named by GITHUB_API_URL and nothing else. No telemetry.
 *
 * It never checks out or runs PR code, so it is safe on any trigger. Do NOT pair it with
 * `pull_request_target` + a checkout of the PR head; that is the classic Actions hole and
 * this action does not need it.
 */
const fs = require('node:fs');
const core = require('./core.js');

const API = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
const SERVER = (process.env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/$/, '');

function input(name, fallback) {
  const v = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`];
  return v === undefined || v === '' ? fallback : v;
}

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

async function gh(path, token, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    redirect: 'error',
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'trustshell-receipts',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const err = new Error(`GitHub API ${init.method || 'GET'} ${path} -> ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/** Check runs plus legacy commit statuses, as one list of {name, status, conclusion}. */
async function evidenceFor(repo, sha, token) {
  const runs = await gh(`/repos/${repo}/commits/${sha}/check-runs?per_page=100`, token);
  const out = (runs.check_runs || []).map((r) => ({ name: r.name, status: r.status, conclusion: r.conclusion, html_url: r.html_url }));
  try {
    const st = await gh(`/repos/${repo}/commits/${sha}/status`, token);
    for (const s of st.statuses || []) {
      const state = s.state;
      out.push({
        name: s.context,
        status: state === 'pending' ? 'in_progress' : 'completed',
        conclusion: state === 'success' ? 'success' : state === 'pending' ? null : state === 'error' ? 'failure' : state,
        html_url: s.target_url,
      });
    }
  } catch {
    // Statuses are optional evidence; a missing permission is not a verdict.
  }
  return out;
}

async function waitForOthers(repo, sha, token, selfPattern, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const ev = await evidenceFor(repo, sha, token);
    const others = ev.filter((r) => !selfPattern.test(r.name));
    const pending = others.filter((r) => r.status !== 'completed');
    if (pending.length === 0 || Date.now() >= deadline) return ev;
    log(`waiting on ${pending.length} check(s): ${pending.map((r) => r.name).join(', ')}`);
    await new Promise((r) => setTimeout(r, 15000));
  }
}

function summary(markdown) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) fs.appendFileSync(file, `${markdown}\n`);
}

async function upsertComment(repo, number, token, body) {
  const comments = await gh(`/repos/${repo}/issues/${number}/comments?per_page=100`, token);
  // Only a comment a bot wrote can be ours. Anyone can post a comment that starts with the
  // marker; editing it would fail (403) and the receipt would never post. Skip those.
  const mine = (comments || []).find(
    (c) => typeof c.body === 'string' && c.body.startsWith(core.MARKER) && c.user && c.user.type === 'Bot',
  );
  if (mine) {
    await gh(`/repos/${repo}/issues/comments/${mine.id}`, token, { method: 'PATCH', body: JSON.stringify({ body }) });
    return 'updated';
  }
  await gh(`/repos/${repo}/issues/${number}/comments`, token, { method: 'POST', body: JSON.stringify({ body }) });
  return 'posted';
}

async function main() {
  const token = input('github-token', process.env.GITHUB_TOKEN || '');
  const repo = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!repo || !eventPath) throw new Error('run this inside GitHub Actions (GITHUB_REPOSITORY and GITHUB_EVENT_PATH are unset)');
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const number = Number(input('pr-number', (event.pull_request && event.pull_request.number) || (event.issue && event.issue.number) || ''));
  if (!Number.isInteger(number) || number <= 0) {
    log('No pull request in this event; nothing to check.');
    return 0;
  }
  const selfPattern = new RegExp(input('self-pattern', 'receipt'), 'i');
  const timeoutMs = Math.max(0, Number(input('wait-seconds', '600')) || 0) * 1000;

  const pr = await gh(`/repos/${repo}/pulls/${number}`, token);
  const sha = pr.head.sha;
  const claims = core.extractClaims(pr.body || '', 'PR description');
  const commits = await gh(`/repos/${repo}/pulls/${number}/commits?per_page=100`, token);
  for (const c of commits || []) claims.push(...core.extractClaims(c.commit && c.commit.message, `commit ${String(c.sha).slice(0, 7)}`));
  const grouped = core.groupClaims(claims);

  const ev = grouped.length > 0 ? await waitForOthers(repo, sha, token, selfPattern, timeoutMs) : [];
  const results = core.judge(grouped, ev, { selfPattern });
  const body = core.render(results, { sha, repoUrl: `${SERVER}/${repo}` });
  summary(body);

  if (grouped.length === 0 && input('comment-when-empty', 'false') !== 'true') {
    log('No claims found; receipt written to the job summary only.');
    return 0;
  }
  try {
    log(`receipt ${await upsertComment(repo, number, token, body)} on #${number}`);
  } catch (e) {
    // A PR from a fork gets a read-only token, so it cannot comment. That is GitHub's
    // safety rule working, not a failure: the receipt is in the job summary.
    if (e.status === 403 || e.status === 404) log(`could not comment (${e.status}); receipt is in the job summary`);
    else throw e;
  }
  const failed = results.filter((r) => r.verdict === 'FAILED').length;
  return input('fail-on-failed', 'false') === 'true' && failed > 0 ? 1 : 0;
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      process.stdout.write(`::error::receipts: ${e && e.message ? e.message : String(e)}\n`);
      process.exit(1);
    },
  );
}

module.exports = { main, evidenceFor, upsertComment };
