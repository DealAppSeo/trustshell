/**
 * @hyperdag/trustshell — 60-second quickstart
 *
 * Fresh clone → npm install → this file. It does the two things the wrapper
 * promise is built on, against the LIVE repid-engine (no API key needed):
 *
 *   1. init()          → live /health probe (fail fast if the backend is down)
 *   2. verifyOutput()  → run a real agent output through the live HAL quorum
 *
 * Both read paths are public. The x402 A2A write path (executeA2A) needs a
 * REPID_API_KEY + a funded Base Sepolia wallet — see QUICKSTART.md.
 *
 * Run:  node quickstart.mjs
 */
import { TrustShell } from '@hyperdag/trustshell';

const t0 = Date.now();

// 1) init() — constructs the client AND confirms the backend is reachable.
const { client, health } = await TrustShell.init({
  // apiUrl defaults to https://repid-engine-production.up.railway.app
  timeout: 60_000,
});

if (!health.ok) {
  console.error(`✗ backend unreachable: ${health.error ?? 'unknown'}`);
  process.exit(1);
}
console.log(`✓ init: backend healthy (status=${health.status})`);

// 2) verifyOutput() — the core "is this agent output trustworthy?" call.
// A truthful claim should PASS; a false one should be FLAG/VETO with evidence.
const truthful = await client.verifyOutput('The capital of France is Paris.');
console.log(
  `✓ verifyOutput (truthful): verdict=${truthful.verdict} ` +
    `trustScore=${truthful.trustScore} halScore=${truthful.halScore.toFixed(3)}`,
);
if (truthful.evidence.length) {
  console.log(`  evidence: ${truthful.evidence.join(' | ')}`);
}

const false_ = await client.verifyOutput('The Eiffel Tower is located in Rome, Italy.');
console.log(
  `✓ verifyOutput (false):    verdict=${false_.verdict} ` +
    `trustScore=${false_.trustScore} halScore=${false_.halScore.toFixed(3)}`,
);
if (false_.evidence.length) {
  console.log(`  evidence: ${false_.evidence.join(' | ')}`);
}

const seconds = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n⏱  first verified call completed in ${seconds}s (from init to two live verdicts).`);
