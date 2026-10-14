/**
 * kernel-buy — the dogfood script for the policy kernel. SCAFFOLD ONLY: it cannot buy anything.
 *
 * WHAT IT WIRES (the three steps, in order):
 *   1. fetch the resource and read its HTTP 402 payment requirements   (a plain GET, no payment)
 *   2. ask the policy kernel whether the owner's signed policy permits this spend   (kernelDecide)
 *   3. only on a clean ALLOW, call guardedX402Payment with a writeReceipt thunk
 *      (the receipt is written BEFORE the signature; if it cannot be written, nothing is signed)
 *
 * WHAT IT CANNOT DO. By default it stops after step 2 and prints "DRY RUN". Step 3 runs only when
 * TRUSTSHELL_KERNEL_BUY_ARMED is set to the exact string below, which is OFF unless someone sets it.
 * Even armed, this script SIGNS and never SENDS: it does not present the signed authorization to the
 * resource, so no value moves from here. Sending it is the spend, and it is not wired.
 *
 *   A REAL BUY NEEDS, AND THIS FILE DOES NOT SUPPLY:
 *     1. the operator's explicit GO (Sean's), given for this purchase;
 *     2. a funded Base Sepolia wallet for the buyer;
 *     3. the KEY-CUSTODY DECISION: where the payer key lives. This script reads it from the
 *        environment only when armed, never writes it anywhere, and never prints it. "Environment"
 *        is not an answer to the custody question; it is where a key sits while that is decided.
 *   Until all three exist, leave it unarmed. Do not add a default for any of them.
 *
 * THE KERNEL IS THE GATE, ARMED OR NOT. A DENY or NOT_CHECKED from the kernel stops the script
 * before any key is read, whatever else is set. A kernel that cannot be reached is NOT_CHECKED.
 *
 * Exit codes carry the verdict, like the rest of this repo:
 *   0  the kernel ALLOWED (dry run: nothing was signed; armed: the payment was signed, not sent)
 *   2  NOT_CHECKED: missing input, the resource did not ask for payment, or the kernel could not
 *      be asked / did not answer cleanly
 *   3  REFUSED: the kernel said DENY
 *
 * Run (dry):
 *   TRUSTSHELL_KERNEL_RESOURCE_URL=https://provider.example/paid \
 *   TRUSTSHELL_BUYER_AGENT=<agent uuid> REPID_API_KEY=<key> node examples/kernel-buy/kernel-buy.mjs
 *
 * Env (read in the order the script needs them):
 *   TRUSTSHELL_KERNEL_RESOURCE_URL  the paid resource (must answer 402 to a plain GET)
 *   TRUSTSHELL_BUYER_AGENT          the buyer agent's id — the id the owner's policy was signed for
 *   REPID_API_KEY                   optional; the engine requires a key on /api/v1/kernel
 *   TRUSTSHELL_BUYER_NAME           optional; a label for the receipt
 *   TRUSTSHELL_API_URL              optional; defaults to the production engine
 *   TRUSTSHELL_SDK_ENTRY            optional; the SDK to load (defaults to this tree's dist/)
 *   TRUSTSHELL_HOME                 optional; where the local receipt log goes (default ~/.trustshell)
 * Only when armed:
 *   TRUSTSHELL_PAYER_KEY, TRUSTSHELL_PAY_CAP   the funded key, and the buyer's own spend ceiling
 */
import { appendFileSync, chmodSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { requirePayCap, refuseOverCap } from '../a2a-purchase/require-pay-cap.mjs';

/** The only value that arms step 3. Anything else — unset, "1", "true", a typo — leaves it off. */
const ARM_PHRASE = 'yes-sign-a-real-payment';
const armed = process.env.TRUSTSHELL_KERNEL_BUY_ARMED === ARM_PHRASE;

const EXIT_ALLOWED = 0;
const EXIT_NOT_CHECKED = 2;
const EXIT_REFUSED = 3;

const log = (...a) => console.log(...a);
const stop = (code, ...lines) => {
  for (const l of lines) log(l);
  process.exit(code);
};

const RESOURCE = process.env.TRUSTSHELL_KERNEL_RESOURCE_URL;
const BUYER = process.env.TRUSTSHELL_BUYER_AGENT;
const API_URL = process.env.TRUSTSHELL_API_URL || 'https://repid-engine-production.up.railway.app';

if (!RESOURCE || !BUYER) {
  stop(
    EXIT_NOT_CHECKED,
    'NOT_CHECKED: nothing was done. To run the dogfood (dry), set:',
    '  • TRUSTSHELL_KERNEL_RESOURCE_URL  the paid resource (answers 402 to a plain GET)',
    "  • TRUSTSHELL_BUYER_AGENT          the buyer agent's id (the id the owner's policy names)",
    '  • REPID_API_KEY                   if the engine requires a key (it does for /api/v1/kernel)',
    `Mode: ${armed ? 'ARMED' : 'DRY RUN'} — a real buy is not available from this script either way.`,
  );
}

// ── SDK ────────────────────────────────────────────────────────────────────────────────────────
const entry = process.env.TRUSTSHELL_SDK_ENTRY || new URL('../../dist/lib/index.js', import.meta.url).href;
const mod = await import(entry);
// The SDK is CommonJS; depending on how Node reads its exports the functions are on the namespace or on `default`.
const sdk = typeof mod.kernelDecide === 'function' ? mod : (mod.default ?? mod);
if (typeof sdk.kernelDecide !== 'function' || typeof sdk.guardedX402Payment !== 'function') {
  stop(EXIT_NOT_CHECKED, 'NOT_CHECKED: this SDK build has no kernelDecide. Run `npm run sdk:build` and try again.');
}

// ── 1. fetch the 402 — a plain GET, no payment header ──────────────────────────────────────────
log(`→ GET ${RESOURCE} (expecting 402)`);
let requirement;
try {
  const res = await fetch(RESOURCE, { redirect: 'error' });
  if (res.status !== 402) stop(EXIT_NOT_CHECKED, `NOT_CHECKED: the resource answered ${res.status}, not 402 — there is nothing to buy.`);
  const body = await res.json();
  requirement = Array.isArray(body?.accepts) ? body.accepts[0] : undefined;
} catch (e) {
  stop(EXIT_NOT_CHECKED, `NOT_CHECKED: could not read the resource's payment requirements (${e?.name ?? 'error'}).`);
}
const payTo = requirement?.payTo;
// The canonical engine/ecosystem 402 wire body carries the price in `amount`
// (repid-engine src/services/x402-server.ts; the facilitator envelope and trustmarket
// buy-intent agree). `maxAmountRequired` is the raw x402-spec field name. Prefer the
// canonical field and tolerate the spec one — reading only `maxAmountRequired` got
// `undefined` off the real wire and refused every valid 402 as NOT_CHECKED.
const amount = requirement?.amount ?? requirement?.maxAmountRequired;
const asset = requirement?.asset ?? null;
if (typeof payTo !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(payTo) || typeof amount !== 'string' || !/^(0|[1-9][0-9]*)$/.test(amount)) {
  stop(EXIT_NOT_CHECKED, "NOT_CHECKED: the 402 did not carry a usable payTo address and amount (raw units).");
}
log(`  requirement: ${amount} raw units to ${payTo}`);

// ── 2. ask the kernel ──────────────────────────────────────────────────────────────────────────
log('→ asking the policy kernel…');
const outcome = await sdk.kernelDecide(
  {
    agent: { agent_id: BUYER, agent_name: process.env.TRUSTSHELL_BUYER_NAME || 'kernel-buy' },
    tool: { name: 'x402.pay', class: 'spend' },
    origin: 'Cli',
    // Hashed here. The URL, the payee and the amount are not sent as "args" — only their hash is.
    args: { resource: RESOURCE, payTo, asset, amount },
    amount_raw: amount,
    payee: payTo,
    asset,
    chain_id: 84532,
  },
  { apiUrl: API_URL, ...(process.env.REPID_API_KEY ? { apiKey: process.env.REPID_API_KEY } : {}) },
);

if (!outcome.allowed) {
  const codes = outcome.reasons.map((r) => r.code).join(', ');
  stop(
    outcome.verdict === 'DENY' ? EXIT_REFUSED : EXIT_NOT_CHECKED,
    `REFUSED by ${outcome.source}: ${outcome.verdict} (${codes}). Nothing was signed; no key was read.`,
  );
}
log(`  kernel: ALLOW (policy ${outcome.receipt.decision.policy.policy_hash ?? 'n/a'}, effective limit ${outcome.receipt.decision.limits.effective_per_tx_raw})`);

// ── 3. sign — armed only ───────────────────────────────────────────────────────────────────────
if (!armed) {
  stop(
    EXIT_ALLOWED,
    'DRY RUN: the kernel allowed this spend, and nothing was signed.',
    '  A real buy needs the operator\'s GO, a funded wallet, and the key-custody decision. See the top of this file.',
  );
}

const payerKey = process.env.TRUSTSHELL_PAYER_KEY;
const cap = requirePayCap(process.env);
if (!payerKey) stop(EXIT_NOT_CHECKED, 'NOT_CHECKED: armed, but TRUSTSHELL_PAYER_KEY is not set. Nothing was signed.');
if (!cap.ok) stop(EXIT_NOT_CHECKED, `NOT_CHECKED: armed, but ${cap.message}. Nothing was signed.`);
const over = refuseOverCap(amount, cap.cap);
if (!over.ok) stop(EXIT_REFUSED, `REFUSED: ${over.message}. Nothing was signed.`);

/** The receipt is written BEFORE the signature. If this throws, guardedX402Payment signs nothing. */
function writeReceipt() {
  const dir = process.env.TRUSTSHELL_HOME || join(process.env.HOME || process.env.USERPROFILE || homedir(), '.trustshell');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, 'kernel-receipts.jsonl');
  appendFileSync(file, JSON.stringify(outcome.receipt) + '\n', { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* windows */ }
}

log('→ ARMED: signing (receipt first; the signed header is NOT sent anywhere)…');
const xPayment = await sdk.guardedX402Payment({
  origin: 'Cli',
  privateKey: payerKey,
  to: payTo,
  amount,
  cap: cap.cap,
  agentId: BUYER,
  policy: { allow: true }, // the kernel's ALLOW is the policy; a DENY never reaches this line
  writeReceipt,
});
log(`✓ signed (${xPayment.length} chars). Not sent. Presenting it to the resource is the spend, and that step is not in this script.`);
process.exit(EXIT_ALLOWED);
