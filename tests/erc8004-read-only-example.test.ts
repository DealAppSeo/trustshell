/**
 * examples/erc8004-read-only: runs OFFLINE. The chain, the hosts and the hosted check are stubs (see
 * tests/erc8004-read-only-driver.mjs: one child process, ~30 scenarios, no socket); the real CLI is spawned a few
 * times against a loopback server with a preload that rejects any fetch to a host other than 127.0.0.1.
 *
 * What would make this fail: the example writing anything (a send method, a key, a selector other than the three
 * reads); a NOT_CHECKED turning into exit 0; a hostile tokenURI (file:, 169.254, 10.x, localhost, ::1, plain http,
 * a redirect into a private address, more than 3 redirects, an oversized body) being fetched; a registration file
 * that points at another agent passing; the hosted check receiving text under --no-check, OFFLINE=1 or a mismatched file.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

jest.setTimeout(180000);

const ROOT = join(__dirname, '..');
const DIR = join(ROOT, 'examples', 'erc8004-read-only');
const LIB = join(DIR, 'erc8004-read.mjs');
const CLI = join(DIR, 'read-agent.mjs');
const DRIVER = join(__dirname, 'erc8004-read-only-driver.mjs');

type Scenario = {
  name: string;
  exit: number;
  report: any;
  text: string;
  fetched: string[];
  rpcMethods: string[];
  callSelectors: string[];
  classifyBodies: { text: string }[];
};

function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const k of ['OFFLINE', 'TRUSTSHELL_LOCAL_ONLY', 'TRUSTSHELL_API_URL']) if (!(k in extra)) delete env[k];
  return env;
}

describe('the example source', () => {
  const src = readFileSync(LIB, 'utf8') + readFileSync(CLI, 'utf8');
  it('has no write path: no send method, no signer, no key', () => {
    for (const bad of [/eth_sendRawTransaction/, /eth_sendTransaction/, /eth_sign/, /personal_sign/, /privateKey/i, /\bWallet\b/, /\bsigner\b/i, /\bPRIVATE_KEY\b/]) {
      expect(src).not.toMatch(bad);
    }
  });
  it('the three selectors are the ones ethers computes', () => {
    const { Interface } = require('ethers');
    const i = new Interface(['function ownerOf(uint256)', 'function tokenURI(uint256)', 'function getAgentWallet(uint256)']);
    const text = readFileSync(LIB, 'utf8');
    const m = /export const SEL = \{([^}]*)\}/.exec(text)!;
    const got = Object.fromEntries([...m[1]!.matchAll(/(\w+):\s*'(0x[0-9a-f]{8})'/g)].map((x) => [x[1], x[2]]));
    expect(got).toEqual({
      ownerOf: i.getFunction('ownerOf').selector,
      tokenURI: i.getFunction('tokenURI').selector,
      getAgentWallet: i.getFunction('getAgentWallet').selector,
    });
  });
  it('the registry address is the canonical Base Sepolia one the repo already uses', () => {
    const { IDENTITY_REGISTRY_BASE_SEPOLIA } = require('../src/lib/identity');
    expect(readFileSync(LIB, 'utf8')).toContain(IDENTITY_REGISTRY_BASE_SEPOLIA);
  });
});

describe('every branch, stubbed chain and hosts', () => {
  let all: Scenario[] = [];
  const by = (name: string): Scenario => {
    const s = all.find((x) => x.name === name);
    if (!s) throw new Error(`no scenario "${name}"`);
    return s;
  };
  const hosts = (s: Scenario) => s.fetched.map((u) => u.replace(/^(\w+:\/\/[^/]+).*/, '$1'));

  beforeAll(() => {
    const r = spawnSync(process.execPath, [DRIVER], { env: cleanEnv({ LIB_URL: pathToFileURL(LIB).href }), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`driver failed (${r.status}): ${r.stderr}`);
    all = JSON.parse(r.stdout);
  });

  it('ran every scenario', () => {
    expect(all.length).toBeGreaterThanOrEqual(30);
  });

  it('reads only: three RPC methods, three selectors, and only stubbed hosts', () => {
    const methods = new Set(all.flatMap((s) => s.rpcMethods));
    expect([...methods].sort()).toEqual(['eth_call', 'eth_chainId', 'eth_getCode']);
    const sels = new Set(all.flatMap((s) => s.callSelectors));
    for (const s of sels) expect(['0x6352211e', '0xc87b56dd', '0x00339509']).toContain(s);
    for (const s of all) for (const h of hosts(s)) expect(['https://rpc.example', 'https://agents.example', 'https://hosted-check.test']).toContain(h);
  });

  it('every printed report says what it did not do', () => {
    for (const s of all.filter((x) => x.exit !== 3)) {
      expect(s.text).toContain('not done:');
      expect(s.text).toContain('This script cannot write');
      expect(s.text).toContain('No reputation was read');
    }
  });

  it('a clean agent passes: exit 0, one sentence sent, and it is the description', () => {
    const s = by('happy: 6705 passes every check');
    expect(s.exit).toBe(0);
    expect(s.report.owner.state).toBe('OWNER_FOUND');
    expect(s.report.backReference.state).toBe('MATCH');
    expect(s.report.claim.result.label).toBe('pass');
    expect(s.classifyBodies).toHaveLength(1);
    expect(s.classifyBodies[0]!.text).toBe('A test agent that answers questions about tide tables.');
    expect(s.text).toContain('OWNER_FOUND');
    expect(s.text).toContain('asked: qwen, gpt-oss');
  });

  it('--claim sends the caller\'s sentence, not the file\'s', () => {
    const s = by('happy: --claim overrides the file text');
    expect(s.exit).toBe(0);
    expect(s.classifyBodies.map((b) => b.text)).toEqual(['Tide tables are published yearly.']);
    expect(s.report.claim.source).toBe('--claim');
  });

  it('follows one redirect and a data: URI needs no host at all', () => {
    expect(by('happy: one redirect is followed').exit).toBe(0);
    expect(by('happy: one redirect is followed').fetched).toContain('https://agents.example/6706.json');
    const d = by('happy: data: URI needs no host');
    expect(d.exit).toBe(0);
    expect(d.report.registration.from).toBe('data: URI');
    // compare parsed hostnames, not a string prefix of a URL (a prefix test is how a host check gets bypassed)
    expect(d.fetched.filter((u) => new URL(u).hostname === 'agents.example')).toEqual([]);
  });

  it('NOT_CHECKED is never exit 0: --no-check and OFFLINE=1 send nothing and exit 2', () => {
    for (const n of ['--no-check sends nothing', 'OFFLINE=1 sends nothing to the check']) {
      const s = by(n);
      expect(s.exit).toBe(2);
      expect(s.classifyBodies).toEqual([]);
      expect(s.fetched).not.toContain('https://hosted-check.test/api/v1/classify');
      expect(s.report.claim.result.label).toBe('not-checked');
    }
  });

  it('a wrong chain stops after eth_chainId: nothing else was read', () => {
    const s = by('wrong chain stops before any other read');
    expect(s.exit).toBe(1);
    expect(s.rpcMethods).toEqual(['eth_chainId']);
    expect(s.report.chain.state).toBe('FAIL');
  });

  it('no code at the registry address fails and asks the chain nothing about the agent', () => {
    const s = by('no contract at the registry address');
    expect(s.exit).toBe(1);
    expect(s.callSelectors).toEqual([]);
  });

  it('an id never minted is a failure, and tokenURI is never asked for', () => {
    const s = by('id never minted: NO_TOKEN');
    expect(s.exit).toBe(1);
    expect(s.report.owner.state).toBe('NO_TOKEN');
    expect(s.callSelectors).toEqual(['0x6352211e']);
  });

  it('other reverts, a zero owner and a reverting tokenURI are stated, not guessed', () => {
    expect(by('ownerOf reverts with some other error').report.owner.state).toBe('REVERTED');
    expect(by('ownerOf reverts with some other error').exit).toBe(1);
    expect(by('zero owner is not an owner').report.owner.state).toBe('NOT_CHECKED');
    expect(by('zero owner is not an owner').exit).toBe(2);
    const t = by('tokenURI reverts');
    expect(t.report.agentURI.state).toBe('NOT_CHECKED');
    expect(t.report.registration).toBeUndefined();
    expect(t.exit).toBe(2);
  });

  it('a file that points at ANOTHER agent fails, and its text is not sent to the hosted check', () => {
    const s = by('file points back to ANOTHER agent');
    expect(s.exit).toBe(1);
    expect(s.report.backReference.state).toBe('MISMATCH');
    expect(s.classifyBodies).toEqual([]);
  });

  it('a file of the wrong type fails the shape check; not JSON fails', () => {
    const s = by('file has the wrong type');
    expect(s.exit).toBe(1);
    expect(s.report.shape.find((r: any) => r.field === 'type').state).toBe('FAIL');
    expect(by('not JSON').exit).toBe(1);
  });

  it.each([
    ['ipfs:// without a gateway', /gateway/, 'ipfs://'],
    ['file: URI refused', /not https/, 'file:'],
    ['link-local 169.254 refused', /private or local/, '169.254'],
    ['10.x refused', /private or local/, '10.0.0.5'],
    ['localhost refused by default', /private or local/, 'localhost'],
    ['ipv6 loopback refused', /private or local/, '[::1]'],
    ['plain http refused', /not https/, '7009'],
    ['oversized file refused', /larger than/, null],
    ['more than 3 redirects refused', /redirects/, null],
    ['public host redirecting to a private one is refused at the hop', /redirect target private or local/, '169.254'],
  ])('%s: NOT_CHECKED, exit 2, never fetched', (name, why, mustNotFetch) => {
    const s = by(name);
    expect(s.exit).toBe(2);
    expect(s.report.registration.state).toBe('NOT_CHECKED');
    expect(s.report.registration.reason).toMatch(why);
    if (mustNotFetch) for (const u of s.fetched) expect(u).not.toContain(mustNotFetch);
  });

  it('every other way to spell a private address is refused before any fetch', () => {
    const forms = all.filter((x) => x.name.startsWith('private form refused'));
    expect(forms.length).toBeGreaterThanOrEqual(12);
    for (const s of forms) {
      expect([s.name, s.exit]).toEqual([s.name, 2]);
      expect([s.name, s.report.registration.state]).toEqual([s.name, 'NOT_CHECKED']);
      expect([s.name, s.report.registration.reason]).toEqual([s.name, expect.stringMatching(/private or local/)]);
      // the only thing fetched is the RPC; the hostile URI never was
      expect(s.fetched.every((u) => u === 'https://rpc.example/')).toBe(true);
    }
  });

  it('the hosted check can only help: veto exits 1, garbage and an outage are not-checked and exit 2', () => {
    expect(by('the hosted check says veto').exit).toBe(1);
    expect(by('the hosted check says veto').report.claim.result.label).toBe('veto');
    for (const n of ['the hosted check answers out of contract', 'the hosted check is down (HTTP 500)']) {
      expect(by(n).report.claim.result.label).toBe('not-checked');
      expect(by(n).exit).toBe(2);
    }
  });

  it('an unreachable RPC is NOT_CHECKED, exit 2', () => {
    const s = by('rpc unreachable');
    expect(s.exit).toBe(2);
    expect(s.report.chain.state).toBe('NOT_CHECKED');
  });

  it('bad usage exits 3 and reads nothing', () => {
    for (const n of ['usage: no id', 'usage: bad id', 'usage: unknown option', 'usage: rpc must be https unless local']) {
      const s = by(n);
      expect(s.exit).toBe(3);
      expect(s.fetched).toEqual([]);
    }
  });
});

describe('the real CLI against a loopback server (any other host rejects)', () => {
  let server: ReturnType<typeof createServer>;
  let port = 0;
  const seen: { method: string; url: string; body: string }[] = [];
  let preload = '';

  const word = (n: number) => BigInt(n).toString(16).padStart(64, '0');
  const REG = '0x8004A818BFB912233c491871b3d84c89A494BD9e';

  beforeAll(async () => {
    preload = join(mkdtempSync(join(tmpdir(), 'erc8004-example-')), 'only-loopback.cjs');
    writeFileSync(preload, [
      'const real = globalThis.fetch;',
      "globalThis.fetch = (u, o) => { const h = new URL(typeof u === 'string' ? u : u.url).hostname; if (h !== '127.0.0.1') return Promise.reject(new Error('OFFLINE TEST blocked ' + h)); return real(u, o); };",
    ].join('\n'));
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        seen.push({ method: req.method ?? '', url: req.url ?? '', body });
        const send = (code: number, o: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(typeof o === 'string' ? o : JSON.stringify(o)); };
        if (req.url === '/agent.json') {
          return send(200, {
            type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1', name: 'loopback', description: 'The loopback test agent answers tide questions.',
            image: 'https://x.example/i.png', services: [], x402Support: false, active: true,
            registrations: [{ agentId: 6705, agentRegistry: `eip155:84532:${REG}` }],
          });
        }
        if (req.url === '/api/v1/classify') return send(200, { label: 'pass', latency_ms: 2, by: 'votes', voters: ['a', 'b'], deciders: ['a', 'b'] });
        const rpc = JSON.parse(body || '{}');
        const ok = (result: string) => send(200, { jsonrpc: '2.0', id: rpc.id, result });
        if (rpc.method === 'eth_chainId') return ok('0x14a34');
        if (rpc.method === 'eth_getCode') return ok('0x' + '60'.repeat(65));
        if (rpc.method === 'eth_call') {
          const data: string = rpc.params[0].data;
          if (data.startsWith('0x6352211e') || data.startsWith('0x00339509')) return ok('0x' + word(0).slice(0, 24) + 'f6ee1768868c3266868edca78bc41c50309cb22a');
          if (data.startsWith('0xc87b56dd')) {
            const uri = Buffer.from(`http://127.0.0.1:${port}/agent.json`, 'utf8');
            return ok('0x' + word(32) + word(uri.length) + uri.toString('hex').padEnd(Math.ceil(uri.length / 32) * 64, '0'));
          }
        }
        return send(200, { jsonrpc: '2.0', id: rpc.id, error: { code: 3, message: 'execution reverted' } });
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as { port: number }).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const cli = (args: string[], env: Record<string, string> = {}) =>
    new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
      const p = spawn(process.execPath, ['--require', preload, CLI, ...args], { env: cleanEnv(env) });
      let out = '', err = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (err += d));
      p.on('close', (code) => resolve({ code, out, err }));
    });

  it('agent 6705 end to end through the CLI: exit 0, --json parses, one classify request, no write method', async () => {
    const r = await cli(['6705', '--rpc', `http://127.0.0.1:${port}/`, '--allow-local-uri', '--json'], { TRUSTSHELL_API_URL: `http://127.0.0.1:${port}` });
    // The SDK warns on stderr when TRUSTSHELL_API_URL is not its default; that line is the only one allowed.
    expect(r.err.replace(/WARNING: TrustShell is using the backend[^\n]*\n?/, '')).toBe('');
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j.exit).toBe(0);
    expect(j.readOnly).toBe(true);
    expect(j.owner.address).toBe('0xf6ee1768868c3266868edca78bc41c50309cb22a');
    expect(j.claim.result.label).toBe('pass');
    const classify = seen.filter((s) => s.url === '/api/v1/classify');
    expect(classify).toHaveLength(1);
    expect(JSON.parse(classify[0]!.body).text).toBe('The loopback test agent answers tide questions.');
    for (const s of seen.filter((x) => x.url === '/' || x.url === '')) expect(['eth_chainId', 'eth_getCode', 'eth_call']).toContain(JSON.parse(s.body).method);
  });

  it('without --allow-local-uri the same agent is NOT_CHECKED (a local tokenURI is not fetched by default)', async () => {
    const before = seen.filter((s) => s.url === '/agent.json').length;
    const r = await cli(['6705', '--rpc', `http://127.0.0.1:${port}/`, '--no-check']);
    expect(r.code).toBe(2);
    expect(r.out).toContain('private or local address');
    expect(seen.filter((s) => s.url === '/agent.json').length).toBe(before);
  });

  it('bad usage: exit 3 and the usage line on stderr', async () => {
    const r = await cli(['abc']);
    expect(r.code).toBe(3);
    expect(r.err).toContain('usage error');
  });

  it('an RPC that is down: exit 2, never a pass', async () => {
    const r = await cli(['6705', '--rpc', 'http://127.0.0.1:9/', '--no-check']);
    expect(r.code).toBe(2);
    expect(r.out).toContain('NOT_CHECKED');
  });
});
