"use strict";
/**
 * wrapExecute — put HAL between an agent's work and the caller who trusts it.
 *
 * Wraps any async function. The function runs, its output is scored by HAL, and the
 * result carries the verdict alongside the output. By default NOTHING is ever withheld:
 * this is telemetry until someone deliberately turns it into a control.
 *
 * WHY RECORD-BY-DEFAULT IS THE SHIPPING DEFAULT, not timidity:
 * HAL's measured accuracy on external, non-circular ground truth is 82.6% (95/115
 * TruthEval cases, measured 2026-08-31), and just 9.1% (1/11) on the uncertain class —
 * it almost never emits FLAG, collapsing uncertainty into clean-or-vetoed. On the same
 * day a live probe watched it VETO the true statement "Paris is the capital of France"
 * (hal_score 0.535). A detector that wrong, blocking by default, would refuse real work
 * and the product would be blamed for the refusal. So blocking is opt-in, per call, at a
 * threshold the caller names.
 *
 * WHAT THIS CANNOT DO — read before you rely on it:
 * The wrapped function has ALREADY RUN by the time HAL sees anything. There is no way to
 * score an output that does not exist yet. So `blocked: true` means the OUTPUT IS
 * WITHHELD FROM THE CALLER — it does not mean the action was prevented. If `fn` sent an
 * email, moved money, or wrote to a database, that happened. Wrap the decision, not the
 * side effect: score the draft, then send it yourself if the verdict allows.
 * Calling this a safety control over side-effecting work would be a claim the code
 * cannot support.
 *
 * THREE OUTCOMES, NEVER TWO. `checked: false` means HAL could not be consulted. That is
 * NOT a pass. It is reported as its own state and, in blocking mode, resolved by an
 * explicit `onUnavailable` choice rather than a silent default — the recurring defect in
 * this ecosystem is a system reporting success it has not earned.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HAL_VERDICT_ORDER = void 0;
exports.meetsThreshold = meetsThreshold;
exports.wrapExecute = wrapExecute;
/** HAL's verdicts, ordered by severity. Index is the comparison. */
exports.HAL_VERDICT_ORDER = ['PASS', 'FLAG', 'VETO'];
/** Is `verdict` at least as severe as `threshold`? */
function meetsThreshold(verdict, threshold) {
    return exports.HAL_VERDICT_ORDER.indexOf(verdict) >= exports.HAL_VERDICT_ORDER.indexOf(threshold);
}
/**
 * Run `fn`, score its output with HAL, and return both.
 *
 * @example Record only — the default. Nothing is ever withheld.
 *   const r = await wrapExecute(shell, () => agent.answer(q), { prompt: q });
 *   if (r.verdict === 'VETO') console.warn(r.decisionReason);
 *   use(r.output);
 *
 * @example Opt in to blocking on outright vetoes.
 *   const r = await wrapExecute(shell, () => agent.answer(q), {
 *     prompt: q, blockAtOrAbove: 'VETO',
 *   });
 *   if (r.blocked) return fallback(r.decisionReason);
 */
async function wrapExecute(shell, fn, options = {}) {
    const { blockAtOrAbove = null, onUnavailable = 'release', onRecord, ...scoreOptions } = options;
    // The caller's work runs first and its errors are NOT swallowed. A thrown fn is the
    // caller's failure to handle; converting it into a verdict would hide a real bug behind
    // a trust signal.
    const output = await fn();
    const scorable = typeof output === 'string' ? output : safeStringify(output);
    let verdict = 'UNKNOWN';
    let checked = false;
    let halScore = null;
    let trustScore = null;
    let decisionReason = '';
    let evidence = [];
    let error;
    const startedAt = Date.now();
    if (scorable === null) {
        // Nothing scoreable (undefined output, or a value that will not serialise). Honest
        // UNKNOWN rather than a PASS nobody earned.
        error = 'output is not scoreable as text';
    }
    else {
        try {
            const result = await shell.score(scorable, scoreOptions);
            verdict = result.verdict;
            checked = true;
            halScore = result.halScore;
            trustScore = result.trustScore;
            decisionReason = result.decisionReason ?? '';
            evidence = result.evidence ?? [];
        }
        catch (e) {
            error = e instanceof Error ? e.message : String(e);
        }
    }
    const halLatencyMs = Date.now() - startedAt;
    if (!checked) {
        decisionReason =
            `HAL was not consulted (${error ?? 'unknown reason'}). This is NOT a pass — ` +
                (blockAtOrAbove === null
                    ? 'record-only mode, so the output was released regardless.'
                    : `blocking is on, so onUnavailable='${onUnavailable}' decided it.`);
    }
    const blocked = blockAtOrAbove !== null &&
        (checked ? meetsThreshold(verdict, blockAtOrAbove) : onUnavailable === 'withhold');
    const record = {
        verdict,
        checked,
        disposition: blocked ? 'withheld' : 'released',
        halScore,
        trustScore,
        decisionReason,
        evidence,
        halLatencyMs,
        ...(error ? { error } : {}),
        blockAtOrAbove,
    };
    if (onRecord) {
        try {
            onRecord(record);
        }
        catch {
            // Telemetry never breaks the caller's work.
        }
    }
    return { ...record, output: blocked ? undefined : output, blocked };
}
/** JSON or null — never throws, and never returns "[object Object]" as if it were content. */
function safeStringify(value) {
    if (value === undefined || value === null)
        return null;
    try {
        const s = JSON.stringify(value);
        return s === undefined ? null : s;
    }
    catch {
        return null;
    }
}
