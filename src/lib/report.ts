/**
 * `trustshell report` — put the inside and outside evidence side by side.
 * ------------------------------------------------------------------------
 * `inspect` says what the agent's own log supports. `check` says what GitHub can
 * confirm. `report` states what the two TOGETHER support, and names where they
 * disagree.
 *
 * EGRESS: none, and this is enforced rather than promised — `report` takes its
 * external evidence as a FILE the operator already produced with `check --json`.
 * It has no fetch, no client and no URL parameter. That is why "what left my
 * machine" stays answerable by reading one row of the egress table.
 */

import type { InspectResult } from './inspect';
import type { Profile } from './profile';

/**
 * CONFIRMED 0 · INCONSISTENT 1 · UNSUPPORTED 3.
 *
 * The word is INCONSISTENT, never "contradicted". Two records disagreeing is a
 * fact about the records. "Contradicted" reads as a finding about the agent's
 * honesty, which this tool cannot establish and must not imply.
 */
export type ReportVerdict = 'CONFIRMED' | 'INCONSISTENT' | 'UNSUPPORTED';

/** The subset of `check --json` output this consumes. Deliberately narrow. */
export interface EvidenceDoc {
  verdict?: string;
  owner?: string;
  repo?: string;
  branch?: string;
  sha?: string;
  title?: string;
  host?: string;
  authenticated?: boolean;
}

export interface ReportInput {
  session: InspectResult | null;
  evidence: EvidenceDoc | null;
  profile: Profile;
}

export interface ReportResult {
  verdict: ReportVerdict;
  reason: string;
  session: { present: boolean; verdict: string | null; entries: number; path: string | null };
  evidence: { present: boolean; verdict: string | null; repo: string | null; sha: string | null };
  /** Included ONLY when the matching share_* flag is true. Absent otherwise — not empty-string. */
  identity?: string;
  context?: string;
  withheld: string[];
  does_not_prove: string[];
}

/**
 * PURE. The whole decision, in one readable table of cases.
 *
 * CONFIRMED is the narrowest case on purpose: it needs BOTH an intact local
 * chain and an external run that actually completed. Everything we cannot
 * establish lands on UNSUPPORTED, which exits 3 — the NOT CHECKED code shared
 * with `check`'s INCONCLUSIVE and `inspect`'s UNCHAINED.
 */
export function decide(session: InspectResult | null, evidence: EvidenceDoc | null): { verdict: ReportVerdict; reason: string } {
  if (!evidence) {
    return {
      verdict: 'UNSUPPORTED',
      reason:
        'No external evidence was supplied, so there is nothing to check the session against. Produce it with `trustshell check <run-url> --json` and pass it as --evidence.',
    };
  }
  if (!session) {
    return {
      verdict: 'UNSUPPORTED',
      reason: 'No session log was supplied, so there is no inside evidence to compare the external result against.',
    };
  }

  const ev = String(evidence.verdict ?? '').toUpperCase();

  if (session.verdict === 'BROKEN') {
    // Both sides are present and they disagree about whether the record is sound.
    return ev === 'COMPLETE'
      ? {
          verdict: 'INCONSISTENT',
          reason:
            'The external run completed, but the local log\'s hash chain does not verify — the record of how it happened was altered after it was written.',
        }
      : {
          verdict: 'INCONSISTENT',
          reason: 'The local log\'s hash chain does not verify, and the external run did not report success either.',
        };
  }

  if (session.verdict === 'NO_LOG' || session.verdict === 'UNCHAINED') {
    return {
      verdict: 'UNSUPPORTED',
      reason:
        session.verdict === 'NO_LOG'
          ? 'There is no session log, so the external result stands alone and nothing about the agent\'s own actions was checked.'
          : 'The session log carries no hash chain, so it is NOT CHECKED. An unchained log cannot support or undermine the external result.',
    };
  }

  // session.verdict === 'INTACT' from here.
  if (ev === 'COMPLETE') {
    return {
      verdict: 'CONFIRMED',
      reason: 'The local log verifies intact and the external run completed successfully. Both records agree.',
    };
  }
  if (ev === 'FAILED' || ev === 'INCONSISTENT') {
    return {
      verdict: 'INCONSISTENT',
      reason:
        'The local log verifies intact, but the external evidence does not report a clean run. The two records disagree about the outcome.',
    };
  }
  return {
    verdict: 'UNSUPPORTED',
    reason: `The external evidence is "${ev || 'absent'}", which establishes nothing either way. NOT CHECKED is not a pass.`,
  };
}

export function reportLimits(v: ReportVerdict): string[] {
  const always = [
    'This compares two records. It cannot tell you whether either record describes work that was actually useful.',
    'The external evidence is a file you supplied. This command does not fetch, so it cannot tell you the file is current.',
  ];
  if (v === 'CONFIRMED') {
    return [
      ...always,
      'Agreement between an intact log and a green run does not prove the agent did what it claimed — only that neither record contradicts the other.',
      // Named here as well as in `inspect`, because CONFIRMED is the verdict most
      // likely to be quoted on its own, away from the card that explains it.
      'The local chain has no trusted anchor: its hashes are unkeyed and reproducible by anyone who can write the log, so CONFIRMED cannot rule out a fabricated session.',
    ];
  }
  if (v === 'INCONSISTENT') {
    return [
      ...always,
      'Records disagreeing is a fact about the records. It is not evidence of dishonesty, and this tool cannot establish intent.',
    ];
  }
  return [...always, 'UNSUPPORTED means NOT CHECKED. It is neither a pass nor a failure.'];
}

/**
 * Build the report. Identity and context are included ONLY when the matching
 * share flag is true, and every omission is NAMED in `withheld` rather than
 * silently dropped — a reader must be able to tell "nothing was set" from
 * "something was set and not shared".
 */
export function buildReport(input: ReportInput): ReportResult {
  const { session, evidence, profile } = input;
  const { verdict, reason } = decide(session, evidence);
  const withheld: string[] = [];

  const out: ReportResult = {
    verdict,
    reason,
    session: {
      present: session !== null,
      verdict: session?.verdict ?? null,
      entries: session?.entries ?? 0,
      path: session?.path ?? null,
    },
    evidence: {
      present: evidence !== null,
      verdict: evidence?.verdict ?? null,
      repo: evidence?.owner && evidence?.repo ? `${evidence.owner}/${evidence.repo}` : null,
      sha: evidence?.sha ?? null,
    },
    withheld,
    does_not_prove: reportLimits(verdict),
  };

  if (profile.share_identity) {
    if (profile.identity) out.identity = profile.identity;
  } else if (profile.identity) {
    withheld.push('identity — set share_identity: true in .trustshell/profile.md to include it');
  }

  if (profile.share_context) {
    if (profile.context) out.context = profile.context;
  } else if (profile.context) {
    withheld.push('context — set share_context: true in .trustshell/profile.md to include it');
  }

  return out;
}

export function reportExitCode(v: ReportVerdict): number {
  if (v === 'CONFIRMED') return 0;
  if (v === 'INCONSISTENT') return 1;
  return 3;
}

export function formatReportCard(r: ReportResult): string {
  const lines = [`trustshell report  —  ${r.verdict}`, '', `  ${r.reason}`, ''];
  lines.push('  inside evidence (your log)');
  lines.push(
    r.session.present
      ? `    ${r.session.verdict}  ·  ${r.session.entries} entries  ·  ${r.session.path}`
      : '    none supplied',
  );
  lines.push('', '  outside evidence (what you saved from `check`)');
  lines.push(
    r.evidence.present
      ? `    ${r.evidence.verdict ?? 'unknown'}${r.evidence.repo ? `  ·  ${r.evidence.repo}` : ''}${r.evidence.sha ? `  ·  ${r.evidence.sha.slice(0, 7)}` : ''}`
      : '    none supplied',
  );
  if (r.identity) lines.push('', `  identity  ${r.identity}`);
  if (r.context) lines.push('', `  context   ${r.context}`);
  if (r.withheld.length) {
    lines.push('', '  Withheld by your profile:');
    for (const w of r.withheld) lines.push(`    - ${w}`);
  }
  lines.push('', '  What this does NOT prove:');
  for (const d of r.does_not_prove) lines.push(`    - ${d}`);
  return lines.join('\n');
}
