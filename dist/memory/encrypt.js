"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEALED_WRONG_KEY = exports.SEALED_NO_KEY = exports.SEALED_PREFIX = void 0;
exports.encryptionEnabled = encryptionEnabled;
exports.isSealed = isSealed;
exports.memoryPassword = memoryPassword;
exports.newSalt = newSalt;
exports.deriveKey = deriveKey;
exports.seal = seal;
exports.unseal = unseal;
exports.encryptMemory = encryptMemory;
exports.decryptMemory = decryptMemory;
/**
 * Optional encryption at rest for the local memory file. No network.
 *
 * TRUSTSHELL_MEMORY_ENCRYPT=on seals every NEW note and keyed value with AES-256-GCM, under a key
 * derived (scrypt) from TRUSTSHELL_MEMORY_KEY and a random salt stored once per memory file.
 * Unset, empty or 'off' writes plain text, as before.
 *
 * Reading does not depend on the flag: a sealed row opens whenever TRUSTSHELL_MEMORY_KEY is set and
 * correct, so turning the flag off never locks anyone out of what they already saved.
 *
 * Fail closed. With the flag on and no key, a write is REFUSED (NOT_CHECKED), never quietly stored
 * as plain text. Until 2026-10-05 this module existed and nothing called it, so setting the flag
 * did exactly that: every note went to disk unencrypted while the setting said otherwise.
 *
 * What it protects: the note text inside the sqlite file, against someone who copies the file
 * without the key. What it does not: the key itself (an environment variable is readable by every
 * process you run), the kind and timestamp of each row, or a note while it is on screen.
 */
const node_crypto_1 = require("node:crypto");
const FLAG = 'TRUSTSHELL_MEMORY_ENCRYPT';
const KEY = 'TRUSTSHELL_MEMORY_KEY';
/** Every sealed body starts with this, so a reader can tell a sealed row from a plain one. */
exports.SEALED_PREFIX = 'tsenc:v1:';
/** Shown in place of a sealed note that cannot be opened. Never the ciphertext. */
exports.SEALED_NO_KEY = `[encrypted note: set ${KEY} to read it]`;
exports.SEALED_WRONG_KEY = `[encrypted note: ${KEY} does not open it]`;
function encryptionEnabled(env = process.env) {
    const raw = env[FLAG];
    if (raw === undefined)
        return false;
    const trimmed = raw.trim();
    return trimmed.length > 0 && trimmed.toLowerCase() !== 'off';
}
function isSealed(body) {
    return body.startsWith(exports.SEALED_PREFIX);
}
/** The memory password, or null when unset or blank. */
function memoryPassword(env = process.env) {
    const password = env[KEY];
    return typeof password === 'string' && password.trim().length > 0 ? password : null;
}
/** A new random salt for one memory file. */
function newSalt() {
    return (0, node_crypto_1.randomBytes)(16);
}
/** 32-byte key from the password and that file's salt. Slow on purpose (scrypt). */
function deriveKey(password, salt) {
    return (0, node_crypto_1.scryptSync)(password, salt, 32);
}
/** Seal one body. The output is ASCII and always starts with {@link SEALED_PREFIX}. */
function seal(body, key) {
    const iv = (0, node_crypto_1.randomBytes)(12);
    const cipher = (0, node_crypto_1.createCipheriv)('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${exports.SEALED_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}
/** Open one sealed body. Throws NOT_CHECKED on a malformed body, a wrong key or tampering. */
function unseal(body, key) {
    if (!isSealed(body))
        throw new Error('NOT_CHECKED not an encrypted memory body');
    const parts = body.slice(exports.SEALED_PREFIX.length).split(':');
    if (parts.length !== 3)
        throw new Error('NOT_CHECKED malformed encrypted memory');
    const [ivB64, tagB64, encryptedB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    if (iv.length !== 12)
        throw new Error('NOT_CHECKED invalid iv');
    if (tag.length !== 16)
        throw new Error('NOT_CHECKED invalid auth tag');
    try {
        const decipher = (0, node_crypto_1.createDecipheriv)('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(Buffer.from(encryptedB64, 'base64')), decipher.final()]).toString('utf8');
    }
    catch {
        throw new Error('NOT_CHECKED decrypt failed');
    }
}
/**
 * Seal a body for writing when the flag is on, else return it unchanged. `salt` is the memory
 * file's salt. With the flag on and no password this THROWS: nothing is written in plain text.
 */
function encryptMemory(body, env = process.env, salt) {
    if (!encryptionEnabled(env))
        return body;
    const password = memoryPassword(env);
    if (!password)
        throw new Error(`NOT_CHECKED ${KEY} missing: ${FLAG} is on, so nothing was written`);
    if (!salt)
        throw new Error('NOT_CHECKED memory salt missing');
    return seal(body, deriveKey(password, salt));
}
/**
 * Read a stored body. Plain text comes back unchanged. A sealed body opens with the password,
 * whatever the flag says; without one, or with the wrong one, the caller gets a placeholder line,
 * never the ciphertext.
 */
function decryptMemory(body, env = process.env, salt) {
    if (!isSealed(body))
        return body;
    const password = memoryPassword(env);
    if (!password || !salt)
        return exports.SEALED_NO_KEY;
    try {
        return unseal(body, deriveKey(password, salt));
    }
    catch {
        return exports.SEALED_WRONG_KEY;
    }
}
