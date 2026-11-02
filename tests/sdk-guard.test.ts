/**
 * Containment row C4: the SDK's own action functions consult the Guard policy.
 *
 * Before this, code importing @hyperdag/trustshell was bounded by nothing: the CLI (C1) and every MCP tool call
 * (C3) were decided against the owner policy, but `new TrustShell().verifyOutput(...)`, a signed x402 payment or
 * a quarantined memory write from the SDK ran whatever policy.json said. Now each SDK function that acts (sends
 * over the network, signs, posts, writes memory) is decided by guardDecide, the CLI's own decision and ledger,
 * with origin 'Sdk', from the policy in TRUSTSHELL_HOME re-read per call, BEFORE it acts.
 *
 * What this does NOT make true: code in the same process can skip the SDK (call fetch, sign, write files
 * itself). C4 is PARTIAL, not ENFORCED. A sandbox mission is the answer for code that is not trusted to use it.
 *
 * Every assertion is on the effect: no fetch made, no memory file written, no amount counted, no signature.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as sdk from '../src/lib/index';
import { TrustShell as CoreTrustShell } from '../src/lib/trustshell';
import { GUARD_RECEIPTS_FILE, POLICY_FILE, defaultPolicy, readLedger, renderPolicyDocument, type GuardRecord } from '../src/lib/guardrails';
import { runGuard } from '../src/cli/guard';
import { mcpGuard } from '../src/mcp/index';

// Disposable local-sign key only, the same one tests/x402-cap.test.ts uses: never a funded wallet, never logged.
const TEST_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111';
const TEST_TO = '0x0000000000000000000000000000000000000001';
const PAY = { privateKey: TEST_KEY, to: TEST_TO, cap: 1000, origin: 'Cli' as const };
const KERNEL_INPUT = { agent: { agent_id: 'agent-1', agent_name: 'a' }, tool: { name: 'x', class: 'read' as const }, origin: 'Cli', args: {} };

/** Every public TrustShell method that acts over the network, with arguments it accepts. */
const GATED_METHODS: Record<string, unknown[]> = {
  score: ['some text'],
  verify: ['agent-1'],
  verifyOutput: ['some text'],
  evaluate: ['some text'],
  getRepID: ['agent-1'],
  getIdentity: ['agent-1'],
  getLeaderboard: ['agents'],
  getFactCheckCount: [],
  getRepIDStake: ['agent-1'],
  presentProof: ['agent-1'],
  verifyProof: ['00', { agent_id: 'agent-1', repid_score: 1, threshold: 1, tier: 'x' }],
  audit: [],
  executeA2A: [{ serviceId: 'svc-1', buyerAgentId: 'agent-1', payload: {} }],
  register: [{ agentName: 'n' }],
  registerHuman: [],
  listServices: [],
  getService: ['svc-1'],
  getContractStatus: ['contract-1'],
  pollUntilSettled: ['contract-1', { intervalMs: 1, timeoutMs: 1 }],
};
/** Local only: a listener, and the caller's own readAllowance function. */
const UNGATED_METHODS = ['subscribe', 'getAllowance'];
const PRIVATE_METHODS = ['constructor', 'emit', 'getHeaders', 'readOnChain', 'verifyProofLocally', 'bindingProblem'];

const deniedError = { name: 'GuardDeniedError' };

describe('SDK action functions pass the Guard policy (C4)', () => {
  const prevEnv = { ...process.env };
  const realFetch = global.fetch;
  let root = '';
  let fetchCalls: string[] = [];
  const home = () => join(root, 'home');
  const memory = () => join(root, 'memory.sqlite');
  const ledgerText = () => (existsSync(join(home(), GUARD_RECEIPTS_FILE)) ? readFileSync(join(home(), GUARD_RECEIPTS_FILE), 'utf8') : '');
  const records = (): GuardRecord[] => ledgerText().trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as GuardRecord);
  const writePolicy = (actions: string[], over: Record<string, unknown> = {}) => {
    mkdirSync(home(), { recursive: true });
    writeFileSync(join(home(), POLICY_FILE), renderPolicyDocument({ policy: { ...defaultPolicy(), actions, ...over } as never, signature: null }));
  };
  const spentToday = () => String(readLedger(ledgerText()).spent?.today);
  const fetchSpy = jest.fn(async (url: unknown) => {
    fetchCalls.push(String(url));
    return new Response(JSON.stringify({ data: [], count: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ts-sdk-guard-'));
    process.env.TRUSTSHELL_HOME = home();
    process.env.TRUSTSHELL_MEMORY = memory();
    delete process.env.OFFLINE;
    delete process.env.TRUSTSHELL_LOCAL_ONLY;
    fetchCalls = [];
    fetchSpy.mockClear();
    global.fetch = fetchSpy as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
    process.env = { ...prevEnv };
    rmSync(root, { recursive: true, force: true });
  });

  it('a denied SDK call throws a typed error naming the rule and the action, sends nothing, and is recorded', async () => {
    writePolicy(['tool:ground']);
    const err = await new sdk.TrustShell().verifyOutput('a reply the policy does not let the SDK send').catch((e) => e);
    expect(err).toMatchObject({ name: 'GuardDeniedError', action: 'tool:verify' });
    expect(err.message).toMatch(/DENIED by the owner policy/);
    expect(err.message).toContain('does not list tool:verify');
    expect(fetchCalls).toEqual([]);
    const last = records().pop();
    expect(last).toMatchObject({ kind: 'decision', origin: 'Sdk', executed: 'not run', requested: { action: 'tool:verify', tool: 'verify' }, authorized: { decision: 'DENIED' } });
    expect(last?.assurance_scope.mediated.join(' ')).toContain('verifyOutput');
    expect(readLedger(ledgerText()).verdict).toBe('INTACT');
  });

  it('an allowed SDK call runs and its ALLOWED decision is recorded, once, even when it calls other methods inside', async () => {
    writePolicy(['tool:market', 'tool:evaluate']);
    const page = await new sdk.TrustShell().listServices();
    expect(page.services).toEqual([]);
    expect(fetchCalls).toHaveLength(1);
    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({ origin: 'Sdk', executed: null, requested: { action: 'tool:market' }, authorized: { decision: 'ALLOWED', reasons: [] } });

    // evaluate calls verifyOutput, which calls score: one public call, one decision (tool:verify is not listed).
    await new sdk.TrustShell().evaluate('some text').catch(() => null);
    expect(fetchCalls).toHaveLength(2);
    expect(records().map((r) => r.requested.action)).toEqual(['tool:market', 'tool:evaluate']);
  });

  it('the policy is re-read per call: guard kill stops the next call on the same client', async () => {
    writePolicy(['tool:market']);
    const client = new sdk.TrustShell();
    await client.listServices();
    expect(runGuard(['kill'], { out: () => {}, err: () => {} }, process.env)).toBe(0);
    await expect(client.listServices()).rejects.toMatchObject(deniedError);
    expect(fetchCalls).toHaveLength(1);
  });

  it('every TrustShell method is classified: gated, local, or private (a new one fails here until it is)', () => {
    const all = Object.getOwnPropertyNames(CoreTrustShell.prototype).sort();
    expect(all).toEqual([...Object.keys(GATED_METHODS), ...UNGATED_METHODS, ...PRIVATE_METHODS].sort());
  });

  describe('a killed policy denies every gated export, and none of them acts', () => {
    beforeEach(() => {
      writePolicy(['tool', 'spend', 'post'], { per_tx_raw: '1000', daily_raw: '1000', total_raw: '1000' });
      expect(runGuard(['kill'], { out: () => {}, err: () => {} }, process.env)).toBe(0);
    });
    const effectsNone = () => {
      expect(fetchCalls).toEqual([]);
      expect(existsSync(memory())).toBe(false);
      expect(spentToday()).toBe('0');
      expect(records().pop()).toMatchObject({ origin: 'Sdk', executed: 'not run', authorized: { decision: 'DENIED' } });
    };

    it.each(Object.entries(GATED_METHODS))('TrustShell.%s', async (method, args) => {
      const client = new sdk.TrustShell() as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
      await expect(client[method]!(...args)).rejects.toMatchObject(deniedError);
      effectsNone();
    });

    it('TrustShell.init with its /health probe', async () => {
      await expect(sdk.TrustShell.init()).rejects.toMatchObject(deniedError);
      effectsNone();
    });

    it('buildX402Payment and guardedX402Payment: no signature, nothing counted', async () => {
      await expect(sdk.buildX402Payment({ ...PAY, amount: 1 })).rejects.toMatchObject({ ...deniedError, action: 'spend' });
      effectsNone();
      const lines: string[] = [];
      await expect(sdk.guardedX402Payment({ ...PAY, amount: 1, agentId: 'agent-1', policy: { allow: true } }, { stream: { write: (s: string) => lines.push(s) } })).rejects.toMatchObject(deniedError);
      effectsNone();
    });

    it('kernelDecide and kernelReceipt keep their never-throw contract: a refusal with code guard_denied, nothing sent', async () => {
      const kfetch = jest.fn(async () => new Response('{}', { status: 200 }));
      const out = await sdk.kernelDecide(KERNEL_INPUT, { fetch: kfetch as unknown as typeof fetch });
      expect(out).toMatchObject({ allowed: false, verdict: 'NOT_CHECKED', source: 'client', reasons: [{ code: 'guard_denied' }] });
      const read = await sdk.kernelReceipt('receipt-0001', { fetch: kfetch as unknown as typeof fetch });
      expect(read).toMatchObject({ ok: false, reason: 'guard_denied' });
      await expect(sdk.requireKernelAllow(KERNEL_INPUT, { fetch: kfetch as unknown as typeof fetch })).rejects.toMatchObject(deniedError);
      expect(kfetch).not.toHaveBeenCalled();
      effectsNone();
    });

    it('verifySigner and onchainFeedbackClients read nothing', async () => {
      const fetchClients = jest.fn(async () => [] as string[]);
      await expect(sdk.verifySigner({ tokenId: '1', fetchClients })).rejects.toMatchObject(deniedError);
      expect(fetchClients).not.toHaveBeenCalled();
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timed out: the RPC read was attempted')), 3000).unref());
      await expect(Promise.race([sdk.onchainFeedbackClients('1', { rpcUrl: 'http://127.0.0.1:9' }), timeout])).rejects.toMatchObject(deniedError);
      effectsNone();
    });

    it('rememberUntrusted, releaseByGround and releaseByHal write no memory', async () => {
      expect(() => sdk.rememberUntrusted('a note', { source: 'test' })).toThrow(expect.objectContaining(deniedError));
      expect(() => sdk.releaseByGround(1, 'the source')).toThrow(expect.objectContaining(deniedError));
      await expect(sdk.releaseByHal(1)).rejects.toMatchObject(deniedError);
      effectsNone();
    });

    it('pure and local helpers are unaffected and record nothing', () => {
      const before = records().length;
      expect(sdk.groundQuote({ quote: 'The rent is 900 dollars.', page: null }, sdk.splitPages('The rent is 900 dollars.')).status).toBe('VERIFIED');
      expect(String(sdk.parsePaymentAmount('5'))).toBe('5');
      expect(sdk.assertPaymentCap({ amount: 5, cap: 10 })).toBe(true);
      expect(sdk.canPay('Cli')).toBe(true);
      expect(sdk.classifySigners([TEST_TO])[0]).toMatchObject({ address: TEST_TO });
      expect(sdk.hashProofBytes('00')).toMatch(/^[0-9a-f]{64}$/);
      const client = new sdk.TrustShell({ readAllowance: () => BigInt(7) });
      expect(typeof client.subscribe('verdict', () => {})).toBe('function');
      return client.getAllowance({ agentId: 'agent-1' }).then((a) => {
        expect(a.cap).toBe('7');
        expect(records()).toHaveLength(before);
        expect(fetchCalls).toEqual([]);
      });
    });
  });

  describe('spends go through the Guard spend limits (C8), not a second counter', () => {
    beforeEach(() => writePolicy(['spend'], { per_tx_raw: '100', daily_raw: '1000', total_raw: '1000' }));

    it('over per_tx is refused with the rule named; nothing signed, nothing counted', async () => {
      const err = await sdk.buildX402Payment({ ...PAY, amount: 500 }).catch((e) => e);
      expect(err).toMatchObject({ name: 'GuardDeniedError', action: 'spend' });
      expect(err.reasons.join(' ')).toContain('over per_tx_raw 100');
      expect(spentToday()).toBe('0');
    });

    it('within the limits it signs, and the amount is counted in the Guard ledger', async () => {
      const header = await sdk.buildX402Payment({ ...PAY, amount: 50 });
      expect(JSON.parse(Buffer.from(header, 'base64').toString('utf8')).value).toBe('50');
      expect(spentToday()).toBe('50');
      expect(records().pop()).toMatchObject({ origin: 'Sdk', requested: { action: 'spend', amount_raw: '50' }, authorized: { decision: 'ALLOWED' } });
    });
  });

  describe('the caller cannot pass an allow', () => {
    beforeEach(() => writePolicy(['tool:ground']));

    it('no TrustShell config option turns the gate off', async () => {
      const loose = { guard: false, allow: true, skipGuard: true, policy: { actions: ['tool'] }, trustshellHome: join(root, 'elsewhere') };
      await expect(new sdk.TrustShell(loose as never).listServices()).rejects.toMatchObject(deniedError);
      await expect(sdk.kernelDecide(KERNEL_INPUT, { allow: true, guard: false } as never)).resolves.toMatchObject({ allowed: false, reasons: [{ code: 'guard_denied' }] });
      expect(fetchCalls).toEqual([]);
    });

    it("guardedX402Payment's own SpendPolicy { allow: true } does not override a Guard policy that does not list spend", async () => {
      const lines: string[] = [];
      await expect(sdk.guardedX402Payment({ ...PAY, amount: 1, agentId: 'agent-1', policy: { allow: true } }, { stream: { write: (s: string) => lines.push(s) } })).rejects.toMatchObject(deniedError);
    });

    it('the package root exports no ungated twin of a gated function', () => {
      expect(sdk.TrustShell).not.toBe(CoreTrustShell);
      expect(sdk.default).toBe(sdk.TrustShell);
    });
  });

  describe('no policy: the same as the CLI and the MCP server (C9)', () => {
    it('allows, writes no record, and decides exactly as mcpGuard does', async () => {
      expect(existsSync(join(home(), POLICY_FILE))).toBe(false);
      expect(mcpGuard('ground_quote', process.env)).toBeNull();
      const page = await new sdk.TrustShell().listServices();
      expect(page.services).toEqual([]);
      expect(fetchCalls).toHaveLength(1);
      expect(records()).toEqual([]);
    });

    it('a TRUSTSHELL_HOME that hides the default policy warns on stderr, once per process, not once per call', async () => {
      const fakeHome = join(root, 'user');
      mkdirSync(join(fakeHome, '.trustshell'), { recursive: true });
      writeFileSync(join(fakeHome, '.trustshell', POLICY_FILE), renderPolicyDocument({ policy: defaultPolicy(), signature: null }));
      process.env.HOME = fakeHome;
      process.env.USERPROFILE = fakeHome;
      const writes: string[] = [];
      const spy = jest.spyOn(process.stderr, 'write').mockImplementation((s: string | Uint8Array) => (writes.push(String(s)), true));
      try {
        const client = new sdk.TrustShell();
        await client.listServices();
        await client.listServices();
        await client.getService('svc-1').catch(() => null);
      } finally {
        spy.mockRestore();
      }
      expect(fetchCalls).toHaveLength(3);
      expect(writes.filter((w) => /is NOT in force/.test(w))).toHaveLength(1);
      expect(records()).toEqual([]);
    });
  });
});
