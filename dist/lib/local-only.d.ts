/**
 * LOCAL-ONLY (SEC F2, security run 2026-10-16). Design and stub; the default is unchanged.
 *
 * WHAT IT IS. One switch that refuses every send of the person's text: to the engine and, through
 * it, to the third-party checker LLMs. On with `localOnly: true` (SDK `TrustShell` config,
 * `classifyClaim` options) or `TRUSTSHELL_LOCAL_ONLY=1` (env, so the CLI and the MCP server get it
 * with no flag). Off unless one of those says so: nothing changes for anyone who does not ask.
 *
 * WHAT IT COVERS TODAY. Every path that sends text of yours, and each answers NOT_CHECKED before
 * any fetch:
 *   - HAL: TrustShell.score / verifyOutput / evaluate (`trustshell verify`, MCP verify_output);
 *   - classify: classifyClaim (`trustshell check "<sentence>"`, MCP check_claim,
 *     `quarantine release --check hal`);
 *   - the verify engine lane (TRUSTSHELL_LAYA=engine).
 * NOT covered (stub): reads that carry no text of yours (status, repid, proof, leaderboard). They
 * still go to the engine. Making local-only refuse those too is a product call, not a privacy one.
 *
 * WHO SAW THE TEXT. A HAL result carries `seenBy`: the providers the engine says it sent the text
 * to (its `provider_responses`, errored ones included, because they received it); `[]` when nothing
 * was sent; 'unknown' when the engine's answer does not say. A classify result already names them:
 * `voters` (with `by: 'votes'`), and `by: 'arithmetic'` means no model was asked. A shared `seenBy`
 * on ClaimResult is the follow-up; it was left out here so the classify shape the extension and the
 * MCP tool return does not change in a stub.
 */
export declare const LOCAL_ONLY_REASON = "local-only is on (TRUSTSHELL_LOCAL_ONLY=1 or localOnly: true), so nothing was sent";
/**
 * Why a check was not sent under OFFLINE=1. The CLI's `verify` and `check <url>`, `classifyClaim`
 * (so `check "<sentence>"` and MCP check_claim) and `TrustShell.score` (so SDK verifyOutput and the
 * MCP verify_output, verify and evaluate) all print these words.
 */
export declare const OFFLINE_REASON = "OFFLINE=1 is set, so nothing was sent";
/**
 * True when OFFLINE=1 is in the environment. The older, CLI-era switch: same promise as local-only
 * for the text-sending paths, but the CLI also uses it to skip backend reads (status, bind-status),
 * which local-only does not. A path that sends your text honours both.
 */
export declare function offline(env?: Record<string, string | undefined>): boolean;
/** Which outside providers saw the text. [] = nothing was sent. 'unknown' = the engine did not say. */
export type SeenBy = string[] | 'unknown';
/** True when the caller asked for local-only, by option or by env. */
export declare function localOnly(explicit?: boolean, env?: Record<string, string | undefined>): boolean;
/** `seenBy` from a HAL /evaluate body: the providers in provider_responses, or 'unknown'. PURE. */
export declare function seenByFromHal(data: unknown): SeenBy;
