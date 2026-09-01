import { REPID_ENGINE_URL } from './repid-engine';

/**
 * Human ↔ agent ownership binding.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT. A binding is a statement somebody
 * signed with a wallet naming one exact agent. That is the only thing in this
 * system that establishes ownership. `repid_agents.builder_id` is an
 * administrative association nobody signed — real, useful, and NOT evidence of
 * ownership. The engine keeps the two apart in `GET /agents/:id/owner`
 * (PROVEN vs LINKED) and so does this module; conflating them in the UI would
 * be exactly the overclaim the passport page had to retract.
 *
 * THE FLOW COSTS THE USER TWO SIGNATURES, AND THAT IS NOT AN OVERSIGHT.
 *   1. An AUTH envelope, bound to method + path + a timestamp, so a signature
 *      gathered for a harmless read cannot be replayed against a write.
 *   2. The BINDING statement itself, naming the wallet, the agent and the scope.
 * They answer different questions — "are you holding this key right now" and
 * "do you mean to claim this agent" — so one cannot stand in for the other.
 * Present them as one act with two prompts; never hide the second.
 *
 * NOTHING HERE ASKS FOR A NAME OR AN EMAIL. An address is a pseudonym. This
 * path discloses strictly less about a person than an email login does.
 */

/** Placeholders the engine puts in its own `sign_this` template. */
const WALLET_SLOT = '<your wallet>';
const TIME_SLOT = '<ISO timestamp>';

/** The engine rejects an auth signature more than 5 minutes from now. */
export const AUTH_SKEW_MS = 5 * 60 * 1000;

export type OwnerKind = 'human_sbt' | 'builder';

export type AgentOwner = {
  owned: boolean;
  owner: { kind: OwnerKind; assurance?: string; wallet?: string } | null;
  /** Administratively associated, NOT owned. Never render this as ownership. */
  linked_account?: string | null;
  note?: string;
  bound_at?: string;
  scope?: string;
};

export type OwnedAgent = {
  id: string;
  agent_name?: string | null;
  scope?: string | null;
  bound_at?: string | null;
};

export type BindOutcome =
  | { ok: true; binding: Record<string, unknown> }
  | { ok: false; reason: string; detail?: string; status?: number };

/**
 * Plain language for every way this can decline, and what to do next.
 *
 * A raw `no_account` or `bad_signature` on screen is a dead end: it names the
 * machine's problem, not the person's. Each line below has to survive being
 * read by someone who has never heard of a nonce.
 */
export const BIND_ERRORS: Record<string, string> = {
  // ── the auth envelope ──
  signature_required:
    'Your wallet did not sign the request. Approve both prompts to continue.',
  stale_signature:
    'That signature took too long to arrive — it is only valid for five minutes. Try again and approve promptly.',
  bad_signature:
    'The signature did not match the wallet on your account. Switch your wallet to the account you registered with, then try again.',
  no_account:
    'That wallet proved you hold the key, but it has no account here yet. Create one below — it takes one signature, and asks for no email and no name.',
  too_many_connects:
    'Too many accounts have been created from this network in the last hour. Wait a little and try again.',
  connect_disabled:
    'Creating an account is switched off on this deployment, so there is no way to finish claiming yet. Nothing you did was wrong.',

  // ── the binding itself ──
  disabled:
    'Claiming an agent is switched off on this deployment. Nothing is wrong with your wallet.',
  human_not_verified:
    'We could not find the account behind that wallet. Connect the wallet again, then retry.',
  agent_not_found:
    'That agent does not exist. Check the ID, or create an agent first.',
  already_bound:
    'This agent already has an owner. An owner has to revoke before it can be claimed again.',
  not_owner: 'You do not own this agent, so you cannot revoke it.',

  // ── the wallet, before we ever reach the engine ──
  no_wallet:
    'No wallet detected in this browser. Install one, then reload this page.',
  declined: 'Signature declined — nothing was claimed.',
  wallet_mismatch:
    'Your wallet is on a different address than the one this page is claiming for. Switch accounts and try again.',
  unreachable:
    'Could not reach the engine. Check your connection and try again in a moment.',
  auth_unavailable:
    'The engine answered but did not send the statement to sign, so there was nothing to approve. Nothing was signed. Try again in a moment.',
};

export function explainBindError(reason: string | undefined, detail?: string): string {
  if (reason && BIND_ERRORS[reason]) return BIND_ERRORS[reason];
  // Never show a bare code. If the engine sent prose, prefer the engine's prose.
  return detail || 'That did not work, and the engine did not say why. Try again in a moment.';
}

/** Signs an arbitrary string with the browser wallet. Supplied by the page. */
export type SignFn = (message: string) => Promise<string>;

/**
 * Build the auth headers for one engine call.
 *
 * WE ASK THE ENGINE FOR THE STRING RATHER THAN REBUILDING IT HERE. An
 * unauthenticated call to the same method and path returns 401 carrying
 * `sign_this` — the engine's own template, with the wallet and timestamp left
 * as slots. Filling those in means the text the user signs is generated by the
 * code that will verify it. If the two ever drift, the failure is a rejected
 * signature rather than a subtly wrong sentence shown to somebody in the moment
 * they decide to sign. The same reasoning as fetchStakeSignMessage().
 */
async function authHeaders(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  wallet: string,
  sign: SignFn,
): Promise<{ headers: Record<string, string> } | { error: string }> {
  let template: string;
  try {
    const probe = await fetch(`${REPID_ENGINE_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      // A body-less POST is enough to draw the 401; the engine checks headers first.
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    const body = await probe.json().catch(() => ({}));
    template = typeof body?.sign_this === 'string' ? body.sign_this : '';
  } catch {
    return { error: 'unreachable' };
  }

  if (!template.includes(WALLET_SLOT) || !template.includes(TIME_SLOT)) {
    // The engine ANSWERED but did not hand back the statement to sign. That is a
    // different fact from an unreachable host, and telling someone to check their
    // connection would send them to fix the one thing that is working. Refuse to
    // guess the format either way: a signature over a string we invented would
    // fail verification, after the person had already approved it.
    return { error: 'auth_unavailable' };
  }

  const timestamp = new Date().toISOString();
  const message = template
    .replace(WALLET_SLOT, wallet.toLowerCase())
    .replace(TIME_SLOT, timestamp);

  let signature: string;
  try {
    signature = await sign(message);
  } catch (e) {
    return { error: isDeclined(e) ? 'declined' : 'bad_signature' };
  }

  return {
    headers: {
      'x-hd-wallet': wallet,
      'x-hd-timestamp': timestamp,
      'x-hd-signature': signature,
    },
  };
}

/** A declined wallet prompt is a decision, not a fault. Say so without alarm. */
export function isDeclined(e: unknown): boolean {
  const err = e as { code?: number; message?: string };
  return err?.code === 4001 || /reject|denied|declin/i.test(err?.message ?? '');
}

/**
 * The exact statement a wallet signs to claim an agent.
 *
 * Served by the engine so the sentence shown and the sentence verified are the
 * same one. The scope comes back from the server too — asking for a narrower
 * one does not narrow it, and a UI that displayed the requested scope rather
 * than the granted scope would be showing a constraint nothing honours.
 */
export async function fetchBindMessage(input: {
  wallet: string;
  agentId: string;
}): Promise<{ message: string; scope: string } | null> {
  try {
    const q = new URLSearchParams({ wallet: input.wallet, agent_id: input.agentId });
    const res = await fetch(`${REPID_ENGINE_URL}/api/v1/human/bind/message?${q}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.message === 'string'
      ? { message: data.message, scope: String(data.scope ?? 'ownership') }
      : null;
  } catch {
    return null;
  }
}

/**
 * Claim an agent. Two wallet prompts: the auth envelope, then the binding.
 *
 * `onStep` reports which prompt is pending so the page can say what the wallet
 * is about to ask for. An unexplained second popup reads as a bug.
 */
export async function bindAgent(input: {
  wallet: string;
  agentId: string;
  sign: SignFn;
  onStep?: (step: 'auth' | 'binding' | 'submitting') => void;
}): Promise<BindOutcome> {
  const path = '/api/v1/human/bind';

  input.onStep?.('auth');
  const auth = await authHeaders('POST', path, input.wallet, input.sign);
  if ('error' in auth) return { ok: false, reason: auth.error };

  input.onStep?.('binding');
  const stmt = await fetchBindMessage({ wallet: input.wallet, agentId: input.agentId });
  if (!stmt) return { ok: false, reason: 'unreachable' };

  let signature: string;
  try {
    signature = await input.sign(stmt.message);
  } catch (e) {
    return { ok: false, reason: isDeclined(e) ? 'declined' : 'bad_signature' };
  }

  input.onStep?.('submitting');
  try {
    const res = await fetch(`${REPID_ENGINE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth.headers },
      body: JSON.stringify({ agent_id: input.agentId, signature, scope: stmt.scope }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return {
        ok: false,
        reason: String(data?.reason ?? data?.error ?? 'unreachable'),
        detail: typeof data?.detail === 'string' ? data.detail : data?.message,
        status: res.status,
      };
    }
    return { ok: true, binding: data };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}

/**
 * Every agent this wallet owns, and whether the engine has the feature on.
 *
 * `enabled` is read from the response rather than assumed: a deployment with
 * binding switched off should say so on this screen instead of rendering an
 * empty list that looks like "you own nothing".
 */
export async function listMyAgents(input: {
  wallet: string;
  sign: SignFn;
}): Promise<
  | { ok: true; enabled: boolean; agents: OwnedAgent[]; owner: { kind: OwnerKind; assurance?: string } }
  | { ok: false; reason: string; detail?: string }
> {
  const path = '/api/v1/human/agents';
  const auth = await authHeaders('GET', path, input.wallet, input.sign);
  if ('error' in auth) return { ok: false, reason: auth.error };

  try {
    const res = await fetch(`${REPID_ENGINE_URL}${path}`, { headers: auth.headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        reason: String(data?.error ?? 'unreachable'),
        detail: data?.message,
      };
    }
    return {
      ok: true,
      enabled: data?.enabled !== false,
      agents: Array.isArray(data?.agents) ? data.agents : [],
      owner: data?.owner ?? { kind: 'builder' },
    };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}

/** Give up ownership of an agent. Only the current owner may do this. */
export async function revokeBinding(input: {
  wallet: string;
  agentId: string;
  sign: SignFn;
}): Promise<{ ok: true } | { ok: false; reason: string; detail?: string }> {
  const path = `/api/v1/human/bind/${input.agentId}`;
  const auth = await authHeaders('DELETE', path, input.wallet, input.sign);
  if ('error' in auth) return { ok: false, reason: auth.error };

  try {
    const res = await fetch(`${REPID_ENGINE_URL}${path}`, {
      method: 'DELETE',
      headers: auth.headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return {
        ok: false,
        reason: String(data?.reason ?? data?.error ?? 'unreachable'),
        detail: typeof data?.detail === 'string' ? data.detail : data?.message,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}

/**
 * Who owns an agent — public, no wallet, no signature.
 *
 * Ownership is meant to be checkable by somebody who does not trust us, so this
 * one takes no credential at all.
 */
export async function fetchAgentOwner(agentId: string): Promise<AgentOwner | null> {
  try {
    const res = await fetch(`${REPID_ENGINE_URL}/api/v1/agents/${agentId}/owner`);
    if (!res.ok) return null;
    return (await res.json()) as AgentOwner;
  } catch {
    return null;
  }
}

export type ConnectOutcome =
  | { ok: true; created: boolean }
  | { ok: false; reason: string; detail?: string };

/**
 * Turn a proven wallet into an account.
 *
 * WHY THIS EXISTS AS A UI STEP AT ALL. `bindOwnerToAgent` takes the wallet from the
 * ACCOUNT ROW, never from the caller — so somebody holding a wallet with no account
 * cannot claim anything, and the claim panel could only tell them so. Telling a person
 * what to do while giving them no way to do it is a dead end, and this closes it.
 *
 * IT ASKS FOR NOTHING BUT THE SIGNATURE. `display_name` is optional and deliberately
 * not sent: the page promises no email and no name, and an account created here keeps
 * that promise. The wallet IS the identity.
 *
 * IT GRANTS NO REPUTATION, and the copy must never imply otherwise. RepID is earned by
 * work somebody else verified; if connecting minted any, RepID would measure how many
 * wallets a person can generate, which is free.
 *
 * IDEMPOTENT. Connecting twice returns the same account with `created: false` rather
 * than a second one, so a retry after a declined prompt is safe.
 */
export async function connectAccount(input: {
  wallet: string;
  sign: SignFn;
}): Promise<ConnectOutcome> {
  const path = '/api/v1/account/connect';
  const auth = await authHeaders('POST', path, input.wallet, input.sign);
  if ('error' in auth) return { ok: false, reason: auth.error };

  try {
    const res = await fetch(`${REPID_ENGINE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth.headers },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // The engine reports the feature flag and the rate limit with the same `error`
      // key. Map the flag to its own reason so the copy can distinguish "switched off"
      // from "you went too fast" — they need different things from the reader.
      const raw = String(data?.error ?? 'unreachable');
      const reason = raw === 'disabled' ? 'connect_disabled' : raw;
      return { ok: false, reason, detail: data?.message };
    }
    return { ok: true, created: data?.created === true };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}

/** Shortens an address for display without ever implying it is the full value. */
export function shortAddress(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

/** One `key: value` line from the statement, kept in the order the engine sent. */
export type StatementParam = { key: string; value: string };

export type ParsedStatement = {
  /** The statement's own first line. */
  title: string;
  /** The contiguous `key: value` block — the specifics. */
  params: StatementParam[];
  /** Everything after it — the declaration, as one flowing paragraph. */
  prose: string;
};

/**
 * Split the statement into its two kinds of text, FOR DISPLAY ONLY.
 *
 * The engine sends one string that is doing two jobs: three machine parameters
 * a person should read character by character, and two sentences of ordinary
 * English they should read as a sentence. Setting both in the same monospace
 * block asks the reader to do the wrong thing with half of it.
 *
 * THIS NEVER CHANGES WHAT GETS SIGNED. `bindAgent` signs the raw string it
 * received, untouched; this only decides how that string is typeset. The order
 * is preserved exactly as the engine wrote it — splitting the two registers is
 * the whole improvement, and reordering a document somebody is about to sign
 * is not part of it.
 *
 * Returns null on anything that does not match the expected shape, and the
 * caller then renders the raw text verbatim. A statement we do not fully
 * understand must never be shown as a tidy reconstruction: that would be a
 * rendering of our guess, presented where the real thing belongs.
 */
export function parseStatement(raw: string): ParsedStatement | null {
  const lines = raw.split('\n');
  let i = 0;

  const skipBlank = () => {
    while (i < lines.length && !(lines[i] ?? '').trim()) i++;
  };

  skipBlank();
  const title = (lines[i] ?? '').trim();
  if (!title) return null;
  i++;

  skipBlank();

  const params: StatementParam[] = [];
  while (i < lines.length && (lines[i] ?? '').trim()) {
    const m = /^([A-Za-z][A-Za-z0-9_ -]*):[ \t]+(.+)$/.exec(lines[i] ?? '');
    if (!m || !m[1] || !m[2]) break;
    params.push({ key: m[1].trim(), value: m[2].trim() });
    i++;
  }
  if (params.length === 0) return null;

  // The parameter block must end at a blank line or at the end of the text. If
  // it stopped on some other line, the shape is not the one we recognise and
  // the rest would be mis-attributed to the prose.
  if (i < lines.length && (lines[i] ?? '').trim()) return null;

  skipBlank();

  const prose = lines
    .slice(i)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');
  if (!prose) return null;

  return { title, params, prose };
}
