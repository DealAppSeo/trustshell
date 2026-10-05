"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PREFIXED_TOKEN = void 0;
exports.containsSecret = containsSecret;
exports.redact = redact;
/**
 * Strip secrets and common personal data from a string before it leaves this machine. No network.
 *
 * Every door that sends text out uses this one function: `check "<sentence>"`, the MCP
 * check_claim and verify tools, the SDK's score()/verifyOutput(), the /check page, outbound
 * memory packs, and (through extension/scrub.js, a byte-for-byte port kept in step by
 * tests/scrub-parity.test.ts) the Chrome extension stamp.
 *
 * What it catches is a list of SHAPES, not a judgement. It cannot recognise a name, an address,
 * or a health detail written in prose. The honest sentence is "known secret and personal-data
 * formats are removed before sending", never "your private information never leaves".
 *
 * Over-redaction is the safe direction: a 64-hex sha256 in a claim is removed along with a
 * 64-hex private key, because the two cannot be told apart by shape.
 */
const SECRET = /sb_secret_[^\s]+/g;
const ADDRESS = /\b0x[0-9a-fA-F]{40}\b/g;
/** Connection strings carry credentials: postgres, mysql, mongo, redis, amqp, sql server. */
const DB_URL = /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?|mssql|sqlserver):\/\/[^\s]+/gi;
/** A whole PEM private-key block, any key type. */
const PEM_PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
/** Authorization header tokens, including `Bearer <jwt>`. Process before the JWT rule so the whole header value is removed. Tokens are assumed to be at least 8 characters. */
const BEARER = /\bBearer\s+[A-Za-z0-9_\-./]{8,}/g;
/** A bare eyJ prefix and a dotted JWT. The prefix alone is enough to strip. */
const EYJ = /\beyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*/g;
/** Agent/API keys with an `sk-` prefix (OpenAI, Anthropic `sk-ant-`, this repo's agent keys). */
const SK = /\bsk-[A-Za-z0-9_\-]+/g;
/** Stripe secret and restricted keys. Publishable `pk_` keys are public and kept. */
const STRIPE = /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{10,}\b/g;
/** AWS access key ids (the secret half is caught by CREDENTIAL_ASSIGNMENT when labelled). */
const AWS_KEY_ID = /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[A-Z0-9]{16}\b/g;
/** Google API keys. */
const GOOGLE_API_KEY = /\bAIza[0-9A-Za-z_-]{35}\b/g;
/** GitHub personal access tokens: classic `ghp_...` and fine-grained `github_pat_...`. */
const GHP = /\bghp_[A-Za-z0-9]{36,}\b/g;
const GITHUB_PAT = /\bgithub_pat_[A-Za-z0-9_]+\b/g;
/** Hugging Face API tokens. */
const HF = /\bhf_[A-Za-z0-9_-]{8,}\b/g;
/** Webhook URLs are bearer credentials: anyone holding one can post. */
const WEBHOOK_URL = /\bhttps:\/\/(?:hooks\.slack\.com\/services|(?:discord|discordapp)\.com\/api\/webhooks)\/[^\s]+/gi;
/** A labelled secret: `password=…`, `api_key: …`, `client_secret = "…"`. The label stays, the value goes. */
const CREDENTIAL_ASSIGNMENT = /\b(password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|aws_secret_access_key)(\s*[=:]\s*)(["']?)[^\s"',;]{6,}\3/gi;
/** 64 hex characters: an Ethereum-style private key or another raw secret (see the header on sha256). */
const HEX_64 = /\b(?:0x)?[0-9a-fA-F]{64}\b/g;
/** Shared with remember refusal. Token bodies are assumed to be at least 8 characters. */
exports.PREFIXED_TOKEN = /\b(?:pypi-|npm_|hf_|glsoat-|glagent-|glptt-|gloas-|glrt-|gldt-|glpat-|ghs_|ghr_|ghu_|gho_|xoxc-|xoxs-|xoxr-|xoxe-|xoxa-|xoxp-|xoxb-)[A-Za-z0-9_-]{8,}\b/;
const PREFIXED_TOKENS = new RegExp(exports.PREFIXED_TOKEN.source, 'g');
/** Personal data. Each shape needs its separators, so plain numbers in a claim are left alone. */
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
/** US SSN, dashed form only (nine bare digits are too common to call personal). */
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
/** Phone numbers written with separators: +1 555-123-4567, (555) 123-4567, 555.123.4567. */
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g;
/** Card-number candidates: 13–19 digits, optionally grouped. Removed only when Luhn-valid. */
const CARD_CANDIDATE = /\b\d(?:[ -]?\d){12,18}\b/g;
/** IBAN candidates. Removed only when the mod-97 checksum holds. */
const IBAN_CANDIDATE = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g;
function luhnValid(digits) {
    let sum = 0;
    let double = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let d = digits.charCodeAt(i) - 48;
        if (double) {
            d *= 2;
            if (d > 9)
                d -= 9;
        }
        sum += d;
        double = !double;
    }
    return sum % 10 === 0;
}
function ibanValid(candidate) {
    const s = candidate.replace(/ /g, '');
    if (s.length < 15 || s.length > 34)
        return false;
    const moved = s.slice(4) + s.slice(0, 4);
    let rem = 0;
    for (const ch of moved) {
        const code = ch.charCodeAt(0);
        const value = code >= 65 && code <= 90 ? String(code - 55) : ch;
        for (const digit of value)
            rem = (rem * 10 + (digit.charCodeAt(0) - 48)) % 97;
    }
    return rem === 1;
}
/**
 * True when the value carries a CREDENTIAL shape (not merely personal data). `remember` refuses
 * these: local memory is plain text on disk, and a key stored there is a key on disk.
 */
function containsSecret(value) {
    const s = String(value ?? '');
    return [SECRET, DB_URL, PEM_PRIVATE_KEY, BEARER, EYJ, SK, STRIPE, AWS_KEY_ID, GOOGLE_API_KEY, GHP, GITHUB_PAT, HF, WEBHOOK_URL, CREDENTIAL_ASSIGNMENT, HEX_64, PREFIXED_TOKENS]
        .some((re) => {
        re.lastIndex = 0;
        const hit = re.test(s);
        re.lastIndex = 0;
        return hit;
    });
}
function redact(value) {
    return String(value ?? '')
        .replace(PEM_PRIVATE_KEY, '')
        .replace(SECRET, '')
        .replace(DB_URL, '')
        .replace(WEBHOOK_URL, '')
        .replace(BEARER, '')
        .replace(EYJ, '')
        .replace(SK, '')
        .replace(STRIPE, '')
        .replace(AWS_KEY_ID, '')
        .replace(GOOGLE_API_KEY, '')
        .replace(GHP, '')
        .replace(GITHUB_PAT, '')
        .replace(HF, '')
        .replace(PREFIXED_TOKENS, '')
        .replace(CREDENTIAL_ASSIGNMENT, '$1$2')
        .replace(HEX_64, '')
        .replace(ADDRESS, '')
        .replace(EMAIL, '')
        .replace(SSN, '')
        .replace(IBAN_CANDIDATE, (m) => (ibanValid(m) ? '' : m))
        .replace(CARD_CANDIDATE, (m) => {
        const digits = m.replace(/[ -]/g, '');
        return digits.length >= 13 && digits.length <= 19 && luhnValid(digits) ? '' : m;
    })
        .replace(PHONE, '');
}
