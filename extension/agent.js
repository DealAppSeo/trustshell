
/**
 * V1-2 — zkRepID where a stranger sees it: type an agent id in the popup, get its RepID and a
 * proof that is verified IN THIS BROWSER, not by our server.
 *
 * WHAT "VERIFIED" MEANS HERE. The engine publishes a Plonky3 proof that the agent's score is at
 * or above a threshold (the statement). The popup runs the same WASM verifier the CLI's
 * `proof --verify` uses (@hyperdag/proof-verifier 0.2.0, vendored under vendor/), on the
 * stranger's machine. A tampered statement fails — measured against a live proof when this was
 * written: the real statement verifies, the same proof with repid_score raised does not.
 *
 * THREE OUTCOMES, NEVER TWO. verified / not-verified / not-checked. A failed fetch, a missing
 * proof, a verifier that did not load, or a statement for a different agent is not-checked or
 * not-verified, never verified. The live score and the proven score are shown separately: a
 * proof is a claim about the score when it was made, and the two can differ.
 *
 * Reads only public GET routes on the engine already in host_permissions (repid, its proof, and the
 * passport for the ERC-8004 ID). Sends no claim text.
 */

(function () {
  'use strict';
  // Function-scoped: popup.js shares this page's global scope and also declares `api`
  // (BUS N-LOAD-SCOPE). Caught by loading the real popup in Chromium, not by a unit test.

  const ENGINE = 'https://repid-engine-production.up.railway.app';
  const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
  // The ERC-8004 IdentityRegistry on Base Sepolia: a contract, not a wallet. The only registry this product is built on.
  const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
  const TOKEN_ID = /^(0|[1-9]\d{0,17})$/;
  const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
  const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
  const ZERO_ADDRESS = /^0x0{40}$/;
  // The engine's machine reason for withholding a registry address (transaction_hash, not_an_address...). Nothing else is printed.
  const ENGINE_REASON = /^[a-z_]{1,40}$/;

  function cleanId(raw) {
    const id = String(raw == null ? '' : raw).trim();
    return ID_RE.test(id) ? id : null;
  }

  async function getJson(fetchImpl, url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { credentials: 'omit', redirect: 'error', signal: controller.signal });
      if (!res || !res.ok) return null;
      return await res.json();
    } catch (_err) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * The registry the engine RECORDED, judged against the canonical IdentityRegistry. The result is the
   * canonical constant or NOT_CHECKED with a reason: never the engine's own string, which for most squad
   * agents is a placeholder, a transaction hash, another address or a near-miss. (Same rule as
   * registryReading in src/lib/identity.ts; tests/mint-honesty-parity.test.ts holds the two equal.)
   */
  function registryReading(raw, engineReason) {
    const notChecked = (reason) => ({ status: 'NOT_CHECKED', reason });
    if (typeof raw !== 'string' || raw.trim() === '') {
      const theirs = typeof engineReason === 'string' && ENGINE_REASON.test(engineReason) ? ` (the engine's reason: ${engineReason})` : '';
      return notChecked(`the engine sent no registry address${theirs}`);
    }
    const v = raw.trim();
    if (TX_HASH.test(v)) return notChecked('the recorded registry is a transaction hash, not an address');
    if (!ADDRESS.test(v)) return notChecked('the recorded registry is not an address');
    if (v.toLowerCase() !== IDENTITY_REGISTRY.toLowerCase()) return notChecked('the recorded registry is not the canonical IdentityRegistry');
    return { status: 'CANONICAL', address: IDENTITY_REGISTRY };
  }

  /**
   * The engine's live ownerOf cross-check (GET /api/v1/agents/:id/onchain), reduced to what the popup may rely
   * on. OWNER_FOUND counts only with a real non-zero owner AND a read about exactly the token the passport
   * named. No `check` (an older engine), an unknown `check` or anything malformed is NOT_CHECKED: not a
   * confirmation and not a denial.
   */
  function onChainReadFrom(body, tokenId) {
    const none = { check: 'NOT_CHECKED', owner: null, ownerMatchesRecord: null };
    if (!body || typeof body !== 'object') return none;
    const check = body.check;
    if (check === 'NO_TOKEN' || check === 'REVERTED') return { check, owner: null, ownerMatchesRecord: null };
    if (check !== 'OWNER_FOUND') return none;
    const owner = body.onChainOwner;
    if (typeof owner !== 'string' || !ADDRESS.test(owner) || ZERO_ADDRESS.test(owner)) return none;
    const dbToken = body.dbTokenId;
    const readToken = typeof dbToken === 'number' && Number.isSafeInteger(dbToken) && dbToken >= 0 ? String(dbToken) : typeof dbToken === 'string' ? dbToken.trim() : '';
    if (tokenId === null || readToken !== tokenId) return none;
    const conservator = body.dbConservator;
    const ownerMatchesRecord = typeof conservator === 'string' && ADDRESS.test(conservator) ? conservator.toLowerCase() === owner.toLowerCase() : null;
    return { check: 'OWNER_FOUND', owner, ownerMatchesRecord };
  }

  /**
   * The same ownerOf cross-check, read from the ADDITIVE `onchain` object the passport now folds in
   * (repid-engine #1330), so the one GET /passport/:id carries the read and the second GET /agents/:id/onchain is
   * not made. OWNER_FOUND counts only with a real non-zero owner. The embedded read is computed for this passport's
   * agent, so there is no separate token id to cross-check. ownerMatchesRecord is null: no conservator is carried.
   * Same rule as onChainReadFromPassport in src/lib/identity.ts.
   */
  function onChainReadFromPassport(onchain) {
    const none = { check: 'NOT_CHECKED', owner: null, ownerMatchesRecord: null };
    if (!onchain || typeof onchain !== 'object') return none;
    const check = onchain.check;
    if (check === 'NO_TOKEN' || check === 'REVERTED') return { check, owner: null, ownerMatchesRecord: null };
    if (check !== 'OWNER_FOUND') return none;
    const owner = onchain.owner;
    if (typeof owner !== 'string' || !ADDRESS.test(owner) || ZERO_ADDRESS.test(owner)) return none;
    return { check: 'OWNER_FOUND', owner, ownerMatchesRecord: null };
  }

  /** The `onchain` object repid-engine folds into the passport (#1330), when present and of that shape, else null.
   *  The `verified` boolean marks it: the second-call body never carries one, so the two read paths never mix. */
  function embeddedOnChain(passport) {
    const o = passport && typeof passport === 'object' ? passport.onchain : null;
    return o && typeof o === 'object' && typeof o.verified === 'boolean' ? o : null;
  }

  /** MINTED is shown, and "on-chain" is said, only for this: a canonical recorded registry AND an owner found for this token. */
  function isVerifiedOnChain(identity) {
    return Boolean(
      identity &&
        identity.state === 'MINTED' &&
        identity.tokenId !== null &&
        identity.registry && identity.registry.status === 'CANONICAL' &&
        identity.onChain && identity.onChain.check === 'OWNER_FOUND',
    );
  }

  /**
   * The SECOND RepID field: the ERC-8004 ID, read from the public passport route. The score and the ID
   * are two different things and are returned apart. States: MINTED / UNVERIFIED / NOT_MINTED, or
   * NOT_CHECKED for anything the engine did not say clearly (never read as NOT_MINTED). A token id is
   * kept only when it is a plain whole number.
   *
   * WHAT MINTED MEANS (E-1). The engine's own MINTED is a RECORD ("we hold a mint transaction"), not a
   * reading of the chain, and the record is wrong for most squad agents. So MINTED, and the word
   * "on-chain", are returned ONLY when the registry the read was bound to is the canonical IdentityRegistry
   * AND the engine's live ownership read found an owner for this token. That read is folded into the passport
   * as `onchain` (repid-engine #1330), so the one GET /passport/:id carries it; an older engine that does not
   * fold it in is read with a second GET /api/v1/agents/:id/onchain, passed here as onChainBody. Otherwise the
   * engine's MINTED comes back NOT_CHECKED with recordedState 'MINTED' and the reason. UNVERIFIED and NOT_MINTED
   * make no claim about the chain and pass through. Same rule as identityFromPassport in src/lib/identity.ts.
   *
   * BOUND TO THE AGENT THAT WAS ASKED ABOUT: when the live route named the agent the typed id resolved
   * to, a passport for any other agent is NOT_CHECKED, same as the proof (Strix on #437).
   */
  function identityOf(passport, resolvedId, onChainBody) {
    const none = { state: 'NOT_CHECKED', tokenId: null };
    if (!passport || typeof passport !== 'object') return none;
    const idv = passport.identity_erc8004;
    if (!idv || typeof idv !== 'object') return none;
    const named = passport.agent && typeof passport.agent.agent_id === 'string' ? passport.agent.agent_id : null;
    if (resolvedId && named && named !== resolvedId) return none;
    const st = idv.registered_onchain;
    if (st !== 'MINTED' && st !== 'UNVERIFIED' && st !== 'NOT_MINTED') return none;
    const raw = idv.token_id;
    const text = typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
    const tokenId = TOKEN_ID.test(text) ? text : null;
    const tokenNote = tokenId === null && text !== '' ? 'the engine sent a token id that is not a whole number, so it is not shown' : null;
    if (st !== 'MINTED') {
      return tokenId !== null ? { state: st, tokenId } : { state: st, tokenId: null, ...(tokenNote ? { reason: tokenNote } : {}) };
    }
    // Prefer the passport's folded-in `onchain` object (repid-engine #1330): one call, no second GET. Judge ITS
    // registry — the one the read was bound to — not the DB contract_address, which can be null for an agent the
    // live read confirmed. An older engine's second-call body (onChainBody) is the fallback.
    const embedded = embeddedOnChain(passport);
    const registry = embedded ? registryReading(embedded.registry) : registryReading(idv.contract_address, idv.contract_address_reason);
    const onChain = embedded ? onChainReadFromPassport(embedded) : onChainReadFrom(onChainBody, tokenId);
    const readMade = embedded !== null || onChainBody !== undefined;
    const problems = [];
    if (tokenNote) problems.push(tokenNote);
    else if (tokenId === null) problems.push('the engine sent no token id');
    if (registry.status !== 'CANONICAL') problems.push(registry.reason);
    if (onChain.check === 'REVERTED') problems.push('the registry says no token with that id exists');
    else if (onChain.check === 'NO_TOKEN') problems.push('the engine has no token id to read on chain');
    else if (onChain.check !== 'OWNER_FOUND') {
      problems.push(readMade ? 'the live ownerOf read did not confirm it' : 'no live ownerOf read was made');
    }
    const evidence = readMade ? { registry, onChain } : { registry };
    if (problems.length === 0) return { state: 'MINTED', tokenId, ...evidence };
    return { state: 'NOT_CHECKED', tokenId, recordedState: 'MINTED', ...evidence, reason: `the engine records a mint transaction, but ${problems.join('; ')}` };
  }

  /**
   * @param {string} rawId agent slug or id
   * @param {{ fetchImpl?: Function, verify?: (proofBytes: string, statement: object) => Promise<object>|object, base?: string, timeoutMs?: number }} opts
   */
  async function checkAgent(rawId, opts) {
    const o = opts || {};
    const id = cleanId(rawId);
    if (!id) return { outcome: 'not-checked', reason: 'bad_id' };
    const fetchImpl = o.fetchImpl || globalThis.fetch;
    const base = String(o.base || ENGINE).replace(/\/$/, '');
    const timeoutMs = Number.isFinite(o.timeoutMs) ? o.timeoutMs : 10000;
    const enc = encodeURIComponent(id);
    const [live, proof, passport] = await Promise.all([
      getJson(fetchImpl, `${base}/api/v1/repid/${enc}?with=id`, timeoutMs),
      getJson(fetchImpl, `${base}/api/v1/repid/${enc}/proof`, timeoutMs),
      getJson(fetchImpl, `${base}/api/v1/passport/${enc}`, timeoutMs),
    ]);
    const score = live && typeof live.score === 'number' ? live.score : null;
    const tier = live && typeof live.tier === 'string' ? live.tier : null;
    const resolvedForId = live && typeof live.agent_id === 'string' ? live.agent_id : null;
    // Two fields, kept apart: the score above, and the ERC-8004 ID here. The ID asks the engine for its live
    // ownership read ONLY when the passport says MINTED, because that is the only state that would say "on-chain".
    let identity = identityOf(passport, resolvedForId);
    // A recorded MINTED needs the live ownerOf read to be confirmed. repid-engine #1330 folds that read into
    // the passport, so identityOf already used it — no second call. An older engine did not, so fetch it then.
    if (identity.recordedState === 'MINTED' && !embeddedOnChain(passport)) {
      const uuid = cleanId(passport.agent && passport.agent.agent_id);
      const onchain = uuid ? await getJson(fetchImpl, `${base}/api/v1/agents/${encodeURIComponent(uuid)}/onchain`, timeoutMs) : null;
      identity = identityOf(passport, resolvedForId, onchain);
    }
    const base_ = { id, score, tier, identity };
    if (!proof || typeof proof.proof_bytes !== 'string' || !proof.proof_bytes || !proof.statement) {
      return { ...base_, outcome: 'not-checked', reason: 'no_proof' };
    }
    const statement = proof.statement;
    // A proof for another agent is not this agent's proof, whatever it verifies to.
    if (proof.agent_id && statement.agent_id && proof.agent_id !== statement.agent_id) {
      return { ...base_, outcome: 'not-verified', reason: 'statement_for_other_agent' };
    }
    // Bind the proof to the agent that was ASKED ABOUT (Strix on #437, CWE-345): the two ids
    // inside the proof agreeing with each other proves nothing about whose proof it is. The
    // live route names the agent the typed id resolved to (?with=id); a proof for any other
    // agent is not-verified. With no resolved id to compare against, the binding is not
    // checked, so the outcome is not-checked: never "verified" for an agent we cannot tie it to.
    const resolved = live && typeof live.agent_id === 'string' ? live.agent_id : null;
    if (!resolved) return { ...base_, outcome: 'not-checked', reason: 'binding_unavailable' };
    if (statement.agent_id !== resolved || (proof.agent_id && proof.agent_id !== resolved)) {
      return { ...base_, outcome: 'not-verified', reason: 'statement_for_other_agent' };
    }
    if (typeof o.verify !== 'function') return { ...base_, outcome: 'not-checked', reason: 'no_verifier' };
    let result;
    try {
      result = await o.verify(proof.proof_bytes, statement);
    } catch (_err) {
      return { ...base_, outcome: 'not-checked', reason: 'verifier_threw' };
    }
    const proven = {
      provenScore: typeof statement.repid_score === 'number' ? statement.repid_score : null,
      threshold: typeof statement.threshold === 'number' ? statement.threshold : null,
      provenTier: typeof statement.tier === 'string' ? statement.tier : null,
      scheme: typeof proof.scheme === 'string' ? proof.scheme : null,
      createdAt: typeof proof.created_at === 'string' ? proof.created_at : null,
      attestation: proof.eas && typeof proof.eas.attestation_uid === 'string' ? proof.eas.attestation_uid : null,
      verifierVersion: result && typeof result.verifier_version === 'string' ? result.verifier_version : null,
    };
    if (result && result.verified === true) return { ...base_, ...proven, outcome: 'verified' };
    return { ...base_, ...proven, outcome: 'not-verified', reason: (result && result.error) || 'not_verified' };
  }

  /** The ID as its own line, with its state in plain words. Not checked is never "not minted". */
  function identityLine(identity) {
    const i = identity && typeof identity === 'object' ? identity : { state: 'NOT_CHECKED', tokenId: null };
    const idText = i.tokenId ? `#${i.tokenId}` : i.state === 'NOT_MINTED' ? 'none yet' : 'not checked';
    let note;
    if (isVerifiedOnChain(i)) {
      note =
        `on-chain: the engine's ownerOf read found an owner for this token, and the recorded registry is the canonical IdentityRegistry ${IDENTITY_REGISTRY}` +
        (i.onChain && i.onChain.ownerMatchesRecord === false ? '; the on-chain owner is NOT the conservator the engine has on record' : '');
    } else if (i.state === 'MINTED') {
      // Says MINTED but carries no evidence for it (an older or hand-built object): never printed as on-chain.
      note = 'NOT_CHECKED: recorded as minted, but nothing here confirmed it on chain';
    } else if (i.state === 'UNVERIFIED') {
      note = 'has a token id; no record of the mint transaction here. Not the same as not minted.';
    } else if (i.state === 'NOT_MINTED') {
      note = 'off-chain only';
    } else if (i.recordedState === 'MINTED') {
      note = `NOT_CHECKED: ${i.reason || 'recorded as minted, not confirmed on chain'}. Recorded, not verified: this is not on-chain until an ownership read confirms it`;
    } else {
      note = 'the engine did not say. Not checked is not the same as not minted.';
    }
    return `ERC-8004 ID: ${idText} (${note})`;
  }

  /** Plain text lines for the popup. */
  function agentLines(r) {
    const lines = [];
    if (r.reason === 'bad_id') return ['Type an agent id, for example trinity-sophia.'];
    lines.push(`${r.id}: RepID ${r.score == null ? 'unknown' : r.score}${r.tier ? ` (${r.tier})` : ''}`);
    lines.push(identityLine(r.identity));
    if (r.outcome === 'verified') {
      lines.push(`Proof verified in your browser: RepID ${r.provenScore} is at least ${r.threshold} (${r.provenTier}).`);
      if (r.createdAt) lines.push(`Proof made ${r.createdAt.slice(0, 10)}. The live score can differ from the proven one.`);
      if (r.attestation) lines.push(`On-chain receipt: ${r.attestation.slice(0, 10)}…`);
    } else if (r.outcome === 'not-verified') {
      lines.push('Proof NOT verified. Do not treat this score as proven.');
    } else if (r.reason === 'binding_unavailable') {
      lines.push('Proof not checked: a proof exists, but the engine did not say which agent this name is, so it cannot be tied to this agent yet. Not checked is not the same as verified.');
    } else {
      lines.push('Proof not checked: no proof could be read or verified here. Not checked is not the same as verified.');
    }
    return lines;
  }

  const api = { ENGINE, IDENTITY_REGISTRY, cleanId, checkAgent, agentLines, identityOf, identityLine, registryReading, onChainReadFrom, onChainReadFromPassport, embeddedOnChain, isVerifiedOnChain };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof globalThis === 'object') globalThis.trustshellAgent = api;
})();
