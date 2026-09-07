/**
 * `trustshell check` — verify a GitHub Actions run from the public API.
 * ------------------------------------------------------------------
 * The one command that needs NO account, NO key and NO backend: it asks
 * api.github.com what it can confirm about a run, prints that, and is explicit
 * about what it cannot confirm.
 *
 * EGRESS: `api.github.com` and nothing else. No telemetry, no upload, no
 * TrustShell backend. The whole point is that a sceptic can run it against
 * someone else's repo and owe nobody an account.
 *
 * This logic lives here, not in `bin/check.js`, for one mechanical reason:
 * `package.json` `files[]` publishes `dist/` only, so anything under `bin/` is
 * absent from the npm tarball. `npx @hyperdag/trustshell check <url>` — the
 * command the launch invite tells people to run — can only work if the code is
 * reachable from `dist/`. `bin/check.js` is kept as a thin shim over this.
 */

/** What GitHub could confirm. Three outcomes, never two — INCONCLUSIVE is not a pass. */
export type CheckVerdict = 'COMPLETE' | 'INCONSISTENT' | 'FAILED' | 'INCONCLUSIVE';

export interface ParsedRun {
  owner: string;
  repo: string;
  runId: string;
}

export interface CheckResult {
  verdict: CheckVerdict;
  source: string;
  freshness: 'LIVE';
  host: 'api.github.com';
  owner: string;
  repo: string;
  branch: string;
  sha: string;
  title: string;
  /** Whether the request was made with a token. Anonymous is the supported default. */
  authenticated: boolean;
  checks: { ok: boolean | null; label: string; detail: string }[];
  does_not_prove: string[];
}

/** Parse a GitHub Actions run URL. PURE — no I/O, so URL handling is testable. */
export function parseRun(url: string): ParsedRun | null {
  // Anchored to the real host, and restricted to GitHub's actual owner/repo
  // charset. `[^/]+` would have accepted `evil-github.com/...` and let a `?` or
  // `#` in a segment reshape the API path this builds. The fetch host is always
  // a literal, so this was never a redirect — but a command whose whole claim is
  // "api.github.com and nothing else" should not leave that argument to be made.
  const m = String(url || '').match(
    /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/actions\/runs\/(\d+)(?:[/?#]|$)/,
  );
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  return { owner: m[1], repo: m[2], runId: m[3] };
}

/**
 * The sentences this command refuses to let a reader forget. A card that only
 * says "✓ passed" is the failure this whole product exists to prevent.
 */
export const DOES_NOT_PROVE: string[] = [
  'This is what GitHub can confirm. It is not a judgement about whether the code is correct.',
  'It cannot show work done outside this repository, or on a branch that was never pushed.',
  'A passing test suite proves the tests that exist passed — not that the right tests exist.',
  'It does not establish who or what authored the change.',
];

interface GhResponse {
  ok: boolean;
  status: number;
  body: any;
}

/**
 * One GitHub GET.
 *
 * A token is OPTIONAL and only ever raises the rate limit. If a token is
 * present but REJECTED (401), this retries anonymously rather than failing:
 * the command promises "no account", so a stale `GITHUB_TOKEN` left in a shell
 * must not be able to break it. That case is real — it is how this was found.
 */
async function gh(path: string, token: string): Promise<GhResponse & { usedToken: boolean }> {
  const call = async (t: string) => {
    const headers: Record<string, string> = {
      'User-Agent': 'trustshell-check',
      Accept: 'application/vnd.github+json',
    };
    if (t) headers['Authorization'] = 'Bearer ' + t;
    const res = await fetch('https://api.github.com' + path, { headers });
    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
    return { ok: res.ok, status: res.status, body };
  };

  if (token) {
    const withToken = await call(token);
    if (withToken.status !== 401) return { ...withToken, usedToken: true };
  }
  return { ...(await call('')), usedToken: false };
}

/**
 * Pluralise a counted noun. The card is the artefact people are shown; "1 jobs"
 * on a tool whose subject is careful claims reads as carelessness about the
 * rest.
 */
export function plural(n: number, singular: string, pluralForm = singular + 's'): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/** Render the human card. PURE — takes a result, returns text. */
export function formatCheckCard(r: CheckResult): string {
  const mark = (ok: boolean | null) => (ok === true ? '✓' : ok === false ? '✕' : '?');
  return [
    'TrustShell · check',
    r.title,
    `${r.owner}/${r.repo} · ${r.branch} · ${r.sha.slice(0, 12)}`,
    r.source,
    '',
    `${r.verdict}  ·  checked live`,
    '',
    ...r.checks.map((c) => `${mark(c.ok)}  ${c.label}${c.detail ? '\n    ' + c.detail : ''}`),
    '',
    'What this does not prove',
    ...r.does_not_prove.map((s) => `* ${s}`),
    '',
    `Generated by trustshell check · public github API · nothing uploaded${r.authenticated ? ' · token used for rate limit only' : ' · no account'}`,
  ].join('\n');
}

/**
 * Ask GitHub about a run.
 *
 * Throws {@link CheckError} for a usage problem or an unreachable API; every
 * other outcome is a verdict, including the ones that are bad news.
 */
export class CheckError extends Error {
  constructor(message: string, readonly usage = false) {
    super(message);
    this.name = 'CheckError';
  }
}

export async function runCheck(url: string, env: Record<string, string | undefined> = process.env): Promise<CheckResult> {
  const parsed = parseRun(url);
  if (!parsed) {
    throw new CheckError('need https://github.com/owner/repo/actions/runs/123', true);
  }
  const token = (env['GITHUB_TOKEN'] || '').trim();
  const base = `/repos/${parsed.owner}/${parsed.repo}/actions/runs/${parsed.runId}`;

  const run = await gh(base, token);
  if (!run.ok) {
    throw new CheckError(`GitHub ${run.status}: ${run.body?.message || 'failed'}`);
  }
  // per_page=100 is the API maximum. Without it GitHub returns the first 30 and
  // says nothing about it, so "every job in the run passed" would have been a
  // claim about 30 of N jobs on any larger run — asserting a pass over work
  // never looked at.
  const jobs = await gh(`${base}/jobs?per_page=100`, token);
  const jobList: any[] = jobs.body?.jobs || [];
  const totalJobs: number = typeof jobs.body?.total_count === 'number' ? jobs.body.total_count : jobList.length;
  const truncated = totalJobs > jobList.length;
  const failed = jobList.filter(
    (j) => j.conclusion && j.conclusion !== 'success' && j.conclusion !== 'skipped',
  );

  const finished = run.body.status === 'completed';
  const runOk = run.body.conclusion === 'success';
  // A job list we only partly saw cannot support "every job passed".
  const jobsKnown = jobs.ok && jobList.length > 0 && !truncated;
  const jobsOk = jobsKnown && failed.length === 0;

  // Order matters, and the first branch is the one most easily got wrong: a run
  // still queued or in progress has `conclusion: null`, which reads as "not
  // success". Calling that FAILED accuses a build that has not finished of
  // failing. It is NOT CHECKED YET.
  let verdict: CheckVerdict;
  if (!finished) verdict = 'INCONCLUSIVE';
  else if (!runOk) verdict = 'FAILED';
  else if (!jobsKnown) verdict = 'INCONCLUSIVE';
  else if (!jobsOk) verdict = 'INCONSISTENT';
  else verdict = 'COMPLETE';

  const sha = run.body.head_sha || '';
  return {
    verdict,
    source: url,
    freshness: 'LIVE',
    host: 'api.github.com',
    owner: parsed.owner,
    repo: parsed.repo,
    branch: run.body.head_branch || '',
    sha,
    title: run.body.display_title || '',
    authenticated: run.usedToken,
    checks: [
      {
        ok: true,
        label: 'A workflow run with this id exists',
        detail: `${run.body.name || ''} · ${run.body.status}`,
      },
      {
        ok: finished,
        label: 'The run finished',
        detail: finished ? `status: ${run.body.status}` : `NOT CHECKED — still ${run.body.status}; nothing is decided yet`,
      },
      {
        ok: finished ? runOk : null,
        label: 'The run succeeded',
        detail: finished
          ? `GitHub reports conclusion: ${run.body.conclusion}`
          : 'NOT CHECKED — a run that has not finished has no conclusion',
      },
      {
        ok: jobsKnown ? jobsOk : null,
        label: 'Every job in the run passed',
        detail: !jobs.ok
          ? `NOT CHECKED — the jobs endpoint answered ${jobs.status}`
          : truncated
            ? `NOT CHECKED — GitHub reports ${totalJobs} jobs and returned ${jobList.length}; the rest were not read`
            : jobList.length === 0
              ? 'NOT CHECKED — the run reports no jobs'
              : failed.length
            ? `${failed.length} of ${jobList.length} jobs did not pass: ${failed.map((j) => j.name).join(', ')}`
            : plural(jobList.length, 'job'),
      },
      { ok: Boolean(sha), label: 'The commit exists on the remote', detail: sha },
    ],
    does_not_prove: DOES_NOT_PROVE,
  };
}

/**
 * Verdict → process exit code. PURE.
 *
 * INCONCLUSIVE is deliberately NOT 0. `bin/check.js` exited 0 for every verdict
 * it could compute, which made "we could not read the jobs" and "every job
 * passed" the same observable outcome for any script branching on it — the
 * exact NOT_CHECKED-scored-as-PASS defect this repo keeps paying for.
 */
export function checkExitCode(verdict: CheckVerdict): number {
  if (verdict === 'COMPLETE') return 0;
  if (verdict === 'INCONCLUSIVE') return 3;
  return 1;
}
