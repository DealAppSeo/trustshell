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
 * This install's Ed25519 key: `<TRUSTSHELL_HOME or ~/.trustshell>/bundle-signing-key.pem`, created on first
 * use and limited to this user with its folder (0600/0700 on POSIX, an owner/SYSTEM/Administrators ACL on
 * Windows; see src/lib/owner-only.ts), never written into anything it signs. It signs bundles (authorship) and, when the owner asks,
 * the local policy (`trustshell guard sign`). A signature proves integrity only as far as the key is
 * trusted; it encrypts nothing. Every check recomputes the fingerprint from the key, never reads it off a file.
 */
const node_crypto_1 = require("node:crypto");
const node_path_1 = require("node:path");
const jcs_1 = require("./jcs");
const owner_only_1 = require("./owner-only");
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
        restrict: (p) => (0, owner_only_1.ownerOnly)(p, 'file'),
        restrictDir: (p) => (0, owner_only_1.ownerOnly)(p, 'dir'),
    };
};
exports.nodeKeyFs = nodeKeyFs;
/**
 * This install's key, created on first use. The key is narrowed to this user on load, not only on create, so
 * a key made by an earlier version, or loosened since, is repaired. Its folder is narrowed too, but only when
 * this call created it or it is the default ~/.trustshell (isDefaultHome): TRUSTSHELL_HOME may name a project
 * or a whole home folder, and resetting that tree would strip grants other programs rely on. Once per process
 * (tryOwnerOnly). When it cannot be done the key still works and a TRUSTSHELL_HOME_PERMISSIONS or
 * TRUSTSHELL_KEY_PERMISSIONS warning says so: unrestricted is what every earlier version had, and failing the
 * command would not make it safer.
 */
function signingKey(dir, fs = (0, exports.nodeKeyFs)()) {
    const path = (0, node_path_1.join)(dir, exports.SIGNING_KEY_FILE);
    let created = false;
    const dirExisted = fs.exists(dir);
    if (!fs.exists(path)) {
        const { privateKey } = (0, node_crypto_1.generateKeyPairSync)('ed25519');
        fs.mkdirp(dir);
        fs.writeNew(path, String(privateKey.export({ format: 'pem', type: 'pkcs8' })));
        created = true;
    }
    const { restrict, restrictDir } = fs;
    if (restrictDir && (!dirExisted || (0, owner_only_1.isDefaultHome)(dir)))
        (0, owner_only_1.tryOwnerOnly)(dir, 'dir', 'TRUSTSHELL_HOME_PERMISSIONS', (p) => restrictDir(p));
    if (restrict)
        (0, owner_only_1.tryOwnerOnly)(path, 'file', 'TRUSTSHELL_KEY_PERMISSIONS', (p) => restrict(p));
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
