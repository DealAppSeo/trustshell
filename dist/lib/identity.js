"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notCheckedIdentity = notCheckedIdentity;
exports.identityFromPassport = identityFromPassport;
exports.formatIdentity = formatIdentity;
const TOKEN_ID = /^(0|[1-9]\d{0,17})$/;
function notCheckedIdentity(reason) {
    return { registeredOnchain: 'NOT_CHECKED', tokenId: null, reason };
}
/** Read the identity out of a passport body. PURE. Anything unclear is NOT_CHECKED, not NOT_MINTED. */
function identityFromPassport(body) {
    const p = body && typeof body === 'object' ? body : null;
    const id = p && p['identity_erc8004'] && typeof p['identity_erc8004'] === 'object' ? p['identity_erc8004'] : null;
    if (!id)
        return notCheckedIdentity('the passport had no identity section');
    const state = id['registered_onchain'];
    if (state !== 'MINTED' && state !== 'UNVERIFIED' && state !== 'NOT_MINTED') {
        return notCheckedIdentity('the passport did not say whether a token is minted');
    }
    const raw = id['token_id'];
    const asText = typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
    if (asText !== '' && TOKEN_ID.test(asText))
        return { registeredOnchain: state, tokenId: asText };
    return {
        registeredOnchain: state,
        tokenId: null,
        ...(asText !== '' ? { reason: 'the engine sent a token id that is not a whole number, so it is not shown' } : {}),
    };
}
/** One line for a terminal: the ID as its own field, with its state. */
function formatIdentity(identity) {
    if (!identity)
        return '  ERC-8004 ID  not checked';
    const id = identity.tokenId !== null ? `#${identity.tokenId}` : identity.registeredOnchain === 'NOT_MINTED' ? 'none yet' : 'not checked';
    const note = identity.registeredOnchain === 'MINTED'
        ? 'on-chain'
        : identity.registeredOnchain === 'UNVERIFIED'
            ? 'has a token id; no record of the mint transaction here, which is not the same as not minted'
            : identity.registeredOnchain === 'NOT_MINTED'
                ? 'off-chain only'
                : identity.reason ?? 'not checked';
    return `  ERC-8004 ID  ${id}  (${note})`;
}
