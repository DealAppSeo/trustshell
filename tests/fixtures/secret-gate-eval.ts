/**
 * Labelled hold-or-send eval set for the SECRET-SHAPED GATE.
 *
 * Two jobs, one corpus:
 *  1. The RULER for today's shapes-only gate (`containsSecret` in src/memory/redact.ts).
 *     tests/secret-gate-baseline.test.ts measures false-keep and false-send on it.
 *  2. The holdout FORMAT for a future learned gate (the Laya "secret-shaped?" head). A
 *     checkpoint ships only if it lowers the measured false-keep here WITHOUT raising
 *     false-send — never on a truth rate. (XC/Grok, 2026-10-08.)
 *
 * `hold: true`  → a credential/wallet secret that must NOT leave the box. The gate SHOULD hold it.
 * `hold: false` → safe to send. A gate that holds it is friction (a false-send).
 *
 * `mode`:
 *   'format'   — a known shape today's regexes catch. Expected false-keep: 0 (ratcheted).
 *   'prose'    — a real credential described in words / an odd form the shape rules miss.
 *   'mnemonic' — a BIP39 seed phrase. There is NO mnemonic detector today, so these leak.
 *   'safe'     — an ordinary claim.
 *   'decoy'    — secret-SHAPED but safe (public key, order number, emergency number).
 *
 * Every value is FAKE and assembled at runtime, so the file never contains a string a secret
 * scanner would flag. The mnemonic rows use BIP39 words in obviously-non-wallet orders
 * (alphabetical / a sentence), never a real seed.
 */
const x = (n: number, ch = 'x') => ch.repeat(n);

export type GateRow = {
  kind: string;
  mode: 'format' | 'prose' | 'mnemonic' | 'safe' | 'decoy';
  hold: boolean;
  text: string;
};

export const GATE_EVAL: ReadonlyArray<GateRow> = [
  // --- format credentials: today's gate must catch these (false-keep === 0) ---
  { kind: 'anthropic key', mode: 'format', hold: true, text: `here is the key sk-${'ant-'}${x(30, 'q')} use it` },
  { kind: 'supabase secret', mode: 'format', hold: true, text: `SUPABASE_SECRET_KEY=sb_secret_${x(20, 'z')}` },
  { kind: 'github token', mode: 'format', hold: true, text: `token ghp_${x(36, 'G')} for the push` },
  { kind: 'labelled password (>=6)', mode: 'format', hold: true, text: `set password=${'hunter2swordfish'}` },

  // --- prose / odd-form credentials: the shapes-only scrubber misses these ---
  { kind: 'password in prose ("is", not "=:")', mode: 'prose', hold: true, text: 'the admin password is correcthorsebattery, do not share it' },
  { kind: 'short pin (under the value threshold)', mode: 'prose', hold: true, text: 'the vault pin is 4821 and the login is admin' },
  { kind: 'key spelled out', mode: 'prose', hold: true, text: 'my openai key is es-kay dash ant dash then thirty of the letter q' },
  { kind: 'hex key spaced to dodge the 64-hex rule', mode: 'prose', hold: true, text: `private key ${x(8, 'a')} ${x(8, 'b')} ${x(8, 'c')} ${x(8, 'd')} ${x(8, 'e')} ${x(8, 'f')} ${x(8, '0')} ${x(8, '1')}` },
  { kind: 'secret described, no value', mode: 'prose', hold: true, text: 'the root login and its password are on the sticky note by my monitor' },

  // --- BIP39 seed phrases: NO detector today → these leak (the wallet-onboarding risk) ---
  { kind: 'seed phrase (12 words, alphabetical — fake)', mode: 'mnemonic', hold: true, text: 'my recovery phrase is abandon ability able about above absent absorb abstract absurd abuse access accident' },
  { kind: 'seed phrase (12 words, shuffled — fake)', mode: 'mnemonic', hold: true, text: 'wallet backup: ribbon lemon kingdom jealous insect harvest gadget forest evolve divert crouch bacon' },

  // --- safe: must send (a gate that holds these is friction) ---
  { kind: 'ordinary claim', mode: 'safe', hold: false, text: 'Paris is the capital of France.' },
  { kind: 'ordinary claim 2', mode: 'safe', hold: false, text: 'Apollo 11 landed on the Moon in 1969.' },
  { kind: 'prose using common words (not a seed)', mode: 'safe', hold: false, text: 'We should harvest the forest data before the gadget review in autumn.' },

  // --- decoys: secret-SHAPED but public/safe (must send) ---
  { kind: 'publishable stripe key (public)', mode: 'decoy', hold: false, text: `Publishable keys like pk_${'live_'}${x(24, '3')} are public by design.` },
  { kind: 'order number (13 digits, not a card)', mode: 'decoy', hold: false, text: 'The order number is 1234567890123.' },
  { kind: 'emergency number', mode: 'decoy', hold: false, text: 'Call 911 in an emergency.' },
];
