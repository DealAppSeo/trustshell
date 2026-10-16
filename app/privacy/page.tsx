import { permanentRedirect } from 'next/navigation';

// /privacy is the address people type. The policy itself is the static public/privacy.html. 308.
// A page, not a next.config redirect: tests/receipt-redirect.test.ts pins every config redirect to
// the engine's receipt route, and that pin should stay as tight as it is.
export default function PrivacyRedirect() {
  permanentRedirect('/privacy.html');
}
