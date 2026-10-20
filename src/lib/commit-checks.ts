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
 *   rulesets                     a required check that never reported is missing from every list (R1)
 *   the change's files           a change that edits .github/workflows wrote its own checks (R4)
 */
import { githubGet } from './check';

export interface CommitChecks {
  head_sha: string;
  retrieved_at: string;
  /** The latest run of each check run. */
  check_runs: { total_count: number; items: { name: string; status: string; conclusion: string | null }[] };
  statuses: { total_count: number; items: { context: string; state: string }[] };
  /** One suite per app and event. Installed apps that never act leave queued suites with no runs. */
  suites: { total_count: number; items: { app: string; status: string; runs: number }[] } | null;
  /** Failed check runs that a later attempt replaced: filter=all minus filter=latest. */
  superseded_failures: number | null;
  /** Check names the base branch's rulesets require. */
  required: string[] | null;
  /** Whether the change edits .github/workflows. */
  workflows_changed: boolean | null;
  /** Every API path read, with its HTTP status, in order. */
  sources: { path: string; status: number }[];
}

const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);
const MAX_PAGES = 10;
const MAX_FILE_PAGES = 30; // GitHub stops listing a PR's files at 3,000.

type Get = (path: string) => Promise<{ ok: boolean; status: number; body: any }>;

/** Every page of a list that reports `total_count`. null if any page fails or the list never completes. */
async function list(get: Get, path: string, key: string): Promise<{ total_count: number; items: any[] } | null> {
  const items: any[] = [];
  let total = 0;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const r = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const chunk = r.ok && Array.isArray(r.body?.[key]) ? (r.body[key] as any[]) : null;
    if (!chunk || typeof r.body.total_count !== 'number') return null;
    total = r.body.total_count;
    items.push(...chunk);
    if (items.length >= total || chunk.length < 100) return { total_count: total, items };
  }
  return { total_count: total, items };
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
): Promise<CommitChecks> {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('fetchCommitChecks needs a full 40-hex SHA');
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
  const suites = await list(get, `${commit}/check-suites`, 'check_suites');

  // The base branch and the change: from the pull requests whose head IS this commit; a commit with
  // none (a push) is judged against the default branch and its own diff.
  let bases: string[] | null = null;
  let files: string[] | null = null;
  const pulls = await array(get, `${commit}/pulls`, 1);
  const own = (pulls ?? []).filter((p) => p?.head?.sha === sha && typeof p?.base?.ref === 'string' && typeof p?.number === 'number');
  if (pulls !== null && own.length > 0) {
    bases = [...new Set(own.map((p) => p.base.ref as string))];
    files = [];
    for (const p of own) {
      const f = await array(get, `${at}/pulls/${p.number}/files`, MAX_FILE_PAGES);
      if (f === null) {
        files = null;
        break;
      }
      files.push(...f.map((x) => String(x?.filename ?? '')));
    }
  } else if (pulls !== null) {
    const r = await get(at);
    bases = r.ok && typeof r.body?.default_branch === 'string' ? [r.body.default_branch] : null;
    const c = await get(commit);
    files = c.ok && Array.isArray(c.body?.files) && c.body.files.length < 300 ? c.body.files.map((x: any) => String(x?.filename ?? '')) : null;
  }

  let required: string[] | null = bases === null ? null : [];
  for (const b of bases ?? []) {
    const rules = await array(get, `${at}/rules/branches/${encodeURIComponent(b)}`, 3);
    if (rules === null || required === null) {
      required = null;
      break;
    }
    for (const r of rules) {
      if (r?.type !== 'required_status_checks') continue;
      for (const c of r?.parameters?.required_status_checks ?? []) if (typeof c?.context === 'string') required.push(c.context);
    }
  }

  const latestIds = new Set((latest?.items ?? []).map((c) => c?.id));
  const complete = (l: { total_count: number; items: any[] } | null) => l !== null && l.items.length >= l.total_count;
  return {
    head_sha: sha,
    retrieved_at: now().toISOString(),
    check_runs: {
      total_count: latest?.total_count ?? 1, // unread: claims one more run than it lists, so it is never complete
      items: (latest?.items ?? []).map((c) => ({ name: String(c?.name ?? ''), status: String(c?.status ?? ''), conclusion: typeof c?.conclusion === 'string' ? c.conclusion : null })),
    },
    statuses: {
      total_count: status?.total_count ?? 1,
      items: (status?.items ?? []).map((x) => ({ context: String(x?.context ?? ''), state: String(x?.state ?? '') })),
    },
    suites: complete(suites)
      ? { total_count: suites!.total_count, items: suites!.items.map((x) => ({ app: String(x?.app?.slug ?? ''), status: String(x?.status ?? ''), runs: Number(x?.latest_check_runs_count ?? 0) })) }
      : null,
    superseded_failures: complete(all) && complete(latest) ? all!.items.filter((c) => !latestIds.has(c?.id) && FAILED.has(c?.conclusion)).length : null,
    required: required === null ? null : [...new Set(required)],
    workflows_changed: files === null ? null : files.some((f) => f.startsWith('.github/workflows/')),
    sources,
  };
}
