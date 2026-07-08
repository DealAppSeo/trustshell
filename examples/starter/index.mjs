/**
 * trustshell-starter — the smallest real TrustShell app.
 *
 * Keyless. Against the LIVE HyperDAG backend. Copy this folder, then:
 *
 *   npm install
 *   npm start
 *
 * It does the two calls the whole trust promise is built on:
 *   1. init()          → live /health probe (fail fast if the backend is down)
 *   2. verifyOutput()  → run agent output through the live cross-provider HAL quorum
 *
 * No API key needed for either. The x402 A2A *purchase* path needs a key + a
 * funded Base Sepolia wallet — see examples/a2a-purchase in the repo.
 */
import { TrustShell } from '@hyperdag/trustshell';

const { client, health } = await TrustShell.init(); // defaults to the live engine URL
if (!health.ok) {
  console.error(`✗ backend unreachable: ${health.error ?? 'unknown'}`);
  process.exit(1);
}
console.log(`✓ backend healthy (status=${health.status})`);

// Change this line to verify your own agent's output.
const claim = 'The capital of France is Paris.';

const r = await client.verifyOutput(claim);
console.log(`\nclaim:      ${claim}`);
console.log(`verdict:    ${r.verdict}`);
console.log(`trustScore: ${r.trustScore}`);
console.log(`halScore:   ${r.halScore.toFixed(3)}`);
if (r.evidence.length) console.log(`evidence:   ${r.evidence.join(' | ')}`);

console.log('\nNext: edit `claim` above, or open examples/a2a-purchase for the buy-a-service loop.');
