import { redirect } from 'next/navigation';

/**
 * Retired 2026-10-07. This was a three-question "tailor your path" page that nothing linked to.
 * It saved a profile nothing read, promised set-up that never happened, and sent "Trust-wrap an
 * agent I have" to /connect, which stores model API keys and links no agent. /start now asks the
 * two questions that change the next step, so the old address goes there.
 */
export default function TailorRetired() {
  redirect('/start');
}
