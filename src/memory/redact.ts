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
import { BIP39_ENGLISH } from './bip39';

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
/** Google OAuth access tokens: `ya29.` then a long URL-safe body. */
const GOOGLE_OAUTH = /\bya29\.[A-Za-z0-9_-]{10,}/g;
/**
 * BIP32 extended keys (base58, 111 chars). `xprv` is a private key. `xpub` is public, but it exposes every
 * address under it, and a claim has no use for one, so it goes too.
 */
const EXTENDED_KEY = /\b(?:[xyzutv](?:prv|pub)|Ltpv|Ltub|Mtpv|Mtub)[1-9A-HJ-NP-Za-km-z]{80,}\b/g;
/** Bitcoin WIF private keys, base58: `5`/`9` + 50 characters (uncompressed) or `K`/`L`/`c` + 51 (compressed). */
const WIF_KEY = /\b(?:[59][1-9A-HJ-NP-Za-km-z]{50}|[KLc][1-9A-HJ-NP-Za-km-z]{51})\b/g;
/** A Solana secret key in base58: 86 to 90 base58 characters standing alone (a keypair is 64 bytes). */
const SOLANA_BASE58 = /\b[1-9A-HJ-NP-Za-km-z]{86,90}\b/g;
/**
 * A Solana keypair as a JSON byte array: 64 integers, each 0-255. Matched as a candidate and
 * checked in {@link isByteArray}, so ordinary lists of 64 larger numbers are left alone.
 */
const SOLANA_KEYPAIR = /\[\s*\d{1,3}(?:\s*,\s*\d{1,3}){63}\s*\]/g;
/**
 * A bare AWS secret access key: exactly 40 base64 characters standing alone. Matched as a candidate
 * and checked in {@link isBareAwsSecret}: it must mix upper case, lower case and a digit or `/` or
 * `+`, and must not be hex (a 40-hex git SHA-1 is not a secret). The labelled form is caught by
 * CREDENTIAL_ASSIGNMENT.
 */
const AWS_SECRET_BARE = /(?<![A-Za-z0-9/+=_-])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=_-])/g;
/** GitHub personal access tokens: classic `ghp_...` and fine-grained `github_pat_...`. */
const GHP = /\bghp_[A-Za-z0-9]{36,}\b/g;
const GITHUB_PAT = /\bgithub_pat_[A-Za-z0-9_]+\b/g;
/** Hugging Face API tokens. */
const HF = /\bhf_[A-Za-z0-9_-]{8,}\b/g;
/** Webhook URLs are bearer credentials: anyone holding one can post. */
const WEBHOOK_URL = /\bhttps:\/\/(?:hooks\.slack\.com\/services|(?:discord|discordapp)\.com\/api\/webhooks)\/[^\s]+/gi;
/**
 * A labelled secret: `password=…`, `api_key: …`, `client_secret = "…"`, `"api_secret": "…"`,
 * `STRIPE_WEBHOOK_SECRET=…`. The label stays, the value goes. The label may carry an identifier prefix
 * (at most four parts, so the scan stays linear) because `api_secret` has no word boundary before
 * `secret` and used to slip through.
 */
const CREDENTIAL_ASSIGNMENT =
  /\b((?:[A-Za-z0-9]{1,20}[_-]){0,4}(?:password|passwd|pwd|secret|api[_-]?key|apikey|api[_-]?secret|access[_-]?token|auth[_-]?token|refresh[_-]?token|session[_-]?token|client[_-]?secret|webhook[_-]?secret|signing[_-]?secret|secret[_-]?key|private[_-]?key|aws_secret_access_key))(["']?)(\s*[=:]\s*)(["']?)[^\s"',;]{6,}\4/gi;
/** 64 hex characters: an Ethereum-style private key or another raw secret (see the header on sha256). */
const HEX_64 = /\b(?:0x)?[0-9a-fA-F]{64}\b/g;
/** Shared with remember refusal. Token bodies are assumed to be at least 8 characters. */
export const PREFIXED_TOKEN = /\b(?:pypi-|npm_|hf_|whsec_|glsoat-|glagent-|glptt-|gloas-|glrt-|gldt-|glpat-|ghs_|ghr_|ghu_|gho_|xoxc-|xoxs-|xoxr-|xoxe-|xoxa-|xoxp-|xoxb-)[A-Za-z0-9_-]{8,}\b/;
const PREFIXED_TOKENS = new RegExp(PREFIXED_TOKEN.source, 'g');

/** Personal data. Each shape needs its separators, so plain numbers in a claim are left alone. */
/**
 * An email address, bounded by the limits of an address itself (RFC 5321): the local part up to 64 characters,
 * the domain up to 253, a top-level label up to 63. EVERY quantifier is bounded. The unbounded form
 * (`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`) was quadratic: on a long run of local-part characters with
 * no `@` it re-scanned to the end of the run from every word boundary (about 1.6 s at 50,000 characters, 28 s at
 * 200,000; the extension runs this on the page's main thread for every reply). Now each start position scans a
 * bounded amount. For anything that is an address the result is the same as before; a local part over 64
 * characters keeps only its leading excess, and a domain over 253 or a top-level label over 63 is not an address.
 */
const EMAIL = /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,63}\b/g;
/** US SSN, dashed form only (nine bare digits are too common to call personal). */
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
/** Phone numbers written with separators: +1 555-123-4567, (555) 123-4567, 555.123.4567. */
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g;
/** Card-number candidates: 13–19 digits, optionally grouped. Removed only when Luhn-valid. */
const CARD_CANDIDATE = /\b\d(?:[ -]?\d){12,18}\b/g;
/** IBAN candidates. Removed only when the mod-97 checksum holds. */
const IBAN_CANDIDATE = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g;

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function ibanValid(candidate: string): boolean {
  const s = candidate.replace(/ /g, '');
  if (s.length < 15 || s.length > 34) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const code = ch.charCodeAt(0);
    const value = code >= 65 && code <= 90 ? String(code - 55) : ch;
    for (const digit of value) rem = (rem * 10 + (digit.charCodeAt(0) - 48)) % 97;
  }
  return rem === 1;
}

/** The 2048 BIP39 words, as a set. Built on first use. */
let bip39Set: Set<string> | null = null;
const bip39 = (): Set<string> => (bip39Set ??= new Set(BIP39_ENGLISH.split(' ')));

/** At least this many consecutive BIP39 words is a seed phrase (12, 15, 18, 21 and 24 are all above it). */
const MNEMONIC_MIN_WORDS = 12;

/**
 * Remove each run of {@link MNEMONIC_MIN_WORDS} or more consecutive BIP39 words. Words may be split by
 * spaces, tabs, newlines, commas or semicolons, and may be numbered ("1. abandon 2. ability"). A label
 * such as "seed phrase:" stays; the words go. Linear in the text: one pass over its alphabetic words.
 *
 * Over-redaction is not a worry here: twelve ordinary words in a row that are ALL on the list is
 * not a sentence anyone writes, and a claim does not need one.
 */
function stripMnemonics(text: string): string {
  const words = [...text.matchAll(/[A-Za-z]+/g)];
  if (words.length < MNEMONIC_MIN_WORDS) return text;
  const set = bip39();
  const cuts: Array<[number, number]> = [];
  let runStart = -1;
  let runLen = 0;
  const close = (endIdx: number) => {
    if (runLen >= MNEMONIC_MIN_WORDS) {
      const first = words[runStart]!;
      const last = words[endIdx]!;
      // Take a leading "12." / "3)" index with the run, so a numbered list leaves nothing behind.
      // Looks only at the 16 characters before the run, so this stays linear however long the text is.
      const from = Math.max(0, first.index! - 16);
      const lead = /\d{1,2}[.):]?[\s,;]*$/.exec(text.slice(from, first.index));
      cuts.push([lead ? from + lead.index : first.index!, last.index! + last[0].length]);
    }
    runStart = -1;
    runLen = 0;
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const inList = w[0].length >= 3 && w[0].length <= 8 && set.has(w[0].toLowerCase());
    // The gap since the previous word must be separators and, at most, one numeric index.
    const gapOk = runStart >= 0 && /^[\s,;]+(?:\d{1,2}[.):]?[\s,;]*)?$/.test(text.slice(words[i - 1]!.index! + words[i - 1]![0].length, w.index));
    if (inList && (runStart < 0 || gapOk)) {
      if (runStart < 0) runStart = i;
      runLen++;
    } else {
      if (runStart >= 0) close(i - 1);
      if (inList) {
        runStart = i;
        runLen = 1;
      }
    }
  }
  if (runStart >= 0) close(words.length - 1);
  if (cuts.length === 0) return text;
  let out = '';
  let at = 0;
  for (const [a, b] of cuts) {
    out += text.slice(at, a);
    at = b;
  }
  return out + text.slice(at);
}

/** A candidate from SOLANA_KEYPAIR is a keypair only if every one of the 64 integers is a byte. */
function isByteArray(candidate: string): boolean {
  return candidate.match(/\d+/g)!.every((n) => Number(n) <= 255);
}

/** A candidate from AWS_SECRET_BARE is a key only if it mixes cases and a digit or `/` or `+`, and is not hex. */
function isBareAwsSecret(candidate: string): boolean {
  if (/^[0-9a-fA-F]{40}$/.test(candidate)) return false;
  return /[a-z]/.test(candidate) && /[A-Z]/.test(candidate) && /[0-9/+]/.test(candidate);
}

/**
 * True when the value carries a CREDENTIAL shape (not merely personal data). `remember` refuses
 * these: local memory is plain text on disk, and a key stored there is a key on disk.
 */
export function containsSecret(value: string): boolean {
  const s = String(value ?? '');
  const shaped = [SECRET, DB_URL, PEM_PRIVATE_KEY, BEARER, EYJ, SK, STRIPE, AWS_KEY_ID, GOOGLE_API_KEY, GOOGLE_OAUTH, EXTENDED_KEY, WIF_KEY, SOLANA_BASE58, GHP, GITHUB_PAT, HF, WEBHOOK_URL, CREDENTIAL_ASSIGNMENT, HEX_64, PREFIXED_TOKENS]
    .some((re) => {
      re.lastIndex = 0;
      const hit = re.test(s);
      re.lastIndex = 0;
      return hit;
    });
  if (shaped) return true;
  // Shapes that need a second look: a candidate is a secret only if it passes the check.
  return (
    (s.match(SOLANA_KEYPAIR) ?? []).some(isByteArray) ||
    (s.match(AWS_SECRET_BARE) ?? []).some(isBareAwsSecret) ||
    stripMnemonics(s) !== s
  );
}

export function redact(value: string): string {
  return stripMnemonics(String(value ?? '')
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
    .replace(GOOGLE_OAUTH, '')
    .replace(GHP, '')
    .replace(GITHUB_PAT, '')
    .replace(HF, '')
    .replace(PREFIXED_TOKENS, '')
    .replace(EXTENDED_KEY, '')
    .replace(WIF_KEY, '')
    .replace(CREDENTIAL_ASSIGNMENT, '$1$2$3')
    .replace(HEX_64, '')
    .replace(AWS_SECRET_BARE, (m) => (isBareAwsSecret(m) ? '' : m))
    .replace(SOLANA_KEYPAIR, (m) => (isByteArray(m) ? '' : m))
    .replace(SOLANA_BASE58, '')
    .replace(ADDRESS, '')
    .replace(EMAIL, '')
    .replace(SSN, '')
    .replace(IBAN_CANDIDATE, (m) => (ibanValid(m) ? '' : m))
    .replace(CARD_CANDIDATE, (m) => {
      const digits = m.replace(/[ -]/g, '');
      return digits.length >= 13 && digits.length <= 19 && luhnValid(digits) ? '' : m;
    })
    .replace(PHONE, ''));
}
