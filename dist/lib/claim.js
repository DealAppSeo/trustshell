"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLAIM_EXIT = exports.ClaimError = exports.SCRUBBED_LINE = exports.CLAIM_PATHS = exports.ANSWER_MAX_CHARS = exports.CLAIM_TIMEOUT_MS = exports.CLASSIFY_PATH = exports.DEFAULT_API_URL = exports.CLAIM_LABELS = void 0;
exports.questionOf = questionOf;
exports.withAnswer = withAnswer;
exports.pathOf = pathOf;
exports.pathLine = pathLine;
exports.resolveClassifyUrl = resolveClassifyUrl;
exports.labelOf = labelOf;
exports.classifyClaim = classifyClaim;
exports.claimExitCode = claimExitCode;
exports.explainClaim = explainClaim;
exports.isUrlOperand = isUrlOperand;
/**
 * Sentence check — one label for one sentence, from the same public endpoint the
 * Chrome extension calls (`extension/select.js` → `POST /api/v1/classify`).
 * ------------------------------------------------------------------
 * ONE implementation. `trustshell check "<sentence>"` (src/cli/index.ts) and the
 * MCP `check_claim` tool (src/mcp/index.ts) both call {@link classifyClaim}; neither
 * has its own fetch. So the CLI, the MCP tool and the extension cannot disagree
 * about what a sentence is labelled — they all ask the same endpoint.
 *
 * Contract:
 *   request   POST <base>/api/v1/classify
 *             {"text": "<sentence>", "labels": ["pass","veto","not-checked"]}
 *   response  {"label": "pass"|"veto"|"not-checked", "latency_ms": n}
 *
 * Three outcomes, never two. A network failure, a timeout, a non-200, a body that
 * is not JSON, or a label outside the contract is `not-checked` — NEVER `pass`.
 * "We did not get an answer" must not be readable as "the claim passed".
 *
 * Base URL: `TRUSTSHELL_API_URL` when set (the same override every other CLI/MCP
 * command honours), else the live backend the SDK defaults to.
 */
const redact_1 = require("../memory/redact");
exports.CLAIM_LABELS = ['pass', 'veto', 'not-checked'];
/** The SDK's default backend origin (`TrustShell` constructor). Kept identical on purpose. */
exports.DEFAULT_API_URL = 'https://repid-engine-production.up.railway.app';
exports.CLASSIFY_PATH = '/api/v1/classify';
/** Stop waiting after this. A later answer is not-checked, never a pass. */
exports.CLAIM_TIMEOUT_MS = 6000;
/** A label is one short word. A body larger than this is not an answer. */
const MAX_BODY_CHARS = 64 * 1024;
const QUESTION_MIN = 10;
const QUESTION_MAX = 160;
/** Defence in depth: the server already parses strictly; this client refuses the same shapes. */
const QUESTION_REFUSED = /[@<>[\]`*_#~|\\]|https?:|www\.|\b[a-z0-9-]+\.(com|org|net|io|dev|ai|app|co)\b/i;
/** The question, or undefined when absent, malformed, or attached to anything but a votes not-checked. PURE. */
function questionOf(body, label, by) {
    if (label !== 'not-checked' || by !== 'votes')
        return undefined;
    if (!body || typeof body !== 'object')
        return undefined;
    const raw = body.question;
    if (typeof raw !== 'string')
        return undefined;
    const q = raw.normalize('NFKC').trim();
    if (q.length < QUESTION_MIN || q.length > QUESTION_MAX || !q.endsWith('?'))
        return undefined;
    if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(q) || QUESTION_REFUSED.test(q))
        return undefined;
    // An HTML character reference (&lt;, &#60;, &#x3c;) is markup written past the character check.
    if (/&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.test(q))
        return undefined;
    return q;
}
/** The longest answer a person may give to the one question. */
exports.ANSWER_MAX_CHARS = 200;
/**
 * The sentence to check again once the person answers: the claim, then their answer as the
 * assumption the checkers lacked. PURE. Throws ClaimError on an empty answer: nothing is sent.
 */
function withAnswer(claim, answer) {
    const a = String(answer ?? '').trim().slice(0, exports.ANSWER_MAX_CHARS);
    if (!a)
        throw new ClaimError('nothing to add: the answer is empty');
    const c = String(claim ?? '').trim().replace(/[.!?]*$/, '');
    return `${c}. Assume: ${a.replace(/[.!?]*$/, '')}.`;
}
exports.CLAIM_PATHS = ['arithmetic', 'votes', 'skipped', 'deadline'];
/** Provider ids the endpoint may name, shown to people by these names. Unknown ids show as sent. */
const VOTER_NAMES = {
    groq: 'Groq',
    cerebras: 'Cerebras',
    'nvidia-nim': 'NVIDIA NIM',
    'workers-ai': 'Cloudflare Workers AI',
};
const VOTER_ID = /^[a-z0-9-]{1,32}$/;
const MAX_VOTERS = 8;
/**
 * The path fields of an endpoint answer, or {} when they are missing or out of contract. PURE.
 * All or nothing: a `votes` without a usable voter list, or a `skipped` / `deadline` that claims a
 * pass or veto, reports no path at all rather than half of one.
 */
function pathOf(body, label) {
    if (!body || typeof body !== 'object')
        return {};
    const { by, voters } = body;
    if (typeof by !== 'string' || !exports.CLAIM_PATHS.includes(by))
        return {};
    if ((by === 'skipped' || by === 'deadline') && label !== 'not-checked')
        return {};
    if (by !== 'votes')
        return { by: by };
    if (!Array.isArray(voters) || voters.length === 0 || voters.length > MAX_VOTERS)
        return {};
    if (!voters.every((v) => typeof v === 'string' && VOTER_ID.test(v)))
        return {};
    return { by: 'votes', voters: [...voters] };
}
function voterPhrase(voters) {
    const names = [...new Set(voters.map((v) => VOTER_NAMES[v] ?? v))];
    if (names.length === 1) {
        return voters.length > 1 ? { names: `Two ${names[0]} models`, many: true } : { names: names[0], many: false };
    }
    const last = names[names.length - 1];
    return { names: `${names.slice(0, -1).join(', ')} and ${last}`, many: true };
}
/**
 * One line saying what produced the label, or '' when the endpoint did not say. PURE.
 * The same words as extension/classify.js pathLine (tests/claim-path-parity.test.ts).
 */
function pathLine(r) {
    switch (r.by) {
        case 'arithmetic':
            return 'Decided by exact calculation. No model was asked.';
        case 'skipped':
            return 'No checker was asked.';
        case 'deadline':
            return 'No answer in time.';
        case 'votes': {
            if (!r.voters || r.voters.length === 0)
                return '';
            const { names, many } = voterPhrase(r.voters);
            const all = !many ? '' : r.voters.length === 2 ? ' both' : ' all';
            if (r.label === 'pass')
                return `${names}${all} said true.`;
            if (r.label === 'veto')
                return `${names}${all} said false.`;
            return `Asked ${names}. No agreed answer.`;
        }
        default:
            return '';
    }
}
/** Shown wherever {@link ClaimResult.scrubbed} is set. One sentence, the same on every door. */
exports.SCRUBBED_LINE = 'Removed before sending: text that looked like a key or personal data. The result is about what was sent.';
/** A local fault: the request could not be formed, so nothing was sent. CLI exit 3. */
class ClaimError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ClaimError';
    }
}
exports.ClaimError = ClaimError;
/** Resolve the full classify URL. PURE. Throws {@link ClaimError} on a non-http(s) base. */
function resolveClassifyUrl(apiUrl, env = typeof process !== 'undefined' ? process.env : {}) {
    const base = (apiUrl?.trim() || env.TRUSTSHELL_API_URL?.trim() || exports.DEFAULT_API_URL).replace(/\/+$/, '');
    let parsed;
    try {
        parsed = new URL(base + exports.CLASSIFY_PATH);
    }
    catch {
        throw new ClaimError(`backend URL is not a valid URL: ${base}`);
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new ClaimError(`backend URL must be http or https: ${base}`);
    }
    return parsed.href;
}
/** Only the endpoint's own label decides. Anything outside the contract is not-checked. PURE. */
function labelOf(body) {
    if (!body || typeof body !== 'object')
        return null;
    const raw = body.label;
    return typeof raw === 'string' && exports.CLAIM_LABELS.includes(raw)
        ? raw
        : null;
}
/**
 * Ask the classify endpoint for one sentence's label. Never resolves to `pass`
 * unless the endpoint itself said `pass`. Throws only {@link ClaimError}, and only
 * before anything is sent (blank sentence, bad base URL).
 */
async function classifyClaim(text, opts = {}) {
    // Secrets never leave the host — same scrub the MCP verify tool applies.
    const typed = String(text ?? '').trim();
    const sentence = (0, redact_1.redact)(typed).trim();
    const scrubbed = sentence !== typed;
    if (!sentence) {
        throw new ClaimError(scrubbed
            ? 'nothing to check: everything in it looked like a key or personal data, and that is never sent'
            : 'nothing to check: the sentence is empty');
    }
    const mark = (r) => (scrubbed ? { ...r, scrubbed: true } : r);
    const url = resolveClassifyUrl(opts.apiUrl, opts.env);
    const fetchImpl = opts.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
    const now = opts.now ?? Date.now;
    const start = now();
    const elapsed = () => Math.max(0, Math.round(now() - start));
    const notChecked = (reason) => mark({
        label: 'not-checked',
        latency_ms: elapsed(),
        reason,
    });
    if (typeof fetchImpl !== 'function')
        return notChecked('no fetch available in this runtime');
    const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : exports.CLAIM_TIMEOUT_MS;
    const controller = new AbortController();
    let timer;
    const timedOut = new Promise((resolve) => {
        timer = setTimeout(() => {
            controller.abort();
            resolve('timeout');
        }, timeoutMs);
    });
    try {
        const call = (async () => {
            const res = await fetchImpl(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: sentence, labels: [...exports.CLAIM_LABELS] }),
                signal: controller.signal,
                redirect: 'error',
            });
            if (!res || res.status !== 200)
                return notChecked(`endpoint answered HTTP ${res ? res.status : 'nothing'}`);
            const raw = await res.text();
            if (typeof raw !== 'string' || raw.trim() === '')
                return notChecked('endpoint returned an empty body');
            if (raw.length > MAX_BODY_CHARS)
                return notChecked('endpoint body is too large to be a label');
            let body;
            try {
                body = JSON.parse(raw);
            }
            catch {
                return notChecked('endpoint body is not JSON');
            }
            const label = labelOf(body);
            if (!label)
                return notChecked('endpoint label is outside the contract (pass | veto | not-checked)');
            const reported = body.latency_ms;
            const latency_ms = typeof reported === 'number' && Number.isFinite(reported) ? reported : elapsed();
            const path = pathOf(body, label);
            // A `by` this server never sends ({"label":"pass","by":"skipped"}) means the answer is not
            // the server's, so its label decides nothing (XC1, night bus #449). No `by` at all is an
            // older endpoint and keeps its label.
            if (body.by !== undefined && path.by === undefined) {
                return notChecked('endpoint said what produced the label, out of contract (by / voters)');
            }
            const question = questionOf(body, label, path.by);
            return mark({ label, latency_ms, ...path, ...(question ? { question } : {}) });
        })();
        const out = await Promise.race([call, timedOut]);
        if (out === 'timeout') {
            call.catch(() => { }); // the aborted fetch rejects later; nobody is waiting for it
            return notChecked(`no answer within ${timeoutMs} ms`);
        }
        return out;
    }
    catch (e) {
        return notChecked(`network error: ${e?.message ?? String(e)}`);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
/** Exit code for a label. PURE. NOT_CHECKED never shares a code with success. */
exports.CLAIM_EXIT = { pass: 0, veto: 1, 'not-checked': 2, error: 3 };
function claimExitCode(label) {
    return exports.CLAIM_EXIT[label];
}
/** One-line human explanation printed under the label. PURE. */
function explainClaim(r) {
    if (r.label === 'pass')
        return `The classifier labelled this sentence pass (${r.latency_ms} ms).`;
    if (r.label === 'veto')
        return `The classifier labelled this sentence veto — do not rely on it (${r.latency_ms} ms).`;
    return r.reason
        ? `Not checked: ${r.reason}. This is not a pass.`
        : `The classifier answered not-checked: it could not decide this sentence (${r.latency_ms} ms). This is not a pass.`;
}
/**
 * Is a `check` operand a URL (the GitHub run check) rather than a sentence? PURE.
 * Deliberately broad: anything with a scheme, or a bare github.com/www. prefix, goes to
 * the GitHub path — so a mistyped run URL gets the old usage error instead of being
 * sent to the classifier as a "sentence".
 */
function isUrlOperand(operand) {
    const s = String(operand ?? '').trim();
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(?:www\.)?github\.com\//i.test(s);
}
