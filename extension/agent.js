
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
 * Reads only public GET routes on the engine already in host_permissions. Sends no claim text.
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
    const [live, proof] = await Promise.all([
      getJson(fetchImpl, `${base}/api/v1/repid/${enc}`, timeoutMs),
      getJson(fetchImpl, `${base}/api/v1/repid/${enc}/proof`, timeoutMs),
    ]);
    const score = live && typeof live.score === 'number' ? live.score : null;
    const tier = live && typeof live.tier === 'string' ? live.tier : null;
    const base_ = { id, score, tier };
    if (!proof || typeof proof.proof_bytes !== 'string' || !proof.proof_bytes || !proof.statement) {
      return { ...base_, outcome: 'not-checked', reason: 'no_proof' };
    }
    const statement = proof.statement;
    // A proof for another agent is not this agent's proof, whatever it verifies to.
    if (proof.agent_id && statement.agent_id && proof.agent_id !== statement.agent_id) {
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

  /** Plain text lines for the popup. */
  function agentLines(r) {
    const lines = [];
    if (r.reason === 'bad_id') return ['Type an agent id, for example trinity-sophia.'];
    lines.push(`${r.id}: RepID ${r.score == null ? 'unknown' : r.score}${r.tier ? ` (${r.tier})` : ''}`);
    if (r.outcome === 'verified') {
      lines.push(`Proof verified in your browser: RepID ${r.provenScore} is at least ${r.threshold} (${r.provenTier}).`);
      if (r.createdAt) lines.push(`Proof made ${r.createdAt.slice(0, 10)}. The live score can differ from the proven one.`);
      if (r.attestation) lines.push(`On-chain receipt: ${r.attestation.slice(0, 10)}…`);
    } else if (r.outcome === 'not-verified') {
      lines.push('Proof NOT verified. Do not treat this score as proven.');
    } else {
      lines.push('Proof not checked: no proof could be read or verified here. Not checked is not the same as verified.');
    }
    return lines;
  }

  const api = { ENGINE, cleanId, checkAgent, agentLines };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof globalThis === 'object') globalThis.trustshellAgent = api;
})();
