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
exports.normalizeClaimText = normalizeClaimText;
exports.stripHtmlComments = stripHtmlComments;
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
 * Remove what would let claim text act on the reader rather than be read: C0/C1 controls (a
 * terminal escape sequence is a control character), bidirectional overrides (text that displays
 * in a different order from the bytes) and zero-width characters. Then collapse whitespace.
 */
function normalizeClaimText(s) {
    const cleaned = String(s ?? '')
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
        .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned.length > exports.MAX_CLAIM_TEXT ? cleaned.slice(0, exports.MAX_CLAIM_TEXT - 1) + '…' : cleaned;
}
/**
 * Remove `<!-- … -->` comments in one left-to-right pass. This replaced the lazy regex
 * `/<!--[\s\S]*?-->/g`, which CodeQL flagged as js/polynomial-redos: on text made of repeated
 * `<!--` with no closing `-->` it rescanned to the end from every opener (64,000 characters took
 * 1.7 s, and each doubling took four times as long). Same result as that regex: an opener with no
 * closer is left as text, so nothing is silently dropped.
 */
function stripHtmlComments(text) {
    let out = '';
    let i = 0;
    for (;;) {
        const open = text.indexOf('<!--', i);
        if (open < 0)
            break;
        const close = text.indexOf('-->', open + 4);
        // No closer after this opener means none after any later opener either: stop.
        if (close < 0)
            break;
        out += text.slice(i, open) + ' ';
        i = close + 3;
    }
    return out + text.slice(i);
}
/**
 * Split free text (an agent's "done" message, a PR description) into claim sentences. PURE.
 *
 * Skipped, because they are not claims: HTML comments (PR templates are full of them), fenced
 * code, headings, and UNCHECKED task-list items. `- [ ] tests pass` is a to-do, not a statement;
 * `- [x] tests pass` is a claim and is kept.
 */
function splitClaims(text) {
    const lines = stripHtmlComments(String(text ?? '')).split(/\r?\n/);
    const full = [];
    let inFence = false;
    for (const raw of lines) {
        const line = raw.trim();
        if (/^(?:```|~~~)/.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence || !line || /^#{1,6}(?:\s|$)/.test(line))
            continue;
        let body = line.replace(/^(?:>\s*)+/, '').replace(/^(?:[-*+]|\d+[.)])\s+/, '');
        if (/^\[ \]\s/.test(body))
            continue;
        body = body.replace(/^\[[xX]\]\s+/, '');
        for (const part of body.split(/(?<=[.!?;])\s+/)) {
            const whole = String(part).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
            if (/[A-Za-z0-9]/.test(whole))
                full.push(whole);
        }
    }
    const kept = full.slice(0, exports.MAX_CLAIMS);
    return { clauses: kept.map(normalizeClaimText), full: kept, dropped: Math.max(0, full.length - exports.MAX_CLAIMS) };
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
    /\b(?:(?:the|this|that|our|its)\s+)?(?:(`[^`\n]{1,64}`|[\w.-]{1,40})\s+)?(?:workflow|pipeline)(?:\s+run)?(?:\s+#?\d{6,})?\s+(?:has\s+|have\s+)?(?:now\s+)?(?:pass(?:es|ed)?|succeed(?:s|ed)?|is\s+green|was\s+green|went\s+green|completed\s+successfully)\b/gi,
    // "The run passed", "run 123456 succeeded". Not "the tests run passed", and not "the job passed":
    // a job is one part of a run, not the run.
    /\b(?:(?:the|this|that|our|its)\s+)?(?<!\btests?\s)run(?:\s+#?\d{6,})?\s+(?:has\s+|have\s+)?(?:now\s+)?(?:pass(?:es|ed)?|succeed(?:s|ed)?|is\s+green|was\s+green|went\s+green|completed\s+successfully)\b/gi,
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
        pattern: /\b\d[\d,]*\s+(?:\w+\s+)?(?:tests?|specs?|cases?|suites?)\b/i,
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
function outcomeEntry(h, sentence, o, tie, qualifier) {
    const base = { claim: normalizeClaimText(h.span), sentence, template: h.template };
    const nc = (scope, reason) => ({ ...base, status: 'NOT_CHECKED', evidence_fields: [], scope, reason });
    const run = runRef(o);
    const jobs = o.jobs.items;
    const finished = o.status === 'completed';
    if (h.template === 'ci.build_unscoped') {
        return nc('Not compared: "the build" names no workflow and no check.', `"The build" could be any workflow or check, so it is not compared with ${run}.`);
    }
    if (qualifier) {
        return nc('Not compared: a negated, failing or partial claim is not read automatically.', `The sentence contains "${qualifier}", which changes what the claim means, so it was not compared with the run.`);
    }
    if (h.template === 'gha.run_succeeded' && h.name !== undefined && !namesThisWorkflow(h.name, o)) {
        // The name is the claimant's text, so it is never spliced into this sentence.
        return nc('Not compared: the claim names a different workflow.', `The claim names a workflow other than the inspected one (see /observation/workflow), so ${run} is not evidence for it.`);
    }
    if (!tie.tied)
        return nc('Not compared: nothing ties this claim to the inspected run.', tie.why);
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
    const offSha = jobs.filter((j) => j.head_sha && j.head_sha !== o.head_sha).length;
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
            reason: `GitHub reports conclusion "success" for ${run}; ${ran} of ${(0, check_1.plural)(jobs.length, 'job')} concluded success${skipped ? ` and ${skipped} skipped` : ''}. ${tie.how}`,
        };
    }
    // ci.all_checks_pass: one run can refute it, never establish it.
    const fields = ['/observation/status', '/observation/conclusion', '/observation/jobs'];
    const scope = 'A claim about every check on the commit. One workflow run can contradict it (a failing check is a counterexample) but cannot establish it: the other checks were not read.';
    if (!finished)
        return nc(scope, `${run} has not finished (status: ${word(o.status)}).`);
    if (o.conclusion !== null && FAILED_CONCLUSIONS.has(o.conclusion)) {
        return { ...base, status: 'CONTRADICTED', evidence_fields: fields, scope, reason: `${run}, a check on this commit, concluded "${word(o.conclusion)}". ${tie.how}` };
    }
    if (!jobsUnread && failedJobs) {
        return { ...base, status: 'CONTRADICTED', evidence_fields: fields, scope, reason: `${failedJobs} of ${jobs.length} jobs in ${run}, each a check run on this commit, concluded failure. ${tie.how}` };
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
/**
 * The parts of a sentence no template matched, joined with an ellipsis, or null if they say
 * nothing. Without this, "CI is not green on b8a17cfb" would show one SUPPORTED commit citation
 * and nothing else: the rest of the sentence would be invisible next to a green verdict.
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
    const kept = parts
        .map(trimPunctuation)
        .filter((p) => (p.match(/[A-Za-z0-9][\w'.-]*/g) ?? []).some((w) => !FILLER.has(w.toLowerCase())));
    return kept.length ? normalizeClaimText(kept.join(' … ')) : null;
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
    return {
        sentence,
        full,
        citations: cites.map((h) => citationEntry(h, sentence, o)),
        citationAt: cites.map((h) => h.at),
        outcomes,
        exclusions,
        remainder: covered.length ? remainderOf(full, covered) : null,
        qualifier: q ? q[0].toLowerCase().replace(/[^a-z']/g, '') : null,
    };
}
/**
 * Map free claim text onto an observation. PURE: same text and observation, same entries, same order.
 *
 * Outcome claims are tied to the inspected run per sentence: by the sentence's own citations when
 * it has any (all must match), otherwise by the text's (there must be at least one, and all must
 * match). Untied, they are NOT_CHECKED, because the alternative is vouching for a sentence about
 * one commit with a green run on another.
 */
function mapClaims(text, o) {
    const { clauses, full, dropped } = splitClaims(text);
    const scanned = clauses.map((c, i) => scanSentence(c, full[i], o));
    const allCites = scanned.flatMap((s) => s.citations);
    const textTie = allCites.length === 0
        ? { tied: false, why: `The text cites no commit or run, so nothing ties this claim to ${runRef(o)}.` }
        : allCites.every((c) => c.status === 'SUPPORTED')
            ? { tied: true, how: 'The text ties it to this run by citing it, and cites nothing else.' }
            : { tied: false, why: 'The text cites a commit, run or attempt that is not, or could not be matched to, the inspected run, so a sentence that cites nothing itself cannot be tied to this run.' };
    const out = [];
    for (const s of scanned) {
        const tie = s.citations.length === 0
            ? textTie
            : s.citations.every((c) => c.status === 'SUPPORTED')
                ? { tied: true, how: 'This sentence ties it to this run by citing it.' }
                : { tied: false, why: 'This sentence cites a commit, run or attempt that is not, or could not be matched to, the inspected run, so its outcome claims are not compared with this run.' };
        const entries = [];
        s.citations.forEach((e, i) => entries.push({ at: s.citationAt[i], order: 0, e }));
        s.outcomes.forEach((h) => entries.push({ at: h.at, order: 1, e: outcomeEntry(h, s.sentence, o, tie, s.qualifier) }));
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
                reason: 'Not compared with anything, so it is neither supported nor contradicted.',
            });
            continue;
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
                reason: 'Not compared with anything, so it is neither supported nor contradicted. A verdict on another part of the sentence says nothing about this part.',
            });
        }
    }
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
    return {
        platform: 'github-actions',
        host: 'api.github.com',
        url: `https://github.com/${parsed.owner}/${parsed.repo}/actions/runs/${parsed.runId}`,
        owner: parsed.owner,
        repo: parsed.repo,
        run_id: runId,
        run_attempt: r.run.attempt,
        workflow: { name: r.run.workflow, path: r.run.workflow_path },
        head_sha: r.sha,
        status: r.run.status,
        conclusion: r.run.conclusion,
        check: { verdict: r.verdict, results: r.checks },
        jobs: r.jobs,
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
