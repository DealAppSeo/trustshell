"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KernelRefusedError = exports.KERNEL_RECEIPT_SCHEMA = void 0;
exports.kernelCanonicalJson = kernelCanonicalJson;
exports.hashKernelArgs = hashKernelArgs;
exports.kernelReceiptHash = kernelReceiptHash;
exports.kernelDecide = kernelDecide;
exports.requireKernelAllow = requireKernelAllow;
/**
 * kernel-client — ask the policy kernel BEFORE you act, and treat anything but a clean ALLOW as no.
 *
 * The kernel (repid-engine, `POST /api/v1/kernel/decide`) weighs a call against the agent owner's
 * SIGNED policy: default-deny, NOT_CHECKED blocking, spend limit zero until the owner raises it.
 * This is the client half. It is deliberately the dullest code in the SDK, because its whole job is
 * to be unable to turn "I did not get an answer" into "yes":
 *
 *   - a network error                       → REFUSE (verdict NOT_CHECKED: we did not look)
 *   - a timeout                             → REFUSE
 *   - any status other than 200             → REFUSE (401, 403, 429, 5xx, a 204, a redirect)
 *   - a body that is not JSON, or has an unexpected shape → REFUSE
 *   - verdict DENY or NOT_CHECKED           → REFUSE (and the kernel's reasons come back)
 *   - verdict ALLOW that does not agree with itself, or is not BOUND TO THIS REQUEST → REFUSE
 *   - the arguments could not be hashed (ethers missing) → REFUSE
 *
 * "Bound to this request" matters: an ALLOW for a different args_hash, tool, agent or amount is
 * somebody else's ALLOW. The answer carries a receipt preview; we check it names exactly what we
 * asked about, that every check in it PASSED, and that its hash matches its body.
 *
 * ARGUMENTS NEVER LEAVE THE PROCESS. Pass `args` and they are hashed here (keccak256 of canonical
 * JSON — the same function the engine uses; a shared test vector pins the two together); only the
 * hash is sent. The request body is built from a fixed list of fields, so nothing else can ride
 * along, and an input carrying a field outside that list is refused rather than half-forwarded.
 *
 * A CLIENT THAT OBEYS IS CO-OPERATING. `/decide` is a dry decision: this module cannot stop a
 * caller that ignores a REFUSE. Enforcement is where the engine wraps the tool (`runUnderKernel`);
 * use `requireKernelAllow` so that refusing is a throw, not a boolean someone forgets to read.
 */
const optional_ethers_1 = require("./optional-ethers");
const trustshell_1 = require("./trustshell");
exports.KERNEL_RECEIPT_SCHEMA = 'kernel-receipt/1';
/** Thrown by `requireKernelAllow`. Carries the full refusal so the caller can log the codes. */
class KernelRefusedError extends trustshell_1.TrustShellError {
    constructor(outcome) {
        const why = outcome.reasons.map((r) => r.code).join(', ') || outcome.verdict;
        super(`kernel_refused: ${outcome.verdict} (${why})`, 403);
        this.code = 'KERNEL_REFUSED';
        this.name = 'KernelRefusedError';
        this.outcome = outcome;
    }
}
exports.KernelRefusedError = KernelRefusedError;
// ── hashing (the same function as the engine's, pinned by a shared vector) ─────────────────────
/** Object keys sorted at every depth, arrays in order, no whitespace. Identical to the engine's. */
function kernelCanonicalJson(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value ?? null);
    if (Array.isArray(value))
        return '[' + value.map((v) => kernelCanonicalJson(v)).join(',') + ']';
    const obj = value;
    return ('{' +
        Object.keys(obj)
            .filter((k) => obj[k] !== undefined)
            .sort()
            .map((k) => JSON.stringify(k) + ':' + kernelCanonicalJson(obj[k]))
            .join(',') +
        '}');
}
/** keccak256 of the canonical JSON of the arguments. Needs the optional `ethers` peer. */
async function hashKernelArgs(args) {
    const { keccak256, toUtf8Bytes } = await (0, optional_ethers_1.loadEthers)('Hashing kernel arguments');
    return keccak256(toUtf8Bytes(kernelCanonicalJson(args)));
}
/** keccak256 of the canonical JSON of a receipt without `header.receipt_hash`. */
async function kernelReceiptHash(receipt) {
    const { keccak256, toUtf8Bytes } = await (0, optional_ethers_1.loadEthers)('Hashing a kernel receipt');
    const { receipt_hash: _omit, ...header } = receipt.header;
    return keccak256(toUtf8Bytes(kernelCanonicalJson({ ...receipt, header })));
}
// ── the call ────────────────────────────────────────────────────────────────────────────────────
const INPUT_KEYS = new Set(['agent', 'tool', 'origin', 'args', 'args_hash', 'amount_raw', 'payee', 'asset', 'chain_id']);
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const DEFAULT_TIMEOUT_MS = 10000;
function client(reason, detail, argsHash = null, status = null) {
    return { allowed: false, verdict: 'NOT_CHECKED', source: 'client', args_hash: argsHash, receipt: null, reasons: [{ code: reason, detail }], http_status: status };
}
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/**
 * Drop trailing slashes with a scan, not a regex. `/\/+$/` is quadratic on a string of many slashes
 * that does not end in one (every start position re-consumes the run before failing at the anchor),
 * and `apiUrl` is caller input, so that is a ReDoS (CodeQL js/polynomial-redos). This is linear.
 */
function trimTrailingSlashes(s) {
    let end = s.length;
    while (end > 0 && s.charCodeAt(end - 1) === 47 /* '/' */)
        end--;
    return s.slice(0, end);
}
function apiUrlOf(opts) {
    const env = typeof process !== 'undefined' ? process.env?.TRUSTSHELL_API_URL : undefined;
    return trimTrailingSlashes(opts.apiUrl || env || 'https://repid-engine-production.up.railway.app');
}
/**
 * Is this answer an ALLOW for exactly the request we sent? Returns null when it is, else why not.
 * Every comparison is against what THIS call sent, never against what the response says about itself.
 */
async function bindingFault(receipt, input, argsHash) {
    if (!isObj(receipt) || !isObj(receipt['header']) || !isObj(receipt['decision']) || !isObj(receipt['request']) || !isObj(receipt['subject']))
        return 'no receipt came with the ALLOW';
    const r = receipt;
    if (r.header.schema !== exports.KERNEL_RECEIPT_SCHEMA)
        return 'the receipt is not kernel-receipt/1';
    if (r.decision.verdict !== 'ALLOW' || r.decision.blocking !== false)
        return 'the receipt does not say ALLOW';
    if (r.decision.executed !== false)
        return 'a preview receipt claims the call already ran';
    if (!Array.isArray(r.decision.checks) || r.decision.checks.length === 0 || r.decision.checks.some((c) => c.outcome !== 'PASS'))
        return 'the ALLOW does not rest on passing checks';
    if (r.request.args_hash?.toLowerCase() !== argsHash.toLowerCase())
        return 'the ALLOW is for different arguments';
    if (r.request.tool?.name !== input.tool.name || r.request.tool?.class !== input.tool.class)
        return 'the ALLOW is for a different tool';
    if (r.subject.agent?.agent_id !== input.agent.agent_id)
        return 'the ALLOW is for a different agent';
    if (input.tool.class === 'spend') {
        const sent = input.amount_raw === undefined || input.amount_raw === null ? null : String(input.amount_raw);
        if (sent === null || r.request.amount_raw !== sent)
            return 'the ALLOW is for a different amount';
    }
    if (typeof r.header.receipt_hash !== 'string' || !HEX32.test(r.header.receipt_hash))
        return 'the receipt has no hash';
    if ((await kernelReceiptHash(r)) !== r.header.receipt_hash)
        return 'the receipt does not match its own hash';
    return null;
}
/**
 * Ask the kernel. NEVER THROWS and never resolves `allowed: true` unless the kernel said ALLOW,
 * with a 200, about exactly this request. Everything else is a refusal with a reason.
 */
async function kernelDecide(input, opts = {}) {
    try {
        if (!isObj(input))
            return client('malformed_input', 'the call must be an object');
        for (const k of Object.keys(input)) {
            if (!INPUT_KEYS.has(k))
                return client('malformed_input', `unexpected field "${k.slice(0, 40)}" (only ${[...INPUT_KEYS].join(', ')} are sent)`);
        }
        if (!isObj(input.agent) || typeof input.agent.agent_id !== 'string' || !isObj(input.tool) || typeof input.tool.name !== 'string' || typeof input.tool.class !== 'string' || typeof input.origin !== 'string') {
            return client('malformed_input', 'agent, tool and origin are required');
        }
        let argsHash;
        if (typeof input.args_hash === 'string') {
            if (!HEX32.test(input.args_hash))
                return client('malformed_input', 'args_hash must be 0x followed by 64 hex characters');
            argsHash = input.args_hash.toLowerCase();
        }
        else if ('args' in input) {
            argsHash = (await hashKernelArgs(input.args)).toLowerCase();
        }
        else {
            return client('malformed_input', 'pass args (hashed here, never sent) or args_hash');
        }
        // The body is built field by field. Nothing the caller added can ride along.
        const body = {
            agent: { agent_id: input.agent.agent_id, agent_name: input.agent.agent_name ?? '' },
            tool: { name: input.tool.name, class: input.tool.class },
            origin: input.origin,
            args_hash: argsHash,
            amount_raw: input.amount_raw ?? null,
            payee: input.payee ?? null,
            asset: input.asset ?? null,
            chain_id: input.chain_id ?? null,
        };
        const doFetch = opts.fetch ?? (typeof fetch === 'function' ? fetch : undefined);
        if (!doFetch)
            return client('no_fetch', 'there is no fetch to ask the kernel with', argsHash);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        let res;
        try {
            res = await doFetch(`${apiUrlOf(opts)}/api/v1/kernel/decide`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}) },
                body: JSON.stringify(body),
                signal: controller.signal,
                redirect: 'error',
            });
        }
        catch (e) {
            const aborted = e?.name === 'AbortError' || controller.signal.aborted;
            return client(aborted ? 'timeout' : 'network_error', aborted ? 'the kernel did not answer in time' : 'the kernel could not be reached', argsHash);
        }
        finally {
            clearTimeout(timer);
        }
        if (res.status !== 200) {
            // A 400 carries the kernel's own DENY; keep its codes if they parse, but it is a refusal either way.
            let reasons = [{ code: `http_${res.status}`, detail: `the kernel answered ${res.status}, not 200` }];
            try {
                const j = await res.json();
                if (isObj(j) && Array.isArray(j['reasons'])) {
                    const own = j['reasons'].filter((x) => isObj(x) && typeof x['code'] === 'string' && typeof x['detail'] === 'string');
                    if (own.length)
                        reasons = [...reasons, ...own];
                }
            }
            catch { /* the status alone is enough */ }
            return { allowed: false, verdict: res.status === 400 ? 'DENY' : 'NOT_CHECKED', source: res.status === 400 ? 'kernel' : 'client', args_hash: argsHash, receipt: null, reasons, http_status: res.status };
        }
        let j;
        try {
            j = await res.json();
        }
        catch {
            return client('unreadable_response', 'the kernel answered 200 with a body that is not JSON', argsHash, 200);
        }
        if (!isObj(j) || !isObj(j['decision']) || typeof j['blocking'] !== 'boolean' || !['ALLOW', 'DENY', 'NOT_CHECKED'].includes(String(j['verdict']))) {
            return client('unreadable_response', 'the kernel answered 200 with a body this client does not understand', argsHash, 200);
        }
        const verdict = j['verdict'];
        const decision = j['decision'];
        if (decision['verdict'] !== verdict || j['blocking'] !== (verdict !== 'ALLOW')) {
            return client('inconsistent_response', 'the verdict and the decision disagree', argsHash, 200);
        }
        const receipt = (isObj(j['receipt_preview']) ? j['receipt_preview'] : null);
        const reasons = Array.isArray(j['reasons'])
            ? j['reasons'].filter((x) => isObj(x) && typeof x['code'] === 'string' && typeof x['detail'] === 'string')
            : [];
        if (verdict !== 'ALLOW') {
            return { allowed: false, verdict, source: 'kernel', args_hash: argsHash, receipt, reasons: reasons.length ? reasons : [{ code: verdict === 'DENY' ? 'default_deny' : 'not_checked', detail: 'the kernel did not allow this call' }], http_status: 200 };
        }
        const fault = await bindingFault(receipt, input, argsHash);
        if (fault)
            return { allowed: false, verdict: 'NOT_CHECKED', source: 'client', args_hash: argsHash, receipt, reasons: [{ code: 'allow_not_bound_to_request', detail: fault }], http_status: 200 };
        return { allowed: true, verdict: 'ALLOW', source: 'kernel', args_hash: argsHash, receipt: receipt, reasons: [] };
    }
    catch (e) {
        // A missing optional ethers is a refusal that SAYS WHAT TO RUN. It used to read only
        // "(MissingDependencyError)", which refused correctly and left a stranger on a cold install with
        // no way to know why (MEASURED 2026-10-12, a fresh `npm i` of this package). The message is a
        // fixed string from optional-ethers.ts, so quoting it leaks nothing.
        if (e instanceof optional_ethers_1.MissingDependencyError)
            return client('ethers_missing', e.message);
        // Anything else we did not anticipate is a refusal too.
        const name = e?.name ?? 'Error';
        return client('client_error', `the kernel client failed (${name}); refusing`);
    }
}
/** Like `kernelDecide`, but a refusal is a THROW, so it cannot be ignored by forgetting to read a flag. */
async function requireKernelAllow(input, opts = {}) {
    const out = await kernelDecide(input, opts);
    if (!out.allowed)
        throw new KernelRefusedError(out);
    return out;
}
