
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
   * The SECOND RepID field: the ERC-8004 ID, read from the public passport route. The score and the ID
   * are two different things and are returned apart. States: MINTED / UNVERIFIED / NOT_MINTED, or
   * NOT_CHECKED for anything the engine did not say clearly (never read as NOT_MINTED). A token id is
   * kept only when it is a plain whole number.
   *
   * BOUND TO THE AGENT THAT WAS ASKED ABOUT: when the live route named the agent the typed id resolved
   * to, a passport for any other agent is NOT_CHECKED, same as the proof (Strix on #437).
   */
  function identityOf(passport, resolvedId) {
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
    return { state: st, tokenId: /^(0|[1-9]\d{0,17})$/.test(text) ? text : null };
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
    // Two fields, kept apart: the score above, and the ERC-8004 ID here.
    const base_ = { id, score, tier, identity: identityOf(passport, resolvedForId) };
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
    const note =
      i.state === 'MINTED'
        ? 'on-chain'
        : i.state === 'UNVERIFIED'
          ? 'has a token id; no record of the mint transaction here. Not the same as not minted.'
          : i.state === 'NOT_MINTED'
            ? 'off-chain only'
            : 'the engine did not say. Not checked is not the same as not minted.';
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

  const api = { ENGINE, cleanId, checkAgent, agentLines, identityOf, identityLine };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof globalThis === 'object') globalThis.trustshellAgent = api;
})();
