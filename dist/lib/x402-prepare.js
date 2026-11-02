"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareX402Payment = prepareX402Payment;
const origin_1 = require("./origin");
const guardrails_1 = require("./guardrails");
const optional_ethers_1 = require("./optional-ethers");
const trustshell_1 = require("./trustshell");
function resolvePaymentCap(params) {
    const declared = params.cap;
    const hasDeclared = declared !== undefined && declared !== null && declared !== '';
    if (params.readAllowance) {
        const allowed = (0, trustshell_1.capFromAllowance)({
            agentId: params.agentId,
            readAllowance: params.readAllowance,
        });
        if (!hasDeclared)
            return allowed;
        const d = BigInt(declared);
        return allowed < d ? allowed : d;
    }
    if (!hasDeclared) {
        throw new trustshell_1.TrustShellError('cap required: buildX402Payment refuses to sign without a cap', 400);
    }
    return declared;
}
/**
 * INTERNAL: not exported by the package root (src/lib/index.ts) or by any `exports` subpath; only `buildX402Payment`
 * (src/lib/trustshell.ts) and `guardedX402Payment` (src/lib/guarded-payment.ts) call it. tests/x402-prepare-internal.test.ts
 * fails if the root exposes it.
 *
 * The deciding half of `buildX402Payment`: everything that can REFUSE a payment, in the order it always ran, ending
 * with the Guard's spend decision (C4/C8). It signs nothing. `guardedX402Payment` calls this, then writes its
 * pre-pay receipt, then `sign()`, so a payment that is refused never leaves a receipt behind.
 *
 * Count rule: the Guard decision is the one and only count, made here, once per payment, after every other check
 * has passed (a refusal above counts nothing). The ledger is append-only and only an ALLOWED decision counts, so a
 * payment decided here and then not made (the receipt writer throws, or the signer fails) stays counted: the
 * ledger can read HIGHER than what was signed, never lower, because no signature exists without its record.
 */
async function prepareX402Payment(params) {
    (0, origin_1.assertOriginCanPay)(params.origin);
    // The amount is validated BEFORE the allowance is read and before the cap is resolved or compared.
    (0, trustshell_1.parsePaymentAmount)(params.amount);
    const cap = resolvePaymentCap(params);
    (0, trustshell_1.assertPaymentCap)({ amount: params.amount, cap });
    // Lazy import keeps ethers out of the module graph for consumers that never call this, and it is
    // an optional peer from 1.6.0: missing, it throws an error that says what to install.
    const { Wallet, getAddress, TypedDataEncoder } = await (0, optional_ethers_1.loadEthers)('Signing an x402 payment');
    const chainId = params.chainId ?? 84532; // Base Sepolia
    // EIP-712 verifyingContract must be a checksummed address; normalize whatever the caller passes.
    const asset = getAddress(params.asset ?? '0x036CbD53842c5426634e7929541eC2318f3dCF7e'); // Base Sepolia USDC
    const tokenName = params.tokenName ?? 'USDC';
    const tokenVersion = params.tokenVersion ?? '2';
    const validForSeconds = params.validForSeconds ?? 3600;
    const wallet = new Wallet(params.privateKey);
    const from = wallet.address;
    const to = getAddress(params.to);
    const value = (0, trustshell_1.parsePaymentAmount)(params.amount).toString();
    const now = Math.floor(Date.now() / 1000);
    const validAfter = 0;
    const validBefore = now + validForSeconds;
    // 32-byte random nonce unless the caller pins one.
    const nonce = params.nonce ??
        '0x' +
            Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
    const domain = { name: tokenName, version: tokenVersion, chainId, verifyingContract: asset };
    const types = {
        TransferWithAuthorization: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'validAfter', type: 'uint256' },
            { name: 'validBefore', type: 'uint256' },
            { name: 'nonce', type: 'bytes32' },
        ],
    };
    const message = { from, to, value, validAfter, validBefore, nonce };
    // Encode the typed data now: a nonce that is not 32 bytes, say, would otherwise surface only at signing, after
    // the Guard counted the spend and the receipt was written. signTypedData hashes this same encoding.
    TypedDataEncoder.hash(domain, types, message);
    // C4/C8: the owner's Guard policy decides the spend, with its per-tx, daily and total limits, after every check
    // above. Allowed, the amount is counted in the Guard ledger; denied, throws. This is the last thing that can refuse.
    (0, guardrails_1.sdkGuard)('buildX402Payment', { tool: 'x402', class: 'spend', amount_raw: value });
    // Single-use, enforced here and not by convention. Set before the first await, so two calls started together
    // still sign once; set whether or not signing then succeeds, because the decision is spent either way.
    let used = false;
    return {
        async sign() {
            if (used)
                throw new trustshell_1.TrustShellError('payment_already_signed: a prepared payment signs once; prepare another (a new Guard decision)', 400);
            used = true;
            // ethers v6: signTypedData produces the EIP-712 signature over the domain/type/message.
            const signature = await wallet.signTypedData(domain, types, message);
            // The facilitator decodes the header as JSON: { from, to, value, validAfter, validBefore, nonce, signature }.
            const payload = { from, to, value, validAfter, validBefore, nonce, signature };
            // Buffer in Node; btoa fallback for browser bundles.
            const json = JSON.stringify(payload);
            const base64 = typeof Buffer !== 'undefined'
                ? Buffer.from(json, 'utf8').toString('base64')
                : btoa(unescape(encodeURIComponent(json)));
            return base64;
        },
    };
}
