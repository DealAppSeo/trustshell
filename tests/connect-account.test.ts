/**
 * THE ENGINE SAYS "disabled" FOR ONE THING AND 429 FOR ANOTHER, AND A PERSON NEEDS TO KNOW WHICH.
 *
 * `POST /api/v1/account/connect` refuses in two completely different situations:
 *
 *   503 {"error":"disabled"}          the feature is switched off on this deployment
 *   429 {"error":"too_many_connects"} you personally went too fast
 *
 * The first is nothing the visitor can act on and nothing they did wrong; the second clears by
 * itself in under an hour. Rendering both as "disabled" would tell somebody to wait out a switch
 * that will never flip on its own, or tell them to give up on a limit that expires. So
 * `connectAccount` remaps the flag's reason to `connect_disabled`, and both have their own line
 * in BIND_ERRORS.
 *
 * The success path is asserted for its `created` flag too, because connecting is IDEMPOTENT: the
 * second call returns the same account with `created: false`, and a UI that said "account
 * created" both times would be claiming something it did not do.
 *
 * fetch is stubbed rather than mocked through a library — the contract under test is what this
 * function does with the engine's answers, not how it reaches the network.
 */
import { connectAccount, explainBindError, BIND_ERRORS } from '../lib/human-bind';

const WALLET = '0x8f4b2c1a9d7e3f60ab5c8e21d4f9a0b7c36e5d18';

/** The engine's own 401 template, which authHeaders fills in before signing. */
const SIGN_THIS =
  'HyperDAG — authenticated request\nmethod: POST\npath:   /api/v1/account/connect\nwallet: <your wallet>\ntime:   <ISO timestamp>';

const sign = async () => '0x' + '11'.repeat(32) + '22'.repeat(32) + '1b';

/**
 * First POST carries no x-hd-* headers: that is the client asking the engine for its own
 * template. Every call after that is the real one, answered with `final`.
 */
function stubEngine(final: { status: number; body: unknown }) {
  const calls: number[] = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const authed = !!(init?.headers as Record<string, string> | undefined)?.['x-hd-signature'];
    calls.push(authed ? 1 : 0);
    if (!authed) {
      return { ok: false, status: 401, json: async () => ({ sign_this: SIGN_THIS }) };
    }
    return {
      ok: final.status < 400,
      status: final.status,
      json: async () => final.body,
    };
  }) as unknown as typeof fetch;
  return calls;
}

afterEach(() => {
  // @ts-expect-error restoring the environment's own fetch between cases
  delete globalThis.fetch;
});

describe('connectAccount', () => {
  it('reports a newly created account', async () => {
    stubEngine({ status: 201, body: { created: true, account: { id: 'b1' } } });
    const r = await connectAccount({ wallet: WALLET, sign });
    expect(r).toEqual({ ok: true, created: true });
  });

  it('does not claim to have created an account that already existed', async () => {
    // Connecting is idempotent. "Account created" on the second call would be a small lie
    // in the one flow whose entire subject is what is and is not true.
    stubEngine({ status: 200, body: { created: false, account: { id: 'b1' } } });
    const r = await connectAccount({ wallet: WALLET, sign });
    expect(r).toEqual({ ok: true, created: false });
  });

  it('remaps the feature flag to its own reason, so it does not read as a rate limit', async () => {
    stubEngine({
      status: 503,
      body: { error: 'disabled', message: 'Self-serve accounts are not enabled on this deployment.' },
    });
    const r = await connectAccount({ wallet: WALLET, sign });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.reason).toBe('connect_disabled');
    expect(explainBindError(r.reason)).toMatch(/switched off/i);
    // And it must not be mistaken for something waiting will fix.
    expect(explainBindError(r.reason)).not.toMatch(/try again|wait/i);
  });

  it('passes the rate limit through as itself, and that message says waiting helps', async () => {
    stubEngine({ status: 429, body: { error: 'too_many_connects', message: 'Too many.' } });
    const r = await connectAccount({ wallet: WALLET, sign });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.reason).toBe('too_many_connects');
    expect(explainBindError(r.reason)).toMatch(/wait|hour/i);
  });

  it('sends no display_name — the page promises no name, and the request keeps that', async () => {
    let sentBody: string | undefined;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const authed = !!(init?.headers as Record<string, string> | undefined)?.['x-hd-signature'];
      if (!authed) return { ok: false, status: 401, json: async () => ({ sign_this: SIGN_THIS }) };
      sentBody = init?.body as string;
      return { ok: true, status: 201, json: async () => ({ created: true }) };
    }) as unknown as typeof fetch;

    await connectAccount({ wallet: WALLET, sign });
    expect(JSON.parse(sentBody ?? '{}')).toEqual({});
  });

  it('every reason it can return has plain language behind it', async () => {
    // A raw code on screen is the dead end this whole module exists to avoid.
    for (const reason of ['connect_disabled', 'too_many_connects', 'no_account', 'unreachable']) {
      expect(BIND_ERRORS[reason]).toBeTruthy();
    }
  });
});
