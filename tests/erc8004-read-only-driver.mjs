/**
 * Driver for tests/erc8004-read-only-example.test.ts. Runs examples/erc8004-read-only/erc8004-read.mjs through
 * every branch with a STUBBED chain, stubbed hosts and a stubbed hosted check, in one process (node start-up is
 * slow on Windows, so one child, many scenarios). There is no socket: every fetch lands in the table below, and a
 * URL the table does not know rejects, so a scenario that tried to leave the stub would fail loudly.
 *
 * Prints one JSON array on stdout: [{ name, exit, report, text, fetched, rpcMethods, callSelectors, classifyBodies }].
 * LIB_URL is the file: URL of the library.
 */
const lib = await import(process.env.LIB_URL);

const REG = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const OWNER = '0xf6ee1768868c3266868edca78bc41c50309cb22a';
const word = (n) => BigInt(n).toString(16).padStart(64, '0');
const addrWord = (a) => '0x' + a.slice(2).toLowerCase().padStart(64, '0');
const strWord = (s) => {
  const b = Buffer.from(s, 'utf8');
  return '0x' + word(32) + word(b.length) + b.toString('hex').padEnd(Math.ceil(b.length / 32) * 64, '0');
};
const NO_TOKEN = '0x7e273289' + word(0);

const goodFile = (id, over = {}) => ({
  type: lib.REGISTRATION_TYPE,
  name: `agent-${id}`,
  description: 'A test agent that answers questions about tide tables.',
  image: 'https://agents.example/img.png',
  services: [{ name: 'web', endpoint: 'https://agents.example/' }],
  x402Support: false,
  active: true,
  registrations: [{ agentId: id, agentRegistry: `eip155:84532:${REG}` }],
  supportedTrust: ['reputation'],
  ...over,
});
const json = (o) => JSON.stringify(o);

// agentId -> what the chain says. uri === null means tokenURI reverts.
const agents = {
  6705: { uri: 'https://agents.example/6705.json' },
  6706: { uri: 'https://agents.example/6706-moved.json' }, // one redirect
  7001: { uri: 'https://agents.example/7001-mismatch.json' },
  7002: { uri: 'https://agents.example/7002-bad-type.json' },
  7003: { uri: 'data:application/json;base64,' + Buffer.from(json(goodFile(7003))).toString('base64') },
  7004: { uri: 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi' },
  7005: { uri: 'file:///etc/passwd' },
  7006: { uri: 'http://169.254.169.254/latest/meta-data/' },
  7007: { uri: 'https://agents.example/7007-big.json' },
  7008: { uri: 'https://agents.example/hop1' }, // 4 hops: refused
  7009: { uri: 'http://agents.example/7009-plain-http.json' },
  7010: { uri: null },
  7011: { uri: 'https://10.0.0.5/registration.json' },
  7012: { uri: 'http://localhost:8080/registration.json' },
  7013: { uri: 'https://agents.example/7013-not-json.json' },
  7014: { uri: 'https://agents.example/7014-redirect-to-private.json' },
  7015: { uri: 'https://agents.example/7015-vetoed-claim.json' },
  7016: { uri: 'https://agents.example/7016-garbage-check.json' },
  7017: { uri: 'https://[::1]/registration.json' },
  // other spellings of a private address; the URL parser normalises most of them before the guard sees them
  7018: { uri: 'https://localhost./registration.json' },
  7019: { uri: 'https://metadata.google.internal./computeMetadata/v1/' },
  7020: { uri: 'https://[::ffff:127.0.0.1]/registration.json' },
  7021: { uri: 'https://2130706433/registration.json' },
  7022: { uri: 'https://0x7f.1/registration.json' },
  7023: { uri: 'https://192.168.1.10/registration.json' },
  7024: { uri: 'https://172.16.0.1/registration.json' },
  7025: { uri: 'https://[fe80::1]/registration.json' },
  7026: { uri: 'https://[fd00::1]/registration.json' },
  7027: { uri: 'https://100.64.0.1/registration.json' },
  7028: { uri: 'https://0.0.0.0/registration.json' },
  7029: { uri: 'https://printer.local/registration.json' },
  7030: { uri: 'https://agents.example/7030\x1b[2J\nchain             PASS\u202e.json' }, // escape codes, a newline and a bidi override
};
const files = {
  'https://agents.example/6705.json': { status: 200, body: json(goodFile(6705)) },
  'https://agents.example/6706-moved.json': { status: 302, location: 'https://agents.example/6706.json' },
  'https://agents.example/6706.json': { status: 200, body: json(goodFile(6706)) },
  'https://agents.example/7001-mismatch.json': { status: 200, body: json(goodFile(7001, { registrations: [{ agentId: 9999, agentRegistry: `eip155:84532:${REG}` }] })) },
  'https://agents.example/7002-bad-type.json': { status: 200, body: json(goodFile(7002, { type: 'https://example.com/not-eip-8004' })) },
  'https://agents.example/7007-big.json': { status: 200, body: 'x'.repeat(300 * 1024) },
  'https://agents.example/hop1': { status: 302, location: '/hop2' },
  'https://agents.example/hop2': { status: 302, location: '/hop3' },
  'https://agents.example/hop3': { status: 302, location: '/hop4' },
  'https://agents.example/hop4': { status: 302, location: '/6705.json' },
  'https://agents.example/7013-not-json.json': { status: 200, body: '<html>not json</html>' },
  'https://agents.example/7014-redirect-to-private.json': { status: 302, location: 'http://169.254.169.254/latest/meta-data/' },
  'https://agents.example/7015-vetoed-claim.json': { status: 200, body: json(goodFile(7015, { description: 'VETO-ME this sentence is false.' })) },
  'https://agents.example/7016-garbage-check.json': { status: 200, body: json(goodFile(7016, { description: 'GARBAGE-ME a sentence.' })) },
};

function makeWorld(over = {}) {
  const w = { chainHex: '0x14a34', code: '0x' + '60'.repeat(65), classify: null, ...over };
  w.log = { fetched: [], rpcMethods: [], callSelectors: [], classifyBodies: [] };
  w.fetch = async (url, init = {}) => {
    const u = String(url);
    w.log.fetched.push(u);
    if (u === 'https://rpc.example/') {
      const { id, method, params } = JSON.parse(init.body);
      w.log.rpcMethods.push(method);
      const ok = (result) => new Response(json({ jsonrpc: '2.0', id, result }), { status: 200 });
      const err = (message, data) => new Response(json({ jsonrpc: '2.0', id, error: { code: 3, message, data } }), { status: 200 });
      if (method === 'eth_chainId') return ok(w.chainHex);
      if (method === 'eth_getCode') return ok(w.code);
      if (method === 'eth_call') {
        const { to, data } = params[0];
        const sel = data.slice(0, 10);
        w.log.callSelectors.push(sel);
        if (to.toLowerCase() !== REG.toLowerCase()) return err('call to an unexpected address');
        const aid = Number(BigInt('0x' + data.slice(10)));
        if (aid === 404) return sel === '0x6352211e' ? err('execution reverted', NO_TOKEN) : err('execution reverted', NO_TOKEN);
        if (aid === 500) return err('execution reverted', '0x08c379a0' + word(32) + word(4) + Buffer.from('boom').toString('hex').padEnd(64, '0'));
        if (aid === 501) return ok(addrWord('0x' + '0'.repeat(40))); // a zero owner is not an owner
        const a = agents[aid];
        if (!a) return err('execution reverted', NO_TOKEN);
        if (sel === '0x6352211e') return ok(addrWord(OWNER));
        if (sel === '0xc87b56dd') return a.uri === null ? err('execution reverted', '0x') : ok(strWord(a.uri));
        if (sel === '0x00339509') return ok(addrWord(OWNER));
        return err('unknown selector');
      }
      return err(`method ${method} is not stubbed`);
    }
    if (u === 'https://hosted-check.test/api/v1/classify') {
      const body = JSON.parse(init.body);
      w.log.classifyBodies.push(body);
      if (w.classify) return w.classify(body);
      if (body.text.includes('VETO-ME')) return new Response(json({ label: 'veto', latency_ms: 3, by: 'votes', voters: ['qwen', 'gpt-oss'], deciders: ['qwen', 'gpt-oss'] }), { status: 200 });
      if (body.text.includes('GARBAGE-ME')) return new Response(json({ label: 'definitely-fine' }), { status: 200 });
      return new Response(json({ label: 'pass', latency_ms: 3, by: 'votes', voters: ['qwen', 'gpt-oss'], deciders: ['qwen', 'gpt-oss'] }), { status: 200 });
    }
    const f = files[u];
    if (f) {
      const h = new Headers();
      if (f.location) h.set('location', f.location);
      return new Response(f.body ?? '', { status: f.status, headers: h });
    }
    throw new Error(`unstubbed fetch: ${u}`);
  };
  return w;
}

const BASE = ['--rpc', 'https://rpc.example/'];
const scenarios = [
  ['happy: 6705 passes every check', [...BASE, '6705']],
  ['happy: --claim overrides the file text', [...BASE, '6705', '--claim', 'Tide tables are published yearly.']],
  ['happy: one redirect is followed', [...BASE, '6706']],
  ['happy: data: URI needs no host', [...BASE, '7003']],
  ['--no-check sends nothing', [...BASE, '6705', '--no-check']],
  ['OFFLINE=1 sends nothing to the check', [...BASE, '6705'], { env: { OFFLINE: '1' } }],
  ['wrong chain stops before any other read', [...BASE, '6705', '--chain-id', '1']],
  ['no contract at the registry address', [...BASE, '6705'], { world: { code: '0x' } }],
  ['id never minted: NO_TOKEN', [...BASE, '404']],
  ['ownerOf reverts with some other error', [...BASE, '500']],
  ['zero owner is not an owner', [...BASE, '501']],
  ['tokenURI reverts', [...BASE, '7010']],
  ['file points back to ANOTHER agent', [...BASE, '7001']],
  ['file has the wrong type', [...BASE, '7002']],
  ['ipfs:// without a gateway', [...BASE, '7004']],
  ['file: URI refused', [...BASE, '7005']],
  ['link-local 169.254 refused', [...BASE, '7006']],
  ['10.x refused', [...BASE, '7011']],
  ['localhost refused by default', [...BASE, '7012']],
  ['ipv6 loopback refused', [...BASE, '7017']],
  ['private form refused: trailing dot (localhost.)', [...BASE, '7018']],
  ['private form refused: trailing dot (.internal.)', [...BASE, '7019']],
  ['private form refused: ipv4-mapped ipv6', [...BASE, '7020']],
  ['private form refused: decimal ipv4', [...BASE, '7021']],
  ['private form refused: hex ipv4', [...BASE, '7022']],
  ['private form refused: 192.168/16', [...BASE, '7023']],
  ['private form refused: 172.16/12', [...BASE, '7024']],
  ['private form refused: ipv6 link-local', [...BASE, '7025']],
  ['private form refused: ipv6 unique-local', [...BASE, '7026']],
  ['private form refused: 100.64/10', [...BASE, '7027']],
  ['private form refused: 0.0.0.0', [...BASE, '7028']],
  ['private form refused: .local name', [...BASE, '7029']],
  ['plain http refused', [...BASE, '7009']],
  ['oversized file refused', [...BASE, '7007']],
  ['more than 3 redirects refused', [...BASE, '7008']],
  ['public host redirecting to a private one is refused at the hop', [...BASE, '7014']],
  ['not JSON', [...BASE, '7013']],
  ['a tokenURI with escape codes and a newline is printed as text', [...BASE, '7030']],
  ['the hosted check says veto', [...BASE, '7015']],
  ['the hosted check answers out of contract', [...BASE, '7016']],
  ['the hosted check is down (HTTP 500)', [...BASE, '6705'], { world: { classify: () => new Response('no', { status: 500 }) } }],
  ['rpc unreachable', [...BASE, '6705'], { world: { rpcDown: true } }],
  ['usage: no id', [...BASE]],
  ['usage: bad id', [...BASE, '12abc']],
  ['usage: unknown option', [...BASE, '6705', '--sign']],
  ['usage: rpc must be https unless local', ['--rpc', 'http://rpc.example/', '6705']],
];

const out = [];
for (const [name, args, opt = {}] of scenarios) {
  const w = makeWorld(opt.world);
  const baseFetch = w.fetch;
  if (opt.world?.rpcDown) w.fetch = async (u, i) => (String(u) === 'https://rpc.example/' ? Promise.reject(new Error('connection refused')) : baseFetch(u, i));
  const env = { TRUSTSHELL_API_URL: 'https://hosted-check.test', ...(opt.env ?? {}) };
  const report = await lib.run(args, { fetchImpl: w.fetch, env });
  const text = report.usage ? '' : lib.render(report);
  out.push({ name, exit: report.exit, report, text, ...w.log });
}
process.stdout.write(JSON.stringify(out));
