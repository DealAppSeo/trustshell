/**
 * onchain-checks.test.ts — the acceptance gate's on-chain decisions, tampered one check at a time.
 *
 * tests/e2e/onchain-checks.mjs holds what the gate's onchain.* legs decide (harness-acceptance.mjs only
 * fetches and calls it). The fixture is REAL: Base Sepolia receipts and an EAS attestation captured
 * keyless and read-only on 2026-10-14 (tests/fixtures/onchain-receipts-2026-10-14.json). The untouched
 * fixture must pass every check; each tamper must come back with its own specific problem, i.e. FAILED.
 * XC1 review of #552: the deal must be the transfer it claims, the write must be the write the engine
 * names, and the anchor must be the anchor we issue, not merely "some" tx or attestation.
 *
 * Runs in a child node process (the module is ESM), the same way announce-gate.test.ts runs its script.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(__dirname, '..');
const MODULE = pathToFileURL(join(ROOT, 'tests', 'e2e', 'onchain-checks.mjs')).href;
const FIXTURE = join(ROOT, 'tests', 'fixtures', 'onchain-receipts-2026-10-14.json');

/** Runs `body` (an async arrow over { oc, fx, abi, clone }) in node and returns its JSON result. */
function run(body: string): any {
  const src = `
    import * as oc from ${JSON.stringify(MODULE)};
    import { readFileSync } from 'node:fs';
    import { createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(pathToFileURL(join(ROOT, 'package.json')).href)});
    const { AbiCoder } = require('ethers');
    const fx = JSON.parse(readFileSync(${JSON.stringify(FIXTURE)}, 'utf8'));
    const abi = AbiCoder.defaultAbiCoder();
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const out = await (${body})({ oc, fx, abi, clone });
    process.stdout.write(JSON.stringify(out, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));`;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', src], { encoding: 'utf8' }));
}

// Each case: a tamper of the fixture, and the problem it must produce. `null` tamper = the control.
const DEAL = (tamper: string) => `({ oc, fx, clone }) => {
  const a = { deal: clone(fx.deal), receipt: clone(fx.dealTx), dealReceipt: clone(fx.dealReceipt),
    html: 'receipt page ' + fx.deal.tx_hash, minedAtMs: fx.dealMinedAtMs, nowMs: fx.dealMinedAtMs + 3600e3, parties: null };
  const t = a.receipt.logs.find((l) => l.topics[0] === oc.ERC20_TRANSFER);
  ${tamper}
  return oc.checkDealSettlement(a);
}`;

const pad = (addr: string) => `'0x' + '0'.repeat(24) + '${addr.slice(2).toLowerCase()}'`;
const OTHER = '0x1111111111111111111111111111111111111111';

describe('onchain.daily_deal — checkDealSettlement', () => {
  it('the real 2026-10-14 deal passes, and the Transfer\'s from/to are decoded from the log', () => {
    const r = run(DEAL(''));
    expect(r.wrong).toEqual([]);
    expect(r.from).toMatch(/^0x[0-9a-f]{40}$/);
    expect(r.to).toMatch(/^0x[0-9a-f]{40}$/);
    expect(r.from).not.toBe(r.to);
  });

  it.each([
    ['the right amount to ANY address is not the deal when the deal names the payee', `a.parties = { payer: '0x' + t.topics[1].slice(26), payee: '${OTHER}' };`, /USDC went to 0x[0-9a-f]{40}, the deal names payee/],
    ['a payer other than the one the deal names', `a.parties = { payer: '${OTHER}', payee: '0x' + t.topics[2].slice(26) };`, /USDC came from 0x[0-9a-f]{40}, the deal names payer/],
    ['a mint (from the zero address)', `t.topics[1] = ${pad('0x' + '0'.repeat(40))};`, /mint or burn/],
    ['a self-transfer', `t.topics[2] = t.topics[1];`, /self-transfer/],
    ['two Transfers of the deal amount in one tx', `a.receipt.logs.push(clone(t));`, /ambiguous/],
    ['the wrong amount', `a.deal.amount = String(BigInt(fx.deal.amount) + 1n);`, /USDC moved .*, the deal says/],
  ])('FAILED: %s', (_why, tamper, problem) => {
    const r = run(DEAL(tamper));
    expect(r.wrong.join(' | ')).toMatch(problem);
  });

  // repid-engine #1386: the public receipt names payer_wallet / payee_wallet. The 2026-10-14 values
  // are the settlement row's [V prod, read-only] and checksummed, as the engine publishes them.
  const PAYER = '0xdf6b8215D193b11B4903d223729c3CF7A6de271d';
  const PAYEE = '0x7b84CCE5502d393DAa6533285eF3e2f8D3A13261';

  it('wired: a receipt naming the real payer and payee passes, compared case-insensitively to the chain', () => {
    const r = run(DEAL(`a.parties = oc.partiesFrom({ payer_wallet: '${PAYER}', payee_wallet: '${PAYEE}' });`));
    expect(r.wrong).toEqual([]);
    expect([r.from, r.to]).toEqual([PAYER.toLowerCase(), PAYEE.toLowerCase()]);
  });

  it('wired: a receipt naming another payee than the chain paid is FAILED', () => {
    const r = run(DEAL(`a.parties = oc.partiesFrom({ payer_wallet: '${PAYER}', payee_wallet: '${OTHER}' });`));
    expect(r.wrong.join(' | ')).toMatch(/USDC went to 0x7b84cce5502d393daa6533285ef3e2f8d3a13261, the deal names payee 0x1111/);
  });

  it.each([
    ['no wallets (the engine before #1386)', `{}`],
    ['only the payer (a half-named record)', `{ payer_wallet: '${PAYER}' }`],
    ['a non-address payee', `{ payer_wallet: '${PAYER}', payee_wallet: 'trinity-sophia' }`],
  ])('partiesFrom: %s states no parties (null), so the leg says NOT checked rather than passing', (_why, receipt) => {
    expect(run(`({ oc }) => oc.partiesFrom(${receipt})`)).toBeNull();
  });
});

// The engine supplies the agent NAMES; the token-to-agent binding comes from the IdentityRegistry's
// tokenURI on chain (fx.registrations, read 2026-10-14). XC1 review of #559.
const WRITE = (tamper: string) => `({ oc, fx, abi, clone }) => {
  const a = { receipt: clone(fx.repTx), minedAtMs: fx.repMinedAtMs, nowMs: fx.repMinedAtMs + 3600e3,
    expectAgents: [fx.deal.buyer_agent_name, fx.deal.provider_agent_name], registrations: clone(fx.registrations),
    expectValue: fx.dealReceipt.onchain_repid, abi };
  const ev = a.receipt.logs.find((l) => l.topics[0] === oc.NEW_FEEDBACK);
  ${tamper}
  return oc.checkReputationWrite(a);
}`;
const OTHER_ID = `'0x' + (424242).toString(16).padStart(64, '0')`;

describe('onchain.erc8004_reputation_write — checkReputationWrite', () => {
  it('the real write passes: one NewFeedback for agent 3747, registered on chain as SOPHIA (= trinity-sophia), with the receipt\'s value', () => {
    const r = run(WRITE(''));
    expect(r.wrong).toEqual([]);
    expect(r.feedback).toMatchObject({ agentId: '3747', registeredAs: 'SOPHIA', value: '1384', decimals: 0, tag1: 'hyperdag_repid' });
  });

  it.each([
    ['a swapped in-window registry tx for ANOTHER agent, registered on chain as someone else',
      `ev.topics[1] = ${OTHER_ID}; a.registrations['424242'] = 'https://trustrepid.dev/agents/someone-else';`, /registered on chain as "someone-else", not trinity-nexus or trinity-sophia/],
    ['an agent id the IdentityRegistry names nobody for', `ev.topics[1] = ${OTHER_ID};`, /IdentityRegistry names no agent for ERC-8004 id 424242/],
    ['the engine naming parties the chain registration does not', `a.expectAgents = ['trinity-orch', 'trinity-mel'];`, /registered on chain as "SOPHIA", not trinity-orch or trinity-mel/],
    ['the same agent written a different value', `a.expectValue = fx.dealReceipt.onchain_repid + 1;`, /wrote 1384 .*, the engine says 1385/],
    ['a tx to another contract (registry pinned, not a parameter)', `a.receipt.to = '${OTHER}';`, /went to 0x1111.*, not the ReputationRegistry 0x8004B663/],
    ['a NewFeedback emitted by another contract', `ev.address = '${OTHER}';`, /no NewFeedback/],
    ['a registry log that is not NewFeedback', `ev.topics[0] = '0x' + 'ab'.repeat(32);`, /no NewFeedback/],
    ['a NewFeedback not tagged by the RepID writer (data)', `ev.data = abi.encode(['uint64','int128','uint8','string','string','string','string','bytes32'], [5, 1384, 0, 'someone_else', '', '', '', '0x' + '00'.repeat(32)]);`, /tagged "someone_else"/],
    ['a NewFeedback whose INDEXED tag topic is not keccak256("hyperdag_repid")', `ev.topics[3] = '0x' + 'cd'.repeat(32);`, /indexed tag topic .* is not keccak256\("hyperdag_repid"\)/],
    ['two NewFeedback events in one tx (exactly one may exist)', `a.receipt.logs.push(clone(ev));`, /2 NewFeedback events in one tx: .* ambiguous/],
    ['a write older than the window', `a.nowMs = fx.repMinedAtMs + 49 * 3600e3;`, /bound 48h/],
  ])('FAILED: %s', (_why, tamper, problem) => {
    const r = run(WRITE(tamper));
    expect(r.wrong.join(' | ')).toMatch(problem);
  });

  it('the pinned tag topic IS keccak256("hyperdag_repid") (recomputed, and equal to the real log)', () => {
    const r = run(`({ oc, fx }) => {
      const { keccak256, toUtf8Bytes } = require('ethers');
      const ev = fx.repTx.logs.find((l) => l.topics[0] === oc.NEW_FEEDBACK);
      return { computed: keccak256(toUtf8Bytes(oc.REPID_FEEDBACK_TAG)), pinned: oc.REPID_FEEDBACK_TAG_TOPIC, logged: ev.topics[3] };
    }`);
    expect(r.computed).toBe(r.pinned);
    expect(r.logged).toBe(r.pinned);
  });
});

describe('the on-chain agent binding — agentNameFromTokenURI / bindsToAgent', () => {
  it('reads the name from both live tokenURI shapes, and nothing from junk', () => {
    expect(run(`({ oc, fx }) => [oc.agentNameFromTokenURI(fx.registrations['3747']), oc.agentNameFromTokenURI(fx.registrations['6711'])]`)).toEqual(['SOPHIA', 'trinity-nexus']);
    for (const junk of ['', 'not a uri', 'data:application/json;base64,!!!', 'data:application/json,{"name":""}', 'ipfs://Qm']) {
      expect(run(`({ oc }) => oc.agentNameFromTokenURI(${JSON.stringify(junk)})`)).toBeNull();
    }
  });

  it('matches case-insensitively with the fleet\'s trinity- prefix dropped, and nothing looser', () => {
    expect(run(`({ oc }) => [
      oc.bindsToAgent('SOPHIA', 'trinity-sophia'), oc.bindsToAgent('trinity-nexus', 'trinity-nexus'),
      oc.bindsToAgent('SOPHIA', 'trinity-nexus'), oc.bindsToAgent('SOPHIA-2', 'trinity-sophia'),
      oc.bindsToAgent(null, 'trinity-sophia'), oc.bindsToAgent('trinity-', 'trinity-'),
    ]`)).toEqual([true, true, false, false, false, false]);
  });
});

describe('a null chain receipt is FAILED by the check itself, never a throw left to the caller', () => {
  it('checkDealSettlement', () => {
    const r = run(`({ oc, fx }) => oc.checkDealSettlement({ deal: fx.deal, receipt: null, dealReceipt: fx.dealReceipt, html: '', minedAtMs: 0, nowMs: 0 })`);
    expect(r.wrong).toEqual([expect.stringMatching(/chain has no receipt for the settlement tx/)]);
  });
  it('checkReputationWrite', () => {
    const r = run(`({ oc, abi }) => oc.checkReputationWrite({ receipt: null, minedAtMs: 0, nowMs: 0, expectAgents: ['trinity-sophia'], abi })`);
    expect(r.wrong).toEqual(['the chain has no receipt for the reputation write']);
  });
});

const ANCHOR = (tamper: string) => `({ oc, fx, abi, clone }) => {
  const a = { verified: { verified: true }, uid: fx.anchor.uid, att: clone(fx.anchor.att), statement: clone(fx.anchor.statement),
    proofCreatedAt: fx.anchor.proofCreatedAt, nowMs: Number(fx.anchor.att.time) * 1000 + 3600e3, abi };
  ${tamper}
  return oc.checkAnchor(a);
}`;

describe('onchain.zkrepid_eas_anchor — checkAnchor', () => {
  it('the real anchor passes (pinned schema and attester, unexpired, same agent and tier)', () => {
    const r = run(ANCHOR(''));
    expect(r.wrong).toEqual([]);
  });

  it('agent ids compare case-insensitively (a UUID upper-cased is the same agent)', () => {
    expect(run(ANCHOR(`a.statement.agent_id = a.statement.agent_id.toUpperCase();`)).wrong).toEqual([]);
  });

  it.each([
    ['an attestation under another schema', `a.att.schema = '0x' + 'cd'.repeat(32);`, /not repid-real-proof-batch-v1/],
    ['an attestation by another attester', `a.att.attester = '${OTHER}';`, /made by 0x1111/],
    ['an EXPIRED attestation', `a.att.expirationTime = String(Math.floor(a.nowMs / 1000) - 1);`, /EXPIRED/],
    ['a REVOKED attestation', `a.att.revocationTime = '1';`, /REVOKED/],
    ['an anchor older than 7 days by its block time', `a.nowMs = Number(fx.anchor.att.time) * 1000 + 8 * 86400e3;`, /attested 8\.0 days ago/],
    ['an attestation about another agent', `a.statement.agent_id = 'someone-else';`, /about agent/],
  ])('FAILED: %s', (_why, tamper, problem) => {
    const r = run(ANCHOR(tamper));
    expect(r.wrong.join(' | ')).toMatch(problem);
  });
});
