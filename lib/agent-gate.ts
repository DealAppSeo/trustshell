/**
 * Client side of the T0.5 agent gate (engine: /api/v1/agent-gate/*).
 *
 * Anonymous visitors get a small free daily taste of hosted HAL-scored
 * runs; verifying an email (6-digit code) raises the cap and becomes the
 * "save your progress" identity. The token is a 30-day JWT stored locally;
 * we attach it to hosted runs via the x-agent-gate-token header.
 */

import { saveAccount, clearAccount } from './account';

const ENGINE_URL =
  process.env.NEXT_PUBLIC_REPID_ENGINE_URL ??
  'https://repid-engine-production.up.railway.app';

const TOKEN_KEY = 'trustshell_gate_token';
const EMAIL_KEY = 'trustshell_gate_email';

export function getGateToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getGateEmail(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(EMAIL_KEY);
}

export function clearGate(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
  // Signing out of the inbox signs you out of the account it earned. Leaving a
  // live login token behind after a visible "sign out" is the kind of thing
  // people are right to be angry about.
  clearAccount();
}

export interface GateStatus {
  enabled: boolean;
  verified: boolean;
  remaining: number;
  limit: number;
}

export async function fetchGateStatus(): Promise<GateStatus | null> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/v1/agent-gate/status`, {
      headers: tokenHeader(),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as GateStatus;
  } catch {
    return null;
  }
}

export function tokenHeader(): Record<string, string> {
  const token = getGateToken();
  return token ? { 'x-agent-gate-token': token } : {};
}

export async function requestCode(email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/v1/agent-gate/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true } : { ok: false, error: data.error || 'request_failed' };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export async function verifyCode(
  email: string,
  code: string,
): Promise<{ ok: boolean; error?: string; gotAccount?: boolean; accountCreated?: boolean }> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/v1/agent-gate/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.token) {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(EMAIL_KEY, email.toLowerCase());

      // The same code may also have earned an account (engine-side flag
      // GATE_PROVISIONS_ACCOUNT). Feature-detected: its absence is the normal
      // older-deployment case, not a failure, and never blocks the verified
      // session the person just earned.
      let gotAccount = false;
      if (data.login_token && data.builder_id && data.builder_address) {
        saveAccount(data.login_token, {
          builder_id: data.builder_id,
          builder_address: data.builder_address,
          email: email.toLowerCase(),
        });
        gotAccount = true;
      }
      return { ok: true, gotAccount, accountCreated: data.account_created === true };
    }
    return { ok: false, error: data.error || 'verify_failed' };
  } catch {
    return { ok: false, error: 'network' };
  }
}
