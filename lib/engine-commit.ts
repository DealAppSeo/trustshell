/**
 * L6 — live engine /health deployed_commit, fail-closed.
 * Never invent a hash (not 987c8c17, not anything else) when the field is missing.
 */

export type EngineCommit =
  | { ok: true; commit: string; short: string }
  | { ok: false; reason: string; commit?: undefined };

const SHA = /^[0-9a-f]{7,40}$/i;

export function engineCommitDisplay(raw: unknown): EngineCommit {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'engine health unavailable' };
  }
  const c = (raw as { deployed_commit?: unknown }).deployed_commit;
  if (typeof c !== 'string' || !SHA.test(c.trim())) {
    return { ok: false, reason: 'deployed_commit missing' };
  }
  const commit = c.trim();
  return { ok: true, commit, short: commit.slice(0, 7) };
}
