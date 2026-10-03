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

/*
 * DESIGN RULE: every doubt resolves to NOT CHECKED, never to VERIFIED.
 * A hand-kept word list fails silently in whichever direction its gaps point. CC2's review
 * of 33f78ea measured nine false VERIFIEDs, all from gaps (a failing `integration` or
 * `playwright` check that no list named, so it was never evidence). So VERIFIED now needs
 * a positive match AND a commit with no failing check anywhere; a gap can only ever cost a
 * VERIFIED, not grant one.
 */

/** Test-ish subtypes a claim may name. A named subtype must appear in the check's name. */
const SUBTYPES = ['unit', 'e2e', 'integration', 'end-to-end', 'smoke', 'contract', 'acceptance'];

const KINDS = {
  tests: {
    label: 'tests',
    claim: [
      /\b(?:all\s+)?(?:\d+\s*(?:\/\s*\d+\s*)?)?(?:(?:unit|e2e|integration|end-to-end|smoke|contract|acceptance)\s+)?tests?\s+(?:are\s+|now\s+|all\s+|still\s+)?(?:pass(?:es|ed|ing)?|green|succeed(?:s|ed)?)\b/i,
      /\b\d+\s*\/\s*\d+\s+(?:tests?\s+)?pass(?:es|ed|ing)?\b/i,
      /\btest\s+suite\s+(?:is\s+)?(?:pass(?:es|ed|ing)?|green)\b/i,
      /\b\d+\s+(?:test\s+)?suites?\s+(?:all\s+)?pass(?:es|ed|ing)?\b/i,
      /\b(?:npm|yarn|pnpm)\s+(?:run\s+)?test\s+(?:pass(?:es|ed)?|is\s+green|succeed(?:s|ed)?)\b/i,
      /\b(?:jest|vitest|pytest|mocha|cargo\s+test|go\s+test)\b[^.\n]{0,24}\b(?:pass(?:es|ed|ing)?|green)\b/i,
    ],
    // A test word must be present; bare `unit`, `spec`, `types` no longer count.
    run: /(?:^|[^a-z])(?:tests?|jest|vitest|pytest|mocha|playwright|cypress|e2e|integration|rspec|phpunit|ctest)(?:[^a-z]|$)/i,
    // Names that mention tests without running them, or run something else.
    notRun: /upload|report|results?\b|artifact|coverage|label|lint|summary|comment|notify|deploy|preview|release|publish|docs?\b/i,
  },
  build: {
    label: 'build',
    claim: [
      /\bbuild(?:s)?\s+(?:is\s+|now\s+)?(?:pass(?:es|ed|ing)?|succeed(?:s|ed)?|green|clean)\b/i,
      /\bcompiles?\s+(?:cleanly|successfully|fine|without\s+errors)\b/i,
    ],
    run: /(?:^|[^a-z])(?:build|compile)(?:[^a-z]|$)/i,
    notRun: /upload|report|artifact|label|cache|summary|notify|preview|deploy|release|publish|docs?\b/i,
  },
  typecheck: {
    label: 'type check',
    claim: [
      /\b(?:tsc|typecheck(?:ing)?|type[- ]check(?:s|ing)?|mypy|pyright)\b[^.\n]{0,24}\b(?:pass(?:es|ed|ing)?|clean|green|no\s+errors)\b/i,
    ],
    run: /(?:^|[^a-z])(?:tsc|typecheck|type-check|mypy|pyright)(?:[^a-z]|$)/i,
    notRun: /label|report|summary|notify/i,
  },
  lint: {
    label: 'lint',
    claim: [
      /\b(?:lint(?:er|ing)?|eslint|ruff|flake8|clippy)\b[^.\n]{0,24}\b(?:pass(?:es|ed|ing)?|clean|green|no\s+(?:errors|warnings))\b/i,
    ],
    run: /(?:^|[^a-z])(?:lint|eslint|ruff|flake8|clippy|prettier)(?:[^a-z]|$)/i,
    notRun: /label|report|summary|notify/i,
  },
};

/** Words that make the sentence a condition or a plan, not a claim: "merge once tests pass". */
const NOT_A_CLAIM = /\b(?:if|once|when|until|unless|after|should|will|must|need(?:s)?\s+to|make\s+sure|ensure|verify\s+that|check\s+that|whether|expect(?:ed|s)?\s+to|confirm|hopefully|maybe|probably|might|hope|before|previously|earlier|used\s+to)\b/i;
/**
 * Words that make the phrase a description or an example, not a claim: "a check named test
 * passed", "reads what a PR claims (tests pass, build succeeds)". Both measured on this
 * action's own receipt, where they were read as claims.
 */
const DESCRIBING = /\b(?:named|called|claims?|claimed|such\s+as|e\.g\.|for\s+example|like)\b/i;
/** Negation or limitation before the claim: "not all of the tests pass", "only 3 tests pass". */
const NEGATED_BEFORE = /\b(?:not|never|no\s+longer|none|neither|only|few|no)\b|n't/i;
/** Negation inside the matched words: "tests do not pass" never matches, but be explicit. */
const NEGATED_INSIDE = /\b(?:not|never)\b|n't/i;
/** A qualifier after the claim makes it something other than a clean claim. */
const QUALIFIED_AFTER = /\b(?:only\s+because|except|excluding|but|skipp(?:ed|ing)|disabled|ignored|flaky)\b/i;
/** About another place than this commit's CI: "on main", "locally", "on my machine". */
const ELSEWHERE = /\b(?:on\s+main|on\s+master|in\s+main)\b/i;
const LOCAL = /\b(?:locally|on\s+my\s+machine|on\s+my\s+laptop|in\s+my\s+env(?:ironment)?)\b/i;

const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out']);
/** Conclusions that do not unsettle the commit. Conditional jobs skip all the time. */
const SETTLED_OK = new Set(['success', 'skipped', 'neutral']);
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
    .join('\n')
    // Text in double quotes is being quoted, not claimed: 'it reads "all tests pass"'.
    // Measured on this action's own first live receipt, which read four quoted examples
    // as four claims. Straight and curly quotes, kept on one line.
    .replace(/"[^"\n]{0,200}"/g, ' ')
    .replace(/“[^”\n]{0,200}”/g, ' ');
}

function sentences(text) {
  return stripQuoted(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[\s*\-+#>|]+/, '').trim())
    .filter((s) => s.length > 0 && s.length <= 400);
}

/** "3/10 tests pass" reports a failure; only "10/10" is a claim. */
function unequalRatio(match) {
  const r = match.match(/(\d+)\s*\/\s*(\d+)/);
  return Boolean(r && r[1] !== r[2]);
}

/**
 * Find claims in a piece of text. Returns one entry per (kind, sentence).
 * @param {string} text
 * @param {string} source  where the text came from, e.g. "PR description" or "commit abc1234"
 */
function extractClaims(text, source) {
  const out = [];
  for (const sentence of sentences(text)) {
    if (/\?\s*$/.test(sentence)) continue; // a question is not a claim
    for (const [kind, def] of Object.entries(KINDS)) {
      for (const re of def.claim) {
        const m = sentence.match(re);
        if (!m) continue;
        // Only words near the claim can turn it into a plan, a description or a negation.
        // A wider window drops real claims: "Fixed the failing test; all tests pass".
        const before = sentence.slice(0, m.index);
        const after = sentence.slice(m.index + m[0].length);
        if (
          NOT_A_CLAIM.test(before.slice(-48)) ||
          DESCRIBING.test(before.slice(-64)) ||
          NEGATED_BEFORE.test(before.slice(-32)) ||
          NEGATED_INSIDE.test(m[0]) ||
          QUALIFIED_AFTER.test(after) ||
          ELSEWHERE.test(sentence) ||
          unequalRatio(m[0])
        ) {
          break;
        }
        const sub = SUBTYPES.find((t) => new RegExp(`\\b${t}\\b`, 'i').test(m[0])) || null;
        out.push({
          kind,
          subtype: sub,
          local: LOCAL.test(sentence),
          quote: sentence.length > 160 ? sentence.slice(0, 157) + '...' : sentence,
          source,
        });
        break;
      }
    }
  }
  return out;
}

/** One claim per kind (and subtype); keep the first quote and every source. */
function groupClaims(claims) {
  const byKey = new Map();
  for (const c of claims) {
    const key = `${c.kind}:${c.subtype || ''}:${c.local ? 'local' : 'ci'}`;
    const g = byKey.get(key);
    if (!g) byKey.set(key, { kind: c.kind, subtype: c.subtype || null, local: Boolean(c.local), quote: c.quote, sources: [c.source] });
    else if (!g.sources.includes(c.source)) g.sources.push(c.source);
  }
  return [...byKey.values()];
}

/** The receipt's own job is excluded by exact name, not substring: a `receipt-tests` check is evidence. */
const DEFAULT_SELF = /^receipts?$/i;

/**
 * Decide each claim against the commit's check runs.
 * @param {Array<{kind:string, subtype?:string|null, local?:boolean}>} grouped
 * @param {Array<{name:string,status:string,conclusion:string|null,html_url?:string}>} runs
 * @param {{ selfPattern?: RegExp }} [opts]
 */
function judge(grouped, runs, opts = {}) {
  const self = opts.selfPattern || DEFAULT_SELF;
  const evidence = (runs || []).filter((r) => r && typeof r.name === 'string' && !self.test(r.name));
  // Any check that did not finish green (or skipped/neutral) leaves the commit unsettled:
  // failed, still running, cancelled, stale or awaiting approval. CC2 measured `test` green
  // plus a provider-named check `in_progress` or `cancelled` reading VERIFIED.
  const unsettled = evidence.filter((r) => !(r.status === 'completed' && SETTLED_OK.has(r.conclusion)));
  return grouped.map((claim) => {
    const def = KINDS[claim.kind];
    const what = claim.subtype ? `${claim.subtype} ${def.label}` : def.label;
    const base = { ...claim, label: def.label };
    if (claim.local) {
      return { ...base, runs: [], verdict: 'NOT_CHECKED', why: `Claimed for a local run. Checks on this commit cannot confirm what ran on someone's machine.` };
    }
    const excluded = (r) => Boolean(def.notRun && def.notRun.test(r.name));
    // A subtype claim matches on the subtype word itself: a check named just `unit` ran
    // unit tests, even though bare `unit` is too weak to count as a generic test check.
    const subRe = claim.subtype ? new RegExp(`\\b${claim.subtype}\\b`, 'i') : null;
    const matched = evidence.filter((r) => !excluded(r) && (subRe ? subRe.test(r.name) : def.run.test(r.name)));
    base.runs = matched;
    if (matched.length === 0) {
      return { ...base, verdict: 'NOT_CHECKED', why: `No check named for ${what} ran on this commit. A receipt cannot tell whether other checks ran ${what}.` };
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
    // A matched check passed, but another check on this commit did not finish green. It may
    // cover this claim under a name no list knows, so the receipt cannot say VERIFIED.
    if (unsettled.length > 0) {
      const desc = (r) => `${r.name} (${r.status === 'completed' ? r.conclusion : r.status})`;
      return {
        ...base,
        verdict: 'NOT_CHECKED',
        why: `${matched.map((r) => r.name).join(', ')} passed, but ${unsettled.map(desc).join(', ')} did not finish green on this commit and may cover the same ground.`,
      };
    }
    return { ...base, verdict: 'VERIFIED', why: `${matched.map((r) => r.name).join(', ')} passed on this commit, and every other check on it finished green, skipped or neutral.` };
  });
}

const MARK = { VERIFIED: '✅ VERIFIED', FAILED: '❌ FAILED', NOT_CHECKED: '⚪ NOT CHECKED' };
const MARKER = '<!-- trustshell-receipt -->';

const DOES_NOT_PROVE = [
  'A green check proves that check passed on this commit. It does not prove the check tested this change.',
  'Checks are matched to claims by their names. A check named `test` that runs nothing would still read as tests.',
  'Claims are read from the PR description and the latest commit message by plain patterns. A claim worded unusually is not seen; quoted text and code blocks are ignored on purpose.',
  'A check created after this receipt was written is not counted until the receipt runs again.',
];

/**
 * Text from the PR is echoed into a comment the bot posts, so it must not act there:
 * no table break, no @mention ping, no link or image (a tracking pixel), no HTML, no
 * forged marker. Words stay readable; only their power to do something is removed.
 */
function escapeCell(s) {
  return String(s)
    .replace(/\r?\n/g, ' ')
    .replace(/[\\`*_[\]()<>!|#~]/g, (c) => `\\${c}`)
    .replace(/@/g, '@\u200b');
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

module.exports = { KINDS, MARKER, DEFAULT_SELF, DOES_NOT_PROVE, stripQuoted, extractClaims, groupClaims, judge, render };
