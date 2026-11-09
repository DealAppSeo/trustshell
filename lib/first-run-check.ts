/**
 * The check the chat path runs, and it is the real one. checkSentence calls buildRecord, the function `trustshell
 * check` calls, against what GitHub reported about a real run, saved by that command. tests/first-run.test.ts holds
 * it to the CLI's own output. Nothing is sent anywhere: the only difference is that the run was read earlier.
 *
 * Loaded on demand, because action-evidence.ts imports node:crypto and the bundler replaces that with a polyfill of
 * about 140 KB gzipped, for a digest this page never computes.
 * ponytail: lazy import keeps that off the other two paths. Move digestRecord out of action-evidence.ts if this goes live.
 */
import { ACTION_EVIDENCE_SCHEMA, buildRecord, claimsExitCode, tallyClaims, type ActionEvidenceRecord, type ClaimTally, type Observation } from '../src/lib/action-evidence';
import { RUNS, type RunId } from './first-run';

export type SavedRun = { ok: true; observation: Observation } | { ok: false };

/** A saved run must be the record `trustshell check --out` wrote, or the page says it could not load one. */
export function parseSavedRun(text: string): SavedRun {
  try {
    const record = (JSON.parse(text) as { record?: Partial<ActionEvidenceRecord> }).record;
    if (record?.schema === ACTION_EVIDENCE_SCHEMA && record.observation?.platform === 'github-actions') return { ok: true, observation: record.observation };
  } catch {
    /* not JSON: the same answer as any other file that is not a saved run */
  }
  return { ok: false };
}

/** Both saved runs, or null: a page with one of two runs would offer sentences it cannot check. */
export async function loadSavedRuns(fetcher: typeof fetch = fetch): Promise<Record<RunId, Observation> | null> {
  try {
    const [failed, passed] = await Promise.all(
      (['failed', 'passed'] as const).map(async (id) => {
        const res = await fetcher(RUNS[id].file);
        return res.ok ? parseSavedRun(await res.text()) : ({ ok: false } as const);
      }),
    );
    return failed?.ok && passed?.ok ? { failed: failed.observation, passed: passed.observation } : null;
  } catch {
    return null;
  }
}

export interface SentenceResult {
  record: ActionEvidenceRecord;
  tally: ClaimTally;
  exit: number;
}

export function checkSentence(text: string, observation: Observation): SentenceResult {
  const record = buildRecord(observation, text);
  return { record, tally: tallyClaims(record.claims), exit: claimsExitCode(record) };
}
