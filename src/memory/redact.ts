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
/** GitHub personal access tokens: classic `ghp_...` and fine-grained `github_pat_...`. */
const GHP = /\bghp_[A-Za-z0-9]{36,}\b/g;
const GITHUB_PAT = /\bgithub_pat_[A-Za-z0-9_]+\b/g;
/** Hugging Face API tokens. Kept separate from PREFIXED_TOKEN because remember refusal
 *  has its own open work for `hf_`; this change only covers outbound escalate packs. */
const HF = /\bhf_[A-Za-z0-9_-]{8,}\b/g;
/** Shared with remember refusal. Token bodies are assumed to be at least 8 characters. */
export const PREFIXED_TOKEN = /\b(?:pypi-|npm_|glsoat-|glagent-|glptt-|gloas-|glrt-|gldt-|glpat-|ghs_|ghr_|ghu_|gho_|xoxc-|xoxs-|xoxr-|xoxe-|xoxa-|xoxp-|xoxb-)[A-Za-z0-9_-]{8,}\b/;
const PREFIXED_TOKENS = new RegExp(PREFIXED_TOKEN.source, 'g');

export function redact(value: string): string {
  return value
    .replace(SECRET, '')
    .replace(ADDRESS, '')
    .replace(POSTGRES, '')
    .replace(BEARER, '')
    .replace(EYJ, '')
    .replace(SK, '')
    .replace(GHP, '')
    .replace(GITHUB_PAT, '')
    .replace(HF, '')
    .replace(PREFIXED_TOKENS, '');
}
