/**
 * The extension's copy of src/memory/redact.ts: strip known secret and personal-data formats from
 * a reply BEFORE it leaves the browser. laya.js calls this on every request and refuses to send
 * if it is missing.
 *
 * It is a port, not an import, because the extension ships plain files and the npm package does
 * not ship the extension. tests/scrub-parity.test.ts runs both over one corpus and fails on any
 * difference, so the two cannot drift. Change both together.
 *
 * Shapes, not judgement: a name, an address or a health detail written in prose is not caught.
 */
(function () {
  const SECRET = /sb_secret_[^\s]+/g;
  const ADDRESS = /\b0x[0-9a-fA-F]{40}\b/g;
  const DB_URL = /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?|mssql|sqlserver):\/\/[^\s]+/gi;
  const PEM_PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
  const BEARER = /\bBearer\s+[A-Za-z0-9_\-./]{8,}/g;
  const EYJ = /\beyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*/g;
  const SK = /\bsk-[A-Za-z0-9_\-]+/g;
  const STRIPE = /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{10,}\b/g;
  const AWS_KEY_ID = /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[A-Z0-9]{16}\b/g;
  const GOOGLE_API_KEY = /\bAIza[0-9A-Za-z_-]{35}\b/g;
  const GHP = /\bghp_[A-Za-z0-9]{36,}\b/g;
  const GITHUB_PAT = /\bgithub_pat_[A-Za-z0-9_]+\b/g;
  const HF = /\bhf_[A-Za-z0-9_-]{8,}\b/g;
  const WEBHOOK_URL = /\bhttps:\/\/(?:hooks\.slack\.com\/services|(?:discord|discordapp)\.com\/api\/webhooks)\/[^\s]+/gi;
  const CREDENTIAL_ASSIGNMENT =
    /\b(password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|aws_secret_access_key)(\s*[=:]\s*)(["']?)[^\s"',;]{6,}\3/gi;
  const HEX_64 = /\b(?:0x)?[0-9a-fA-F]{64}\b/g;
  const PREFIXED_TOKENS = /\b(?:pypi-|npm_|hf_|glsoat-|glagent-|glptt-|gloas-|glrt-|gldt-|glpat-|ghs_|ghr_|ghu_|gho_|xoxc-|xoxs-|xoxr-|xoxe-|xoxa-|xoxp-|xoxb-)[A-Za-z0-9_-]{8,}\b/g;
  const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
  const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g;
  const CARD_CANDIDATE = /\b\d(?:[ -]?\d){12,18}\b/g;
  const IBAN_CANDIDATE = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g;

  function luhnValid(digits) {
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

  function ibanValid(candidate) {
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

  function redact(value) {
    return String(value == null ? '' : value)
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

  const api = { redact };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof globalThis === 'object') globalThis.trustshellScrub = api;
})();
