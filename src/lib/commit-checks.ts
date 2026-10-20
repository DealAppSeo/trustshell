/**
 * Every check GitHub reports for one commit, for `check <runUrl> --claims … --guided` (EXPERIMENTAL).
 *
 * Read-only, api.github.com only, with `check`'s rule for tokens (optional; only raises the rate
 * limit). Whatever cannot be read, or was read only in part, is `null` here, and a `null` decides
 * nothing: see `allChecksEntry` in action-evidence.ts, which is the only reader of this shape.
 *
 * Why each piece is read (CLAIMS-v1 stage 2, XC1's adversarial round):
 *   check_runs (filter=latest)  what the PR page shows: the latest run of each check
 *   filter=all                   a check that failed and was re-run until green (R2)
 *   statuses                     integrations that still post commit statuses
 *   check suites                 a GitHub Actions workflow that has not started yet has a suite and
 *                                no check run, so the check-run list alone cannot see it
 *   rulesets, branch protection  a required check that never reported is missing from every list
 *                                (R1); one pinned to an app is met only by that app's run (Q1/Q2)
 *   status history               a status that failed and later passed (S2)
 *   the change's files           a change that edits .github/workflows or .github/actions, or renames
 *                                a file out of them, wrote its own checks (R4, W1)
 */
import { githubGet } from './check';

export interface CommitChecks {
  head_sha: string;
  /** When the first read started; `retrieved_at` is when the last one ended (XC1 F5). */
  started_at: string;
  retrieved_at: string;
  /**
   * How the base branches (whose required checks apply) and the change's files were found. Always the
   * UNION of the pull requests GitHub associates with the commit and the run's own context, never one
   * instead of the other (XC1 F1/F2, R3/R4):
   *   pr          a pull-request-like run: its own PR, found by its head label and head SHA
   *   push        a same-repository push or other run: the branch it ran on, and this commit's diff
   *   unresolved  the run's own context could not be found: required checks are unknown
   * `associated` counts the associated PRs added to it.
   */
  base: { how: 'pr' | 'push' | 'unresolved'; branches: string[]; associated: number };
  /** The latest run of each check run, with the id of the app that ran it. */
  check_runs: { total_count: number; items: { name: string; status: string; conclusion: string | null; app_id: number | null }[] };
  statuses: { total_count: number; items: { context: string; state: string }[] };
  /** One suite per app and event. Installed apps that never act leave queued suites with no runs. */
  suites: { total_count: number; items: { app: string; status: string; conclusion: string | null; runs: number }[] } | null;
  /** Failed check runs a later attempt replaced, plus statuses that failed and later passed. */
  superseded_failures: number | null;
  /**
   * Checks the base branch requires, from its rulesets and its classic branch protection. `app_id`
   * pins a check to one app: only that app's check run meets it, never a status.
   */
  required: { context: string; app_id: number | null }[] | null;
  /** Rules on the base branch that gate merging on something this does not read (required workflows, code scanning, deployments). */
  unsupported_rules: string[] | null;
  /** Whether the change edits .github/workflows. */
  workflows_changed: boolean | null;
  /** Every API path read, with its HTTP status, in order. */
  sources: { path: string; status: number }[];
}

const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);
/** Ruleset rules that gate a merge on something this does not read: never "all checks pass" with one. */
const UNSUPPORTED_RULES = new Set(['workflows', 'code_scanning', 'required_deployments']);
const MAX_PAGES = 10;
const MAX_FILE_PAGES = 30; // GitHub stops listing a PR's files at 3,000.

type Get = (path: string) => Promise<{ ok: boolean; status: number; body: any }>;

/**
 * Every page of a list that reports `total_count`. null if any page fails. Items are de-duplicated by
 * `id`, so an item that moves between pages while they are read is counted once, and a list is only
 * complete when the distinct items reach `total_count` (XC1 F3).
 */
async function list(get: Get, path: string, key: string): Promise<{ total_count: number; items: any[] } | null> {
  const byId = new Map<unknown, any>();
  const noId: any[] = [];
  let total = 0;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const r = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const chunk = r.ok && Array.isArray(r.body?.[key]) ? (r.body[key] as any[]) : null;
    if (!chunk || typeof r.body.total_count !== 'number') return null;
    total = r.body.total_count;
    for (const x of chunk) {
      if (typeof x?.id === 'number') byId.set(x.id, x);
      else noId.push(x);
    }
    if (byId.size + noId.length >= total || chunk.length < 100) break;
  }
  return { total_count: total, items: [...byId.values(), ...noId] };
}

/** Every page of a list returned as a bare array. null if any page fails or the cap is reached. */
async function array(get: Get, path: string, maxPages: number): Promise<any[] | null> {
  const items: any[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const r = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!r.ok || !Array.isArray(r.body)) return null;
    items.push(...r.body);
    if (r.body.length < 100) return items;
  }
  return null;
}

/**
 * Read every check on `sha` in `owner/repo`. Never throws for an API answer: a failed read becomes
 * `null` (or an empty, incomplete list), which makes the claim NOT_CHECKED. The network error of an
 * unreachable API does propagate, as it does for `check`.
 */
export async function fetchCommitChecks(
  owner: string,
  repo: string,
  sha: string,
  env: Record<string, string | undefined> = process.env,
  now: () => Date = () => new Date(),
  run: { event: string | null; head_branch: string | null; head_owner: string | null; repo_full_name?: string | null; head_full_name?: string | null } = {
    event: null,
    head_branch: null,
    head_owner: null,
  },
): Promise<CommitChecks> {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('fetchCommitChecks needs a full 40-hex SHA');
  const started_at = now().toISOString();
  const sources: { path: string; status: number }[] = [];
  const get: Get = async (path) => {
    const r = await githubGet(path, env);
    sources.push({ path, status: r.status });
    return r;
  };
  const at = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const commit = `${at}/commits/${sha}`;

  const latest = await list(get, `${commit}/check-runs?filter=latest`, 'check_runs');
  const all = await list(get, `${commit}/check-runs?filter=all`, 'check_runs');
  const status = await list(get, `${commit}/status`, 'statuses');
  const history = await array(get, `${commit}/statuses`, MAX_PAGES);
  const suites = await list(get, `${commit}/check-suites`, 'check_suites');

  // The base branches (whose required checks apply) and the change's files: the UNION of
  //   - every pull request GitHub associates with this commit, whether or not its head has moved on
  //     (their bases and their whole diffs), and
  //   - the run's own context, never replaced by the associated PRs (XC1 R3):
  //       a pull-request-like run (any pull_request* event, merge_group, or a head owned by another
  //       account: XC1 R4) -> its own PR, found by head label and confirmed by head SHA; not found ->
  //       unresolved;
  //       a same-owner push or other run -> the branch it ran on (else the default branch) and this
  //       commit's own diff. A push of several commits shows only the last one's files.
  //   An unresolved context leaves the required checks unknown, so NOT_CHECKED.
  const usable = (p: any) => typeof p?.base?.ref === 'string' && typeof p?.number === 'number';
  const prs = new Map<number, any>();
  const bases = new Set<string>();
  let files: string[] | null = [];
  let resolved = true;
  const addPrs = (list: any[]) => {
    for (const p of list) {
      prs.set(p.number, p);
      bases.add(p.base.ref as string);
    }
  };
  const pulls = await array(get, `${commit}/pulls`, 1);
  if (pulls === null) resolved = false;
  const associated = (pulls ?? []).filter(usable);
  addPrs(associated);

  // Same repository or not, from the API's own full names (XC1 N2: a renamed or transferred
  // repository still reports its run's head as itself). An unknown head repository (a deleted fork)
  // is never treated as the same repository (XC1 N3).
  const repoName = (run.repo_full_name ?? `${owner}/${repo}`).toLowerCase();
  const headName = run.head_full_name ? run.head_full_name.toLowerCase() : null;
  const sameRepo = headName !== null && headName === repoName;
  const prLike = (run.event ?? '').startsWith('pull_request') || run.event === 'merge_group' || !sameRepo;
  let how: CommitChecks['base']['how'] = 'unresolved';
  if (prLike) {
    const found = run.head_owner && run.head_branch ? await array(get, `${at}/pulls?head=${encodeURIComponent(`${run.head_owner}:${run.head_branch}`)}&state=all`, 1) : null;
    // Every PR from the run's head label counts, whatever its state or head (stricter; XC1 N1). The
    // context is resolved only when at least one of them is confirmed as this run's: its head is this
    // commit, or GitHub associates this commit with that same PR (an older commit of it).
    const ids = new Set(associated.map((p) => p.number));
    const labelled = (found ?? []).filter(usable);
    if (labelled.some((p) => p?.head?.sha === sha || ids.has(p.number))) {
      how = 'pr';
      addPrs(labelled);
    } else resolved = false;
  } else {
    how = 'push';
    if (run.head_branch) bases.add(run.head_branch);
    else {
      const r = await get(at);
      if (r.ok && typeof r.body?.default_branch === 'string') bases.add(r.body.default_branch);
      else resolved = false;
    }
    const c = await get(commit);
    if (c.ok && Array.isArray(c.body?.files) && c.body.files.length < 300) {
      for (const x of c.body.files) files.push(String(x?.filename ?? ''), String(x?.previous_filename ?? ''));
    } else files = null;
  }
  for (const p of prs.values()) {
    if (files === null) break;
    const f = await array(get, `${at}/pulls/${p.number}/files`, MAX_FILE_PAGES);
    if (f === null) files = null;
    else for (const x of f) files.push(String(x?.filename ?? ''), String(x?.previous_filename ?? ''));
  }
  if (!resolved) how = 'unresolved';

  let required: { context: string; app_id: number | null }[] | null = resolved ? [] : null;
  let unsupported: string[] | null = resolved ? [] : null;
  for (const b of resolved ? bases : []) {
    const rules = await array(get, `${at}/rules/branches/${encodeURIComponent(b)}`, 3);
    // Classic branch protection, alongside rulesets. Its summary is public on the branch itself.
    const branch = await get(`${at}/branches/${encodeURIComponent(b)}`);
    if (rules === null || !branch.ok || required === null || unsupported === null) {
      required = null;
      unsupported = null;
      break;
    }
    for (const r of rules) {
      if (UNSUPPORTED_RULES.has(r?.type)) unsupported.push(String(r.type));
      if (r?.type !== 'required_status_checks') continue;
      for (const c of r?.parameters?.required_status_checks ?? []) {
        if (typeof c?.context === 'string') required.push({ context: c.context, app_id: typeof c?.integration_id === 'number' ? c.integration_id : null });
      }
    }
    const classic = branch.body?.protection?.required_status_checks;
    if (branch.body?.protected === true && classic) {
      const pinned: any[] = Array.isArray(classic.checks) ? classic.checks : [];
      // app_id -1 is classic protection's "any source" (XC1 F4).
      for (const c of pinned) if (typeof c?.context === 'string') required.push({ context: c.context, app_id: typeof c?.app_id === 'number' && c.app_id > 0 ? c.app_id : null });
      for (const c of Array.isArray(classic.contexts) ? classic.contexts : []) {
        if (typeof c === 'string' && !pinned.some((x) => x?.context === c)) required.push({ context: c, app_id: null });
      }
    }
  }

  const latestIds = new Set((latest?.items ?? []).map((c) => c?.id));
  const complete = (l: { total_count: number; items: any[] } | null) => l !== null && l.items.length >= l.total_count;
  // A status that failed and was later set to success: the history (newest first) holds the failure,
  // the combined status only the success (XC1 S2).
  const nowState = new Map((status?.items ?? []).map((x) => [String(x?.context ?? ''), String(x?.state ?? '')]));
  const flipped =
    history === null
      ? null
      : new Set(history.filter((x) => (x?.state === 'failure' || x?.state === 'error') && nowState.get(String(x?.context ?? '')) === 'success').map((x) => String(x?.context ?? ''))).size;
  const reruns = complete(all) && complete(latest) ? all!.items.filter((c) => !latestIds.has(c?.id) && FAILED.has(c?.conclusion)).length : null;
  return {
    head_sha: sha,
    started_at,
    retrieved_at: now().toISOString(),
    base: { how, branches: [...bases], associated: associated.length },
    check_runs: {
      total_count: latest?.total_count ?? 1, // unread: claims one more run than it lists, so it is never complete
      items: (latest?.items ?? []).map((c) => ({
        name: String(c?.name ?? ''),
        status: String(c?.status ?? ''),
        conclusion: typeof c?.conclusion === 'string' ? c.conclusion : null,
        app_id: typeof c?.app?.id === 'number' ? c.app.id : null,
      })),
    },
    statuses: {
      total_count: status?.total_count ?? 1,
      items: (status?.items ?? []).map((x) => ({ context: String(x?.context ?? ''), state: String(x?.state ?? '') })),
    },
    suites: complete(suites)
      ? {
          total_count: suites!.total_count,
          items: suites!.items.map((x) => ({
            app: String(x?.app?.slug ?? ''),
            status: String(x?.status ?? ''),
            conclusion: typeof x?.conclusion === 'string' ? x.conclusion : null,
            runs: Number(x?.latest_check_runs_count ?? 0),
          })),
        }
      : null,
    superseded_failures: reruns === null || flipped === null ? null : reruns + flipped,
    required: required === null ? null : required.filter((q, i) => required!.findIndex((r) => r.context === q.context && r.app_id === q.app_id) === i),
    unsupported_rules: unsupported === null ? null : [...new Set(unsupported)],
    workflows_changed: files === null ? null : files.some((f) => f.startsWith('.github/workflows/') || f.startsWith('.github/actions/')),
    sources,
  };
}
