/**
 * The signed-in account, as far as the browser knows.
 *
 * Distinct from the gate token in `agent-gate.ts`, and the distinction matters:
 *
 *   gate token     scope 'agent_gate'. Says "this inbox was verified", raises
 *                  the free run allowance. Carries NO account id.
 *   login token    a full-account JWT carrying builder_id. This is what proves
 *                  "this is my account" to anything that credits or spends.
 *
 * Both are HS256 over the same server secret, and the engine deliberately
 * refuses to accept either in the other's place. Keeping them in separate keys
 * here mirrors that: verifying an email for free runs must never silently read
 * as authority over an account.
 *
 * The engine hands back a login token from verify-otp only when it is configured
 * to provision accounts (GATE_PROVISIONS_ACCOUNT). Everything here treats its
 * absence as normal — feature detection, not an error state.
 *
 * Storage is localStorage: a bearer token, same as the gate token beside it. Not
 * a secret worth more than the session it represents, and there is no cookie to
 * be sent cross-site by accident.
 */

const TOKEN_KEY = 'trustshell_login_token';
const ACCOUNT_KEY = 'trustshell_account';

export interface Account {
  builder_id: string;
  builder_address: string;
  email: string;
}

export function getLoginToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getAccount(): Account | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(ACCOUNT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Account>;
    if (!parsed.builder_id || !parsed.builder_address) return null;
    return {
      builder_id: parsed.builder_id,
      builder_address: parsed.builder_address,
      email: parsed.email ?? '',
    };
  } catch {
    return null;
  }
}

/** True when we hold a token AND the account it belongs to. */
export function isSignedIn(): boolean {
  return !!getLoginToken() && !!getAccount();
}

export function saveAccount(token: string, account: Account): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
}

export function clearAccount(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
}

/**
 * `Authorization: Bearer <login_token>` when signed in, otherwise nothing.
 *
 * Returns an empty object rather than throwing so a caller can always spread it
 * — an anonymous request should get the server's honest 401, not a client-side
 * exception that hides which side said no.
 */
export function accountHeader(): Record<string, string> {
  const token = getLoginToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
