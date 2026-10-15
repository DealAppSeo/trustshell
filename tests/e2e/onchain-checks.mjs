// onchain-checks.mjs — the decisions behind the acceptance gate's on-chain legs, as pure functions.
//
// harness-acceptance.mjs fetches (engine pointers, chain receipts, EAS reads) and calls these with what
// it got; tests/onchain-checks.test.ts calls them with real captured data and one tamper per check.
// Each returns `wrong` (every problem found, in words), so a tamper reads as a specific FAILED, never
// as a generic error. No I/O here. `abi` is an ethers AbiCoder (the gate passes the cold-installed one).
//
// PINNED, NEVER READ FROM THE ENGINE: the addresses, topics, schema and attester below are what the
// chain is checked against. A value taken from the engine's own response could not catch the engine.

export const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
export const EAS_BASE_SEPOLIA = '0x4200000000000000000000000000000000000021'; // EAS predeploy (OP stack)
/** keccak256("Transfer(address,address,uint256)") */
export const ERC20_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
/**
 * keccak256("NewFeedback(uint256,address,uint64,int128,uint8,string,string,string,string,string,bytes32)"):
 * ERC-8004 ReputationRegistry, agentId / clientAddress / indexedTag1 indexed (repid-engine
 * src/contracts/ReputationRegistry.abi.json). Recomputed and matched to a live log 2026-10-14.
 */
export const NEW_FEEDBACK = '0x6a4a61743519c9d648a14e6493f47dbe3ff1aa29e7785c96c8326a205e58febc';
/** The engine's ERC-8004 writer tags every RepID write tag1 = this (live log 2026-10-14). */
export const REPID_FEEDBACK_TAG = 'hyperdag_repid';
/**
 * topics[3] of that NewFeedback: an indexed `string` is logged as keccak256(bytes(value)), so this is
 * keccak256("hyperdag_repid"). Recomputed and matched to the live log's topics[3] 2026-10-14.
 */
export const REPID_FEEDBACK_TAG_TOPIC = '0xba5a93d572a22314cdb64ad7a5378fa53a5713c48d7aa04baa2685327a3cd78c';
/** The ERC-8004 ReputationRegistry on Base Sepolia (pinned; the package export is cross-checked against it). */
export const REPUTATION_REGISTRY = '0x8004B663056A597Dffe9eCcC1965A193B7388713';
/** The ERC-8004 IdentityRegistry on Base Sepolia, read for tokenURI(agentId): the on-chain agent binding. */
export const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
/** EAS schema uid of repid-real-proof-batch-v1 (on-chain, repid-engine reports/2026-07-26 BEAT24/26). */
export const REPID_BATCH_SCHEMA_UID = '0x4e8445d9663aaaa7f74409c88c1652b2f2a44e2a86dd008d70543b9804c71cd6';
/** The batch anchor's attester (public; repid-engine scripts/diag/verify-anchor-batch.ts EXPECTED_ATTESTER). */
export const REPID_ANCHOR_ATTESTER = '0x4F8AD3fB35473b6DEA0559FfbbDe034e2Db504fb';

export const HOUR = 3600 * 1000;
export const DEAL_MAX_AGE_H = 30;   // the dogfood deal settles daily around 12:00Z; one missed day goes red
export const WRITE_MAX_AGE_H = 48;  // the ReputationRegistry write rides the daily deal
export const ANCHOR_MAX_AGE_D = 7;  // the same bound zkrepid.freshness uses, dated by the EAS block time
export const SKEW_MAX_MIN = 15;     // the engine's settled_at must agree with the block it names

const lower = (s) => String(s ?? '').toLowerCase();
const short = (h) => `${String(h).slice(0, 10)}…`;
const ZERO = /^0x0{40}$/i;
/** The address in a 32-byte indexed topic. */
export const topicAddress = (t) => `0x${String(t).slice(26)}`.toLowerCase();

/**
 * THE DAILY DEAL. `deal` is the engine's feed entry; `dealReceipt` / `html` are the engine's public
 * receipt (JSON / page). Those are ONE source (the engine) repeating one hash, not corroboration. The
 * chain decides: exactly one USDC Transfer of the deal's amount, decoded from and to. `parties` is the
 * payer/payee wallets the deal record names (partiesFrom), or null when it names none: then the
 * transfer's from/to are reported as chain facts and NOT tied to the named agents.
 */
/**
 * The payer/payee wallets the engine's public deal receipt names for its buyer and provider
 * (`payer_wallet` / `payee_wallet`, repid-engine #1386), or null unless BOTH are addresses. Null is
 * "not stated", never a pass: the deal leg then says the parties are not checked.
 */
export function partiesFrom(dealReceipt) {
  const payer = dealReceipt?.payer_wallet;
  const payee = dealReceipt?.payee_wallet;
  const addr = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
  return addr(payer) && addr(payee) ? { payer, payee } : null;
}

export function checkDealSettlement({ deal, receipt, dealReceipt, html, minedAtMs, nowMs, parties = null }) {
  const wrong = [];
  if (!receipt) return { wrong: [`the chain has no receipt for the settlement tx ${short(deal?.tx_hash)}`], from: null, to: null, ageH: null };
  if (receipt.status !== '0x1') wrong.push(`the settlement tx reverted (status ${receipt.status})`);
  if (lower(receipt.to) !== lower(USDC_BASE_SEPOLIA)) wrong.push(`the settlement tx went to ${receipt.to}, not Base Sepolia USDC`);
  const transfers = (receipt.logs ?? []).filter((l) =>
    lower(l.address) === lower(USDC_BASE_SEPOLIA) && l.topics?.[0] === ERC20_TRANSFER && l.topics.length === 3);
  const amount = BigInt(deal.amount);
  const matching = transfers.filter((l) => BigInt(l.data) === amount);
  let from = null, to = null;
  if (transfers.length === 0) wrong.push('the settlement tx carries no USDC Transfer');
  else if (matching.length === 0) wrong.push(`USDC moved ${transfers.map((l) => BigInt(l.data)).join(', ')}, the deal says ${deal.amount}`);
  else if (matching.length > 1) wrong.push(`${matching.length} USDC Transfers of ${deal.amount} in one tx: which one paid the deal is ambiguous`);
  else {
    from = topicAddress(matching[0].topics[1]);
    to = topicAddress(matching[0].topics[2]);
    if (ZERO.test(from) || ZERO.test(to)) wrong.push(`the Transfer is a mint or burn (${from} → ${to}), not a payment`);
    else if (from === to) wrong.push(`the Transfer is a self-transfer (${from})`);
    if (parties) {
      if (from !== lower(parties.payer)) wrong.push(`USDC came from ${from}, the deal names payer ${parties.payer}`);
      if (to !== lower(parties.payee)) wrong.push(`USDC went to ${to}, the deal names payee ${parties.payee}`);
    }
  }
  if (dealReceipt.settlement_tx !== deal.tx_hash) wrong.push(`the public receipt names settlement ${short(dealReceipt.settlement_tx)}, not ${short(deal.tx_hash)}`);
  if (dealReceipt.is_simulated !== false) wrong.push('the public receipt marks the exchange simulated');
  if (!String(html ?? '').includes(deal.tx_hash)) wrong.push('the receipt page does not show the settlement tx');
  const skewMin = Math.abs(minedAtMs - Date.parse(deal.settled_at)) / 60000;
  if (!(skewMin <= SKEW_MAX_MIN)) wrong.push(`the engine says settled at ${deal.settled_at} but the tx was mined ${new Date(minedAtMs).toISOString()} (${skewMin.toFixed(0)} min apart)`);
  const ageH = (nowMs - minedAtMs) / HOUR;
  if (!(ageH <= DEAL_MAX_AGE_H)) wrong.push(`the newest real deal was mined ${ageH.toFixed(1)}h ago (bound ${DEAL_MAX_AGE_H}h): the daily dogfood deal did not run`);
  return { wrong, from, to, ageH };
}

/**
 * The agent an ERC-8004 IdentityRegistry tokenURI names, read from the CHAIN, or null. Two shapes are
 * live (2026-10-14): an on-chain registration (`data:application/json;base64,…` with "name":"SOPHIA"),
 * and a URL whose last path segment is the agent (`https://trustrepid.dev/agents/trinity-nexus`).
 */
export function agentNameFromTokenURI(uri) {
  const s = String(uri ?? '');
  try {
    const m = /^data:application\/json(;base64)?,(.*)$/s.exec(s);
    if (m) {
      const json = JSON.parse(m[1] ? Buffer.from(m[2], 'base64').toString('utf8') : decodeURIComponent(m[2]));
      return typeof json?.name === 'string' && json.name.trim() !== '' ? json.name.trim() : null;
    }
    if (/^https?:\/\//.test(s)) {
      const seg = new URL(s).pathname.split('/').filter(Boolean).pop();
      return seg ? decodeURIComponent(seg) : null;
    }
  } catch { /* an unreadable registration names nobody */ }
  return null;
}

/**
 * Does the on-chain registered name denote the agent the deal names? The fleet registers some agents by
 * their short name (SOPHIA for trinity-sophia), so the comparison is case-insensitive with the fleet's
 * `trinity-` prefix dropped on both sides. A NAME match, stated as such in the leg's line; it is not a
 * key binding.
 */
export const bindsToAgent = (registeredName, agentName) => {
  const norm = (n) => lower(n).trim().replace(/^trinity-/, '');
  return registeredName !== null && norm(registeredName) !== '' && norm(registeredName) === norm(agentName);
};

/**
 * THE ERC-8004 WRITE. The tx must succeed, go TO the pinned ReputationRegistry, and carry EXACTLY ONE
 * NewFeedback from it (one write per tx is what the engine does; two is ambiguous and FAILED), tagged
 * REPID_FEEDBACK_TAG in both the indexed topic and the data. Its agentId's registration, read from the
 * IdentityRegistry ON CHAIN (`registrations`: { agentId: tokenURI }), must name one of `expectAgents`
 * (the deal's two named parties, or the sample agent): the engine supplies the names, the chain the
 * binding. When the engine states the value (`expectValue`, the deal receipt's onchain_repid) it must
 * equal the written value at 0 decimals. A null receipt is FAILED here, not left to the caller.
 */
export function checkReputationWrite({ receipt, minedAtMs, nowMs, expectAgents, registrations = {}, expectValue = null, abi }) {
  if (!receipt) return { wrong: ['the chain has no receipt for the reputation write'], feedback: null, ageH: null };
  const wrong = [];
  if (receipt.status !== '0x1') wrong.push(`the write reverted (status ${receipt.status})`);
  if (lower(receipt.to) !== lower(REPUTATION_REGISTRY)) wrong.push(`the write went to ${receipt.to}, not the ReputationRegistry ${REPUTATION_REGISTRY}`);
  const events = (receipt.logs ?? [])
    .filter((l) => lower(l.address) === lower(REPUTATION_REGISTRY) && l.topics?.[0] === NEW_FEEDBACK && l.topics.length === 4)
    .map((l) => {
      const [feedbackIndex, value, decimals, tag1] = abi.decode(['uint64', 'int128', 'uint8', 'string', 'string', 'string', 'string', 'bytes32'], l.data);
      return { agentId: BigInt(l.topics[1]).toString(), client: topicAddress(l.topics[2]), tagTopic: lower(l.topics[3]), feedbackIndex: feedbackIndex.toString(), value: value.toString(), decimals: Number(decimals), tag1 };
    });
  let feedback = null;
  if (events.length === 0) wrong.push('the registry emitted no NewFeedback in that tx');
  else if (events.length > 1) wrong.push(`the registry emitted ${events.length} NewFeedback events in one tx: which one is this deal's write is ambiguous`);
  else {
    const e = events[0];
    const registeredAs = agentNameFromTokenURI(registrations[e.agentId]);
    feedback = { ...e, registeredAs };
    const wanted = (expectAgents ?? []).filter(Boolean);
    if (wanted.length === 0) wrong.push('the engine names no agent to compare the write against');
    else if (registeredAs === null) wrong.push(`the IdentityRegistry names no agent for ERC-8004 id ${e.agentId}`);
    else if (!wanted.some((a) => bindsToAgent(registeredAs, a))) {
      wrong.push(`the NewFeedback is for ERC-8004 agent ${e.agentId}, registered on chain as "${registeredAs}", not ${wanted.join(' or ')}`);
    }
    if (expectValue !== null && !(e.decimals === 0 && e.value === String(expectValue))) {
      wrong.push(`the NewFeedback wrote ${e.value} (decimals ${e.decimals}), the engine says ${expectValue}`);
    }
    if (e.tag1 !== REPID_FEEDBACK_TAG) wrong.push(`the NewFeedback is tagged "${e.tag1}", not "${REPID_FEEDBACK_TAG}"`);
    if (e.tagTopic !== REPID_FEEDBACK_TAG_TOPIC) wrong.push(`the NewFeedback's indexed tag topic ${short(e.tagTopic)} is not keccak256("${REPID_FEEDBACK_TAG}")`);
  }
  const ageH = (nowMs - minedAtMs) / HOUR;
  if (!(ageH <= WRITE_MAX_AGE_H)) wrong.push(`the newest write was mined ${ageH.toFixed(1)}h ago (bound ${WRITE_MAX_AGE_H}h)`);
  return { wrong, feedback, ageH };
}

/**
 * THE zkRepID ANCHOR. `att` is the decoded EAS getAttestation result; `statement` the proof's statement.
 * The attestation must exist, be unexpired and unrevoked, be made under the PINNED schema by the PINNED
 * attester, decode as repid-real-proof-batch-v1 naming the same agent (case-insensitive) and tier, and be
 * no older than ANCHOR_MAX_AGE_D by its own block time. Not checked here: that THIS proof is inside the
 * anchored batch (no inclusion path is served).
 */
export function checkAnchor({ verified, uid, att, statement, proofCreatedAt, nowMs, abi }) {
  const wrong = [];
  let payload = null;
  if (verified?.verified !== true) wrong.push(`the proof did NOT verify client-side: ${verified?.error ?? 'no reason given'}`);
  if (!/^0x[0-9a-fA-F]{64}$/.test(uid ?? '')) {
    wrong.push('the proof names no EAS attestation uid');
    return { wrong, payload, ageD: null };
  }
  if (!att || lower(att.uid) !== lower(uid)) {
    wrong.push(`EAS has no attestation ${short(uid)} on Base Sepolia`);
    return { wrong, payload, ageD: null };
  }
  const nowS = BigInt(Math.floor(nowMs / 1000));
  if (BigInt(att.revocationTime) !== 0n) wrong.push(`the attestation was REVOKED at ${new Date(Number(att.revocationTime) * 1000).toISOString()}`);
  if (BigInt(att.expirationTime) !== 0n && BigInt(att.expirationTime) <= nowS) wrong.push(`the attestation EXPIRED at ${new Date(Number(att.expirationTime) * 1000).toISOString()}`);
  if (lower(att.schema) !== lower(REPID_BATCH_SCHEMA_UID)) wrong.push(`the attestation is under schema ${short(att.schema)}, not repid-real-proof-batch-v1 ${short(REPID_BATCH_SCHEMA_UID)}`);
  if (lower(att.attester) !== lower(REPID_ANCHOR_ATTESTER)) wrong.push(`the attestation was made by ${att.attester}, not the anchor attester ${REPID_ANCHOR_ATTESTER}`);
  try {
    payload = abi.decode(['string', 'string', 'bytes32', 'uint256', 'string', 'uint64'], att.data);
  } catch { wrong.push('the attestation data does not decode as repid-real-proof-batch-v1'); }
  if (payload && lower(payload[0]) !== lower(statement?.agent_id)) wrong.push(`the attestation is about agent ${payload[0]}, the proof about ${statement?.agent_id}`);
  if (payload && payload[1] !== statement?.tier) wrong.push(`the attestation says tier ${payload[1]}, the proof ${statement?.tier}`);
  const attestedMs = Number(att.time) * 1000;
  // An ORDERING check against the engine's timestamp, not an age: the anchor cannot predate its proof.
  if (attestedMs < Date.parse(proofCreatedAt) - 60000) wrong.push('the attestation predates the proof it is said to anchor');
  const ageD = (nowMs - attestedMs) / (24 * HOUR);
  if (!(ageD <= ANCHOR_MAX_AGE_D)) wrong.push(`the anchor was attested ${ageD.toFixed(1)} days ago by its block time (bound ${ANCHOR_MAX_AGE_D})`);
  return { wrong, payload, ageD };
}
