"use strict";
/**
 * `trustshell check <run-url> --claims <file|text>` — map what an agent SAID onto what GitHub REPORTS.
 * ------------------------------------------------------------------
 * GitHub already shows a green check. What it does not show is whether the sentence an agent
 * wrote ("all tests pass, fixed in abc1234, production ready") is the sentence the run supports.
 * This file builds one minimal record that keeps those apart:
 *
 *   observation     what `check` read from api.github.com, field by field (PLATFORM_REPORTED)
 *   claims[]        each claim, the deterministic template that read it, and one of three
 *                   statuses: SUPPORTED, CONTRADICTED, NOT_CHECKED
 *   assurance       what kind of evidence this is, and what it is not
 *   does_not_prove  the sentences a reader must not lose
 *
 * NO LLM, NO NETWORK BEYOND `check`. Claim mapping is regular expressions over the claim text and
 * equality over observation fields. The only egress is `runCheck`'s, which is api.github.com.
 *
 * THE RULES THIS FILE EXISTS TO KEEP, each enforced below and pinned in tests/action-evidence.test.ts:
 *  - Never claim more than the evidence proves. Each claim is atomic, with its own verdict.
 *  - A claim no template can check is NOT_CHECKED with the reason written next to it. Never SUPPORTED.
 *  - A claim that conflicts with a field is CONTRADICTED, and the reason names both values.
 *  - A successful run supports "this workflow run succeeded" and nothing wider: not "all tests
 *    pass", not "all checks pass", not "the fix works". Those stay NOT_CHECKED.
 *  - An outcome is compared only when the text ties it to the inspected run by citing its commit or
 *    run id, and cites nothing that does not match.
 *  - A run that has not finished, or whose jobs were not all read, decides no outcome.
 *  - SUPPORTED is narrow. Its `scope` says exactly what matched and what that match does not cover.
 *  - The observation is GitHub reporting on its own run. It is labelled PLATFORM_REPORTED and is
 *    never presented as an independent grade.
 *  - No attestation is read, so cryptographic_integrity is NOT_CHECKED. The type allows nothing else,
 *    so it cannot be set to anything stronger without code that actually verifies one.
 *  - Text from outside (the claims, and names GitHub returns for someone else's repo) is never
 *    spliced into generated sentences. Those sentences interpolate only digits and hex.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_CLAIMS = exports.MAX_CLAIM_TEXT = exports.RECORD_DOES_NOT_PROVE = exports.ACTION_EVIDENCE_SCHEMA = void 0;
exports.digestRecord = digestRecord;
exports.cleanCodePoints = cleanCodePoints;
exports.wellFormed = wellFormed;
exports.normalizeClaimText = normalizeClaimText;
exports.splitClaims = splitClaims;
exports.mapClaims = mapClaims;
exports.observationFromCheck = observationFromCheck;
exports.buildRecord = buildRecord;
exports.urlAttempt = urlAttempt;
exports.inspectRunClaims = inspectRunClaims;
exports.tallyClaims = tallyClaims;
exports.claimsExitCode = claimsExitCode;
const jcs_1 = require("./jcs");
const check_1 = require("./check");
exports.ACTION_EVIDENCE_SCHEMA = 'dev.trustshell.action-evidence/0.1-draft';
/** SHA-256 over the RFC 8785 canonical form of the record. Detects later edits; says nothing about authorship. */
function digestRecord(record) {
    return { algorithm: 'sha-256', canonicalization: 'RFC 8785', value: (0, jcs_1.jcsSha256)(record) };
}
exports.RECORD_DOES_NOT_PROVE = [
    ...check_1.DOES_NOT_PROVE,
    'SUPPORTED means the platform record matches the narrow scope written next to the claim. It is not a finding that the claim is true in any broader sense.',
    'A successful workflow run shows that run succeeded. It does not show which tests ran, that all tests or all checks passed, or that a change works.',
    'Only this one workflow run was read. Other workflows, check suites and status checks on the same commit were not.',
    'Every observed fact is GitHub reporting on its own run (PLATFORM_REPORTED). Nothing was re-run or independently observed.',
    'Broader security: not checked. A CI conclusion is not a security review.',
    'The record is not signed. Its SHA-256 shows whether the record changed after it was made, not who made it.',
];
// ── normalisation and splitting ─────────────────────────────────────────────────────────────────
/** A clause longer than this is stored cut, with an ellipsis. Templates still read all of it. */
exports.MAX_CLAIM_TEXT = 300;
/** Sentences after this many are not read one by one; a single NOT_CHECKED entry says how many. */
exports.MAX_CLAIMS = 200;
/**
 * Code points that display as nothing, or reorder what is displayed: soft hyphen, combining
 * grapheme joiner, the bidi marks, overrides and isolates, zero-width characters, Hangul fillers,
 * variation selectors, the byte-order mark, musical-symbol format controls and the Unicode tag
 * block. Listed as numbers, not regex escapes, so no invisible character has to appear in this
 * file. XC1 (2026-10-19) hid "Not" from the qualifier check with U+200B, U+00AD and U+E0020.
 */
const INVISIBLE_RANGES = [
    [0x00ad, 0x00ad], [0x034f, 0x034f], [0x061c, 0x061c], [0x115f, 0x1160], [0x17b4, 0x17b5],
    [0x180b, 0x180f], [0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x206f], [0x3164, 0x3164],
    [0xfe00, 0xfe0f], [0xfeff, 0xfeff], [0xffa0, 0xffa0], [0x1bca0, 0x1bca3], [0x1d173, 0x1d17a],
    [0xe0000, 0xe0fff],
];
function isInvisible(cp) {
    for (const [a, b] of INVISIBLE_RANGES)
        if (cp >= a && cp <= b)
            return true;
    return false;
}
const REPLACEMENT = String.fromCharCode(0xfffd);
/**
 * One pass over the code points: an unpaired surrogate becomes U+FFFD (it has no UTF-8 form, and
 * RFC 8785 refuses it), an invisible or reordering character is removed, and a C0/C1 control (a
 * terminal escape starts with one) becomes a space. Newlines survive only when asked for.
 */
function cleanCodePoints(s, keepNewlines = false) {
    let out = '';
    for (const ch of String(s ?? '')) {
        const cp = ch.codePointAt(0);
        if (cp >= 0xd800 && cp <= 0xdfff)
            out += REPLACEMENT;
        else if (isInvisible(cp))
            continue;
        else if (cp === 0x0a && keepNewlines)
            out += ch;
        else if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f))
            out += ' ';
        else
            out += ch;
    }
    return out;
}
/**
 * Replace unpaired surrogates with U+FFFD and change nothing else. Applied to every string GitHub
 * returns before it enters the record: one unpaired surrogate in a workflow name otherwise made the
 * RFC 8785 digest throw, so any repository could make every --claims check of its runs fail (XC1 L1).
 */
function wellFormed(s) {
    let out = '';
    for (const ch of String(s ?? '')) {
        const cp = ch.codePointAt(0);
        out += cp >= 0xd800 && cp <= 0xdfff ? REPLACEMENT : ch;
    }
    return out;
}
/**
 * The one form of the text that every template reads and every card displays: invisible characters
 * removed, NFKC applied (fullwidth digits become digits, compatibility forms their plain letters),
 * controls made spaces. Templates and display read the SAME string, so a reader can never see a
 * word the checks did not.
 */
function canonicalText(s, keepNewlines) {
    return cleanCodePoints(cleanCodePoints(s, keepNewlines).normalize('NFKC'), keepNewlines);
}
/** Normalise one claim for storage: {@link canonicalText}, whitespace collapsed, cut at MAX_CLAIM_TEXT. */
function normalizeClaimText(s) {
    const cleaned = canonicalText(String(s ?? ''), false).replace(/\s+/g, ' ').trim();
    return cleaned.length > exports.MAX_CLAIM_TEXT ? cleaned.slice(0, exports.MAX_CLAIM_TEXT - 1) + '…' : cleaned;
}
/** Any letter or digit, in any script. A sentence without one is punctuation, not a claim. */
const HAS_WORD = /[\p{L}\p{N}]/u;
/**
 * Split free text into claim sentences. PURE, and one pass over the lines.
 *
 * Skipped, because a reader of the rendered text does not see them as claims: fenced code, HTML
 * comment BLOCKS, headings, and unticked task-list items (`- [ ] tests pass` is a to-do). Kept but
 * marked: blockquoted lines, which are someone else's words.
 *
 * The rules follow CommonMark, because the failure to avoid is hiding text a reader can see (XC1
 * H1, H2):
 *  - A fence opens on a line of 3+ backticks or tildes, indented at most 3 spaces. A backtick
 *    fence's info string may not contain a backtick, so "```x``` more text" is prose, not a fence.
 *    It closes on the same character, at least as long, with nothing else on the line.
 *  - A comment is removed only as an HTML block: a line that starts with `<!--`, through the line
 *    holding `-->`. Text after the `-->` is kept. A `<!--` anywhere else (in a code span,
 *    mid-sentence) is text, and so is an opener with no `-->` anywhere after it.
 */
function splitClaims(text) {
    const lines = canonicalText(String(text ?? ''), true).split('\n');
    // closesFrom[i]: whether line i or any later line holds "-->". One backward pass, so this stays linear.
    const closesFrom = new Array(lines.length + 1).fill(false);
    for (let i = lines.length - 1; i >= 0; i -= 1)
        closesFrom[i] = closesFrom[i + 1] || lines[i].includes('-->');
    const out = [];
    let fence = null;
    let inComment = false;
    for (let i = 0; i < lines.length; i += 1) {
        let line = lines[i];
        if (fence) {
            const close = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
            if (close && close[1][0] === fence.ch && close[1].length >= fence.len)
                fence = null;
            continue;
        }
        if (inComment) {
            const end = line.indexOf('-->');
            if (end < 0)
                continue;
            inComment = false;
            line = line.slice(end + 3);
        }
        else {
            const open = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
            if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
                fence = { ch: open[1][0], len: open[1].length };
                continue;
            }
            const opener = line.match(/^ {0,3}<!--/);
            if (opener) {
                const sameLine = line.indexOf('-->', opener[0].length);
                if (sameLine >= 0)
                    line = line.slice(sameLine + 3);
                else if (closesFrom[i + 1]) {
                    inComment = true;
                    continue;
                }
                // No "-->" anywhere after it: not a comment anyone can see the end of, so it stays text.
            }
        }
        let body = line.trim();
        if (!body || /^#{1,6}(?:\s|$)/.test(body))
            continue;
        let quoted = false;
        if (body.startsWith('>')) {
            quoted = true;
            body = body.replace(/^(?:>\s*)+/, '');
        }
        body = body.replace(/^(?:[-*+]|\d+[.)])\s+/, '');
        if (/^\[ \]\s/.test(body))
            continue;
        body = body.replace(/^\[[xX]\]\s+/, '');
        for (const part of body.split(/(?<=[.!?;])\s+/)) {
            const whole = part.replace(/\s+/g, ' ').trim();
            if (HAS_WORD.test(whole))
                out.push({ text: whole, quoted });
        }
    }
    const kept = out.slice(0, exports.MAX_CLAIMS);
    return {
        clauses: kept.map((s) => normalizeClaimText(s.text)),
        full: kept.map((s) => s.text),
        quoted: kept.map((s) => s.quoted),
        dropped: Math.max(0, out.length - exports.MAX_CLAIMS),
    };
}
// ── templates ───────────────────────────────────────────────────────────────────────────────────
//
// LINEAR TIME ON UNTRUSTED TEXT. Every pattern here runs over claim text a stranger wrote. CodeQL
// flagged js/polynomial-redos on the HTML-comment pattern this file used to have, and three more of
// one shape were then measured here: `\s*`, an optional token, then `\s*` again lets the engine try
// every split of a run of spaces between the two, so "commit" followed by 80,000 spaces took 130 s.
// No pattern below puts two unbounded quantifiers over the same characters side by side, and
// tests/action-evidence.test.ts times every template against that kind of input.
//
// ATOMIC CLAIMS. A sentence such as "All tests pass and CI is green on 5cd68edc (run 1, attempt 2)"
// is five claims, and each gets its own verdict. `claim` is the exact span a template matched;
// `sentence` is where it came from.
//
// WHAT A GREEN RUN CAN SUPPORT. One successful workflow run supports exactly one outcome claim:
// "this workflow run succeeded". It does not establish that all tests pass (the run record does
// not say which tests ran), that all checks pass (other workflows were not read), or that a change
// works. Those stay NOT_CHECKED. A FAILED run can still CONTRADICT "all checks pass": one failing
// check is a counterexample. And no outcome is compared at all unless the text ties it to this run
// by citing its commit or run id, with nothing cited that does not match.
/** Explicitly about a workflow run: "the workflow passed", "the check workflow run succeeded", "run 123456 passed". */
const RUN_SUCCEEDED = [
    // "The `check` workflow passed": an optional determiner and workflow NAME, each bounded. The name
    // is captured (group 1) because "the deploy workflow passed" is not evidenced by the check
    // workflow; see namesThisWorkflow.
    // A determiner is never taken as the name ("that the workflow" is not a workflow named "the").
    /\b(?:(?:the|this|that|our|its)\s+)?(?:(?!(?:the|this|that|our|its|a|an)\s)(`[^`\n]{1,64}`|[\w.-]{1,40})\s+)?(?:workflow|pipeline)(?:\s+run)?(?:\s+#?\d{6,})?\s+(?:has\s+|have\s+)?(?:now\s+)?(?:pass(?:es|ed)?|succeed(?:s|ed)?|is\s+green|was\s+green|went\s+green|completed\s+successfully)\b/gi,
    // "The run passed", "run 123456 succeeded": a determiner or a run id directly beside "run", so "the
    // dry run passed" and "the e2e test-run passed" are not this workflow run (XC1 D). Not "the job
    // passed" either: a job is one part of a run, not the run.
    /\b(?:(?:the|this|that|our|its)\s+run|run\s+#?\d{6,})\s+(?:has\s+|have\s+)?(?:now\s+)?(?:pass(?:es|ed)?|succeed(?:s|ed)?|is\s+green|was\s+green|went\s+green|completed\s+successfully)\b/gi,
];
/** Whether a workflow name a claim uses is the inspected run's, by display name or file stem. */
function namesThisWorkflow(name, o) {
    const n = name.replace(/`/g, '').trim().toLowerCase();
    const display = o.workflow.name.trim().toLowerCase();
    const file = (o.workflow.path.split('/').pop() ?? '').toLowerCase();
    const stem = file.endsWith('.yml') ? file.slice(0, -4) : file.endsWith('.yaml') ? file.slice(0, -5) : file;
    return n !== '' && (n === display || (stem !== '' && n === stem));
}
/** About every check on the change: "all checks pass", "CI is green", "everything is green". */
const ALL_CHECKS = [
    /\ball\s+(?:of\s+the\s+|the\s+)?(?:status\s+|CI\s+)?checks?\s+(?:are\s+|have\s+)?(?:now\s+)?(?:pass(?:es|ed|ing)?|green|succeed(?:s|ed)?)\b/gi,
    /\bevery\s+check\s+(?:has\s+)?(?:pass(?:es|ed)|succeed(?:s|ed)|is\s+green)\b/gi,
    /\bchecks\s+(?:are\s+|have\s+)?(?:all\s+)?(?:now\s+)?(?:pass(?:es|ed|ing)?|green)\b/gi,
    /\bCI\s+(?:is\s+|was\s+|has\s+)?(?:all\s+|now\s+|fully\s+)?(?:green|pass(?:es|ed|ing)?|succeed(?:s|ed)?)\b/gi,
    /\b(?:all|everything)\s+(?:is\s+)?green\b/gi,
    /\bgreen\s+CI\b/gi,
    /\bpass(?:es|ed|ing)?\s+(?:all\s+)?(?:the\s+)?(?:checks|CI)\b/gi,
];
/** About tests: "all tests pass", "the unit tests are green", "passes all tests". */
const TESTS_PASS = [
    /\b(?:all\s+(?:of\s+)?)?(?:the\s+)?(?:unit\s+|integration\s+|e2e\s+|end-to-end\s+|regression\s+)?(?:tests?|specs?|test\s+suites?)\s+(?:are\s+|is\s+|have\s+)?(?:all\s+)?(?:now\s+|still\s+)?(?:pass(?:es|ed|ing)?|green|succeed(?:s|ed)?)\b/gi,
    /\bpass(?:es|ed|ing)?\s+(?:all\s+)?(?:the\s+)?(?:unit\s+|integration\s+|e2e\s+)?(?:tests|specs|test\s+suites?)\b/gi,
];
/** "The build passes": names no workflow and no check, so it is compared with nothing. */
const BUILD_PASS = [
    /\b(?:the\s+)?build\s+(?:is\s+|was\s+|has\s+)?(?:now\s+|still\s+)?(?:pass(?:es|ed|ing)?|green|succeed(?:s|ed)?)\b/gi,
    /\bgreen\s+build\b/gi,
];
/**
 * Words that change what a pass claim means: a negation ("tests don't pass"), a failure word, or a
 * partial quantifier ("most tests pass" is not refuted by a red run). A sentence holding one has
 * its pass and success claims NOT_CHECKED: conservative on purpose, since the alternative is
 * reading a claim backwards.
 */
const PASS_QUALIFIER = /\b(?:not|no|never|cannot|without|fail\w*|broken|flak\w*|except|but|although|though|unless|some|most|several|few|half|partially|mostly)\b|n't\b/i;
const LOCAL_RUN = /\b(?:locally|on\s+my\s+(?:machine|laptop|box|computer)|in\s+my\s+(?:env|environment|setup))\b/i;
/** Commit citations. `needLetter` is for the weak contexts, so a run id or a count is not read as a SHA. */
const SHA_PATTERNS = [
    { re: /\b(?:commit|sha|rev(?:ision)?)\s*(?:[:#]\s*)?[`'"(\[]?([0-9a-f]{7,40})(?![0-9a-z])/gi, needLetter: false },
    { re: /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+\/commit\/([0-9a-f]{7,40})(?![0-9a-z])/gi, needLetter: false },
    { re: /\b(?:in|on|at|of)\s+[`'"(\[]?([0-9a-f]{7,40})(?![0-9a-z])/gi, needLetter: true },
    { re: /`([0-9a-f]{7,40})`/gi, needLetter: true },
];
const RUN_URL = /(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/actions\/runs\/(\d+)(\/attempts\/(\d+))?/gi;
const RUN_ID = /\brun\s*(?:id\s*)?(?:(?:#|no\.?)\s*)?(\d{6,})\b/gi;
const ATTEMPT = /\battempt\s*(?:#\s*)?(\d{1,3})\b/gi;
/** Claims this tool will name and refuse to grade. Each yields its own NOT_CHECKED entry. */
const EXCLUSIONS = [
    {
        id: 'excluded.completion',
        pattern: /\b(?:done|finished|all\s+set|implemented|completed?\s+(?:the|this|it|all|everything))\b/i,
        reason: '"Done" is not a fact a workflow run records. Only the narrower claims mapped from the same text are compared.',
    },
    {
        id: 'excluded.security',
        pattern: /\b(?:(?:fully|completely|totally|very|now)\s+)?(?:secure(?:d|ly)?|security|vulnerab\w*|exploit\w*|CVE-\d+|hardened|pen-?test\w*)\b/i,
        reason: 'A CI run conclusion is not a security review, and no security result is mapped.',
    },
    {
        id: 'excluded.no_bugs',
        pattern: /\b(?:all|every|any)\s+(?:of\s+the\s+|the\s+|known\s+|remaining\s+|other\s+)?bugs?\b|\bbug[- ]?free\b|\bno\s+(?:more\s+|known\s+|remaining\s+)?bugs?\b/i,
        reason: 'No run result can show that bugs are absent.',
    },
    {
        id: 'excluded.readiness',
        pattern: /\bprod(?:uction)?[- ]ready\b|\bready\s+(?:for|to)\s+(?:production|prod|ship|merge|deploy|release|go)\b|\bsafe\s+to\s+(?:merge|ship|deploy|release)\b/i,
        reason: 'Readiness is a judgement, not something a workflow run reports.',
    },
    {
        id: 'excluded.fix',
        pattern: /\b(?:fix(?:es|ed)?|resolv(?:es|ed)|solv(?:es|ed))\b/i,
        reason: 'A run shows what its jobs concluded, not whether a change fixes what it set out to fix.',
    },
    {
        id: 'excluded.local_run',
        pattern: LOCAL_RUN,
        reason: 'A local or private run cannot be observed through this workflow run.',
    },
    {
        id: 'excluded.test_count',
        // Bounded: `\d[\d,]*` re-scanned a run like "1,1,1,…" from every digit, ~2 minutes at the
        // 256 KiB file limit (XC1 S3).
        pattern: /\b\d{1,9}(?:,\d{3}){0,4}\s+(?:\w+\s+)?(?:tests?|specs?|cases?|suites?)\b/i,
        reason: 'The Actions API reports jobs, not individual tests or how many there are.',
    },
    {
        id: 'excluded.coverage',
        pattern: /\bcoverage(?:\s+(?:is|was|of|at))?(?:\s+\d+(?:\.\d+)?\s?%)?|\b\d+(?:\.\d+)?\s?%(?:\s+coverage)?/i,
        reason: 'Coverage figures are not read.',
    },
    {
        id: 'excluded.deployment',
        pattern: /\b(?:deployed|in\s+production|live\s+(?:in|on)\s+prod\w*|released|published|shipped)\b/i,
        reason: 'Deployment state is not part of a workflow run record.',
    },
    {
        id: 'excluded.performance',
        pattern: /\b(?:faster|slower|performance|perf|latency|throughput|optimi[sz]ed|speed(?:s|ed)?\s+up)\b/i,
        reason: 'Performance is not measured here.',
    },
    {
        id: 'excluded.review',
        pattern: /\b(?:reviewed|approved|LGTM|signed[- ]off)\b/i,
        reason: 'Reviews and approvals are not read.',
    },
];
const HEX40 = /^[0-9a-f]{40}$/;
const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out', 'startup_failure']);
/** First 12 hex characters of a SHA GitHub returned, or a placeholder. Never splices a non-hex string. */
function shortSha(sha) {
    return HEX40.test(sha) ? sha.slice(0, 12) : '(unrecognised sha)';
}
/** A GitHub enum value such as `success` or `in_progress`, or a placeholder — never free text. */
function word(s) {
    return s && /^[a-z_]{1,32}$/.test(s) ? s : 'unrecognised';
}
function runRef(o) {
    return `run ${o.run_id} (attempt ${o.run_attempt ?? 'unknown'}, commit ${shortSha(o.head_sha)})`;
}
/** All matches of every pattern, as hits. Overlapping hits of one template keep the earliest, then longest. */
function hitsFor(template, patterns, text) {
    const all = [];
    for (const re of patterns) {
        for (const m of text.matchAll(re))
            all.push({ template, span: m[0], at: m.index ?? 0, ...(m[1] !== undefined ? { name: m[1] } : {}) });
    }
    all.sort((a, b) => a.at - b.at || b.span.length - a.span.length);
    const kept = [];
    for (const h of all) {
        const last = kept[kept.length - 1];
        if (last && h.at < last.at + last.span.length)
            continue;
        kept.push(h);
    }
    return kept;
}
/** Commit, run and attempt citations in one sentence. URLs are blanked (same length) before the prose patterns run. */
function citationHits(text, o) {
    const hits = [];
    const seenSha = new Set();
    for (const { re, needLetter } of SHA_PATTERNS) {
        for (const m of text.matchAll(re)) {
            const sha = String(m[1]).toLowerCase();
            if ((needLetter && !/[a-f]/.test(sha)) || seenSha.has(sha))
                continue;
            seenSha.add(sha);
            hits.push({ template: 'git.head_sha', span: m[0], at: m.index ?? 0, sha });
        }
    }
    const seenRun = new Set();
    const seenAttempt = new Set();
    for (const m of text.matchAll(RUN_URL)) {
        const runId = Number(m[3]);
        const sameRepo = String(m[1]).toLowerCase() === o.owner.toLowerCase() && String(m[2]).toLowerCase() === o.repo.toLowerCase();
        const at = m.index ?? 0;
        if (!seenRun.has(runId)) {
            seenRun.add(runId);
            hits.push({ template: 'gha.run_id', span: m[0].slice(0, m[0].length - (m[4] ?? '').length), at, runId, sameRepo });
        }
        if (m[5] && !seenAttempt.has(Number(m[5]))) {
            seenAttempt.add(Number(m[5]));
            hits.push({ template: 'gha.run_attempt', span: String(m[4]), at: at + m[0].length - String(m[4]).length, attempt: Number(m[5]) });
        }
    }
    const prose = text.replace(/https?:\/\/\S+/g, (u) => ' '.repeat(u.length));
    for (const m of prose.matchAll(RUN_ID)) {
        const runId = Number(m[1]);
        if (seenRun.has(runId))
            continue;
        seenRun.add(runId);
        hits.push({ template: 'gha.run_id', span: m[0], at: m.index ?? 0, runId, sameRepo: null });
    }
    for (const m of prose.matchAll(ATTEMPT)) {
        const attempt = Number(m[1]);
        if (seenAttempt.has(attempt))
            continue;
        seenAttempt.add(attempt);
        hits.push({ template: 'gha.run_attempt', span: m[0], at: m.index ?? 0, attempt });
    }
    return hits;
}
/** A citation's verdict. Only a SUPPORTED citation ties a sentence to this run. */
function citationEntry(h, sentence, o) {
    const base = { claim: normalizeClaimText(h.span), sentence, template: h.template };
    if (h.template === 'git.head_sha') {
        const t = h.sha;
        const scope = 'Commit identity only: whether the commit this claim cites is the one the inspected run ran on. A short SHA is matched as a prefix. Not what the commit changes or fixes.';
        const fields = ['/observation/head_sha'];
        if (!HEX40.test(o.head_sha))
            return { ...base, status: 'NOT_CHECKED', evidence_fields: [], scope, reason: 'GitHub returned no recognisable head_sha for this run.' };
        if (o.head_sha.startsWith(t))
            return { ...base, status: 'SUPPORTED', evidence_fields: fields, scope, reason: `The inspected run's head_sha ${shortSha(o.head_sha)} begins with ${t}.` };
        return { ...base, status: 'CONTRADICTED', evidence_fields: fields, scope, reason: `The claim cites commit ${t}; the inspected run is on ${shortSha(o.head_sha)}.` };
    }
    if (h.template === 'gha.run_id') {
        const scope = 'Run identity only: whether the run this claim cites is the inspected run. Not what the run shows.';
        const fields = ['/observation/owner', '/observation/repo', '/observation/run_id'];
        if (h.sameRepo === false)
            return { ...base, status: 'CONTRADICTED', evidence_fields: fields, scope, reason: 'The claim links a run in a different repository from the inspected one.' };
        if (h.runId !== o.run_id)
            return { ...base, status: 'CONTRADICTED', evidence_fields: fields, scope, reason: `The claim cites run ${h.runId}; the inspected run is ${o.run_id}.` };
        return { ...base, status: 'SUPPORTED', evidence_fields: fields, scope, reason: `The cited run is the inspected run, ${o.run_id}.` };
    }
    // gha.run_attempt
    const scope = "Attempt identity only: whether the attempt this claim cites is the one GitHub's record describes. Not what that attempt shows.";
    const fields = ['/observation/run_attempt'];
    if (o.run_attempt === null)
        return { ...base, status: 'NOT_CHECKED', evidence_fields: [], scope, reason: 'GitHub returned no run_attempt, so an attempt number cannot be compared.' };
    if (h.attempt !== o.run_attempt) {
        return { ...base, status: 'CONTRADICTED', evidence_fields: fields, scope, reason: `The claim cites attempt ${h.attempt}; GitHub's record for run ${o.run_id} is attempt ${o.run_attempt}, its latest.` };
    }
    return { ...base, status: 'SUPPORTED', evidence_fields: fields, scope, reason: `The cited attempt is ${o.run_attempt}, the one GitHub's record describes.` };
}
function outcomeEntry(h, sentence, o, anchor, qualifier) {
    const base = { claim: normalizeClaimText(h.span), sentence, template: h.template };
    const nc = (scope, reason) => ({ ...base, status: 'NOT_CHECKED', evidence_fields: [], scope, reason });
    const run = runRef(o);
    const jobs = o.jobs.items;
    const finished = o.status === 'completed';
    if (h.template === 'ci.build_unscoped') {
        return nc('Not compared: "the build" names no workflow and no check.', `"The build" could be any workflow or check, so it is not compared with ${run}.`);
    }
    if (anchor.gate)
        return nc('Not compared: this sentence is not read as a plain statement.', anchor.gate);
    if (qualifier) {
        return nc('Not compared: a negated, failing or partial claim is not read automatically.', `The sentence contains "${qualifier}", which changes what the claim means, so it was not compared with the run.`);
    }
    const namesThis = h.name !== undefined && namesThisWorkflow(h.name, o);
    if (h.template === 'gha.run_succeeded' && h.name !== undefined && !namesThis) {
        // The name is the claimant's text, so it is never spliced into this sentence.
        return nc('Not compared: the claim names a different workflow.', `The claim names a workflow other than the inspected one (see /observation/workflow), so ${run} is not evidence for it.`);
    }
    if (anchor.mismatch) {
        return nc('Not compared: nothing ties this claim to the inspected run.', 'This sentence cites a commit, run or attempt that is not, or could not be matched to, the inspected run, so its outcome claims are not compared with this run.');
    }
    if (!anchor.commit) {
        return nc('Not compared: nothing ties this claim to the inspected run.', `This sentence cites neither this run's commit nor its run id, so nothing ties the claim to ${run}.`);
    }
    // A commit has many workflow runs. Citing the commit identifies the commit, not the workflow:
    // "the workflow passed on <sha>" could be an always-green labeler next to a red CI (XC1 F7).
    if (h.template === 'gha.run_succeeded' && !anchor.run && !namesThis) {
        return nc('Not compared: the claim does not say which workflow.', `A commit has many workflow runs. This sentence cites the commit but neither names this workflow nor cites run ${o.run_id}, so it is not compared.`);
    }
    const how = anchor.run ? 'The sentence cites this run.' : h.template === 'gha.run_succeeded' ? 'The sentence names this workflow and cites this commit.' : 'The sentence cites this commit.';
    if (h.template === 'ci.tests_pass') {
        const scope = 'Not decided by a run record: it says how jobs concluded, not which tests ran or how each one ended.';
        if (!finished)
            return nc(scope, `${run} has not finished (status: ${word(o.status)}).`);
        if (o.conclusion === 'success') {
            return nc(scope, `${run} concluded "success". That is consistent with this claim but does not establish it: the run record does not say which tests ran or whether all of them passed.`);
        }
        return nc(scope, `${run} concluded "${word(o.conclusion)}". That does not establish that a test failed: the run record does not say which step failed or why.`);
    }
    // A job that names another commit or attempt cannot be counted as part of this run's evidence.
    // Strict: a job with no head_sha cannot be tied to this commit either (XC1 L4).
    const offSha = jobs.filter((j) => j.head_sha !== o.head_sha).length;
    const offAttempt = jobs.filter((j) => j.run_attempt !== null && o.run_attempt !== null && j.run_attempt !== o.run_attempt).length;
    const jobsUnread = o.jobs.http_status < 200 || o.jobs.http_status >= 300
        ? `the jobs endpoint answered HTTP ${o.jobs.http_status}, so no job result was read`
        : o.jobs.total > jobs.length
            ? `GitHub reports ${o.jobs.total} jobs and returned ${jobs.length}, so not every job was read`
            : jobs.length === 0
                ? 'the run reports no jobs'
                : offSha
                    ? `${offSha} of ${jobs.length} jobs report a head_sha other than the run's`
                    : offAttempt
                        ? `${offAttempt} of ${jobs.length} jobs report a different run attempt`
                        : null;
    const failedJobs = jobs.filter((j) => j.conclusion !== null && FAILED_CONCLUSIONS.has(j.conclusion)).length;
    const notSucceeded = jobs.filter((j) => j.conclusion !== 'success' && j.conclusion !== 'skipped').length;
    const ran = jobs.filter((j) => j.conclusion === 'success').length;
    const skipped = jobs.filter((j) => j.conclusion === 'skipped').length;
    if (h.template === 'gha.run_succeeded') {
        const fields = ['/observation/status', '/observation/conclusion', '/observation/check/verdict', '/observation/jobs'];
        const scope = `Whether workflow ${run} concluded success with every job read. Not which tests it ran, not any other workflow or check on the commit, and not whether the change works.`;
        if (!finished)
            return nc(scope, `${run} has not finished (status: ${word(o.status)}).`);
        // A finished run with no readable conclusion is a malformed record, not a failed run.
        if (word(o.conclusion) === 'unrecognised')
            return nc(scope, `${run} is reported finished but with no recognisable conclusion.`);
        if (o.conclusion !== 'success') {
            return { ...base, status: 'CONTRADICTED', evidence_fields: fields, scope, reason: `${run} finished with conclusion "${word(o.conclusion)}", not "success".` };
        }
        if (jobsUnread)
            return nc(scope, `GitHub reports conclusion "success", but ${jobsUnread}.`);
        if (notSucceeded)
            return nc(scope, `GitHub reports conclusion "success" for the run, but ${notSucceeded} of ${jobs.length} jobs concluded something else: the record disagrees with itself.`);
        if (ran === 0)
            return nc(scope, 'Every job was skipped. A run in which no job ran is not a run that succeeded at anything.');
        return {
            ...base,
            status: 'SUPPORTED',
            evidence_fields: fields,
            scope,
            reason: `GitHub reports conclusion "success" for ${run}; ${ran} of ${(0, check_1.plural)(jobs.length, 'job')} concluded success${skipped ? ` and ${skipped} skipped` : ''}. ${how}`,
        };
    }
    // ci.all_checks_pass: one run can refute it, never establish it.
    const fields = ['/observation/status', '/observation/conclusion', '/observation/jobs'];
    const scope = 'A claim about every check on the commit. One workflow run can contradict it (a failing check is a counterexample) but cannot establish it: the other checks were not read.';
    if (!finished)
        return nc(scope, `${run} has not finished (status: ${word(o.status)}).`);
    if (o.conclusion !== null && FAILED_CONCLUSIONS.has(o.conclusion)) {
        return { ...base, status: 'CONTRADICTED', evidence_fields: fields, scope, reason: `${run}, a check on this commit, concluded "${word(o.conclusion)}". ${how}` };
    }
    if (!jobsUnread && failedJobs) {
        return { ...base, status: 'CONTRADICTED', evidence_fields: fields, scope, reason: `${failedJobs} of ${jobs.length} jobs in ${run}, each a check run on this commit, concluded failure. ${how}` };
    }
    if (o.conclusion === 'success')
        return nc(scope, `${run} concluded "success", but it is one workflow; the other checks on this commit were not read.`);
    return nc(scope, `${run} concluded "${word(o.conclusion)}", which is not a failure, and the other checks on this commit were not read.`);
}
/** Words that carry no claim on their own, so a leftover made only of them is not listed. */
const FILLER = new Set('a an and also as at be been by for from has have here i in is it its my now of on or our so that the then there this to was we were with'.split(' '));
const EDGE = new Set([...' \t.,;:!?()[]\'"`-']);
/** Trim spaces and punctuation from both ends. A loop, not `/[…]+$/`, which is quadratic on a long run of them. */
function trimPunctuation(s) {
    let a = 0;
    let b = s.length;
    while (a < b && EDGE.has(s[a]))
        a += 1;
    while (b > a && EDGE.has(s[b - 1]))
        b -= 1;
    return s.slice(a, b);
}
/** A word in any script: a remainder in Chinese or Cyrillic says something too. */
const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'._-]*/gu;
/**
 * The parts of a sentence no template matched, joined with an ellipsis, or null if they say
 * nothing; and whether a "?" sits outside every match. Without the remainder, "CI is not green on
 * b8a17cfb" would show one SUPPORTED commit citation and nothing else.
 */
function remainderOf(full, covered) {
    const sorted = [...covered].sort((a, b) => a[0] - b[0]);
    const parts = [];
    let i = 0;
    for (const [start, end] of sorted) {
        if (start > i)
            parts.push(full.slice(i, start));
        i = Math.max(i, end);
    }
    parts.push(full.slice(i));
    const question = parts.some((p) => p.includes('?'));
    const kept = parts.map(trimPunctuation).filter((p) => (p.match(WORD) ?? []).some((w) => !FILLER.has(w.toLowerCase())));
    return { remainder: kept.length ? normalizeClaimText(kept.join(' … ')) : null, question };
}
function scanSentence(sentence, full, o) {
    const local = LOCAL_RUN.test(full);
    const cites = citationHits(full, o);
    // A local run is not this run: its pass and success claims are left to excluded.local_run.
    const outcomes = local
        ? []
        : [
            ...hitsFor('gha.run_succeeded', RUN_SUCCEEDED, full),
            ...hitsFor('ci.all_checks_pass', ALL_CHECKS, full),
            ...hitsFor('ci.tests_pass', TESTS_PASS, full),
            ...hitsFor('ci.build_unscoped', BUILD_PASS, full),
        ];
    const exclusions = [];
    for (const x of EXCLUSIONS) {
        const m = full.match(x.pattern);
        if (m)
            exclusions.push({ template: x.id, span: m[0], at: m.index ?? 0 });
    }
    const q = full.match(PASS_QUALIFIER);
    const covered = [...cites, ...outcomes, ...exclusions].map((h) => [h.at, h.at + h.span.length]);
    const rest = covered.length ? remainderOf(full, covered) : { remainder: null, question: full.includes('?') };
    return {
        sentence,
        full,
        citations: cites.map((h) => citationEntry(h, sentence, o)),
        citationAt: cites.map((h) => h.at),
        outcomes,
        exclusions,
        remainder: rest.remainder,
        question: rest.question,
        qualifier: q ? q[0].toLowerCase().replace(/[^a-z']/g, '') : null,
    };
}
/**
 * Why a sentence decides nothing, or null when it is a plain statement the templates read in full.
 *
 * This is the rule that closes most of what XC1 found (R1): a verdict, SUPPORTED or CONTRADICTED,
 * is given only for a sentence the templates understood END TO END. "If the workflow passed (run N),
 * we can merge", "Unclear whether …", "The workflow passed on a branch rebased on <sha>", "The dry
 * run passed", "The lint checks pass": each has words no template read, and those words change what
 * the sentence says. A question asks; a blockquote is someone else's words. Everything in such a
 * sentence is NOT_CHECKED, and the unread words are listed as their own claim.
 */
function gateOf(s, quoted) {
    if (s.question)
        return 'This sentence asks rather than states, so none of its parts is taken as a claim.';
    if (quoted)
        return "This line is quoted, so it is not taken as the author's own claim.";
    if (s.remainder)
        return 'This sentence says more than the templates read (see its unmapped part), so none of its parts is decided on its own.';
    return null;
}
/**
 * Map free claim text onto an observation. PURE: same text and observation, same entries, same order.
 *
 * Each sentence is judged on its own: its citations decide which run it is about (see
 * {@link Anchor}), and a sentence the templates did not read end to end decides nothing (see
 * {@link gateOf}). A green run is never evidence for a sentence about another commit, another
 * workflow, or nothing in particular.
 */
function mapClaims(text, o) {
    const { clauses, full, quoted, dropped } = splitClaims(text);
    const out = [];
    clauses.forEach((sentence, idx) => {
        const s = scanSentence(sentence, full[idx], o);
        const gate = gateOf(s, quoted[idx] === true);
        const citations = gate
            ? s.citations.map((c) => ({ ...c, status: 'NOT_CHECKED', evidence_fields: [], reason: gate }))
            : s.citations;
        const mismatch = citations.some((c) => c.status !== 'SUPPORTED');
        const anchor = {
            gate,
            mismatch,
            commit: !mismatch && citations.some((c) => c.status === 'SUPPORTED' && (c.template === 'git.head_sha' || c.template === 'gha.run_id')),
            run: !mismatch && citations.some((c) => c.status === 'SUPPORTED' && c.template === 'gha.run_id'),
        };
        const entries = [];
        citations.forEach((e, i) => entries.push({ at: s.citationAt[i], order: 0, e }));
        s.outcomes.forEach((h) => entries.push({ at: h.at, order: 1, e: outcomeEntry(h, s.sentence, o, anchor, s.qualifier) }));
        s.exclusions.forEach((h, i) => entries.push({
            at: h.at,
            order: 2 + i,
            e: {
                claim: normalizeClaimText(h.span),
                sentence: s.sentence,
                template: h.template,
                status: 'NOT_CHECKED',
                evidence_fields: [],
                scope: 'Outside what a workflow run record can show.',
                reason: EXCLUSIONS.find((x) => x.id === h.template).reason,
            },
        }));
        if (entries.length === 0) {
            out.push({
                claim: s.sentence,
                sentence: s.sentence,
                template: 'unmapped',
                status: 'NOT_CHECKED',
                evidence_fields: [],
                scope: 'No deterministic template matches this sentence.',
                reason: quoted[idx] ? "Quoted, so not the author's own claim, and not compared with anything." : 'Not compared with anything, so it is neither supported nor contradicted.',
            });
            return;
        }
        entries.sort((a, b) => a.at - b.at || a.order - b.order);
        out.push(...entries.map((x) => x.e));
        if (s.remainder) {
            out.push({
                claim: s.remainder,
                sentence: s.sentence,
                template: 'unmapped',
                status: 'NOT_CHECKED',
                evidence_fields: [],
                scope: 'The part of this sentence no template matched.',
                reason: 'Not compared with anything, so it is neither supported nor contradicted. Because of it, no other part of this sentence is decided either.',
            });
        }
    });
    if (dropped > 0) {
        const note = `(${dropped} further sentences)`;
        out.push({
            claim: note,
            sentence: note,
            template: 'truncated',
            status: 'NOT_CHECKED',
            evidence_fields: [],
            scope: `Only the first ${exports.MAX_CLAIMS} sentences are read.`,
            reason: `${dropped} sentences after the first ${exports.MAX_CLAIMS} were not read at all.`,
        });
    }
    return out;
}
// ── the record ──────────────────────────────────────────────────────────────────────────────────
/** Build the observation from `check`'s result. PURE. */
function observationFromCheck(r, fetchedAt) {
    const parsed = (0, check_1.parseRun)(r.source);
    if (!parsed)
        throw new check_1.CheckError('need https://github.com/owner/repo/actions/runs/123', true);
    const runId = Number(parsed.runId);
    // The record is about the run that was asked for. GitHub answering for another id is not a
    // detail to note on the card; it means the record would describe the wrong thing.
    if (r.run.id !== null && r.run.id !== runId)
        throw new check_1.CheckError(`GitHub answered for run ${r.run.id}, but run ${runId} was asked for`);
    // Every string GitHub sent is kept as sent, except that an unpaired surrogate becomes U+FFFD
    // (see wellFormed). Control characters stay in the record, where JSON escapes them; the card
    // strips them before display.
    const wf = wellFormed;
    const orNull = (s) => (s === null ? null : wf(s));
    return {
        platform: 'github-actions',
        host: 'api.github.com',
        url: `https://github.com/${parsed.owner}/${parsed.repo}/actions/runs/${parsed.runId}`,
        owner: parsed.owner,
        repo: parsed.repo,
        run_id: runId,
        run_attempt: r.run.attempt,
        workflow: { name: wf(r.run.workflow), path: wf(r.run.workflow_path) },
        head_sha: wf(r.sha),
        status: wf(r.run.status),
        conclusion: orNull(r.run.conclusion),
        check: { verdict: r.verdict, results: r.checks.map((c) => ({ ok: c.ok, label: wf(c.label), detail: wf(c.detail) })) },
        jobs: {
            http_status: r.jobs.http_status,
            total: r.jobs.total,
            items: r.jobs.items.map((j) => ({ name: wf(j.name), status: wf(j.status), conclusion: orNull(j.conclusion), head_sha: wf(j.head_sha), run_attempt: j.run_attempt })),
        },
        fetchedAt,
        freshness: 'LIVE',
    };
}
/** Assemble the record. PURE. */
function buildRecord(observation, claimText) {
    return {
        schema: exports.ACTION_EVIDENCE_SCHEMA,
        observation,
        claims: mapClaims(claimText, observation),
        assurance: { cryptographic_integrity: 'NOT_CHECKED', observation: 'PLATFORM_REPORTED' },
        does_not_prove: exports.RECORD_DOES_NOT_PROVE,
    };
}
/**
 * The attempt a run URL names (`…/actions/runs/123/attempts/2`), if any. `parseRun` accepts such a
 * URL but the run endpoint always answers for the LATEST attempt, so a record built from it would
 * silently describe a different attempt from the one asked for.
 */
function urlAttempt(url) {
    const m = String(url || '').match(/\/actions\/runs\/\d+\/attempts\/(\d+)(?:[/?#]|$)/);
    return m ? Number(m[1]) : null;
}
/**
 * Fetch the run through `check` (api.github.com only) and build the record.
 * Throws {@link CheckError} for a usage problem, an unreachable API, or a record that would
 * describe a different run or attempt from the one the URL names.
 */
async function inspectRunClaims(url, claimText, opts = {}) {
    const result = await (0, check_1.runCheck)(url, opts.env ?? process.env);
    const fetchedAt = (opts.now ?? (() => new Date()))().toISOString();
    const asked = urlAttempt(url);
    if (asked !== null && asked !== result.run.attempt) {
        throw new check_1.CheckError(`the URL names attempt ${asked}, but GitHub's run endpoint answered for attempt ${result.run.attempt ?? 'unknown'} (the latest). ` +
            'Reading a specific earlier attempt is not supported yet; nothing was recorded.');
    }
    const record = buildRecord(observationFromCheck(result, fetchedAt), claimText);
    return { record, digest: digestRecord(record) };
}
function tallyClaims(claims) {
    const t = { SUPPORTED: 0, CONTRADICTED: 0, NOT_CHECKED: 0 };
    for (const c of claims)
        t[c.status] += 1;
    return t;
}
/**
 * Record → process exit code. PURE. Same codes as `check <runUrl>`:
 *   1  a claim is CONTRADICTED, or the run itself FAILED / is INCONSISTENT
 *   3  anything NOT_CHECKED (including an INCONCLUSIVE run) — never 0
 *   0  every claim SUPPORTED on a COMPLETE run
 * A text with nothing checkable in it is therefore 3, not 0: "we compared nothing" is not a pass.
 */
function claimsExitCode(record) {
    const t = tallyClaims(record.claims);
    const v = record.observation.check.verdict;
    if (t.CONTRADICTED > 0 || v === 'FAILED' || v === 'INCONSISTENT')
        return 1;
    if (t.NOT_CHECKED > 0 || v !== 'COMPLETE' || record.claims.length === 0)
        return 3;
    return 0;
}
