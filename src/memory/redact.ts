/**
 * Strip secrets from a string. No network.
 */
const SECRET = /sb_secret_[^\s]+/g;
const ADDRESS = /\b0x[0-9a-fA-F]{40}\b/g;
const POSTGRES = /postgresql:\/\/[^\s]+/gi;
/** Authorization header tokens, including `Bearer <jwt>`. Process before the JWT rule so the whole header value is removed. Tokens are assumed to be at least 8 characters. */
const BEARER = /\bBearer\s+[A-Za-z0-9_\-./]{8,}/g;
/** A bare eyJ prefix and a dotted JWT. The prefix alone is enough to strip. */
const EYJ = /\beyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*/g;
/** Agent/API keys with an `sk-` prefix, as used for agent apiKey values in this repo. */
const SK = /\bsk-[A-Za-z0-9_\-]+/g;
/** Slack config tokens (`xoxc-…`) must not leave the local redaction boundary. */
const SLACK_CONFIG = /\bxoxc-[A-Za-z0-9_\-]+/g;

export function redact(value: string): string {
  return value
    .replace(SECRET, '')
    .replace(ADDRESS, '')
    .replace(POSTGRES, '')
    .replace(BEARER, '')
    .replace(EYJ, '')
    .replace(SK, '')
    .replace(SLACK_CONFIG, '');
}
