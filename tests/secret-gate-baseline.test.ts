/**
 * The RULER for the secret-shaped gate (XC/Grok build order, 2026-10-08): measure today's gate's
 * false-keep and false-send BEFORE building a learned gate or opening any new text-sending surface.
 *
 *   false-keep = a secret the gate would SEND (hold:true, gate says send). The leak. The number
 *                that decides a secret gate.
 *   false-send = a safe line the gate would HOLD (hold:false, gate says hold). Friction only.
 *
 * Today's gate is `containsSecret` (src/memory/redact.ts) — a hold decision made of SHAPES. This
 * suite pins what it catches and, honestly, what it MISSES:
 *   • format credentials  → caught (false-keep 0, ratcheted — a weakened regex breaks this)
 *   • safe + decoy lines   → sent (false-send 0 — no over-holding of checkable claims)
 *   • prose + mnemonic     → MISSED today (the measured blind spot). Pinned so the number is
 *                            visible and down-only: a learned "secret-shaped?" gate (the Laya
 *                            experiment) ships ONLY if it lowers this WITHOUT raising false-send.
 *
 * The mnemonic miss is the one to read first: a shapes-only scrubber has no BIP39 detector, so a
 * user who pastes a seed phrase is not protected by `redact()`. That is the highest-value target
 * for the learned gate (or a conservative mnemonic rule), and this is where its win is measured.
 */
import { containsSecret, redact } from '../src/memory/redact';
import { GATE_EVAL, type GateRow } from './fixtures/secret-gate-eval';

/** Today's gate: hold the message when it carries a credential shape; otherwise send. */
const gateHolds = (text: string): boolean => containsSecret(text);

type Mode = GateRow['mode'];
const MODES: Mode[] = ['format', 'prose', 'mnemonic', 'safe', 'decoy'];

function confusion() {
  const falseKeep: Record<Mode, number> = { format: 0, prose: 0, mnemonic: 0, safe: 0, decoy: 0 };
  const falseSend: Record<Mode, number> = { format: 0, prose: 0, mnemonic: 0, safe: 0, decoy: 0 };
  for (const row of GATE_EVAL) {
    const held = gateHolds(row.text);
    if (row.hold && !held) falseKeep[row.mode]++; // secret that would leave the box
    if (!row.hold && held) falseSend[row.mode]++; // safe line held back
  }
  return { falseKeep, falseSend };
}

describe('secret-gate baseline — today\'s shapes-only gate (the ruler)', () => {
  const { falseKeep, falseSend } = confusion();
  const blindSpot = falseKeep.prose + falseKeep.mnemonic;

  it('reports the confusion matrix (the measured baseline)', () => {
    const lines = MODES.map(
      (m) => `  ${m.padEnd(9)} false-keep=${falseKeep[m]}  false-send=${falseSend[m]}`,
    );
    // eslint-disable-next-line no-console
    console.log(`\nsecret-gate baseline (containsSecret):\n${lines.join('\n')}\n  blind-spot false-keep (prose+mnemonic) = ${blindSpot}\n`);
    expect(GATE_EVAL.length).toBeGreaterThan(0);
  });

  it('INVARIANT: no false-keep on FORMAT credentials — a weakened regex breaks this', () => {
    expect(falseKeep.format).toBe(0);
  });

  it('INVARIANT: no false-send on safe or decoy lines — checkable claims are never over-held', () => {
    expect(falseSend.safe).toBe(0);
    expect(falseSend.decoy).toBe(0);
  });

  it('BLIND SPOT (pinned, down-only): prose and mnemonic secrets leak today', () => {
    // These are the measured gaps a shapes-only scrubber cannot close. The pins document the
    // exact ruler the learned gate must beat. Lower them (never raise) when a fix lands; a change
    // in either direction must be deliberate and reviewed, so this is `toBe`, not `toBeLessThan`.
    expect(falseKeep.prose).toBe(5);
    expect(falseKeep.mnemonic).toBe(2);
  });

  it('a mnemonic seed phrase is NOT redacted today (names the wallet-onboarding risk)', () => {
    const mnemonic = GATE_EVAL.find((r) => r.mode === 'mnemonic')!;
    // redact() is shapes-only; a BIP39 phrase has no shape, so it survives verbatim.
    expect(redact(mnemonic.text)).toBe(mnemonic.text);
  });
});
