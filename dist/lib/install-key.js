"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeKeyFs = exports.SIGNING_KEY_FILE = void 0;
exports.fingerprintOf = fingerprintOf;
exports.signerOf = signerOf;
exports.signingKey = signingKey;
exports.ownFingerprint = ownFingerprint;
exports.signValue = signValue;
exports.verifyValue = verifyValue;
/**
 * This install's Ed25519 key: `<TRUSTSHELL_HOME or ~/.trustshell>/bundle-signing-key.pem`, created 0600 on
 * first use, never written into anything it signs. It signs bundles (authorship) and, when the owner asks,
 * the local policy (`trustshell guard sign`). A signature proves integrity only as far as the key is
 * trusted; it encrypts nothing. Every check recomputes the fingerprint from the key, never reads it off a file.
 */
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const jcs_1 = require("./jcs");
exports.SIGNING_KEY_FILE = 'bundle-signing-key.pem';
function fingerprintOf(publicKeyB64url) {
    return (0, node_crypto_1.createHash)('sha256').update(Buffer.from(publicKeyB64url, 'base64url')).digest('hex');
}
function signerOf(key) {
    const x = String((0, node_crypto_1.createPublicKey)(key).export({ format: 'jwk' }).x);
    return { alg: 'ed25519', public_key: x, fingerprint: fingerprintOf(x) };
}
const nodeKeyFs = () => {
    const fs = require('node:fs');
    return {
        exists: (p) => fs.existsSync(p),
        read: (p) => fs.readFileSync(p, 'utf8'),
        writeNew: (p, d) => fs.writeFileSync(p, d, { mode: 0o600, flag: 'wx' }),
        mkdirp: (p) => {
            fs.mkdirSync(p, { recursive: true, mode: 0o700 });
        },
    };
};
exports.nodeKeyFs = nodeKeyFs;
/** This install's key, created on first use. */
function signingKey(dir, fs = (0, exports.nodeKeyFs)()) {
    const path = (0, node_path_1.join)(dir, exports.SIGNING_KEY_FILE);
    let created = false;
    if (!fs.exists(path)) {
        const { privateKey } = (0, node_crypto_1.generateKeyPairSync)('ed25519');
        fs.mkdirp(dir);
        fs.writeNew(path, String(privateKey.export({ format: 'pem', type: 'pkcs8' })));
        created = true;
    }
    const key = (0, node_crypto_1.createPrivateKey)(fs.read(path));
    if (key.asymmetricKeyType !== 'ed25519')
        throw new Error(`${path} is not an Ed25519 key`);
    return { key, signer: signerOf(key), created, path };
}
/** The fingerprint of this install's key, or null when it has none yet (nothing is created). */
function ownFingerprint(dir, fs = (0, exports.nodeKeyFs)()) {
    const path = (0, node_path_1.join)(dir, exports.SIGNING_KEY_FILE);
    return fs.exists(path) ? signerOf((0, node_crypto_1.createPrivateKey)(fs.read(path))).fingerprint : null;
}
/** Ed25519 over the RFC 8785 form of `value`, base64. */
function signValue(value, key) {
    return (0, node_crypto_1.sign)(null, Buffer.from((0, jcs_1.canonicalize)(value), 'utf8'), key).toString('base64');
}
/** True only when `signer` is well formed, its fingerprint is its key's, and `signature` verifies over `value`. */
function verifyValue(value, signer, signature) {
    try {
        if (signer.alg !== 'ed25519' || fingerprintOf(signer.public_key) !== signer.fingerprint)
            return false;
        const pub = (0, node_crypto_1.createPublicKey)({ key: { kty: 'OKP', crv: 'Ed25519', x: signer.public_key }, format: 'jwk' });
        return (0, node_crypto_1.verify)(null, Buffer.from((0, jcs_1.canonicalize)(value), 'utf8'), pub, Buffer.from(signature, 'base64'));
    }
    catch {
        return false;
    }
}
