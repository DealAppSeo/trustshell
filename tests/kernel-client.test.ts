/**
 * The kernel client (src/lib/kernel-client.ts): anything but a clean, request-bound ALLOW is a
 * refusal — and the dogfood script (examples/kernel-buy/kernel-buy.mjs) cannot buy anything.
 *
 * Three groups:
 *   1. the cross-repo VECTOR and the schema file, pinned to the same values as repid-engine's
 *      src/kernel/__tests__/receipt.test.ts, so the two repos cannot drift apart in silence;
 *   2. the client's refusals, one per way an answer can be wrong;
 *   3. the script, run as a child process against local stand-ins for the resource and the kernel.
 *
 * Nothing here dials a real host, holds a funded key, or signs a payment. The script's armed path
 * is exercised only up to the point it would read a key, and no key is ever set.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  KernelRefusedError,
  SIX_CLAIM_KEYS,
  hashKernelArgs,
  kernelCanonicalJson,
  kernelDecide,
  kernelReceipt,
  kernelReceiptHash,
  requireKernelAllow,
  type KernelCallInput,
  type KernelReceiptV1,
} from '../src/lib/kernel-client';
import { SIX_CLAIM_KEYS as APP_SIX_CLAIM_KEYS } from '../lib/six-claims';

const ROOT = join(__dirname, '..');

// ── 1. the shared vector ────────────────────────────────────────────────────────────────────────
// SHARED VECTOR — repid-engine src/kernel/__tests__/receipt.test.ts pins this same receipt, the same
// hash, and the same hash of the schema file. If either side changes how a receipt is fingerprinted
// or what shape it has, one of the two suites goes red.
const SCHEMA_SHA256 = '9519068e49073f2d5de094e5acbbe157af41555bb5a9bcb56d03c94cdd1ac5d9';
const VECTOR_HASH = '0x5110abfef0a7ba2685214b1873bf22eac5a823aa367dc60a872691639571b88f';
const VECTOR_ARGS_HASH = '0xd82cf87614b294f236e7d71bdbc831d606503ec1f6446013321450df46425440';
const VECTOR = {
  "header": {
    "schema": "kernel-receipt/1",
    "version": 1,
    "receipt_id": "00000000-0000-4000-8000-000000000001",
    "prev_receipt_id": null,
    "prev_hash": null,
    "created_at": "2027-01-15T08:00:00.000Z",
    "receipt_hash": "0x5110abfef0a7ba2685214b1873bf22eac5a823aa367dc60a872691639571b88f",
    "env": {
      "network": "base-sepolia",
      "chain_id": 84532,
      "is_simulated": true
    },
    "signer": null
  },
  "subject": {
    "agent": {
      "agent_id": "11111111-1111-4111-8111-111111111111",
      "agent_name": "kernel-demo-agent"
    },
    "owner": {
      "wallet": "0x1111111111111111111111111111111111111111",
      "assurance": "wallet-proven",
      "status": "resolved"
    }
  },
  "request": {
    "tool": {
      "name": "x402.pay",
      "class": "spend"
    },
    "origin": "Cli",
    "args_hash": "0xd82cf87614b294f236e7d71bdbc831d606503ec1f6446013321450df46425440",
    "amount_raw": "10000",
    "payee": "0x000000000000000000000000000000000000dEaD",
    "asset": "USDC",
    "chain_id": 84532
  },
  "decision": {
    "verdict": "DENY",
    "blocking": true,
    "executed": false,
    "reasons": [
      {
        "code": "spend_limit_zero",
        "detail": "the per-transaction spend limit is 0 (an unset limit is 0)"
      }
    ],
    "checks": [
      {
        "name": "request_wellformed",
        "outcome": "PASS",
        "source": "kernel/decide"
      },
      {
        "name": "owner_resolved",
        "outcome": "PASS",
        "source": "accountable-root"
      },
      {
        "name": "policy_present",
        "outcome": "PASS",
        "source": "policy-store"
      },
      {
        "name": "policy_subject",
        "outcome": "PASS",
        "source": "kernel/decide"
      },
      {
        "name": "policy_signer_is_owner",
        "outcome": "PASS",
        "source": "accountable-root"
      },
      {
        "name": "policy_signature",
        "outcome": "PASS",
        "source": "wallet-signature"
      },
      {
        "name": "policy_unexpired",
        "outcome": "PASS",
        "source": "kernel/decide"
      },
      {
        "name": "policy_revocation",
        "outcome": "PASS",
        "source": "policy-store"
      },
      {
        "name": "action_permitted",
        "outcome": "PASS",
        "source": "kernel/decide"
      },
      {
        "name": "amount_valid",
        "outcome": "PASS",
        "source": "kernel/decide"
      },
      {
        "name": "payee_allowed",
        "outcome": "PASS",
        "source": "kernel/decide"
      },
      {
        "name": "spend_totals",
        "outcome": "PASS",
        "source": "ledger"
      },
      {
        "name": "spend_limit",
        "outcome": "FAIL",
        "source": "kernel/decide"
      }
    ],
    "does_not_attest": [
      "cumulative_total (no atomic reservation)",
      "total_cap_scope (the total limit is per policy version, not lifetime: it is keyed to the policy hash, which includes the nonce, so it resets when a policy is superseded)",
      "tool_class (caller-asserted; there is no tool registry in the MVP)",
      "explicit_revocation (revocation is supersession by a higher nonce inside this ledger only)",
      "laya (shadow mode; not consulted)",
      "receipt_signature (unsigned in the MVP; integrity is the hash and the chain)",
      "asset_and_chain (the owner policy does not constrain which asset or chain a spend uses)",
      "declared_payment_fields (amount and payee are as the caller declared them; the kernel does not observe what the tool then pays)"
    ],
    "policy": {
      "policy_hash": "0x377a7eba68de2b1ece036ee30a36a318fc01a03a422bbb8117994c7d2a83be37",
      "signer": "0x1111111111111111111111111111111111111111",
      "signature": "VERIFIED",
      "expires_at": 1800003600,
      "revocation": "VERIFIED"
    },
    "limits": {
      "per_tx_raw": "0",
      "daily_raw": "5000000",
      "total_raw": "20000000",
      "effective_per_tx_raw": "0",
      "binding_term": "per_tx"
    },
    "laya": {
      "lane": null,
      "mode": "shadow",
      "consulted": false
    }
  },
  "payment": {
    "status": "NOT_APPLICABLE",
    "scheme": null,
    "amount_raw": null,
    "payer": null,
    "payee": null,
    "authorization_nonce": null,
    "tx_hash": null,
    "block": null,
    "observed_amount_raw": null,
    "settlement_evidence": "NOT_CHECKED",
    "is_simulated": true
  },
  "verification": {
    "status": "NOT_APPLICABLE",
    "method": null,
    "votes": [],
    "verdict_label": "PROVISIONAL",
    "settled_by": null,
    "grounded": false,
    "same_domain": false,
    "is_simulated": true,
    "counts_toward_band_restore": false
  }
} as unknown as KernelReceiptV1;

/** A small JSON-Schema walker: the constructs kernel-receipt.v1.json uses, and nothing else. */
function schemaErrors(node: unknown, schema: any, root: any, path: string, out: string[]): void {
  if (schema.$ref) {
    const target = schema.$ref.replace('#/', '').split('/').reduce((a: any, k: string) => a?.[k], root);
    return schemaErrors(node, target, root, path, out);
  }
  if (schema.oneOf) {
    const passing = schema.oneOf.filter((s: any) => { const e: string[] = []; schemaErrors(node, s, root, path, e); return e.length === 0; });
    if (passing.length !== 1) out.push(`${path}: matches ${passing.length} of oneOf`);
    return;
  }
  if ('const' in schema && node !== schema.const) out.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(node)) out.push(`${path}: not in enum`);
  if (schema.type) {
    const types: string[] = Array.isArray(schema.type) ? schema.type : [schema.type];
    const is = (t: string): boolean =>
      t === 'string' ? typeof node === 'string'
      : t === 'integer' ? Number.isInteger(node)
      : t === 'boolean' ? typeof node === 'boolean'
      : t === 'null' ? node === null
      : t === 'array' ? Array.isArray(node)
      : t === 'object' ? node !== null && typeof node === 'object' && !Array.isArray(node)
      : false;
    if (!types.some(is)) { out.push(`${path}: expected ${types.join('|')}`); return; }
  }
  if (typeof node === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(node)) out.push(`${path}: pattern`);
    if (schema.minLength && node.length < schema.minLength) out.push(`${path}: too short`);
  }
  if (Array.isArray(node) && schema.items) node.forEach((v, i) => schemaErrors(v, schema.items, root, `${path}[${i}]`, out));
  if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
    const obj = node as Record<string, unknown>;
    for (const k of schema.required ?? []) if (!(k in obj)) out.push(`${path}: missing ${k}`);
    if (schema.additionalProperties === false) for (const k of Object.keys(obj)) if (!(k in (schema.properties ?? {}))) out.push(`${path}: unexpected ${k}`);
    for (const [k, sub] of Object.entries(schema.properties ?? {})) if (k in obj) schemaErrors(obj[k], sub, root, `${path}.${k}`, out);
  }
}

describe('the vector and the schema file match repid-engine', () => {
  const schemaText = readFileSync(join(ROOT, 'schemas', 'kernel-receipt.v1.json'), 'utf8');
  const schema = JSON.parse(schemaText);

  it('hashes the arguments exactly as the engine does', async () => {
    expect(kernelCanonicalJson({ b: 1, a: [2, { d: null, c: 'é ✓' }] })).toBe('{"a":[2,{"c":"é ✓","d":null}],"b":1}');
    expect(await hashKernelArgs({ resource: 'https://example.invalid/paid' })).toBe(VECTOR_ARGS_HASH);
  });

  it('fingerprints the vector receipt exactly as the engine does', async () => {
    expect(VECTOR.request.args_hash).toBe(VECTOR_ARGS_HASH);
    expect(await kernelReceiptHash(VECTOR)).toBe(VECTOR_HASH);
    expect(VECTOR.header.receipt_hash).toBe(VECTOR_HASH);
  });

  it('the vector satisfies the schema, and an altered one does not', () => {
    const errors: string[] = [];
    schemaErrors(VECTOR, schema, schema, 'receipt', errors);
    expect(errors).toEqual([]);
    const bad = JSON.parse(JSON.stringify(VECTOR));
    bad.decision.verdict = 'MAYBE';
    bad.header.extra = 1;
    delete bad.payment;
    const e2: string[] = [];
    schemaErrors(bad, schema, schema, 'receipt', e2);
    expect(e2.length).toBeGreaterThanOrEqual(3);
  });

  it('the schema file is byte-for-byte the one repid-engine pins', () => {
    expect(createHash('sha256').update(schemaText).digest('hex')).toBe(SCHEMA_SHA256);
  });

  it('the vector is the refusal the engine demo produces: spend 10000 under a zero limit', () => {
    expect(VECTOR.decision.verdict).toBe('DENY');
    expect(VECTOR.decision.reasons[0]?.code).toBe('spend_limit_zero');
    expect(VECTOR.decision.executed).toBe(false);
    expect(VECTOR.decision.limits.effective_per_tx_raw).toBe('0');
    expect(VECTOR.payment.status).toBe('NOT_APPLICABLE');
    expect(VECTOR.decision.does_not_attest).toContain('cumulative_total (no atomic reservation)');
    // ...and that the total cap resets when a policy is superseded, so it cannot read as a lifetime one.
    expect(VECTOR.decision.does_not_attest.some((s) => s.startsWith('total_cap_scope') && /per policy version/.test(s) && /resets when a policy is superseded/.test(s))).toBe(true);
    // The payee gate is one of the checks that ran, and passed: the refusal is the limit alone.
    expect(VECTOR.decision.checks.find((c) => c.name === 'payee_allowed')?.outcome).toBe('PASS');
  });
});

// ── 2. the client ───────────────────────────────────────────────────────────────────────────────

const AGENT = '11111111-1111-4111-8111-111111111111';
const PAYEE = '0x000000000000000000000000000000000000dEaD';

const callInput = (over: Partial<KernelCallInput> = {}): KernelCallInput => ({
  agent: { agent_id: AGENT, agent_name: 'kernel-demo-agent' },
  tool: { name: 'x402.pay', class: 'spend' },
  origin: 'Cli',
  args: { resource: 'https://example.invalid/paid' },
  amount_raw: '10000',
  payee: PAYEE,
  asset: 'USDC',
  chain_id: 84532,
  ...over,
});

/** A kernel ALLOW answer bound to `input`, hash and all. `mutate` breaks it in one chosen way. */
async function allowAnswer(input: KernelCallInput, mutate: (r: any) => void = () => {}): Promise<Record<string, unknown>> {
  const argsHash = input.args_hash ?? (await hashKernelArgs(input.args));
  const receipt: any = JSON.parse(JSON.stringify(VECTOR));
  receipt.request = { tool: { ...input.tool }, origin: input.origin, args_hash: argsHash, amount_raw: input.amount_raw === undefined || input.amount_raw === null ? null : String(input.amount_raw), payee: input.payee ?? null, asset: input.asset ?? null, chain_id: input.chain_id ?? null };
  receipt.subject.agent = { ...input.agent };
  receipt.decision.verdict = 'ALLOW';
  receipt.decision.blocking = false;
  receipt.decision.reasons = [];
  receipt.decision.checks = receipt.decision.checks.map((c: any) => ({ ...c, outcome: 'PASS' }));
  receipt.decision.limits.per_tx_raw = '1000000';
  receipt.decision.limits.effective_per_tx_raw = '1000000';
  receipt.payment.status = 'AUTHORIZED';
  // The envelope's own copy of the decision is taken BEFORE the mutation, so a test can make the
  // receipt disagree with the envelope that carries it.
  const envelopeDecision = JSON.parse(JSON.stringify(receipt.decision));
  mutate(receipt);
  receipt.header.receipt_hash = await kernelReceiptHash(receipt);
  return { verdict: 'ALLOW', blocking: false, persisted: false, decision: envelopeDecision, receipt_preview: receipt, reasons: [] };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fakeFetch = (res: () => Response | Promise<Response>) => jest.fn(async () => res()) as unknown as typeof fetch & jest.Mock;

describe('kernelDecide: only a clean ALLOW, bound to this request, is a yes', () => {
  it('ALLOW → allowed, with the receipt', async () => {
    const input = callInput();
    const f = fakeFetch(async () => json(200, await allowAnswer(input)));
    const out = await kernelDecide(input, { fetch: f });
    expect(out.allowed).toBe(true);
    if (out.allowed) {
      expect(out.verdict).toBe('ALLOW');
      expect(out.receipt.header.schema).toBe('kernel-receipt/1');
      expect(out.args_hash).toBe(VECTOR_ARGS_HASH);
    }
  });

  it('sends the hash, the stated fields and nothing else — the arguments never leave', async () => {
    const input = callInput({ args: { resource: 'https://example.invalid/paid', secret_note: 'do not transmit' } });
    const f = fakeFetch(async () => json(200, await allowAnswer(input)));
    await kernelDecide(input, { fetch: f, apiUrl: 'https://engine.example.invalid///', apiKey: 'k-test' });
    const [url, init] = (f as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://engine.example.invalid/api/v1/kernel/decide');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer k-test');
    const body = JSON.parse(String(init.body));
    expect(Object.keys(body).sort()).toEqual(['agent', 'amount_raw', 'args_hash', 'asset', 'chain_id', 'origin', 'payee', 'tool']);
    expect(String(init.body)).not.toContain('do not transmit');
    expect(String(init.body)).not.toContain('example.invalid/paid');
    expect(body.args_hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  const refusals: Array<[string, () => Response | Promise<Response>, string]> = [
    ['204 No Content', () => new Response(null, { status: 204 }), 'http_204'],
    ['301', () => new Response(null, { status: 301, headers: { location: 'https://elsewhere.invalid' } }), 'http_301'],
    ['401', () => json(401, { error: 'unauthorized' }), 'http_401'],
    ['403', () => json(403, { error: 'forbidden' }), 'http_403'],
    ['429', () => json(429, {}), 'http_429'],
    ['500', () => json(500, {}), 'http_500'],
    ['502', () => new Response('bad gateway', { status: 502 }), 'http_502'],
    ['503', () => json(503, {}), 'http_503'],
    ['200 with a body that is not JSON', () => new Response('<html>ok</html>', { status: 200 }), 'unreadable_response'],
    ['200 with an empty object', () => json(200, {}), 'unreadable_response'],
    ['200 with an unknown verdict', () => json(200, { verdict: 'MAYBE', blocking: false, decision: { verdict: 'MAYBE' } }), 'unreadable_response'],
    ['200 ALLOW that says blocking:true', () => json(200, { verdict: 'ALLOW', blocking: true, decision: { verdict: 'ALLOW' } }), 'inconsistent_response'],
    ['200 DENY whose decision says ALLOW', () => json(200, { verdict: 'DENY', blocking: true, decision: { verdict: 'ALLOW' } }), 'inconsistent_response'],
  ];
  it.each(refusals)('%s → REFUSE (%s)', async (_label, res, code) => {
    const out = await kernelDecide(callInput(), { fetch: fakeFetch(res) });
    expect(out.allowed).toBe(false);
    if (!out.allowed) {
      expect(out.verdict).not.toBe('ALLOW');
      expect(out.reasons.map((r) => r.code)).toContain(code);
    }
  });

  it('a network error → REFUSE as NOT_CHECKED (we did not look); it does not throw', async () => {
    const out = await kernelDecide(callInput(), { fetch: (async () => { throw new TypeError('fetch failed'); }) as typeof fetch });
    expect(out).toMatchObject({ allowed: false, verdict: 'NOT_CHECKED', source: 'client' });
    expect(out.allowed === false && out.reasons[0]?.code).toBe('network_error');
  });

  it('a fetch that throws synchronously, a null input, and a missing fetch are refusals, not exceptions', async () => {
    const sync = await kernelDecide(callInput(), { fetch: (() => { throw new Error('boom'); }) as unknown as typeof fetch });
    expect(sync.allowed).toBe(false);
    expect((await kernelDecide(null as never)).allowed).toBe(false);
  });

  it('a kernel that never answers → REFUSE on timeout', async () => {
    const hangs = ((_u: string, init: RequestInit) =>
      new Promise((_, reject) => { init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); })) as unknown as typeof fetch;
    const out = await kernelDecide(callInput(), { fetch: hangs, timeoutMs: 25 });
    expect(out.allowed).toBe(false);
    expect(out.allowed === false && out.reasons[0]?.code).toBe('timeout');
  });

  it('DENY → REFUSE, with the kernel\'s own reasons passed through', async () => {
    const out = await kernelDecide(callInput(), {
      fetch: fakeFetch(() => json(200, { verdict: 'DENY', blocking: true, persisted: false, decision: { verdict: 'DENY' }, reasons: [{ code: 'spend_limit_zero', detail: 'the per-transaction spend limit is 0' }], receipt_preview: VECTOR })),
    });
    expect(out).toMatchObject({ allowed: false, verdict: 'DENY', source: 'kernel' });
    expect(out.allowed === false && out.reasons.map((r) => r.code)).toEqual(['spend_limit_zero']);
  });

  it('NOT_CHECKED → REFUSE', async () => {
    const out = await kernelDecide(callInput(), {
      fetch: fakeFetch(() => json(200, { verdict: 'NOT_CHECKED', blocking: true, decision: { verdict: 'NOT_CHECKED' }, reasons: [{ code: 'policy_store_unavailable', detail: 'x' }] })),
    });
    expect(out).toMatchObject({ allowed: false, verdict: 'NOT_CHECKED', source: 'kernel' });
  });

  it('a 400 from the kernel is its DENY, and its reasons survive', async () => {
    const out = await kernelDecide(callInput(), { fetch: fakeFetch(() => json(400, { verdict: 'DENY', reasons: [{ code: 'malformed_request', detail: 'bad' }] })) });
    expect(out).toMatchObject({ allowed: false, verdict: 'DENY', http_status: 400 });
    expect(out.allowed === false && out.reasons.map((r) => r.code)).toEqual(['http_400', 'malformed_request']);
  });

  describe('an ALLOW that is not bound to THIS request is somebody else\'s ALLOW', () => {
    const cases: Array<[string, (r: any) => void]> = [
      ['for different arguments', (r) => { r.request.args_hash = '0x' + '1'.repeat(64); }],
      ['for a different tool', (r) => { r.request.tool.name = 'x402.other'; }],
      ['for a different tool class', (r) => { r.request.tool.class = 'read'; }],
      ['for a different agent', (r) => { r.subject.agent.agent_id = '22222222-2222-4222-8222-222222222222'; }],
      ['for a different amount', (r) => { r.request.amount_raw = '1'; }],
      ['a receipt that says the call already ran', (r) => { r.decision.executed = true; }],
      ['a receipt that says DENY', (r) => { r.decision.verdict = 'DENY'; r.decision.blocking = true; }],
      ['an ALLOW resting on a NOT_CHECKED check', (r) => { r.decision.checks[0].outcome = 'NOT_CHECKED'; }],
      ['an ALLOW resting on no checks at all', (r) => { r.decision.checks = []; }],
      ['the wrong schema', (r) => { r.header.schema = 'kernel-receipt/9'; }],
    ];
    it.each(cases)('%s → REFUSE', async (_label, mutate) => {
      const input = callInput();
      const out = await kernelDecide(input, { fetch: fakeFetch(async () => json(200, await allowAnswer(input, mutate))) });
      expect(out.allowed).toBe(false);
      expect(out.allowed === false && out.reasons[0]?.code).toBe('allow_not_bound_to_request');
    });

    it('a receipt whose body was edited after it was hashed → REFUSE', async () => {
      const input = callInput();
      const answer: any = await allowAnswer(input);
      answer.receipt_preview.decision.limits.effective_per_tx_raw = '999999999'; // hash no longer matches
      const out = await kernelDecide(input, { fetch: fakeFetch(() => json(200, answer)) });
      expect(out.allowed).toBe(false);
      expect(out.allowed === false && out.reasons[0]?.detail).toMatch(/hash/);
    });

    it('an ALLOW with no receipt → REFUSE', async () => {
      const input = callInput();
      const answer: any = await allowAnswer(input);
      delete answer.receipt_preview;
      const out = await kernelDecide(input, { fetch: fakeFetch(() => json(200, answer)) });
      expect(out.allowed).toBe(false);
    });
  });

  describe('apiUrl is caller input: a string of many slashes is handled in bounded time', () => {
    // The old `.replace(/\/+$/, '')` took ~2.6 s at 80 000 slashes and grows with the square of the
    // length (CodeQL js/polynomial-redos); at 200 000 it would run for about sixteen seconds.
    const N = 200_000;

    it('many slashes NOT at the end (the pathological shape): left alone, and fast', async () => {
      const input = callInput();
      const f = fakeFetch(async () => json(200, await allowAnswer(input)));
      const apiUrl = 'https://engine.example.invalid' + '/'.repeat(N) + 'x';
      const t0 = Date.now();
      await kernelDecide(input, { fetch: f, apiUrl });
      expect(Date.now() - t0).toBeLessThan(1000);
      expect((f as jest.Mock).mock.calls[0]![0]).toBe(`${apiUrl}/api/v1/kernel/decide`);
    });

    it('many slashes AT the end: all of them are dropped, and fast', async () => {
      const input = callInput();
      const f = fakeFetch(async () => json(200, await allowAnswer(input)));
      const t0 = Date.now();
      await kernelDecide(input, { fetch: f, apiUrl: 'https://engine.example.invalid' + '/'.repeat(N) });
      expect(Date.now() - t0).toBeLessThan(1000);
      expect((f as jest.Mock).mock.calls[0]![0]).toBe('https://engine.example.invalid/api/v1/kernel/decide');
    });

    it('the ordinary cases are unchanged: none, one, several trailing slashes, and an all-slash url', async () => {
      const urls: Array<[string, string]> = [
        ['https://e.example.invalid', 'https://e.example.invalid'],
        ['https://e.example.invalid/', 'https://e.example.invalid'],
        ['https://e.example.invalid///', 'https://e.example.invalid'],
        ['https://e.example.invalid/base/', 'https://e.example.invalid/base'],
      ];
      for (const [given, want] of urls) {
        const f = fakeFetch(() => json(500, {}));
        await kernelDecide(callInput(), { fetch: f, apiUrl: given });
        expect((f as jest.Mock).mock.calls[0]![0]).toBe(`${want}/api/v1/kernel/decide`);
      }
      // An all-slash url is no URL at all. It used to be sent as a relative path; since SEC F10 it is
      // refused, and nothing is sent.
      const f = fakeFetch(() => json(500, {}));
      const out = await kernelDecide(callInput(), { fetch: f, apiUrl: '///' });
      expect(out.allowed).toBe(false);
      expect(f as jest.Mock).not.toHaveBeenCalled();
    });
  });

  describe('input the client will not forward', () => {
    it.each([
      ['a claim', { claim: 'x' }], ['a prompt', { prompt: 'x' }], ['a user_id', { user_id: 'u' }], ['a supplied counts_toward_band_restore', { counts_toward_band_restore: true }],
    ])('%s → refused locally; fetch is never called', async (_l, extra) => {
      const f = fakeFetch(() => json(200, {}));
      const out = await kernelDecide({ ...callInput(), ...extra } as KernelCallInput, { fetch: f });
      expect(out.allowed).toBe(false);
      expect(out.allowed === false && out.reasons[0]?.code).toBe('malformed_input');
      expect(f).not.toHaveBeenCalled();
    });

    it('needs args or args_hash, and an args_hash must be a hash', async () => {
      const f = fakeFetch(() => json(200, {}));
      const { args: _a, ...noArgs } = callInput();
      expect((await kernelDecide(noArgs as KernelCallInput, { fetch: f })).allowed).toBe(false);
      expect((await kernelDecide(callInput({ args_hash: 'trust me' }), { fetch: f })).allowed).toBe(false);
      expect(f).not.toHaveBeenCalled();
    });

    it('accepts a precomputed args_hash', async () => {
      const input = callInput({ args_hash: VECTOR_ARGS_HASH });
      delete (input as { args?: unknown }).args;
      const out = await kernelDecide(input, { fetch: fakeFetch(async () => json(200, await allowAnswer(input))) });
      expect(out.allowed).toBe(true);
    });
  });
});

describe('requireKernelAllow: a refusal is a throw', () => {
  it('throws KernelRefusedError carrying the outcome, status 403', async () => {
    const f = fakeFetch(() => json(200, { verdict: 'DENY', blocking: true, decision: { verdict: 'DENY' }, reasons: [{ code: 'spend_limit_zero', detail: 'x' }] }));
    await expect(requireKernelAllow(callInput(), { fetch: f })).rejects.toBeInstanceOf(KernelRefusedError);
    await expect(requireKernelAllow(callInput(), { fetch: f })).rejects.toMatchObject({ status: 403, code: 'KERNEL_REFUSED', message: expect.stringContaining('spend_limit_zero') });
  });

  it('returns the outcome on a clean ALLOW', async () => {
    const input = callInput();
    const out = await requireKernelAllow(input, { fetch: fakeFetch(async () => json(200, await allowAnswer(input))) });
    expect(out.allowed).toBe(true);
  });
});

// ── 3. the dogfood script ───────────────────────────────────────────────────────────────────────

const SCRIPT = join(ROOT, 'examples', 'kernel-buy', 'kernel-buy.mjs');

interface Stand { resource: Server; kernel: Server; resourceUrl: string; kernelUrl: string; resourceReqs: IncomingMessage[]; kernelBodies: string[]; }

function listen(handler: Parameters<typeof createServer>[1]): Promise<Server> {
  return new Promise((resolve) => { const s = createServer(handler); s.listen(0, '127.0.0.1', () => resolve(s)); });
}
const urlOf = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;

async function standIns(
  kernelAnswer: (body: any) => Promise<{ status: number; json: unknown }>,
  // Which field carries the price in the 402 the resource serves. Default is the
  // canonical engine/ecosystem field `amount` (repid-engine x402-server.ts, trustmarket
  // buy-intent); `maxAmountRequired` is the raw x402-spec field the script also tolerates.
  amountField: 'amount' | 'maxAmountRequired' = 'amount',
): Promise<Stand> {
  const resourceReqs: IncomingMessage[] = [];
  const kernelBodies: string[] = [];
  const resource = await listen((req, res) => {
    resourceReqs.push(req);
    res.writeHead(402, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ x402Version: 1, accepts: [{ scheme: 'exact', network: 'base-sepolia', [amountField]: '10000', payTo: PAYEE, asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' }] }));
  });
  const kernel = await listen((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      kernelBodies.push(raw);
      const a = await kernelAnswer(JSON.parse(raw));
      res.writeHead(a.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(a.json));
    });
  });
  return { resource, kernel, resourceUrl: urlOf(resource), kernelUrl: urlOf(kernel), resourceReqs, kernelBodies };
}

function runScript(env: Record<string, string>): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    // NODE_PATH: the SDK is built into a temp directory (the committed dist/ is left alone), and a CommonJS
    // require from there must still find this tree's ethers. Without it the client cannot hash, and refuses.
    const child = spawn(process.execPath, [SCRIPT], { env: { PATH: process.env.PATH ?? '', NODE_PATH: join(ROOT, 'node_modules'), ...env } as unknown as NodeJS.ProcessEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (out += c));
    child.on('close', (code) => resolve({ code, out }));
  });
}

describe('examples/kernel-buy/kernel-buy.mjs cannot buy anything', () => {
  let build: string;
  let home: string;
  let stand: Stand | null = null;
  const sdkEntry = () => `file://${join(build, 'lib', 'index.js')}`;

  beforeAll(() => {
    build = mkdtempSync(join(tmpdir(), 'kernel-buy-sdk-'));
    home = mkdtempSync(join(tmpdir(), 'kernel-buy-home-'));
    // The repo's dist/ is a committed build; do not touch it. Build this tree's SDK somewhere else.
    const r = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.sdk.json', '--outDir', build], { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`could not build the SDK for the script test: ${r.stdout}${r.stderr}`);
  }, 180_000);

  afterAll(() => {
    rmSync(build, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  afterEach(async () => {
    if (stand) await Promise.all([new Promise((r) => stand!.resource.close(r)), new Promise((r) => stand!.kernel.close(r))]);
    stand = null;
  });

  const baseEnv = (s: Stand, extra: Record<string, string> = {}) => ({
    TRUSTSHELL_SDK_ENTRY: sdkEntry(),
    TRUSTSHELL_HOME: home,
    TRUSTSHELL_KERNEL_RESOURCE_URL: `${s.resourceUrl}/paid`,
    TRUSTSHELL_BUYER_AGENT: AGENT,
    TRUSTSHELL_API_URL: s.kernelUrl,
    ...extra,
  });

  /** An ALLOW the kernel stand-in builds for whatever it is asked about. */
  const allowFor = async (body: any) => {
    const input: KernelCallInput = { agent: body.agent, tool: body.tool, origin: body.origin, args_hash: body.args_hash, amount_raw: body.amount_raw, payee: body.payee, asset: body.asset, chain_id: body.chain_id };
    return { status: 200, json: await allowAnswer(input) };
  };
  const denyFor = async () => ({ status: 200, json: { verdict: 'DENY', blocking: true, persisted: false, decision: { verdict: 'DENY' }, reasons: [{ code: 'spend_limit_zero', detail: 'the per-transaction spend limit is 0' }], receipt_preview: null } });

  it('with nothing set it does nothing, and says NOT_CHECKED (exit 2)', async () => {
    const r = await runScript({ TRUSTSHELL_SDK_ENTRY: 'file:///nonexistent/never-loaded.js' });
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/NOT_CHECKED/);
    expect(r.out).toMatch(/DRY RUN/);
  });

  it('kernel DENY → REFUSED (exit 3); the resource only ever saw a plain GET; the arguments were not sent', async () => {
    stand = await standIns(denyFor);
    const r = await runScript(baseEnv(stand));
    expect(r.code).toBe(3);
    expect(r.out).toMatch(/REFUSED by kernel: DENY \(spend_limit_zero\)/);
    expect(r.out).toMatch(/no key was read/);
    expect(stand.resourceReqs).toHaveLength(1);
    expect(stand.resourceReqs[0]!.headers['x-payment']).toBeUndefined();
    expect(stand.kernelBodies).toHaveLength(1);
    expect(stand.kernelBodies[0]).not.toContain('/paid'); // the resource URL went in as a hash, not as text
    expect(JSON.parse(stand.kernelBodies[0]!).args_hash).toMatch(/^0x[0-9a-f]{64}$/);
  }, 60_000);

  it('a kernel that cannot be reached → NOT_CHECKED (exit 2), refused by the client', async () => {
    stand = await standIns(denyFor);
    const r = await runScript(baseEnv(stand, { TRUSTSHELL_API_URL: 'http://127.0.0.1:1' }));
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/REFUSED by client: NOT_CHECKED \(network_error\)/);
  }, 60_000);

  it('kernel ALLOW, not armed → DRY RUN (exit 0): nothing signed, nothing sent, no key read', async () => {
    stand = await standIns(allowFor);
    const r = await runScript(baseEnv(stand));
    expect(r.code).toBe(0);
    // The resource serves the canonical engine wire body (price in `amount`). Reaching
    // ALLOW and echoing the amount proves the script read `amount`, not `maxAmountRequired`
    // (which would have been undefined and exited NOT_CHECKED before the kernel was asked).
    expect(r.out).toMatch(/requirement: 10000 raw units/);
    expect(r.out).toMatch(/kernel: ALLOW/);
    expect(r.out).toMatch(/DRY RUN: the kernel allowed this spend, and nothing was signed/);
    expect(r.out).not.toMatch(/signed \(/);
    expect(stand.resourceReqs.every((q) => q.headers['x-payment'] === undefined)).toBe(true);
  }, 60_000);

  it('still tolerates a spec-shaped 402 that carries the price in `maxAmountRequired`', async () => {
    stand = await standIns(allowFor, 'maxAmountRequired');
    const r = await runScript(baseEnv(stand));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/requirement: 10000 raw units/);
    expect(r.out).toMatch(/kernel: ALLOW/);
  }, 60_000);

  it.each(['1', 'true', 'yes', 'ARMED', 'yes-sign-a-real-payment ', ''])('arming needs the exact phrase: %p leaves it a dry run', async (value) => {
    stand = await standIns(allowFor);
    const r = await runScript(baseEnv(stand, { TRUSTSHELL_KERNEL_BUY_ARMED: value }));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/DRY RUN/);
  }, 60_000);

  it('armed with the phrase but no key: stops before signing (exit 2); the kernel was still asked first', async () => {
    stand = await standIns(allowFor);
    const r = await runScript(baseEnv(stand, { TRUSTSHELL_KERNEL_BUY_ARMED: 'yes-sign-a-real-payment' }));
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/TRUSTSHELL_PAYER_KEY is not set\. Nothing was signed/);
    expect(stand.kernelBodies).toHaveLength(1);
  }, 60_000);

  it('armed, but the kernel says DENY: refused before any key is read, whatever else is set', async () => {
    stand = await standIns(denyFor);
    const r = await runScript(baseEnv(stand, { TRUSTSHELL_KERNEL_BUY_ARMED: 'yes-sign-a-real-payment', TRUSTSHELL_PAYER_KEY: 'not-a-real-key-must-never-be-read', TRUSTSHELL_PAY_CAP: '1000000' }));
    expect(r.code).toBe(3);
    expect(r.out).toMatch(/Nothing was signed; no key was read/);
    expect(r.out).not.toContain('not-a-real-key-must-never-be-read');
  }, 60_000);

  it('the source names the three things a real buy needs, and never sends the signed header', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    expect(src).toMatch(/operator's explicit GO/);
    expect(src).toMatch(/funded Base Sepolia wallet/);
    expect(src).toMatch(/KEY-CUSTODY DECISION/);
    expect(src).toMatch(/guardedX402Payment\s*\(/);
    expect(src).toMatch(/writeReceipt/);
    expect(src).not.toMatch(/\bbuildX402Payment\s*\(/);
    expect(src).not.toMatch(/x-payment['"]?\s*:/i); // it never builds a header to send
  });
});

// ── 4. reading a receipt back: GET /api/v1/kernel/receipt/:id ─────────────────────────────────────

/** The engine's toSixClaimStatement shape, over receipt `r`. `over` breaks it in one chosen way. */
const sixClaimsFor = (r: any, over: Record<string, unknown> = {}) => ({
  _type: 'https://in-toto.io/Statement/v1',
  subject: [{ name: `kernel-receipt:${r.header.receipt_id}`, digest: { keccak256: r.header.receipt_hash.replace(/^0x/, '') } }],
  predicateType: 'https://hyperdag.dev/predicates/trust-receipt-six-claims/v1',
  predicate: {
    claims: Object.fromEntries(SIX_CLAIM_KEYS.map((k) => [k, { status: 'NOT_CHECKED', statement: `${k}.`, supports: [], gaps: [`${k} gap`] }])),
    what_this_does_not_establish: ['the tool is a closure the kernel does not see into'],
  },
  ...over,
});
const RID = VECTOR.header.receipt_id;
const readAnswer = (receipt: any = VECTOR, six: unknown = sixClaimsFor(receipt)) =>
  ({ receipt_id: receipt.header.receipt_id, receipt, entries: [{ receipt_hash: receipt.header.receipt_hash, executed: false, created_at: receipt.header.created_at }], six_claims: six });

describe('kernelReceipt: a receipt read back is shown only when it matches its own hash', () => {
  it('200 with the vector → ok, the six claims attached, sent as an authenticated GET to the receipt route', async () => {
    const f = fakeFetch(() => json(200, readAnswer()));
    const out = await kernelReceipt(RID, { fetch: f, apiKey: 'k', apiUrl: 'https://engine.invalid/' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.receipt.header.receipt_hash).toBe(VECTOR_HASH);
    expect(Object.keys(out.six_claims!.predicate.claims)).toEqual([...SIX_CLAIM_KEYS]);
    expect(out.six_claims_note).toBeNull();
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`https://engine.invalid/api/v1/kernel/receipt/${RID}`);
    expect(init.method).toBe('GET');
    expect(init.headers.authorization).toBe('Bearer k');
    expect(init.redirect).toBe('error');
  });

  it('a receipt edited after it was hashed → receipt_hash_mismatch (tampered), never ok', async () => {
    const edited = JSON.parse(JSON.stringify(VECTOR));
    edited.decision.verdict = 'ALLOW';
    const out = await kernelReceipt(RID, { fetch: fakeFetch(() => json(200, readAnswer(edited))) });
    expect(out).toMatchObject({ ok: false, reason: 'receipt_hash_mismatch' });
  });

  it('a different receipt than the one asked for → wrong_receipt', async () => {
    const out = await kernelReceipt('00000000-0000-4000-8000-0000000000ff', { fetch: fakeFetch(() => json(200, readAnswer())) });
    expect(out).toMatchObject({ ok: false, reason: 'wrong_receipt' });
  });

  it.each([
    ['absent (an engine from before the envelope shipped)', 'ABSENT', 'sent no six-claim envelope'],
    ['null', null, 'sent no six-claim envelope'],
    ['over a different hash', sixClaimsFor({ header: { ...VECTOR.header, receipt_hash: '0x' + 'ab'.repeat(32) } }), 'different hash'],
    ['naming a different receipt', sixClaimsFor({ header: { ...VECTOR.header, receipt_id: 'someone-elses-receipt' } }), 'different receipt'],
    ['missing a claim', (() => { const e: any = sixClaimsFor(VECTOR); delete e.predicate.claims.correctness; return e; })(), 'correctness claim is malformed'],
    ['with an unknown status', (() => { const e: any = sixClaimsFor(VECTOR); e.predicate.claims.integrity.status = 'PASS'; return e; })(), 'integrity claim is malformed'],
  ])('six claims %s → the receipt is still ok, the claims are null with a note, never a guess', async (_label, six, note) => {
    const { six_claims: _drop, ...withoutSix } = readAnswer();
    const body = six === 'ABSENT' ? withoutSix : readAnswer(VECTOR, six);
    const out = await kernelReceipt(RID, { fetch: fakeFetch(() => json(200, body)) });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.six_claims).toBeNull();
    expect(out.six_claims_note).toContain(note);
  });

  it.each([
    [401, 'REPID_API_KEY'],
    [403, 'different agent'],
    [404, 'no receipt with this id'],
    [503, 'answered 503'],
  ])('HTTP %i → not ok, and the detail says why', async (status, detail) => {
    const out = await kernelReceipt(RID, { fetch: fakeFetch(() => json(status, { error: 'x' })) });
    expect(out).toMatchObject({ ok: false, reason: `http_${status}`, http_status: status });
    if (!out.ok) expect(out.detail).toContain(detail);
  });

  it('a bad id is refused before any request; a network error and a non-JSON body are refusals, not throws', async () => {
    const f = fakeFetch(() => json(200, readAnswer()));
    expect(await kernelReceipt('../etc/passwd', { fetch: f })).toMatchObject({ ok: false, reason: 'bad_receipt_id' });
    expect(f).not.toHaveBeenCalled();
    expect(await kernelReceipt(RID, { fetch: jest.fn(async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch })).toMatchObject({ ok: false, reason: 'network_error' });
    expect(await kernelReceipt(RID, { fetch: fakeFetch(() => new Response('<html>', { status: 200 })) })).toMatchObject({ ok: false, reason: 'unreadable_response' });
  });

  it('the SDK and the app renderer list the same six claims in the same order', () => {
    expect([...SIX_CLAIM_KEYS]).toEqual([...APP_SIX_CLAIM_KEYS]);
  });
});
