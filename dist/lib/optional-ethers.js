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
exports.MissingDependencyError = void 0;
exports.loadEthers = loadEthers;
/**
 * `ethers` is an OPTIONAL peer dependency from 1.6.0. Only two SDK functions use it: signing an
 * x402 payment (`buildX402Payment` / `guardedX402Payment`) and the keyless on-chain read behind
 * `verifySigner`. Measured on the published 1.5.0, it was 23 of the 50 MB every install pulled,
 * for `verify`, `check`, `repid` and `proof` users who never touch a chain.
 *
 * A caller of those two paths who has not installed it gets this error, which says what to run,
 * instead of a module-resolution stack trace. Any other failure inside ethers is rethrown as is.
 */
class MissingDependencyError extends Error {
    constructor(purpose) {
        super(`${purpose} needs the ethers package, which is optional since @hyperdag/trustshell 1.6.0. Install it next to trustshell: npm i ethers@^6`);
        this.code = 'ETHERS_MISSING';
        this.name = 'MissingDependencyError';
    }
}
exports.MissingDependencyError = MissingDependencyError;
function isMissing(err) {
    const e = err;
    if (!e)
        return false;
    if (e.code === 'MODULE_NOT_FOUND' || e.code === 'ERR_MODULE_NOT_FOUND')
        return /ethers/.test(String(e.message ?? ''));
    return false;
}
async function loadEthers(purpose) {
    try {
        return await Promise.resolve().then(() => __importStar(require('ethers')));
    }
    catch (err) {
        if (isMissing(err))
            throw new MissingDependencyError(purpose);
        throw err;
    }
}
