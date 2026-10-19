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
 *  - A claim no template can check is NOT_CHECKED with the reason written next to it. Never SUPPORTED.
 *  - A claim that conflicts with a field is CONTRADICTED, and the reason names both values.
 *  - A run that has not finished, or whose jobs were not all read, makes "tests pass" NOT_CHECKED.
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
 * Split free text (an agent's "done" message, a PR description) into claim sentences. PURE.
 *
 * Skipped, because they are not claims: HTML comments (PR templates are full of them), fenced
 * code, headings, and UNCHECKED task-list items. `- [ ] tests pass` is a to-do, not a statement;
 * `- [x] tests pass` is a claim and is kept.
 */
function splitClaims(text) {
    const lines = String(text ?? '').replace(/<!--[\s\S]*?-->/g, ' ').split(/\r?\n/);
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
/** "tests pass", "CI is green", "all checks pass", "the build passes", "passes all tests". */
const CI_PASS = [
    /\b(?:tests?|specs?|test\s+suites?|suites?)\s+(?:are\s+|is\s+|all\s+)?(?:now\s+|still\s+)?(?:pass(?:es|ed|ing)?|green)\b/i,
    /\bCI\s+(?:is\s+|was\s+|are\s+)?(?:now\s+|still\s+|all\s+)?(?:green|pass(?:es|ed|ing)?)\b/i,
    /\bchecks?\s+(?:are\s+|is\s+|all\s+)?(?:now\s+|still\s+)?(?:pass(?:es|ed|ing)?|green)\b/i,
    /\bbuild\s+(?:is\s+|was\s+)?(?:now\s+|still\s+)?(?:pass(?:es|ed|ing)?|green)\b/i,
    /\bpass(?:es|ed|ing)?\s+(?:all\s+)?(?:the\s+)?(?:tests|checks|CI|build)\b/i,
    /\bgreen\s+(?:CI|build|checks?|run)\b/i,
    /\ball\s+green\b/i,
];
/**
 * Words that change what a pass claim means: a negation ("tests don't pass"), a failure word, or a
 * partial quantifier ("most tests pass" is not refuted by a red run). A sentence holding one is NOT
 * mapped automatically — conservative on purpose, since the alternative is reading a claim backwards.
 */
const PASS_QUALIFIER = /\b(?:not|no|never|cannot|without|fail\w*|broken|flak\w*|except|but|although|though|unless|some|most|several|few|half|partially|mostly)\b|n't\b/i;
const LOCAL_RUN = /\b(?:locally|on\s+my\s+(?:machine|laptop|box|computer)|in\s+my\s+(?:env|environment|setup))\b/i;
/** Claims this tool will name and refuse to grade. Each yields its own NOT_CHECKED entry. */
const EXCLUSIONS = [
    {
        id: 'excluded.completion',
        pattern: /\b(?:done|finished|all\s+set|implemented|completed?\s+(?:the|this|it|all|everything))\b/i,
        reason: '"Done" is not a fact a workflow run records. Only the narrower claims mapped from the same text are checked.',
    },
    {
        id: 'excluded.security',
        pattern: /\b(?:secure(?:d|ly)?|security|vulnerab\w*|exploit\w*|CVE-\d+|hardened|pen-?test\w*)\b/i,
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
        pattern: /\bcoverage\b|\b\d+(?:\.\d+)?\s?%/i,
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
/** First 12 hex characters of a SHA GitHub returned, or a placeholder. Never splices a non-hex string. */
function shortSha(sha) {
    return HEX40.test(sha) ? sha.slice(0, 12) : '(unrecognised sha)';
}
/** A GitHub enum value such as `success` or `in_progress`, or a placeholder — never free text. */
function word(s) {
    return s && /^[a-z_]{1,32}$/.test(s) ? s : 'unrecognised';
}
function runRef(o) {
    return `run ${o.run_id}, attempt ${o.run_attempt ?? 'unknown'}, commit ${shortSha(o.head_sha)}`;
}
function entry(text, template, status, evidence_fields, scope, reason) {
    return { text, template, status, evidence_fields, scope, reason };
}
/** "tests pass" and friends → the run conclusion and the jobs read on head_sha. */
function mapRunPassed(text, o) {
    const fields = ['/observation/status', '/observation/conclusion', '/observation/check/verdict', '/observation/jobs'];
    const scope = `This one workflow run (${runRef(o)}): the run conclusion and the conclusions of its jobs. Not which tests exist or ran, and not any other workflow on this commit.`;
    const nc = (reason) => entry(text, 'ci.run_passed', 'NOT_CHECKED', fields, scope, reason);
    const v = o.check.verdict;
    const jobs = o.jobs.items;
    if (o.status !== 'completed')
        return nc(`The run has not finished (status: ${word(o.status)}), so nothing is decided yet.`);
    if (v === 'FAILED') {
        // Only a conclusion that says the work ran and failed contradicts "tests pass". A cancelled or
        // skipped run never showed the tests failing; it showed them not finishing.
        if (o.conclusion === 'failure' || o.conclusion === 'timed_out' || o.conclusion === 'startup_failure') {
            return entry(text, 'ci.run_passed', 'CONTRADICTED', fields, scope, `GitHub reports the run finished with conclusion "${word(o.conclusion)}", not "success".`);
        }
        return nc(`GitHub reports conclusion "${word(o.conclusion)}": the run did not complete its work, so it neither supports nor refutes a pass.`);
    }
    if (v === 'INCONSISTENT') {
        const bad = jobs.filter((j) => j.conclusion && j.conclusion !== 'success' && j.conclusion !== 'skipped').length;
        return entry(text, 'ci.run_passed', 'CONTRADICTED', fields, scope, `GitHub reports conclusion "success" for the run, but ${bad} of ${jobs.length} jobs concluded something other than success or skipped (see /observation/jobs).`);
    }
    if (v === 'INCONCLUSIVE') {
        if (o.jobs.http_status < 200 || o.jobs.http_status >= 300)
            return nc(`The jobs endpoint answered HTTP ${o.jobs.http_status}, so no job result was read.`);
        if (o.jobs.total > jobs.length)
            return nc(`GitHub reports ${o.jobs.total} jobs and returned ${jobs.length}; a pass over jobs never read is not claimed.`);
        if (jobs.length === 0)
            return nc('The run reports no jobs, so there is no job result to compare.');
        return nc('check returned INCONCLUSIVE for this run.');
    }
    // COMPLETE from here: finished, conclusion success, every job read, none failed.
    const ran = jobs.filter((j) => j.conclusion === 'success').length;
    const skipped = jobs.filter((j) => j.conclusion === 'skipped').length;
    if (ran === 0)
        return nc('Every job was skipped. A run in which no job ran says nothing about tests.');
    const offSha = jobs.filter((j) => j.head_sha && j.head_sha !== o.head_sha).length;
    const offAttempt = jobs.filter((j) => j.run_attempt !== null && o.run_attempt !== null && j.run_attempt !== o.run_attempt).length;
    if (offSha)
        return nc(`${offSha} of ${jobs.length} jobs report a head_sha other than the run's, so the jobs cannot be tied to this commit.`);
    if (offAttempt)
        return nc(`${offAttempt} of ${jobs.length} jobs report a different run attempt, so the jobs cannot be tied to this attempt.`);
    return entry(text, 'ci.run_passed', 'SUPPORTED', fields, scope, `GitHub reports conclusion "success"; ${ran} of ${(0, check_1.plural)(jobs.length, 'job')} concluded success${skipped ? ` and ${skipped} skipped` : ''}, all on this commit and attempt.`);
}
/** Commit references in a sentence: `commit abc1234`, `fixed in abc1234`, `` `abc1234` ``, a /commit/ URL. */
function shaTokens(text) {
    const out = new Set();
    // Explicit commit words: any hex token counts.
    for (const m of text.matchAll(/\b(?:commit|sha|rev(?:ision)?)\s*[:#]?\s*[`'"(\[]?([0-9a-f]{7,40})(?![0-9a-z])/gi))
        out.add(String(m[1]).toLowerCase());
    for (const m of text.matchAll(/github\.com\/[\w.-]+\/[\w.-]+\/commit\/([0-9a-f]{7,40})(?![0-9a-z])/gi))
        out.add(String(m[1]).toLowerCase());
    // Weaker contexts ("in", "on", "at", backticks): require a letter, so a run id or a count is not a SHA.
    for (const m of text.matchAll(/\b(?:in|on|at|of)\s+[`'"(\[]?([0-9a-f]{7,40})(?![0-9a-z])/gi)) {
        if (/[a-f]/i.test(String(m[1])))
            out.add(String(m[1]).toLowerCase());
    }
    for (const m of text.matchAll(/`([0-9a-f]{7,40})`/gi)) {
        if (/[a-f]/i.test(String(m[1])))
            out.add(String(m[1]).toLowerCase());
    }
    return [...out];
}
function mapSha(text, token, o) {
    const fields = ['/observation/head_sha'];
    const scope = 'Commit identity only: which commit this run ran on. A short SHA is matched as a prefix. Not what the commit changes or fixes.';
    if (!HEX40.test(o.head_sha))
        return entry(text, 'git.head_sha', 'NOT_CHECKED', fields, scope, 'GitHub returned no recognisable head_sha for this run.');
    if (o.head_sha.startsWith(token)) {
        return entry(text, 'git.head_sha', 'SUPPORTED', fields, scope, `The run's head_sha ${shortSha(o.head_sha)} begins with ${token}.`);
    }
    return entry(text, 'git.head_sha', 'CONTRADICTED', fields, scope, `The claim names commit ${token}; this run's head_sha is ${shortSha(o.head_sha)}.`);
}
function runRefs(text, o) {
    const out = [];
    const seen = new Set();
    // Keyed on run and attempt only, so a run named both by link and in prose is one entry. The link
    // is read first, so the entry that survives is the one that also carries the repository.
    const push = (r) => {
        const k = `${r.runId}|${r.attempt}`;
        if (!seen.has(k)) {
            seen.add(k);
            out.push(r);
        }
    };
    for (const m of text.matchAll(/github\.com\/([\w.-]+)\/([\w.-]+)\/actions\/runs\/(\d+)(?:\/attempts\/(\d+))?/gi)) {
        push({
            runId: Number(m[3]),
            attempt: m[4] ? Number(m[4]) : null,
            sameRepo: String(m[1]).toLowerCase() === o.owner.toLowerCase() && String(m[2]).toLowerCase() === o.repo.toLowerCase(),
        });
    }
    const withoutUrls = text.replace(/https?:\/\/\S+/g, ' ');
    for (const m of withoutUrls.matchAll(/\brun\s*(?:id\s*)?(?:#|no\.?)?\s*(\d{6,})\b(?:[^.;]{0,24}?\b(?:attempt|try)\s*#?\s*(\d{1,3})\b)?/gi)) {
        push({ runId: Number(m[1]), attempt: m[2] ? Number(m[2]) : null, sameRepo: null });
    }
    if (out.length === 0) {
        const a = withoutUrls.match(/\battempt\s*#?\s*(\d{1,3})\b/i);
        if (a)
            push({ runId: null, attempt: Number(a[1]), sameRepo: null });
    }
    return out;
}
function mapRun(text, r, o) {
    const template = r.runId === null ? 'gha.run_attempt' : 'gha.run_id';
    const fields = r.runId === null ? ['/observation/run_attempt'] : ['/observation/owner', '/observation/repo', '/observation/run_id', '/observation/run_attempt'];
    const scope = 'Run identity only: which run and which attempt this record describes. Not what the run proves.';
    if (r.sameRepo === false)
        return entry(text, template, 'CONTRADICTED', fields, scope, 'The claim links a run in a different repository from this one.');
    if (r.runId !== null && r.runId !== o.run_id) {
        return entry(text, template, 'CONTRADICTED', fields, scope, `The claim names run ${r.runId}; this record is run ${o.run_id}.`);
    }
    if (r.attempt !== null) {
        if (o.run_attempt === null)
            return entry(text, template, 'NOT_CHECKED', fields, scope, 'GitHub returned no run_attempt, so an attempt number cannot be compared.');
        if (r.attempt !== o.run_attempt) {
            return entry(text, template, 'CONTRADICTED', fields, scope, `The claim names attempt ${r.attempt}; GitHub's record for run ${o.run_id} is attempt ${o.run_attempt}, its latest.`);
        }
    }
    const matched = [r.runId !== null ? `run ${o.run_id}` : '', r.attempt !== null ? `attempt ${o.run_attempt}` : ''].filter(Boolean).join(' and ');
    return entry(text, template, 'SUPPORTED', fields, scope, `Matches this record: ${matched}.`);
}
/** Every claim entry a single sentence yields. A sentence no template reads yields one `unmapped` entry. */
function mapSentence(text, full, o) {
    const out = [];
    if (CI_PASS.some((re) => re.test(full)) && !LOCAL_RUN.test(full)) {
        const q = full.match(PASS_QUALIFIER);
        if (q) {
            out.push(entry(text, 'ci.run_passed', 'NOT_CHECKED', [], 'Not mapped: a negated, failing or partial pass claim is not read automatically.', `The sentence contains "${q[0].toLowerCase().replace(/[^a-z']/g, '')}", which changes what a pass claim means, so it was not compared with the run.`));
        }
        else
            out.push(mapRunPassed(text, o));
    }
    for (const t of shaTokens(full))
        out.push(mapSha(text, t, o));
    for (const r of runRefs(full, o))
        out.push(mapRun(text, r, o));
    for (const x of EXCLUSIONS) {
        if (x.pattern.test(full))
            out.push(entry(text, x.id, 'NOT_CHECKED', [], 'Outside what a workflow run record can show.', x.reason));
    }
    if (out.length === 0) {
        out.push(entry(text, 'unmapped', 'NOT_CHECKED', [], 'No deterministic template matches this sentence.', 'Not compared with anything, so it is neither supported nor contradicted.'));
    }
    return out;
}
/** Map free claim text onto an observation. PURE: same text and observation, same entries, same order. */
function mapClaims(text, o) {
    const { clauses, full, dropped } = splitClaims(text);
    const out = [];
    clauses.forEach((c, i) => out.push(...mapSentence(c, full[i], o)));
    if (dropped > 0) {
        out.push(entry(`(${dropped} further sentences)`, 'truncated', 'NOT_CHECKED', [], `Only the first ${exports.MAX_CLAIMS} sentences are read.`, `${dropped} sentences after the first ${exports.MAX_CLAIMS} were not read at all.`));
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
