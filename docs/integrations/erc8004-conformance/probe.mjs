/**
 * ERC-8004 conformance probe. READ ONLY: eth_chainId, eth_blockNumber, eth_getCode, eth_getStorageAt and
 * eth_call on view functions. No transaction, no simulated write, no key.
 *
 *   node docs/integrations/erc8004-conformance/probe.mjs --out raw.json [--ids 1,2,6705] [--rpc https://sepolia.base.org]
 *        [--identity 0x8004A8...] [--reputation 0x8004B6...] [--ref-identity abi.json --ref-reputation abi.json]
 *
 * It compares the DEPLOYED code with the function and event list of the EIP-8004 text (the lists below are copied from
 * the text fetched 2026-10-24, see docs/integrations/erc-8004-x402-openclaw.md) and, when given the reference ABIs
 * from github.com/erc-8004/erc-8004-contracts (abis/*.json), with those too. Needs `ethers` (v6), which this repo
 * already has as an optional dependency: `npm i ethers`.
 *
 * Presence in bytecode means the 4-byte selector (or event topic) appears byte-aligned in the runtime code of the
 * proxy's implementation (EIP-1967 slot). That shows the function is compiled in, not that it behaves as the text says;
 * behaviour is checked only by the live calls at the end. A selector with leading zero bytes is emitted by solc as a
 * shorter PUSH, so those forms are searched too.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

let ethers;
try { ethers = await import('ethers'); } catch { console.error('This probe needs ethers v6: npm i ethers'); process.exit(3); }
const { Interface, keccak256, getAddress } = ethers;

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : dflt; };
const RPC = opt('rpc', 'https://sepolia.base.org');
const IDENTITY = opt('identity', '0x8004A818BFB912233c491871b3d84c89A494BD9e');
const REPUTATION = opt('reputation', '0x8004B663056A597Dffe9eCcC1965A193B7388713');
const IDS = opt('ids', '1,2').split(',').filter(Boolean).map((x) => BigInt(x));
const OUT = opt('out', null);
const REF_I = opt('ref-identity', null), REF_R = opt('ref-reputation', null);

const out = { probedAt: new Date().toISOString(), rpc: RPC, notes: [] };
let n = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpc(method, params) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(350);
    const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params }) });
    if (res.status === 429 || res.status >= 500) { out.notes.push(`HTTP ${res.status} on ${method}; backing off`); await sleep(2000 * (attempt + 1)); continue; }
    return res.json();
  }
  throw new Error('rpc failed: ' + method);
}
const call = async (to, data) => {
  const j = await rpc('eth_call', [{ to, data }, 'latest']);
  return j.error ? { ok: false, errCode: j.error.code, errMsg: String(j.error.message).slice(0, 160), errData: j.error.data ?? null } : { ok: true, data: j.result };
};

// ---- the EIP-8004 text's function and event lists
const IDENT_EIP = [
  'function register(string agentURI, (string metadataKey, bytes metadataValue)[] metadata) returns (uint256)',
  'function register(string agentURI) returns (uint256)',
  'function register() returns (uint256)',
  'function setAgentURI(uint256 agentId, string newURI)',
  'function getMetadata(uint256 agentId, string metadataKey) view returns (bytes)',
  'function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue)',
  'function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature)',
  'function getAgentWallet(uint256 agentId) view returns (address)',
  'function unsetAgentWallet(uint256 agentId)',
  // ERC-721 with URIStorage and ERC-165, which the text incorporates by reference
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function balanceOf(address owner) view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function approve(address to, uint256 tokenId)',
  'function setApprovalForAll(address operator, bool approved)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
];
const IDENT_EVENTS = [
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
  'event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)',
  'event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)',
];
const REP_EIP = [
  'function getIdentityRegistry() view returns (address)',
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
  'function revokeFeedback(uint256 agentId, uint64 feedbackIndex)',
  'function appendResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex, string responseURI, bytes32 responseHash)',
  'function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)',
  'function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) view returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)',
  'function readAllFeedback(uint256 agentId, address[] clientAddresses, string tag1, string tag2, bool includeRevoked) view returns (address[] clients, uint64[] feedbackIndexes, int128[] values, uint8[] valueDecimals, string[] tag1s, string[] tag2s, bool[] revokedStatuses)',
  'function getResponseCount(uint256 agentId, address clientAddress, uint64 feedbackIndex, address[] responders) view returns (uint64 count)',
  'function getClients(uint256 agentId) view returns (address[])',
  'function getLastIndex(uint256 agentId, address clientAddress) view returns (uint64)',
];
const REP_EVENTS = [
  'event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
  'event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)',
  'event ResponseAppended(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, address indexed responder, string responseURI, bytes32 responseHash)',
];
// The shape giveFeedback had in a pre-final draft of the text; kept only to say which shape the deployed code has.
const REP_OLD_GIVE = 'function giveFeedback(uint256 agentId, uint8 score, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash, bytes feedbackAuth)';

const fnsOf = (sigs) => sigs.map((s) => { const f = new Interface([s]).fragments[0]; return { sig: f.format('sighash'), selector: f.selector }; });
const evsOf = (sigs) => sigs.map((s) => { const e = new Interface([s]).fragments[0]; return { sig: e.format('sighash'), topic0: e.topicHash }; });
const alignedHas = (code, needle) => { let i = code.indexOf(needle); while (i !== -1) { if (i % 2 === 0) return true; i = code.indexOf(needle, i + 1); } return false; };
const selForm = (code, sel) => {
  let h = sel.slice(2).toLowerCase(), op = 0x63;
  if (alignedHas(code, '63' + h)) return 'PUSH4';
  while (h.startsWith('00') && h.length > 2) { h = h.slice(2); op--; if (alignedHas(code, op.toString(16) + h)) return 'PUSH' + (op - 0x5f); }
  return false;
};
const presence = (code, fns) => fns.map((f) => { const form = selForm(code, f.selector); return { ...f, inBytecode: !!form, form: form || null }; });
const topicPresence = (code, evs) => evs.map((e) => ({ ...e, inBytecode: alignedHas(code, e.topic0.slice(2).toLowerCase()) }));

// ---- chain, block, code, proxy
const SLOT_IMPL = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const SLOT_ADMIN = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
out.chainId = parseInt((await rpc('eth_chainId', [])).result, 16);
out.blockNumber = parseInt((await rpc('eth_blockNumber', [])).result, 16);
const codeInfo = async (addr) => {
  const c = (await rpc('eth_getCode', [addr, 'latest'])).result;
  const impl = (await rpc('eth_getStorageAt', [addr, SLOT_IMPL, 'latest'])).result;
  const admin = (await rpc('eth_getStorageAt', [addr, SLOT_ADMIN, 'latest'])).result;
  const implAddr = /^0x0{24}[0-9a-f]{40}$/i.test(impl) && !/^0x0+$/.test(impl) ? getAddress('0x' + impl.slice(26)) : null;
  const implCode = implAddr ? (await rpc('eth_getCode', [implAddr, 'latest'])).result : null;
  const pub = { address: addr, codeBytes: (c.length - 2) / 2, codeHash: c.length > 2 ? keccak256(c) : null, eip1967Implementation: implAddr, eip1967Admin: /^0x0+$/.test(admin) ? null : admin, implementationCodeBytes: implCode ? (implCode.length - 2) / 2 : null, implementationCodeHash: implCode ? keccak256(implCode) : null };
  return { pub, runtime: (implCode ?? c).toLowerCase() };
};
const idc = await codeInfo(IDENTITY), rpc_ = await codeInfo(REPUTATION);
out.identity = idc.pub; out.reputation = rpc_.pub;

out.identitySelectors = presence(idc.runtime, fnsOf(IDENT_EIP));
out.identityEvents = topicPresence(idc.runtime, evsOf(IDENT_EVENTS));
out.reputationSelectors = presence(rpc_.runtime, fnsOf(REP_EIP));
out.reputationEvents = topicPresence(rpc_.runtime, evsOf(REP_EVENTS));
out.reputationOldGiveFeedbackShape = presence(rpc_.runtime, fnsOf([REP_OLD_GIVE]));

const refDiff = (path, code, eip) => {
  const text = readFileSync(path, 'utf8');
  const iface = new Interface(JSON.parse(text));
  const ref = iface.fragments.filter((x) => x.type === 'function').map((x) => ({ sig: x.format('sighash'), selector: x.selector }));
  const refSet = new Set(ref.map((x) => x.selector)), eipSet = new Set(eip.map((x) => x.selector));
  return {
    // the file's name and hash, not its path, so the output carries nothing about the machine it ran on
    referenceAbi: path.split(/[\\/]/).pop(), referenceAbiSha256: createHash('sha256').update(text).digest('hex'), referenceFunctions: ref.length,
    inReferenceButNotInDeployedBytecode: presence(code, ref).filter((x) => !x.inBytecode).map((x) => x.sig),
    inEipListButNotInReferenceAbi: eip.filter((x) => !refSet.has(x.selector)).map((x) => x.sig),
    inReferenceAbiButNotInEipList: ref.filter((x) => !eipSet.has(x.selector)).map((x) => x.sig),
  };
};
if (REF_I) out.identityVsReferenceAbi = refDiff(REF_I, idc.runtime, fnsOf(IDENT_EIP));
if (REF_R) out.reputationVsReferenceAbi = refDiff(REF_R, rpc_.runtime, fnsOf(REP_EIP));

// ---- live view calls
const ifaceI = new Interface([...IDENT_EIP, 'function getVersion() view returns (string)', 'function owner() view returns (address)']);
const ifaceR = new Interface([...REP_EIP, 'function getVersion() view returns (string)', 'function owner() view returns (address)', 'function supportsInterface(bytes4) view returns (bool)']);
const plain = (x) => (typeof x === 'bigint' ? x.toString() : Array.isArray(x) ? x.map(plain) : x);
const view = async (to, iface, fn, args) => {
  const r = await call(to, iface.encodeFunctionData(fn, args));
  if (!r.ok) return r;
  try { const d = iface.decodeFunctionResult(fn, r.data); return { ok: true, value: plain(d.length === 1 ? d[0] : [...d]) }; }
  catch (e) { return { ok: false, decodeError: String(e.message).slice(0, 120), raw: r.data }; }
};
out.erc165 = {};
for (const [name, iid] of [['ERC165 0x01ffc9a7', '0x01ffc9a7'], ['ERC721 0x80ac58cd', '0x80ac58cd'], ['ERC721Metadata 0x5b5e139f', '0x5b5e139f'], ['ERC721Enumerable 0x780e9d63', '0x780e9d63'], ['invalid 0xffffffff', '0xffffffff']]) {
  out.erc165[name] = await view(IDENTITY, ifaceI, 'supportsInterface', [iid]);
}
out.reputationSupportsInterface = await view(REPUTATION, ifaceR, 'supportsInterface', ['0x01ffc9a7']);
out.identityName = await view(IDENTITY, ifaceI, 'name', []);
out.identitySymbol = await view(IDENTITY, ifaceI, 'symbol', []);
out.identityVersion = await view(IDENTITY, ifaceI, 'getVersion', []);
out.reputationVersion = await view(REPUTATION, ifaceR, 'getVersion', []);
out.identityOwner = await view(IDENTITY, ifaceI, 'owner', []);
out.reputationOwner = await view(REPUTATION, ifaceR, 'owner', []);
out.reputationGetIdentityRegistry = await view(REPUTATION, ifaceR, 'getIdentityRegistry', []);
out.ownerOfNeverMinted = await view(IDENTITY, ifaceI, 'ownerOf', [2n ** 200n]);
out.summaryWithEmptyClients = await view(REPUTATION, ifaceR, 'getSummary', [IDS[0] ?? 1n, [], '', '']);

out.agents = [];
for (const aid of IDS) {
  const a = { agentId: String(aid) };
  a.ownerOf = await view(IDENTITY, ifaceI, 'ownerOf', [aid]);
  if (a.ownerOf.ok) {
    a.tokenURI = await view(IDENTITY, ifaceI, 'tokenURI', [aid]);
    a.agentWallet = await view(IDENTITY, ifaceI, 'getAgentWallet', [aid]);
    a.clients = await view(REPUTATION, ifaceR, 'getClients', [aid]);
    if (a.clients.ok && a.clients.value.length) {
      const cl = a.clients.value.slice(0, 25);
      a.summary = await view(REPUTATION, ifaceR, 'getSummary', [aid, cl, '', '']);
      const all = await view(REPUTATION, ifaceR, 'readAllFeedback', [aid, cl, '', '', true]);
      if (all.ok) {
        const [clients, , values, , tag1s, tag2s, revoked] = all.value;
        const vals = values.map(Number);
        a.feedback = { entries: vals.length, firstValue: vals[0] ?? null, lastValue: vals[vals.length - 1] ?? null, meanOfEntries: vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null, tag1s: [...new Set(tag1s)], tag2s: [...new Set(tag2s)], revoked: revoked.filter(Boolean).length, distinctClients: new Set(clients.map((c) => c.toLowerCase())).size };
      }
    }
  }
  out.agents.push(a);
}
if (OUT) writeFileSync(OUT, JSON.stringify(out, null, 2));
else console.log(JSON.stringify(out, null, 2));
