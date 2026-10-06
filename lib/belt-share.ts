import { timingSafeEqual } from 'node:crypto';

/** The shortest key the deployment may set. Shorter, and every request is refused. */
export const MIN_SHARE_KEY_LENGTH = 24;

/**
 * True only when the deployment has a share key of at least MIN_SHARE_KEY_LENGTH characters and the
 * one in the address is exactly it. No setting means no page at all, so this fails closed.
 * The comparison takes the same time however many characters match.
 */
export function shareKeyMatches(given: string, configured: string | undefined): boolean {
  if (!configured || configured.length < MIN_SHARE_KEY_LENGTH) return false;
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(configured, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
