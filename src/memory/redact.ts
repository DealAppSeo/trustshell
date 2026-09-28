/**
 * Strip secrets from a string. No network.
 */
const SECRET = /sb_secret_[^\s]+/g;
const ADDRESS = /\b0x[0-9a-fA-F]{40}\b/g;
const POSTGRES = /postgresql:\/\/[^\s]+/gi;

export function redact(value: string): string {
  return value.replace(SECRET, '').replace(ADDRESS, '').replace(POSTGRES, '');
}
