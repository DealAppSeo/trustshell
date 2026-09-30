/**
 * Strip secrets from a string. No network.
 */
const SECRET = /sb_secret_[^\s]+/g;
const ADDRESS = /\b0x[0-9a-fA-F]{40}\b/g;
const POSTGRES = /postgresql:\/\/[^\s]+/gi;
/** A bare eyJ prefix and a dotted JWT. The prefix alone is enough to strip. */
const EYJ = /\beyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*/g;

export function redact(value: string): string {
  return value.replace(SECRET, '').replace(ADDRESS, '').replace(POSTGRES, '').replace(EYJ, '');
}
