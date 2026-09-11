#!/usr/bin/env node
/**
 * e2e-published.mjs — PUBLISHED TrustShell (@hyperdag/trustshell@1.3.0) against the PRODUCTION engine.
 * DONE-WHEN: `node tests/e2e-published.mjs` exits 0. This is the PAI backend contract.
 *
 * Run with the PUBLISHED package resolvable (npm i @hyperdag/trustshell@1.3.0), NOT the local tree.
 * Uses the real 1.3.0 API surface (measured 2026-09-10):
 *   TrustShell.init() -> { client, health }
 *   client.verifyOutput(text) -> { verdict: 'PASS'|'FLAG'|'VETO', trustScore, ... }
 *   client.getRepID(id) -> { repid:number, tier:string, ... }
 *   client.presentProof(id, {verify:true}) -> { proofBytes, scheme, verification:{verified:boolean} }
 *   client.register({ agentName }) -> { agentId, erc8004TokenId:null(=NOT_MINTED), ... }
 * NOTE: P0 spec said register({name}); the SHIPPED SDK requires `agentName` (maps to agent_name) —
 *       register({name}) returns 400 "agent_name (or name) is required". Test uses the real key.
 */
import { createRequire } from 'node:module';
import { TrustShell } from '@hyperdag/trustshell';

const require = createRequire(import.meta.url);
let ver = 'unknown';
try { ver = require('@hyperdag/trustshell/package.json').version; } catch { /* exports may block subpath */ }

let fails = 0;
const check = (name, cond, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

console.log(`# TrustShell published E2E — pkg ${ver} — against PRODUCTION engine`);

// 1. init() -> health.ok
const { client, health } = await TrustShell.init();
check('init() health.ok', health && health.ok === true, `health=${JSON.stringify(health)}`);

// 2. verifyOutput(true claim) -> PASS
const trueClaim = await client.verifyOutput('The capital of France is Paris.');
check('verifyOutput(true) → PASS', trueClaim.verdict === 'PASS', `verdict=${trueClaim.verdict} trust=${trueClaim.trustScore}`);

// 3. verifyOutput(false claim) -> VETO
const falseClaim = await client.verifyOutput('The Eiffel Tower is in Rome.');
check('verifyOutput(false) → VETO', falseClaim.verdict === 'VETO', `verdict=${falseClaim.verdict} trust=${falseClaim.trustScore}`);

// 4. getRepID('trinity-shofet') -> number + tier
const rep = await client.getRepID('trinity-shofet');
check('getRepID number + tier', typeof rep.repid === 'number' && typeof rep.tier === 'string' && rep.tier.length > 0, `repid=${rep.repid} tier=${rep.tier}`);

// 5. presentProof(..., {verify:true}) -> client verify true
const proof = await client.presentProof('trinity-shofet', { verify: true });
check('presentProof client verify true', proof.verification && proof.verification.verified === true, `verified=${proof.verification && proof.verification.verified} scheme=${proof.scheme} bytes=${(proof.proofBytes||'').length}`);

// 6. register({ agentName }) -> agent id + NOT_MINTED documented
const reg = await client.register({ agentName: 'pai-e2e-' + Date.now() });
check('register → agent id', typeof reg.agentId === 'string' && reg.agentId.length > 0, `agentId=${reg.agentId}`);
// NOT_MINTED: a keyless register has no on-chain identity token — erc8004TokenId is null.
check('register → NOT_MINTED (erc8004TokenId=null)', reg.erc8004TokenId === null, `erc8004TokenId=${JSON.stringify(reg.erc8004TokenId)} (null = NOT_MINTED, expected for keyless onboarding)`);

console.log(fails === 0 ? '\nE2E PUBLISHED: ALL PASS ✅' : `\nE2E PUBLISHED: ${fails} FAIL ❌`);
process.exit(fails === 0 ? 0 : 1);
