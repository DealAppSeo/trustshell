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
    cmd: /(?:^|[^\w-])(?:jest|vitest|pytest|mocha|playwright|cypress|rspec|phpunit|ctest|tox)\b|\b(?:go|cargo|dotnet|mix|swift)\s+test\b|\b(?:npm|yarn|pnpm|bun)\s+(?:run\s+)?[\w.:-]*test(?:[:\s]|$)|\bmake\s+test\b/i,
  },
  build: {
    label: 'build',
    claim: [
      /\bbuild(?:s)?\s+(?:is\s+|now\s+)?(?:pass(?:es|ed|ing)?|succeed(?:s|ed)?|green|clean)\b/i,
      /\bcompiles?\s+(?:cleanly|successfully|fine|without\s+errors)\b/i,
    ],
    run: /(?:^|[^a-z])(?:build|compile)(?:[^a-z]|$)/i,
    notRun: /upload|report|artifact|label|cache|summary|notify|preview|deploy|release|publish|docs?\b/i,
    cmd: /\b(?:npm|yarn|pnpm|bun)\s+(?:run\s+)?[\w.:-]*build(?:[:\s]|$)|\b(?:tsc|rollup|vite|webpack|esbuild|next)\s+build\b|\b(?:make|cargo|go|dotnet|mvn|gradle)\s+build\b|\bgo\s+build\b/i,
  },
  typecheck: {
    label: 'type check',
    claim: [
      /\b(?:tsc|typecheck(?:ing)?|type[- ]check(?:s|ing)?|mypy|pyright)\b[^.\n]{0,24}\b(?:pass(?:es|ed|ing)?|clean|green|no\s+errors)\b/i,
    ],
    run: /(?:^|[^a-z])(?:tsc|typecheck|type-check|mypy|pyright)(?:[^a-z]|$)/i,
    notRun: /label|report|summary|notify/i,
    cmd: /\btsc\b|\b(?:mypy|pyright)\b|\b(?:npm|yarn|pnpm|bun)\s+(?:run\s+)?[\w.:-]*type-?check(?:[:\s]|$)/i,
  },
  lint: {
    label: 'lint',
    claim: [
      /\b(?:lint(?:er|ing)?|eslint|ruff|flake8|clippy)\b[^.\n]{0,24}\b(?:pass(?:es|ed|ing)?|clean|green|no\s+(?:errors|warnings))\b/i,
    ],
    run: /(?:^|[^a-z])(?:lint|eslint|ruff|flake8|clippy|prettier)(?:[^a-z]|$)/i,
    notRun: /label|report|summary|notify/i,
    cmd: /\b(?:eslint|ruff|flake8|prettier|biome|golangci-lint)\b|\bcargo\s+clippy\b|\b(?:npm|yarn|pnpm|bun)\s+(?:run\s+)?[\w.:-]*lint(?:[:\s]|$)/i,
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

/**
 * Steps that are scaffolding, not work. GitHub injects `Set up job`, `Run actions/...`,
 * `Post Run actions/...` and `Complete job` into every job, and an install or cache step
 * can name a runner (`Install Playwright`) without running one test. Excluding a real
 * step by mistake costs a VERIFIED; including a fake one grants one.
 */
const STEP_NOISE = /^(?:set\s?up\b|post\s|complete\s+job\b)|\b(?:install|cache|restore|download|checkout|setup)\b/i;

/**
 * A step with no `name:` is displayed by GitHub as `Run <the command>`, so for those the
 * step name IS the command — the strongest label there is, and free.
 *
 * It is also the one place a step name can be written to say anything at all, which is a
 * hole this change opened and measurement found: `- run: echo "all tests pass"` displays as
 * `Run echo "all tests pass"` and would have counted as a test step. So an auto-named step
 * is held to the COMMAND pattern, not the name pattern. `Run npx jest` is evidence;
 * `Run echo ...`, `Run actions/checkout@v4` and `Run ./.github/actions/x` (a composite whose
 * contents cannot be read from here) are not. Closing it by construction beats a list of
 * no-ops to deny, which would need a new entry for every shell builtin.
 */
const STEP_AUTONAMED = /^run\s+(.+)$/i;

/**
 * How strong a piece of evidence is. `name` is a label someone chose; `step` is a label
 * plus that step's own result; `command` adds the `run:` line from the workflow file at
 * this commit, which is the first level that is evidence rather than a name.
 */
const LEVEL_RANK = { name: 1, step: 2, command: 3 };
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
    // A quoted span never crosses sentence punctuation: " is also the inch mark, and an
    // unmatched one must not swallow the claim in the next sentence (CC2 at 58b5899).
    .replace(/"[^"\n.!?;]{0,200}"/g, ' ')
    .replace(/“[^”\n.!?;]{0,200}”/g, ' ');
    // Single quotes are NOT stripped. ' is also an apostrophe ('90s, maintainers', it’s), so
    // a single-quote span can swallow a real claim and the FAILED under it. Reading a quoted
    // claim is visible on the receipt; hiding a real one is not (CC2, #433 at ac442ff).
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
 * Every piece of evidence one check run offers for one kind of claim, strongest first.
 *
 * WHY THIS IS NOT A NAME TEST ANY MORE. A check run is named after its job, and a job is
 * named for how CI is organised, not for what it does: on this repository the job that
 * runs `tsc --noEmit` and `npx jest` is called `check`, so every claim about tests, build,
 * type check and lint read NOT CHECKED forever — measured on the head of #510, where the
 * only non-self checks were `check`, `Analyze (javascript-typescript)` and `gitleaks`.
 * The fix is not a wider word list: adding `check` would also match `spell-check`,
 * `check-licenses` and `dependency-check`, buying verdicts with false VERIFIEDs, which on
 * this tool is the one unacceptable error.
 *
 * So when the steps of a job can be read, they are the evidence and the job's name is not
 * consulted at all — INCLUDING when no step matches. A job named `test` whose steps run
 * nothing of the sort now reads NOT CHECKED, which is the direction this whole module
 * leans. Falling back to the name there would reinstate exactly what is being replaced.
 *
 * A step carries its own conclusion, so `Typecheck` passing and `Unit tests` never running
 * is now two different answers instead of one job-level verdict. Note `skipped` on a step
 * is NOT settled-ok the way it is on a whole check: a conditional job skipping is normal,
 * a test step skipping means the tests did not run.
 */
function unitsFor(run, def, subRe) {
  const hits = (s) => (subRe ? subRe.test(s) : def.run.test(s));
  const pending = run.status !== 'completed';
  const steps = Array.isArray(run.steps) ? run.steps.filter((s) => s && typeof s.name === 'string' && s.name) : null;
  if (steps && steps.length > 0) {
    // The command corroborates the step, and is read from the job's own block in the
    // workflow file at this commit. Scoped to the job on purpose: crediting job A's
    // `npx jest` to job B would be a false VERIFIED, which is the error that matters.
    const corroborated = Boolean(def.cmd) && Array.isArray(run.commands) && run.commands.some((c) => def.cmd.test(String(c)));
    const out = [];
    for (const st of steps) {
      if (STEP_NOISE.test(st.name)) continue;
      if (def.notRun && def.notRun.test(st.name)) continue;
      const auto = st.name.match(STEP_AUTONAMED);
      // An auto-named step carries its own command, so judge it as a command, not a label.
      if (auto && !(def.cmd && def.cmd.test(auto[1]))) continue;
      if (!hits(st.name)) continue;
      out.push({
        level: corroborated ? 'command' : 'step',
        where: `step \`${st.name}\` in ${run.name}`,
        conclusion: pending ? null : st.conclusion || null,
        pending,
        run,
      });
    }
    return out;
  }
  if (def.notRun && def.notRun.test(run.name)) return [];
  if (!hits(run.name)) return [];
  return [{ level: 'name', where: run.name, conclusion: pending ? null : run.conclusion, pending, run }];
}

/**
 * Would any matcher look twice at a step with this name? The fetcher asks this before
 * spending an API call on the workflow file: a job whose steps are all scaffolding has no
 * command worth reading. A false `true` costs one request; a false `false` only loses an
 * upgrade from `step` to `command`, never a verdict.
 */
function stepCouldMatter(name) {
  const s = String(name || '');
  if (!s || STEP_NOISE.test(s)) return false;
  const auto = s.match(STEP_AUTONAMED);
  if (auto) return Object.values(KINDS).some((def) => Boolean(def.cmd) && def.cmd.test(auto[1]));
  if (SUBTYPES.some((t) => new RegExp(`\\b${t}\\b`, 'i').test(s))) return true;
  return Object.values(KINDS).some((def) => !(def.notRun && def.notRun.test(s)) && def.run.test(s));
}

/** The strongest level present, so the receipt can say which kind of evidence it read. */
function strongestLevel(units) {
  return units.reduce((best, u) => (LEVEL_RANK[u.level] > LEVEL_RANK[best] ? u.level : best), 'name');
}

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
    // A subtype claim matches on the subtype word itself: a check or step named just
    // `unit` ran unit tests, even though bare `unit` is too weak to count as a generic
    // test check.
    const subRe = claim.subtype ? new RegExp(`\\b${claim.subtype}\\b`, 'i') : null;
    const units = evidence.flatMap((r) => unitsFor(r, def, subRe));
    const matched = [...new Set(units.map((u) => u.run))];
    const level = units.length > 0 ? strongestLevel(units) : null;
    base.runs = matched;
    base.level = level;
    if (units.length === 0) {
      return { ...base, verdict: 'NOT_CHECKED', why: `No check named for ${what} ran on this commit. A receipt cannot tell whether other checks ran ${what}.` };
    }
    const failed = units.filter((u) => !u.pending && FAILED_CONCLUSIONS.has(u.conclusion));
    if (failed.length > 0) {
      return { ...base, verdict: 'FAILED', why: `${failed.map((u) => u.where).join(', ')} finished ${failed[0].conclusion}.` };
    }
    const pending = units.filter((u) => u.pending);
    if (pending.length > 0) {
      return { ...base, verdict: 'NOT_CHECKED', why: `${pending.map((u) => u.where).join(', ')} still running when this receipt was written.` };
    }
    // A step that never ran reports `skipped` or nothing at all. Either way the work did
    // not happen, so it is never a pass — see the note on SETTLED_OK in unitsFor.
    const notGreen = units.filter((u) => u.conclusion !== 'success');
    if (notGreen.length > 0) {
      return { ...base, verdict: 'NOT_CHECKED', why: `${notGreen.map((u) => `${u.where} (${u.conclusion || 'did not run'})`).join(', ')}: ended without a pass or a fail.` };
    }
    // A matched check passed, but another check on this commit did not finish green. It may
    // cover this claim under a name no list knows, so the receipt cannot say VERIFIED.
    if (unsettled.length > 0) {
      const desc = (r) => `${r.name} (${r.status === 'completed' ? r.conclusion : r.status})`;
      return {
        ...base,
        verdict: 'NOT_CHECKED',
        why: `${units.map((u) => u.where).join(', ')} passed, but ${unsettled.map(desc).join(', ')} did not finish green on this commit and may cover the same ground.`,
      };
    }
    // Name the level, so a reader can tell a command-backed pass from a name match without
    // opening the run. The weakest level says so out loud rather than reading as proof.
    const how =
      level === 'command'
        ? `and the job's own workflow file at this commit runs a matching command`
        : level === 'step'
          ? `as its own step`
          : `matched by check name only, which is a label rather than evidence`;
    return { ...base, verdict: 'VERIFIED', why: `${units.map((u) => u.where).join(', ')} passed ${how}, and every other check on this commit finished green, skipped or neutral.` };
  });
}

const MARK = { VERIFIED: '✅ VERIFIED', FAILED: '❌ FAILED', NOT_CHECKED: '⚪ NOT CHECKED' };
const MARKER = '<!-- trustshell-receipt -->';

const DOES_NOT_PROVE = [
  'A green check proves that check passed on this commit. It does not prove the check tested this change.',
  'Evidence is read at the strongest level each check offers: the `run:` command of the job, taken from the workflow file at this commit; else the step name and that step own result; else the check name alone. The Result column says which. A check name is a label, not evidence.',
  'At command level the receipt confirms the job runs a command that normally runs this kind of check. It cannot confirm the command asserted anything: a test script that exits 0 without running a test still reads as tests.',
  'A job whose steps cannot be read (a third-party check, or no `actions: read` permission) is matched by its name alone, and a job whose work happens inside a composite action shows no command.',
  'Claims are read from the PR description and the latest commit message by plain patterns. A claim worded unusually is not seen. Text in double quotes, code blocks and block quotes is ignored on purpose; text in single quotes is read, because a single quote is also an apostrophe.',
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
      // One sentence can hold two claims ("tsc is clean and tests pass"); name which this row is.
      const what = r.subtype ? `${r.subtype} ${r.label}` : r.label;
      lines.push(`| **${escapeCell(what)}**: ${escapeCell(r.quote)} | ${escapeCell(r.sources.join(', '))} | ${escapeCell(r.why)} | ${MARK[r.verdict]} |`);
    }
  }
  lines.push('', '<details><summary>What this receipt does not prove</summary>', '');
  for (const d of DOES_NOT_PROVE) lines.push(`- ${d}`);
  lines.push('', '</details>', '', '<sub>Receipts by TrustShell. Read-only: it reads this PR and its check runs, and writes only this comment. No code leaves the repo.</sub>');
  return lines.join('\n');
}

module.exports = {
  KINDS,
  MARKER,
  DEFAULT_SELF,
  DOES_NOT_PROVE,
  STEP_NOISE,
  stripQuoted,
  extractClaims,
  groupClaims,
  judge,
  render,
  unitsFor,
  stepCouldMatter,
  strongestLevel,
};
