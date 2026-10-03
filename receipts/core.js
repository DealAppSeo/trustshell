'use strict';
/**
 * Receipts — the pure core. No I/O, no dependencies, so it is testable and portable.
 *
 * An AI agent (or a person) writes "all tests pass" in a PR. GitHub already holds the
 * evidence: which check runs ran on that commit and how they ended. This module reads
 * the claims, matches each one to the runs that could prove it, and says what the
 * evidence shows. Three outcomes, never two:
 *
 *   VERIFIED     a run named for that kind of check finished green on this commit
 *   FAILED       a run named for that kind of check finished red on this commit
 *   NOT_CHECKED  no run could prove it (none ran, still running, skipped, or ambiguous)
 *
 * It never says anyone lied. It says what the evidence shows and what it does not prove.
 * No model reads the PR text: the claim extractor is plain patterns, so text written by
 * whoever opened the PR cannot talk it into a verdict.
 */

const KINDS = {
  tests: {
    label: 'tests',
    claim: [
      /\b(?:all\s+)?(?:\d+\s*(?:\/\s*\d+\s*)?)?(?:unit\s+|e2e\s+|integration\s+)?tests?\s+(?:are\s+|now\s+|all\s+|still\s+)?(?:pass(?:es|ed|ing)?|green|succeed(?:s|ed)?)\b/i,
      /\b\d+\s*\/\s*\d+\s+(?:tests?\s+)?pass(?:es|ed|ing)?\b/i,
      /\btest\s+suite\s+(?:is\s+)?(?:pass(?:es|ed|ing)?|green)\b/i,
      /\b\d+\s+(?:test\s+)?suites?\s+(?:all\s+)?pass(?:es|ed|ing)?\b/i,
      /\b(?:npm|yarn|pnpm)\s+(?:run\s+)?test\s+(?:pass(?:es|ed)?|is\s+green|succeed(?:s|ed)?)\b/i,
      /\b(?:jest|vitest|pytest|mocha|cargo\s+test|go\s+test)\b[^.\n]{0,24}\b(?:pass(?:es|ed|ing)?|green)\b/i,
    ],
    run: /test|jest|vitest|pytest|spec\b|mocha|e2e|unit/i,
  },
  build: {
    label: 'build',
    claim: [
      /\bbuild(?:s)?\s+(?:is\s+|now\s+)?(?:pass(?:es|ed|ing)?|succeed(?:s|ed)?|green|clean)\b/i,
      /\bcompiles?\s+(?:cleanly|successfully|fine|without\s+errors)\b/i,
    ],
    run: /build|compile/i,
  },
  typecheck: {
    label: 'type check',
    claim: [
      /\b(?:tsc|typecheck(?:ing)?|type[- ]check(?:s|ing)?|mypy|pyright)\b[^.\n]{0,24}\b(?:pass(?:es|ed|ing)?|clean|green|no\s+errors)\b/i,
    ],
    run: /tsc|typecheck|type-check|types\b|mypy|pyright/i,
  },
  lint: {
    label: 'lint',
    claim: [
      /\b(?:lint(?:er|ing)?|eslint|ruff|flake8|clippy)\b[^.\n]{0,24}\b(?:pass(?:es|ed|ing)?|clean|green|no\s+(?:errors|warnings))\b/i,
    ],
    run: /lint|eslint|ruff|flake8|clippy|prettier/i,
  },
};

/** Words that make the sentence a condition or a plan, not a claim: "merge once tests pass". */
const NOT_A_CLAIM = /\b(?:if|once|when|until|unless|after|should|will|must|need(?:s)?\s+to|make\s+sure|ensure|verify\s+that|check\s+that|whether|expect(?:ed|s)?\s+to)\b/i;
/** Negation directly in front of the claim: "not all tests pass", "doesn't build cleanly". */
const NEGATED_BEFORE = /(?:\bnot|n't|\bnever|\bno\s+longer)\s+(?:\w+\s+)?$/i;
/** Negation inside the matched words: "tests do not pass" never matches, but be explicit. */
const NEGATED_INSIDE = /\b(?:not|never)\b|n't/i;

const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out']);
const MAX_TEXT = 64 * 1024;

/** Drop text that is quoted rather than claimed: fenced code, block quotes, HTML comments. */
function stripQuoted(text) {
  return String(text || '')
    .slice(0, MAX_TEXT)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    // Inline code is UNWRAPPED, not dropped: "`tsc --noEmit` is clean" is a real claim, and
    // dropping the code span left "is clean" with no subject (measured on a real PR).
    .replace(/`([^`\n]*)`/g, '$1')
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join('\n');
}

function sentences(text) {
  return stripQuoted(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[\s*\-+#>|]+/, '').trim())
    .filter((s) => s.length > 0 && s.length <= 400);
}

/**
 * Find claims in a piece of text. Returns one entry per (kind, sentence).
 * @param {string} text
 * @param {string} source  where the text came from, e.g. "PR description" or "commit abc1234"
 */
function extractClaims(text, source) {
  const out = [];
  for (const sentence of sentences(text)) {
    for (const [kind, def] of Object.entries(KINDS)) {
      for (const re of def.claim) {
        const m = sentence.match(re);
        if (!m) continue;
        // Only the words just before the claim can turn it into a plan or a negation.
        // A wider window drops real claims: "Fixed the failing test; all tests pass".
        const before = sentence.slice(0, m.index);
        if (NOT_A_CLAIM.test(before.slice(-48)) || NEGATED_BEFORE.test(before) || NEGATED_INSIDE.test(m[0])) break;
        out.push({ kind, quote: sentence.length > 160 ? sentence.slice(0, 157) + '...' : sentence, source });
        break;
      }
    }
  }
  return out;
}

/** One claim per kind is enough for a verdict; keep the first quote and every source. */
function groupClaims(claims) {
  const byKind = new Map();
  for (const c of claims) {
    const g = byKind.get(c.kind);
    if (!g) byKind.set(c.kind, { kind: c.kind, quote: c.quote, sources: [c.source] });
    else if (!g.sources.includes(c.source)) g.sources.push(c.source);
  }
  return [...byKind.values()];
}

/**
 * Decide each claim against the commit's check runs.
 * @param {Array<{kind:string}>} grouped
 * @param {Array<{name:string,status:string,conclusion:string|null,html_url?:string}>} runs
 * @param {{ selfPattern?: RegExp }} [opts]
 */
function judge(grouped, runs, opts = {}) {
  const self = opts.selfPattern || /receipt/i;
  const evidence = (runs || []).filter((r) => r && typeof r.name === 'string' && !self.test(r.name));
  return grouped.map((claim) => {
    const def = KINDS[claim.kind];
    const matched = evidence.filter((r) => def.run.test(r.name));
    const base = { ...claim, label: def.label, runs: matched };
    if (matched.length === 0) {
      const othersGreen = evidence.length > 0 && evidence.every((r) => r.status === 'completed' && r.conclusion === 'success');
      return {
        ...base,
        verdict: 'NOT_CHECKED',
        why: othersGreen
          ? `No check named for ${def.label} ran on this commit. ${evidence.length} other check(s) passed, but a receipt cannot tell whether they ran ${def.label}.`
          : `No check named for ${def.label} ran on this commit.`,
      };
    }
    const failed = matched.filter((r) => r.status === 'completed' && FAILED_CONCLUSIONS.has(r.conclusion));
    if (failed.length > 0) {
      return { ...base, verdict: 'FAILED', why: `${failed.map((r) => r.name).join(', ')} finished ${failed[0].conclusion}.` };
    }
    const pending = matched.filter((r) => r.status !== 'completed');
    if (pending.length > 0) {
      return { ...base, verdict: 'NOT_CHECKED', why: `${pending.map((r) => r.name).join(', ')} still running when this receipt was written.` };
    }
    const notGreen = matched.filter((r) => r.conclusion !== 'success');
    if (notGreen.length > 0) {
      return { ...base, verdict: 'NOT_CHECKED', why: `${notGreen.map((r) => `${r.name} (${r.conclusion})`).join(', ')}: ended without a pass or a fail.` };
    }
    return { ...base, verdict: 'VERIFIED', why: `${matched.map((r) => r.name).join(', ')} passed on this commit.` };
  });
}

const MARK = { VERIFIED: '✅ VERIFIED', FAILED: '❌ FAILED', NOT_CHECKED: '⚪ NOT CHECKED' };
const MARKER = '<!-- trustshell-receipt -->';

const DOES_NOT_PROVE = [
  'A green check proves that check passed on this commit. It does not prove the check tested this change.',
  'Checks are matched to claims by their names. A check named `test` that runs nothing would still read as tests.',
  'Claims are read from the PR description and commit messages by plain patterns. A claim worded unusually is not seen; quoted text and code blocks are ignored on purpose.',
];

function escapeCell(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** The receipt as markdown. `sha` is the commit the evidence belongs to. */
function render(results, { sha, repoUrl } = {}) {
  const n = (v) => results.filter((r) => r.verdict === v).length;
  const lines = [MARKER, '### 🧾 Receipt'];
  const short = sha ? String(sha).slice(0, 7) : 'unknown';
  const at = sha && repoUrl ? `[\`${short}\`](${repoUrl}/commit/${sha})` : `\`${short}\``;
  if (results.length === 0) {
    lines.push('', `No claims about tests, build, type check or lint were found in this PR. Nothing to check on ${at}.`);
  } else {
    lines.push(
      '',
      `${results.length} claim(s) checked against GitHub's own check runs on ${at}: ` +
        `**${n('VERIFIED')} verified · ${n('NOT_CHECKED')} not checked · ${n('FAILED')} failed**`,
      '',
      '| Claim | Said in | Evidence | Result |',
      '|---|---|---|---|',
    );
    for (const r of results) {
      lines.push(`| ${escapeCell(r.quote)} | ${escapeCell(r.sources.join(', '))} | ${escapeCell(r.why)} | ${MARK[r.verdict]} |`);
    }
  }
  lines.push('', '<details><summary>What this receipt does not prove</summary>', '');
  for (const d of DOES_NOT_PROVE) lines.push(`- ${d}`);
  lines.push('', '</details>', '', '<sub>Receipts by TrustShell. Read-only: it reads this PR and its check runs, and writes only this comment. No code leaves the repo.</sub>');
  return lines.join('\n');
}

module.exports = { KINDS, MARKER, DOES_NOT_PROVE, stripQuoted, extractClaims, groupClaims, judge, render };
