/**
 * ERC-8004, read only: read one agent's identity from the IdentityRegistry, then run a TrustShell
 * `check` on one claim from its registration file.
 * ------------------------------------------------------------------
 *   node examples/erc8004-read-only/read-agent.mjs <agentId> [--claim "<text>"] [--claim-field description]
 *        [--no-check] [--json] [--rpc <url>] [--registry 0x...] [--chain-id 84532] [--ipfs-gateway <https url>]
 *
 * WHAT IT DOES (every step is a read)
 *   1. eth_chainId on the RPC, refused unless it is the chain you asked for (default Base Sepolia, 84532).
 *   2. eth_getCode on the registry, eth_call ownerOf / tokenURI / getAgentWallet. No key, no gas, no write.
 *   3. Fetch the registration file the agent's tokenURI names (https, or a data: URI) and check its shape
 *      against the EIP-8004 text, including whether it points back to THIS agent on THIS registry.
 *   4. Send ONE sentence from that file to TrustShell's hosted check (src/lib/claim.ts classifyClaim, the same
 *      call as `trustshell check "<sentence>"`) and print the label. --no-check sends nothing.
 *
 * WHAT IT DOES NOT DO: no transaction, no feedback, no reputation read, no payment, no validation request.
 * Everything not read is printed under "not done". Anything unreadable is NOT_CHECKED, never a pass.
 *
 * The tokenURI is chosen by whoever registered the agent, so it is treated as hostile input: https only
 * (plain http for localhost only with --allow-local-uri), no private or link-local addresses, no more than
 * 3 redirects, each hop re-checked, 256 KiB cap, 8 s timeout. A hostname that RESOLVES to a private address
 * is not caught (no DNS check here). The claim text is untrusted data too: the label says something about
 * that sentence and nothing about the agent.
 *
 * Imports this tree's dist/ (like examples/quickstart). Exit: 0 all checks passed, 1 a check failed or the
 * claim was vetoed, 2 something was NOT_CHECKED, 3 bad usage.
 */
import { run, render } from './erc8004-read.mjs';

const r = await run(process.argv.slice(2));
if (r.usage) {
  console.error(`usage error: ${r.usage}
node examples/erc8004-read-only/read-agent.mjs <agentId> [--claim "<text>"] [--no-check] [--json]`);
  process.exitCode = 3;
} else {
  console.log(process.argv.includes('--json') ? JSON.stringify(r, null, 2) : render(r));
  process.exitCode = r.exit;
}
