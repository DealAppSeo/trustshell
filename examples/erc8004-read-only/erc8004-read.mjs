/**
 * ERC-8004 read-only helpers behind examples/erc8004-read-only/read-agent.mjs (the CLI; its header and the
 * README say what this does and does not do). Split out so tests/erc8004-read-only-example.test.ts can drive every
 * branch with a stubbed fetch. Every function here is a read: no signing, no key, no write path.
 */
import { createHash } from 'node:crypto';
import { classifyClaim } from '../../dist/lib/claim.js';
import { cleanCodePoints } from '../../dist/lib/action-evidence.js';

export const BASE_SEPOLIA = {
  chainId: 84532,
  rpc: 'https://sepolia.base.org',
  // The shared canonical singleton from github.com/erc-8004/erc-8004-contracts, not a contract of ours.
  registry: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
};
export const REGISTRATION_TYPE = 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';
/** 4-byte selectors. tests/erc8004-read-only-example.test.ts recomputes them with ethers. */
export const SEL = { ownerOf: '0x6352211e', tokenURI: '0xc87b56dd', getAgentWallet: '0x00339509' };
/** ERC721NonexistentToken(uint256), the revert data OpenZeppelin v5 gives for an id that was never minted. */
const NO_TOKEN_ERROR = '0x7e273289';
const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 8000;
const MAX_HOPS = 3;

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = /^0x0{40}$/;

// ---- args ----------------------------------------------------------------------------------------

export function parseArgs(argv) {
  const o = { flags: new Set(), values: {} };
  const withValue = new Set(['claim', 'claim-field', 'rpc', 'registry', 'chain-id', 'ipfs-gateway']);
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { rest.push(a); continue; }
    const name = a.slice(2);
    if (withValue.has(name)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) return { error: `--${name} needs a value` };
      o.values[name] = v;
    } else if (['no-check', 'json', 'allow-local-uri'].includes(name)) o.flags.add(name);
    else return { error: `unknown option --${name}` };
  }
  if (rest.length !== 1) return { error: 'give exactly one agent id' };
  if (!/^(0|[1-9]\d{0,17})$/.test(rest[0])) return { error: `agent id must be a whole number, got "${rest[0]}"` };
  o.agentId = rest[0];
  return o;
}

// ---- hostile-URL guard ---------------------------------------------------------------------------

/** True for localhost and private, loopback, link-local and unique-local literals. Names that merely resolve there are not caught. */
export function isPrivateHost(hostname) {
  // A trailing dot ("localhost.") is the same host and survives URL parsing, so strip it before comparing.
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (h.includes(':')) return h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:');
  return false;
}

/** The URL to fetch, or a reason it must not be. https only; http only for a local URL the caller allowed. */
export function checkFetchUrl(raw, { allowLocal = false } = {}) {
  let u;
  try { u = new URL(raw); } catch { return { ok: false, reason: 'not a URL' }; }
  const local = isPrivateHost(u.hostname);
  if (u.username || u.password) return { ok: false, reason: 'URL carries credentials' };
  if (local) return allowLocal && (u.protocol === 'http:' || u.protocol === 'https:') ? { ok: true, url: u.href } : { ok: false, reason: 'private or local address (pass --allow-local-uri to read one on purpose)' };
  if (u.protocol !== 'https:') return { ok: false, reason: `scheme ${u.protocol} is not https` };
  return { ok: true, url: u.href };
}

async function readCapped(res, max) {
  const reader = res.body.getReader();
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** GET with manual redirects so every hop goes through checkFetchUrl. Returns { ok, bytes, finalUrl } or { ok:false, reason }. */
export async function guardedGet(raw, { allowLocal = false, fetchImpl = fetch } = {}) {
  let url = raw;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const g = checkFetchUrl(url, { allowLocal });
    if (!g.ok) return { ok: false, reason: `${hop ? 'redirect target ' : ''}${g.reason}` };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(g.url, { redirect: 'manual', signal: ctl.signal, headers: { accept: 'application/json' } });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get('location');
        if (!loc) return { ok: false, reason: `HTTP ${res.status} with no location` };
        url = new URL(loc, g.url).href;
        continue;
      }
      if (res.status !== 200) return { ok: false, reason: `HTTP ${res.status}` };
      const bytes = await readCapped(res, MAX_BYTES);
      if (bytes === null) return { ok: false, reason: `larger than ${MAX_BYTES} bytes` };
      return { ok: true, bytes, finalUrl: g.url };
    } catch (e) {
      return { ok: false, reason: ctl.signal.aborted ? `no answer within ${TIMEOUT_MS} ms` : `network error: ${e?.message ?? e}` };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, reason: `more than ${MAX_HOPS} redirects` };
}

// ---- chain reads (JSON-RPC, hand-rolled ABI: one uint256 in, address or string out) ----------------

const word = (decimal) => BigInt(decimal).toString(16).padStart(64, '0');

export async function rpc(url, method, params, { fetchImpl = fetch } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: ctl.signal });
    if (res.status !== 200) return { ok: false, notChecked: `RPC answered HTTP ${res.status}` };
    const j = await res.json();
    if (j && j.error) return { ok: false, revert: true, data: typeof j.error.data === 'string' ? j.error.data : null, message: String(j.error.message ?? '') };
    if (!j || typeof j.result !== 'string') return { ok: false, notChecked: 'RPC answer has no result' };
    return { ok: true, result: j.result };
  } catch (e) {
    return { ok: false, notChecked: ctl.signal.aborted ? `RPC: no answer within ${TIMEOUT_MS} ms` : `RPC network error: ${e?.message ?? e}` };
  } finally {
    clearTimeout(timer);
  }
}

export function decodeAddress(hex) {
  if (typeof hex !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hex)) return null;
  const a = '0x' + hex.slice(26);
  return HEX_ADDRESS.test(a) ? a : null;
}

export function decodeString(hex) {
  if (typeof hex !== 'string' || !/^0x([0-9a-fA-F]{2})*$/.test(hex) || hex.length < 2 + 128) return null;
  const body = hex.slice(2);
  const off = Number(BigInt('0x' + body.slice(0, 64)));
  if (!Number.isSafeInteger(off) || off % 32 !== 0 || off + 64 > body.length / 2) return null;
  const len = Number(BigInt('0x' + body.slice(off * 2, off * 2 + 64)));
  if (!Number.isSafeInteger(len) || off + 32 + len > body.length / 2) return null;
  return Buffer.from(body.slice(off * 2 + 64, off * 2 + 64 + len * 2), 'hex').toString('utf8');
}

async function readOwner(ctx) {
  const r = await rpc(ctx.rpc, 'eth_call', [{ to: ctx.registry, data: SEL.ownerOf + word(ctx.agentId) }, 'latest'], ctx);
  if (r.ok) {
    const owner = decodeAddress(r.result);
    if (!owner || ZERO_ADDRESS.test(owner)) return { state: 'NOT_CHECKED', reason: 'ownerOf returned something that is not an owner address' };
    return { state: 'OWNER_FOUND', address: owner };
  }
  if (r.revert) return r.data && r.data.toLowerCase().startsWith(NO_TOKEN_ERROR) ? { state: 'NO_TOKEN' } : { state: 'REVERTED', reason: r.message.slice(0, 120) };
  return { state: 'NOT_CHECKED', reason: r.notChecked };
}

async function readString(ctx, selector) {
  const r = await rpc(ctx.rpc, 'eth_call', [{ to: ctx.registry, data: selector + word(ctx.agentId) }, 'latest'], ctx);
  if (!r.ok) return { state: 'NOT_CHECKED', reason: r.revert ? `reverted: ${r.message.slice(0, 100)}` : r.notChecked };
  const s = decodeString(r.result);
  return s === null ? { state: 'NOT_CHECKED', reason: 'the registry answered with something that is not a string' } : { state: 'FOUND', value: s };
}

async function readAgentWallet(ctx) {
  const r = await rpc(ctx.rpc, 'eth_call', [{ to: ctx.registry, data: SEL.getAgentWallet + word(ctx.agentId) }, 'latest'], ctx);
  if (!r.ok) return { state: 'NOT_CHECKED', reason: r.revert ? 'reverted' : r.notChecked };
  const a = decodeAddress(r.result);
  return a ? { state: 'FOUND', address: a, isZero: ZERO_ADDRESS.test(a) } : { state: 'NOT_CHECKED', reason: 'not an address' };
}

// ---- registration file ----------------------------------------------------------------------------

/** The agentURI to bytes: https (guarded), data: (base64 or percent-encoded), ipfs:// only through a gateway the caller names. */
export async function loadRegistration(uri, { allowLocal, ipfsGateway, fetchImpl } = {}) {
  if (/^data:/i.test(uri)) {
    const m = /^data:application\/json(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/i.exec(uri);
    if (!m) return { ok: false, reason: 'data: URI is not application/json' };
    try {
      const bytes = m[1] ? Buffer.from(m[2], 'base64') : Buffer.from(decodeURIComponent(m[2]), 'utf8');
      return bytes.length > MAX_BYTES ? { ok: false, reason: `larger than ${MAX_BYTES} bytes` } : { ok: true, bytes, finalUrl: 'data:' };
    } catch { return { ok: false, reason: 'data: URI could not be decoded' }; }
  }
  if (/^ipfs:\/\//i.test(uri)) {
    if (!ipfsGateway) return { ok: false, reason: 'ipfs:// needs a gateway you choose: --ipfs-gateway https://<gateway>/ipfs/ (not read here)' };
    const path = uri.slice('ipfs://'.length).replace(/^ipfs\//, '');
    return guardedGet(ipfsGateway.replace(/\/?$/, '/') + path, { allowLocal, fetchImpl });
  }
  return guardedGet(uri, { allowLocal, fetchImpl });
}

const isStr = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * The EIP-8004 text's registration-file structure, field by field. States: PASS; FAIL (present and wrong, or a
 * clear MUST missing); ABSENT (a field the example structure shows but the text does not make individually
 * mandatory; not a failure); SHOULD_MISSING (the text says SHOULD). Plus whether it points back to this agent.
 */
export function checkShape(file, { agentId, chainId, registry }) {
  const rows = [];
  const add = (field, state, note = '') => rows.push({ field, state, note });
  if (!file || typeof file !== 'object' || Array.isArray(file)) return { rows: [{ field: '(file)', state: 'FAIL', note: 'not a JSON object' }], backReference: { state: 'ABSENT', note: 'no registrations to read' } };
  add('type', file.type === REGISTRATION_TYPE ? 'PASS' : 'FAIL', file.type === REGISTRATION_TYPE ? '' : `expected ${REGISTRATION_TYPE}`);
  add('name', isStr(file.name) ? 'PASS' : 'FAIL');
  add('description', isStr(file.description) ? 'PASS' : 'FAIL');
  add('image', isStr(file.image) ? 'PASS' : 'SHOULD_MISSING', isStr(file.image) ? '' : 'the text says type, name, description and image SHOULD be present for ERC-721 apps');
  if (file.services === undefined) add('services', 'ABSENT');
  else if (!Array.isArray(file.services) || file.services.some((s) => !s || !isStr(s.name) || !isStr(s.endpoint))) add('services', 'FAIL', 'every entry needs a name and an endpoint');
  else add('services', 'PASS', `${file.services.length} endpoint(s); names are free-form in the text`);
  for (const k of ['x402Support', 'active']) add(k, file[k] === undefined ? 'ABSENT' : typeof file[k] === 'boolean' ? 'PASS' : 'FAIL');
  add('supportedTrust', file.supportedTrust === undefined ? 'ABSENT' : Array.isArray(file.supportedTrust) && file.supportedTrust.every(isStr) ? 'PASS' : 'FAIL', file.supportedTrust === undefined ? 'OPTIONAL in the text' : '');
  const want = `eip155:${chainId}:${registry}`.toLowerCase();
  let backReference;
  if (!Array.isArray(file.registrations) || file.registrations.length === 0) {
    add('registrations', 'SHOULD_MISSING', 'the text says an agent SHOULD have at least one registration');
    backReference = { state: 'ABSENT', note: 'the file lists no registration' };
  } else if (file.registrations.some((r) => !r || !isStr(String(r.agentRegistry ?? '')) || r.agentId === undefined)) {
    add('registrations', 'FAIL', 'each registration needs agentId and agentRegistry');
    backReference = { state: 'MISMATCH', note: 'a registration entry is malformed' };
  } else {
    add('registrations', 'PASS', `${file.registrations.length} entr${file.registrations.length === 1 ? 'y' : 'ies'}`);
    const hit = file.registrations.some((r) => String(r.agentId) === agentId && String(r.agentRegistry).toLowerCase() === want);
    backReference = hit ? { state: 'MATCH' } : { state: 'MISMATCH', note: `no entry says agentId ${agentId} on ${`eip155:${chainId}:${registry}`}` };
  }
  return { rows, backReference };
}

// ---- main -------------------------------------------------------------------------------------------

export const NOT_DONE = [
  'No transaction was sent and no key was used. This script cannot write.',
  'No reputation was read (getClients / getSummary / readAllFeedback), and no feedback was posted.',
  'No validation request or response was read or made.',
  'The agent\'s service endpoints were not called, so whether any of them works is NOT_CHECKED.',
  'The registration file was not checked for who controls its host; the optional /.well-known/agent-registration.json domain proof was not read.',
  'A hostname that resolves to a private address would not be caught by the URL guard (no DNS check).',
];

export async function run(argv, { fetchImpl = fetch, env = process.env, claimFn = classifyClaim } = {}) {
  const a = parseArgs(argv);
  if (a.error) return { exit: 3, usage: a.error };
  const chainId = a.values['chain-id'] ? Number(a.values['chain-id']) : BASE_SEPOLIA.chainId;
  const registry = a.values.registry ?? BASE_SEPOLIA.registry;
  const rpcUrl = a.values.rpc ?? BASE_SEPOLIA.rpc;
  if (!Number.isSafeInteger(chainId) || chainId <= 0) return { exit: 3, usage: '--chain-id must be a positive whole number' };
  if (!HEX_ADDRESS.test(registry)) return { exit: 3, usage: '--registry must be a 0x address' };
  const rpcGuard = checkFetchUrl(rpcUrl, { allowLocal: true });
  if (!rpcGuard.ok) return { exit: 3, usage: `--rpc: ${rpcGuard.reason}` };
  if (a.values['ipfs-gateway'] && !checkFetchUrl(a.values['ipfs-gateway'], { allowLocal: a.flags.has('allow-local-uri') }).ok) return { exit: 3, usage: '--ipfs-gateway must be an https URL' };

  const ctx = { rpc: rpcGuard.url, registry, agentId: a.agentId, fetchImpl };
  const report = { agentId: a.agentId, chainId, registry, rpc: rpcGuard.url, readOnly: true, notDone: NOT_DONE };

  const cid = await rpc(ctx.rpc, 'eth_chainId', [], ctx);
  if (!cid.ok) report.chain = { state: 'NOT_CHECKED', reason: cid.notChecked ?? cid.message };
  else if (parseInt(cid.result, 16) !== chainId) report.chain = { state: 'FAIL', reason: `the RPC is on chain ${parseInt(cid.result, 16)}, not ${chainId}; nothing else was read` };
  else report.chain = { state: 'PASS', chainId };
  if (report.chain.state !== 'PASS') return finish(report);

  const code = await rpc(ctx.rpc, 'eth_getCode', [registry, 'latest'], ctx);
  report.registryCode = !code.ok ? { state: 'NOT_CHECKED', reason: code.notChecked ?? code.message } : /^0x(00)*$/.test(code.result) || code.result === '0x' ? { state: 'FAIL', reason: 'no contract code at that address on this chain' } : { state: 'PASS', bytes: (code.result.length - 2) / 2 };
  if (report.registryCode.state !== 'PASS') return finish(report);

  report.owner = await readOwner(ctx);
  if (report.owner.state !== 'OWNER_FOUND') return finish(report);
  report.agentURI = await readString(ctx, SEL.tokenURI);
  report.agentWallet = await readAgentWallet(ctx);
  if (report.agentURI.state !== 'FOUND') return finish(report);

  const got = await loadRegistration(report.agentURI.value, { allowLocal: a.flags.has('allow-local-uri'), ipfsGateway: a.values['ipfs-gateway'], fetchImpl });
  if (!got.ok) { report.registration = { state: 'NOT_CHECKED', reason: got.reason }; return finish(report); }
  let file;
  try { file = JSON.parse(got.bytes.toString('utf8')); } catch { report.registration = { state: 'FAIL', reason: 'the file is not JSON' }; return finish(report); }
  report.registration = { state: 'FETCHED', bytes: got.bytes.length, sha256: createHash('sha256').update(got.bytes).digest('hex'), from: got.finalUrl.startsWith('data:') ? 'data: URI' : got.finalUrl };
  const shape = checkShape(file, { agentId: a.agentId, chainId, registry });
  report.shape = shape.rows;
  report.backReference = shape.backReference;

  // The claim: free text, or one top-level string field of the file (default: description).
  const field = a.values['claim-field'] ?? 'description';
  const text = a.values.claim ?? (isStr(file[field]) ? file[field] : '');
  report.claim = { source: a.values.claim ? '--claim' : `registration file field "${field}"`, text: text.slice(0, 500) };
  if (a.flags.has('no-check')) report.claim.result = { label: 'not-checked', reason: '--no-check: nothing was sent' };
  else if (!a.values.claim && report.backReference.state === 'MISMATCH') report.claim.result = { label: 'not-checked', reason: 'the file does not point back to this agent, so its text is not this agent\'s claim; nothing was sent' };
  else if (!text.trim()) report.claim.result = { label: 'not-checked', reason: `the file has no text in "${field}"` };
  else {
    try {
      const r = await claimFn(text, { fetchImpl, env });
      report.claim.result = { label: r.label, reason: r.reason, by: r.by, voters: r.voters, deciders: r.deciders, scrubbed: r.scrubbed };
    } catch (e) {
      report.claim.result = { label: 'not-checked', reason: `check refused before sending: ${e?.message ?? e}` };
    }
  }
  return finish(report);
}

function finish(report) {
  const bad = [report.chain?.state, report.registryCode?.state, report.registration?.state, ...(report.shape ?? []).map((r) => r.state)].includes('FAIL')
    || ['NO_TOKEN', 'REVERTED'].includes(report.owner?.state) || report.backReference?.state === 'MISMATCH' || report.claim?.result?.label === 'veto';
  const clean = report.chain?.state === 'PASS' && report.registryCode?.state === 'PASS' && report.owner?.state === 'OWNER_FOUND' && report.agentURI?.state === 'FOUND'
    && report.registration?.state === 'FETCHED' && report.backReference?.state === 'MATCH' && report.claim?.result?.label === 'pass';
  report.exit = bad ? 1 : clean ? 0 : 2;
  return report;
}

export function render(r) {
  const L = [];
  // Values come from the chain, a remote file or the hosted check: print them as text, one line each (no escape codes, no injected rows).
  const row = (k, v) => L.push(`${k.padEnd(18)}${cleanCodePoints(v)}`);
  L.push(`ERC-8004 agent ${r.agentId} on chain ${r.chainId}, registry ${r.registry}`, `(read only: ${r.rpc})`, '');
  row('chain', r.chain ? `${r.chain.state}${r.chain.reason ? ' - ' + r.chain.reason : ''}` : '');
  if (r.registryCode) row('registry code', `${r.registryCode.state}${r.registryCode.reason ? ' - ' + r.registryCode.reason : r.registryCode.bytes ? ` (${r.registryCode.bytes} bytes, a proxy if small)` : ''}`);
  if (r.owner) row('ownerOf', r.owner.state === 'OWNER_FOUND' ? `OWNER_FOUND ${r.owner.address}` : `${r.owner.state}${r.owner.reason ? ' - ' + r.owner.reason : ''}`);
  if (r.agentURI) row('agentURI', r.agentURI.state === 'FOUND' ? r.agentURI.value.slice(0, 120) : `${r.agentURI.state} - ${r.agentURI.reason}`);
  if (r.agentWallet) row('agentWallet', r.agentWallet.state === 'FOUND' ? (r.agentWallet.isZero ? 'unset (zero address)' : r.agentWallet.address) : `${r.agentWallet.state} - ${r.agentWallet.reason}`);
  if (r.registration) row('registration', r.registration.state === 'FETCHED' ? `FETCHED ${r.registration.bytes} bytes sha256 ${r.registration.sha256.slice(0, 16)}... from ${r.registration.from.slice(0, 90)}` : `${r.registration.state} - ${r.registration.reason}`);
  for (const s of r.shape ?? []) row(`  ${s.field}`, `${s.state}${s.note ? ' - ' + s.note : ''}`);
  if (r.backReference) row('points back', `${r.backReference.state}${r.backReference.note ? ' - ' + r.backReference.note : ''}`);
  if (r.claim) {
    const c = r.claim.result;
    row('claim from', r.claim.source);
    row('claim', JSON.stringify(r.claim.text.length > 140 ? r.claim.text.slice(0, 140) + '...' : r.claim.text));
    row('check', `${c.label}${c.reason ? ' - ' + c.reason : ''}${c.voters ? ` (asked: ${c.voters.join(', ')})` : ''}${c.scrubbed ? ' (something was removed before sending)' : ''}`);
  }
  L.push('', 'not done:', ...r.notDone.map((n) => `  - ${n}`), '', `exit ${r.exit}  (0 all passed, 1 a check failed, 2 something NOT_CHECKED)`);
  return L.join('\n');
}
