"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HAL_VERDICT_ORDER = exports.meetsThreshold = exports.wrapExecute = exports.proofBadgeStatus = exports.renderProofBadgeMarkdown = exports.renderProofBadge = exports.isActionEnvelope = exports.EnvelopeRequiredError = exports.runEnvelopedAction = exports.REPUTATION_REGISTRY_BASE_SEPOLIA = exports.HYPERDAG_REPID_SIGNERS = exports.onchainFeedbackClients = exports.classifySigners = exports.verifySigner = exports.guardedX402Payment = exports.CircuitBreaker = exports.auditThenAct = exports.PAY_CAPABLE_ORIGINS = exports.assertOriginCanPay = exports.canPay = exports.MissingDependencyError = exports.default = void 0;
exports.verify = verify;
__exportStar(require("./trustshell"), exports);
var trustshell_1 = require("./trustshell");
Object.defineProperty(exports, "default", { enumerable: true, get: function () { return trustshell_1.TrustShell; } });
var optional_ethers_1 = require("./optional-ethers");
Object.defineProperty(exports, "MissingDependencyError", { enumerable: true, get: function () { return optional_ethers_1.MissingDependencyError; } });
/**
 * Fail-closed turn origins. `Unknown` (or an unstamped turn) may never pay — the same
 * missing-config-refuses posture as the payment cap. Stamp origin at the trust boundary.
 */
var origin_1 = require("./origin");
Object.defineProperty(exports, "canPay", { enumerable: true, get: function () { return origin_1.canPay; } });
Object.defineProperty(exports, "assertOriginCanPay", { enumerable: true, get: function () { return origin_1.assertOriginCanPay; } });
Object.defineProperty(exports, "PAY_CAPABLE_ORIGINS", { enumerable: true, get: function () { return origin_1.PAY_CAPABLE_ORIGINS; } });
/**
 * Audit before act: record the spend intent, require a policy, then run the act. A missing policy
 * refuses — a spend with no policy behind it never runs. Reuses the `.trustshell/value-events.jsonl`
 * on-device log. Wrap `buildX402Payment` / `executeA2A` with `auditThenAct` at the spend boundary.
 */
var audit_1 = require("./audit");
Object.defineProperty(exports, "auditThenAct", { enumerable: true, get: function () { return audit_1.auditThenAct; } });
/**
 * Circuit breaker: halt a retry/beat loop after N identical failures (VETO / cap_refuse /
 * no_progress) instead of spinning forever. `record(key)` returns a one-line halt reason at the
 * threshold; break out on a non-null return. No screensaver loop.
 */
var circuit_breaker_1 = require("./circuit-breaker");
Object.defineProperty(exports, "CircuitBreaker", { enumerable: true, get: function () { return circuit_breaker_1.CircuitBreaker; } });
/**
 * Fail-closed spend entry point: composes the origin gate (SLICE 1) + audit-before-act (SLICE 2)
 * around `buildX402Payment`. A turn that may not pay, or a spend with no policy, never signs. Use
 * this from a turn boundary; `buildX402Payment` remains the lower-level cap-checked signer.
 */
var guarded_payment_1 = require("./guarded-payment");
Object.defineProperty(exports, "guardedX402Payment", { enumerable: true, get: function () { return guarded_payment_1.guardedX402Payment; } });
/**
 * Signer-aware verification (T6): the registry is permissionless, so "check the signer" is the real
 * step. Two of our addresses post feedback (a writer + an attestor); this labels every signer against
 * a config allowlist and returns unknowns FLAGGED — it never silently drops a row, and recommends no
 * policy. Keyless (public RPC). See docs/SIGNER_VERIFICATION.md.
 */
var verify_signer_1 = require("./verify-signer");
Object.defineProperty(exports, "verifySigner", { enumerable: true, get: function () { return verify_signer_1.verifySigner; } });
Object.defineProperty(exports, "classifySigners", { enumerable: true, get: function () { return verify_signer_1.classifySigners; } });
Object.defineProperty(exports, "onchainFeedbackClients", { enumerable: true, get: function () { return verify_signer_1.onchainFeedbackClients; } });
Object.defineProperty(exports, "HYPERDAG_REPID_SIGNERS", { enumerable: true, get: function () { return verify_signer_1.HYPERDAG_REPID_SIGNERS; } });
Object.defineProperty(exports, "REPUTATION_REGISTRY_BASE_SEPOLIA", { enumerable: true, get: function () { return verify_signer_1.REPUTATION_REGISTRY_BASE_SEPOLIA; } });
/**
 * S5: one action class cannot run without a typed envelope. Exported and used
 * by the CLI `verify`/`evaluate` command (origin=Cli, actionClass=verify).
 */
var action_envelope_1 = require("./action-envelope");
Object.defineProperty(exports, "runEnvelopedAction", { enumerable: true, get: function () { return action_envelope_1.runEnvelopedAction; } });
Object.defineProperty(exports, "EnvelopeRequiredError", { enumerable: true, get: function () { return action_envelope_1.EnvelopeRequiredError; } });
Object.defineProperty(exports, "isActionEnvelope", { enumerable: true, get: function () { return action_envelope_1.isActionEnvelope; } });
/**
 * Portable proof badge — render a {@link ProofPresentation} (from `presentProof`)
 * as a self-contained, embeddable SVG or Markdown snippet a reviewer can share and
 * re-verify. Green only when local verification returned true. The BADGE never prints the
 * score; the proof's statement still carries it as a bound public input.
 */
var badge_1 = require("./badge");
Object.defineProperty(exports, "renderProofBadge", { enumerable: true, get: function () { return badge_1.renderProofBadge; } });
Object.defineProperty(exports, "renderProofBadgeMarkdown", { enumerable: true, get: function () { return badge_1.renderProofBadgeMarkdown; } });
Object.defineProperty(exports, "proofBadgeStatus", { enumerable: true, get: function () { return badge_1.proofBadgeStatus; } });
/**
 * One-install story (Phase F): re-export the sound WASM proof verifier so a single
 * `npm install @hyperdag/trustshell` ships HAL filtering AND client-side ZKP RepID verification.
 * `@hyperdag/proof-verifier` is a direct dependency. Loaded via a variable specifier so the SDK
 * still type-checks/loads even if the optional native WASM build isn't present in a given env.
 *
 *   import { verify } from '@hyperdag/trustshell';
 *   const r = await verify(proofBytes, { agent_id, repid_score, threshold, tier });
 */
async function verify(proofBytes, statement) {
    const verifierPkg = '@hyperdag/proof-verifier';
    const mod = await Promise.resolve(`${verifierPkg}`).then(s => __importStar(require(s)));
    return mod.verify(proofBytes, statement);
}
/**
 * wrapExecute — run an agent's work, score the output with HAL, return both.
 *
 * Records by default and withholds nothing; blocking is opt-in per call via
 * `blockAtOrAbove`. See wrap-execute.ts for why that default is a measurement, not
 * caution, and for what the wrapper structurally cannot do (it scores output that has
 * already been produced, so it withholds results, not side effects).
 */
var wrap_execute_1 = require("./wrap-execute");
Object.defineProperty(exports, "wrapExecute", { enumerable: true, get: function () { return wrap_execute_1.wrapExecute; } });
Object.defineProperty(exports, "meetsThreshold", { enumerable: true, get: function () { return wrap_execute_1.meetsThreshold; } });
Object.defineProperty(exports, "HAL_VERDICT_ORDER", { enumerable: true, get: function () { return wrap_execute_1.HAL_VERDICT_ORDER; } });
