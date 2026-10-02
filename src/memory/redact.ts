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
/** GitHub refresh tokens: `ghr_...`. */
const GHR = /\bghr_[A-Za-z0-9]{36,}\b/g;
/** GitHub App user-to-server tokens: `ghu_...`. */
const GHU = /\bghu_[A-Za-z0-9]{36,}\b/g;
/** GitLab Agent for Kubernetes tokens: `glagent-...`. */
const GLAGENT = /\bglagent-[A-Za-z0-9_\-]+\b/g;

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
    .replace(GHR, '')
    .replace(GHU, '')
    .replace(GLAGENT, '');
}
