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
exports.HAL_VERDICT_ORDER = exports.meetsThreshold = exports.wrapExecute = exports.proofBadgeStatus = exports.renderProofBadgeMarkdown = exports.renderProofBadge = exports.default = void 0;
exports.verify = verify;
__exportStar(require("./trustshell"), exports);
var trustshell_1 = require("./trustshell");
Object.defineProperty(exports, "default", { enumerable: true, get: function () { return trustshell_1.TrustShell; } });
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
