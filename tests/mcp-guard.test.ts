/**
 * IS-P0-5, containment row C3: every trustshell-mcp tool call passes the Guard policy.
 *
 * Before this, the MCP server never read `policy.json`: an agent acting through MCP tools did what the CLI gate
 * refused (docs/guard-carry-demo.md showed it: an MCP `remember` stored a note while the policy denied
 * tool:remember). Now each call is decided by guardDecide, the CLI's own decision and ledger, from the policy on
 * disk in the server's TRUSTSHELL_HOME, before the tool runs, and re-read on every call.
 *
 * Calls go through a real MCP client over an in-memory transport where the protocol matters (a client sending its
 * own policy, home or allow flag), and through the registered handler otherwise.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as mcp from '../src/mcp/index';
import { TrustShell } from '../src/lib/trustshell';
import { GUARD_RECEIPTS_FILE, LOCAL_TOOLS, POLICY_FILE, defaultPolicy, isPolicyAction, readLedger, renderPolicyDocument, type GuardRecord } from '../src/lib/guardrails';
import { runGuard } from '../src/cli/guard';

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };
type Handler = (args: unknown, extra?: unknown) => Promise<ToolResult>;

const GROUND_ARGS = { source_text: 'The rent is 900 dollars.', quote: 'The rent is 900 dollars.' };

/** A client that must never be reached: every network tool is replaced by a throw. */
const offlineClient = new Proxy({} as TrustShell, {
  get: () => () => {
    throw new Error('the network client was called');
  },
});

describe('trustshell-mcp tool calls pass the Guard policy (C3)', () => {
  const prevEnv = { ...process.env };
  let root = '';
  const home = () => join(root, 'home');
  const records = (): GuardRecord[] => {
    const p = join(home(), GUARD_RECEIPTS_FILE);
    return existsSync(p) ? readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as GuardRecord) : [];
  };
  const writePolicy = (actions: string[], over: Record<string, unknown> = {}) => {
    mkdirSync(home(), { recursive: true });
    writeFileSync(join(home(), POLICY_FILE), renderPolicyDocument({ policy: { ...defaultPolicy(), actions, ...over } as never, signature: null }));
  };
  const server = () => mcp.createServer(offlineClient) as unknown as { _registeredTools: Record<string, { handler: Handler }> };
  const call = (s: ReturnType<typeof server>, name: string, args: unknown = {}) => s._registeredTools[name]!.handler(args, {});

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ts-mcp-guard-'));
    process.env.TRUSTSHELL_HOME = home();
    process.env.TRUSTSHELL_MEMORY = join(root, 'memory.sqlite');
    process.env.OFFLINE = '1';
  });
  afterEach(() => {
    process.env = { ...prevEnv };
    rmSync(root, { recursive: true, force: true });
  });

  it('a call the policy does not list is refused before it runs, names the rule, and is recorded in the CLI ledger', async () => {
    writePolicy(['tool:ground']);
    const r = await call(server(), 'remember', { text: 'a note over MCP while the policy denies tool:remember' });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/DENIED by the owner policy/);
    expect(r.content[0]!.text).toContain('does not list tool:remember');
    // Nothing ran: remember would have created the memory file.
    expect(existsSync(process.env.TRUSTSHELL_MEMORY as string)).toBe(false);
    const last = records().pop();
    expect(last).toMatchObject({ kind: 'decision', origin: 'Mcp', executed: 'not run', requested: { action: 'tool:remember', tool: 'remember' }, authorized: { decision: 'DENIED' } });
    expect(last?.assurance_scope.mediated.join(' ')).toContain('remember');
    expect(readLedger(readFileSync(join(home(), GUARD_RECEIPTS_FILE), 'utf8')).verdict).toBe('INTACT');
  });

  it('a call the policy lists still runs (the gate does not refuse everything), and its ALLOWED decision is recorded', async () => {
    writePolicy(['tool:ground']);
    const r = await call(server(), 'ground_quote', GROUND_ARGS);
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content[0]!.text).check.status).toBe('VERIFIED');
    expect(records().pop()).toMatchObject({ kind: 'decision', origin: 'Mcp', executed: null, requested: { action: 'tool:ground' }, authorized: { decision: 'ALLOWED', reasons: [] } });
  });

  it('`guard kill` refuses every tool afterwards', async () => {
    writePolicy(['tool']);
    const io = { out: () => {}, err: () => {} };
    expect(runGuard(['kill'], io, process.env)).toBe(0);
    const s = server();
    for (const name of ['ground_quote', 'recall', 'remember', 'quarantine_list']) {
      const r = await call(s, name, name === 'ground_quote' ? GROUND_ARGS : name === 'remember' ? { text: 'x' } : {});
      expect({ name, isError: r.isError, text: r.content[0]!.text }).toMatchObject({ name, isError: true, text: expect.stringMatching(/DENIED/) });
    }
  });

  it('`guard kill` takes effect on a server that is already running, with no restart', async () => {
    writePolicy(['tool:ground']);
    const s = server();
    expect((await call(s, 'ground_quote', GROUND_ARGS)).isError).toBeFalsy();
    expect(runGuard(['kill'], { out: () => {}, err: () => {} }, process.env)).toBe(0);
    const r = await call(s, 'ground_quote', GROUND_ARGS);
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain('does not list tool:ground');
  });

  it.each([
    ['does not parse', () => writeFileSync(join(home(), POLICY_FILE), '{ "policy": { "actions": ["tool"] ')],
    ['has a field the policy language does not have (a tampered file)', () => writePolicy(['tool:ground'], { allow_all: true })],
    ['has expired', () => writePolicy(['tool:ground'], { expires_at: 1000 })],
    ['cannot be read (a directory where the file should be)', () => mkdirSync(join(home(), POLICY_FILE), { recursive: true })],
  ])('a policy that %s refuses (fail closed)', async (_why, make) => {
    mkdirSync(home(), { recursive: true });
    make();
    const r = await call(server(), 'ground_quote', GROUND_ARGS);
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/DENIED/);
  });

  it('no policy at all: the call runs, as the CLI gate does (C9), and nothing is recorded', async () => {
    const r = await call(server(), 'ground_quote', GROUND_ARGS);
    expect(r.isError).toBeFalsy();
    expect(existsSync(join(home(), GUARD_RECEIPTS_FILE))).toBe(false);
  });

  it('TRUSTSHELL_HOME with no policy while the default home has one: the call runs, and stderr says that policy is NOT in force (C9)', async () => {
    const user = join(root, 'user');
    mkdirSync(join(user, '.trustshell'), { recursive: true });
    writeFileSync(join(user, '.trustshell', POLICY_FILE), renderPolicyDocument({ policy: { ...defaultPolicy(), actions: [] }, signature: null }));
    // Jest's process.env is a copy the OS never sees, so the home directory is stubbed, not set.
    const home = jest.spyOn(require('node:os') as typeof import('node:os'), 'homedir').mockReturnValue(user);
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const r = await call(server(), 'ground_quote', GROUND_ARGS);
      expect(r.isError).toBeFalsy();
      expect(spy.mock.calls.map((c) => String(c[0])).join('')).toMatch(/trustshell-mcp: WARNING: TRUSTSHELL_HOME=.* has no policy, so the owner policy at .* is NOT in force/);
    } finally {
      spy.mockRestore();
      home.mockRestore();
    }
  });

  it('over the MCP protocol, a client cannot send its own policy, home or allow flag', async () => {
    writePolicy(['tool:recall']);
    // A permissive policy the client points at: never read.
    const elsewhere = join(root, 'elsewhere');
    mkdirSync(elsewhere, { recursive: true });
    writeFileSync(join(elsewhere, POLICY_FILE), renderPolicyDocument({ policy: { ...defaultPolicy(), actions: ['tool'] }, signature: null }));
    const [a, b] = InMemoryTransport.createLinkedPair();
    const s = mcp.createServer(offlineClient);
    await s.connect(a);
    const client = new Client({ name: 'mcp-guard-test', version: '1' });
    await client.connect(b);
    try {
      const r = (await client.callTool({
        name: 'ground_quote',
        arguments: { ...GROUND_ARGS, policy: { actions: ['tool'] }, TRUSTSHELL_HOME: elsewhere, home: elsewhere, allow: true, decision: 'ALLOWED' },
      })) as ToolResult;
      expect(r.isError).toBe(true);
      expect(r.content[0]!.text).toContain('does not list tool:ground');
      expect(existsSync(join(elsewhere, GUARD_RECEIPTS_FILE))).toBe(false);
      // And the call the policy does list goes through the same path.
      const ok = (await client.callTool({ name: 'recall', arguments: {} })) as ToolResult;
      expect(ok.isError).toBeFalsy();
    } finally {
      await client.close();
      await s.close();
    }
  });

  it('every registered tool has exactly one entry in the tool-to-action map, and each is a valid policy action', () => {
    const map = (mcp as unknown as { MCP_GUARD_TOOLS?: Record<string, string> }).MCP_GUARD_TOOLS;
    expect(map).toBeDefined();
    const names = Object.keys(server()._registeredTools).sort();
    expect(Object.keys(map ?? {}).sort()).toEqual(names);
    for (const [name, tool] of Object.entries(map ?? {})) expect({ name, ok: isPolicyAction(`tool:${tool}`) }).toEqual({ name, ok: true });
  });

  it('under the policy `guard init` writes, MCP allows exactly the tools that map to its local commands', async () => {
    expect(runGuard(['init'], { out: () => {}, err: () => {} }, process.env)).toBe(0);
    const map = (mcp as unknown as { MCP_GUARD_TOOLS?: Record<string, string> }).MCP_GUARD_TOOLS ?? {};
    const local = Object.keys(map).filter((n) => (LOCAL_TOOLS as readonly string[]).includes(map[n] as string));
    expect(local.sort()).toEqual(['ground_quote', 'learn_lessons_for', 'learn_record', 'quarantine_explain', 'quarantine_list', 'recall', 'remember']);
    const s = server();
    // A network tool is refused before the (throwing) network client is reached.
    const r = await call(s, 'get_repid', { agentId: 'x' });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain('does not list tool:repid');
    expect((await call(s, 'ground_quote', GROUND_ARGS)).isError).toBeFalsy();
  });
});
