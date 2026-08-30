/**
 * Proof badge tests — pure rendering + the two honesty invariants:
 *   1. Green ("verified") ONLY when local verification returned true.
 *   2. The RepID score NEVER appears in any BADGE output. Note the scope: that is a fact about
 *      what this renderer emits, NOT about the proof. `repid_score` is a public input to the
 *      circuit and travels in the statement, so the caption must not claim the proof withholds
 *      it — it once did, and that was the single sentence readers took as the privacy guarantee.
 *
 * No network: badge rendering is pure over a ProofPresentation. The CLI `badge`
 * command is exercised through run() with a MOCKED client (same pattern as cli.test.ts).
 */
import {
  renderProofBadge,
  renderProofBadgeMarkdown,
  proofBadgeStatus,
} from '../src/lib/badge';
import type { ProofPresentation } from '../src/lib/trustshell';
import { parseArgs, run, EXIT, type CliIO } from '../src/cli';
import type { TrustShell } from '../src/lib/trustshell';

const SCORE = 7777; // the secret the proof must never reveal
const THRESHOLD = 999;

function presentation(over: Partial<ProofPresentation> = {}): ProofPresentation {
  return {
    agentId: 'trinity-shofet',
    tier: 'postcard',
    proofBytes: 'AAAA_base64_proof_bytes',
    scheme: 'plonky3_range_check',
    statement: { agent_id: 'trinity-shofet', repid_score: SCORE, threshold: THRESHOLD, tier: 'ESTABLISHED' },
    createdAt: '2026-08-07T00:00:00.000Z',
    ...over,
  };
}

function captureIO(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

describe('proofBadgeStatus — the honest state machine', () => {
  it('verified:true → verified/green', () => {
    const s = proofBadgeStatus(presentation({ verification: { verified: true, error: null, verifierVersion: 'wasm-v1' } }));
    expect(s.state).toBe('verified');
    expect(s.value).toMatch(/verified/i);
    expect(s.color).toBe('#3fb950');
    expect(s.label).toBe(`RepID ≥ ${THRESHOLD}`);
  });

  it('verified:false → failed/red (verification ran and did not pass)', () => {
    const s = proofBadgeStatus(presentation({ verification: { verified: false, error: 'proof mismatch', verifierVersion: 'wasm-v1' } }));
    expect(s.state).toBe('failed');
    expect(s.color).toBe('#d1242f');
    expect(s.detail).toMatch(/mismatch/);
  });

  it('verifier UNAVAILABLE → failed/red, NOT a pass (fail-closed)', () => {
    // The SDK reports an unavailable verifier as verified:false — this must render red.
    const s = proofBadgeStatus(presentation({ verification: { verified: false, error: 'verifier unavailable: not installed', verifierVersion: 'unavailable' } }));
    expect(s.state).toBe('failed');
    expect(s.value).not.toMatch(/✓/);
  });

  it('no verification run → unverified/grey (we refuse to imply unchecked trust)', () => {
    const s = proofBadgeStatus(presentation()); // no verification field
    expect(s.state).toBe('unverified');
    expect(s.value).toBe('unverified');
  });

  it('no proof bytes → no-proof', () => {
    const s = proofBadgeStatus(presentation({ proofBytes: '', verification: { verified: true, error: null, verifierVersion: 'x' } }));
    expect(s.state).toBe('no-proof');
  });
});

describe('renderProofBadge — SVG output', () => {
  it('is a self-contained SVG with no external references', () => {
    const svg = renderProofBadge(presentation({ verification: { verified: true, error: null, verifierVersion: 'wasm-v1' } }));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('</svg>');
    // No fetchable external assets — no phone-home. (The w3.org xmlns is a namespace
    // identifier, never fetched, so it is not a network reference.)
    expect(svg).not.toMatch(/<image|xlink:href|\ssrc=|url\(https?:/);
    expect(svg).toContain(`RepID ≥ ${THRESHOLD}`);
  });

  it('NEVER reveals the RepID score in any state', () => {
    const states: ProofPresentation[] = [
      presentation({ verification: { verified: true, error: null, verifierVersion: 'v' } }),
      presentation({ verification: { verified: false, error: 'x', verifierVersion: 'v' } }),
      presentation(), // unverified
      presentation({ proofBytes: '' }), // no-proof
    ];
    for (const p of states) {
      expect(renderProofBadge(p)).not.toContain(String(SCORE));
      expect(renderProofBadgeMarkdown(p)).not.toContain(String(SCORE));
    }
  });

  it('wraps in <a> only when an href is supplied', () => {
    const p = presentation({ verification: { verified: true, error: null, verifierVersion: 'v' } });
    expect(renderProofBadge(p)).not.toContain('<a ');
    const linked = renderProofBadge(p, { href: 'https://trustrepid.dev/agent/trinity-shofet' });
    expect(linked).toContain('<a ');
    expect(linked).toContain('trustrepid.dev');
  });

  it('escapes XML in a caller-supplied href', () => {
    const p = presentation({ verification: { verified: true, error: null, verifierVersion: 'v' } });
    const linked = renderProofBadge(p, { href: 'https://x.dev/?a=1&b=2"onload="x' });
    expect(linked).toContain('&amp;');
    expect(linked).not.toContain('"onload="x'); // the raw quote must be escaped
  });
});

describe('renderProofBadgeMarkdown', () => {
  it('embeds the SVG as a self-contained data URI + honest caption', () => {
    const md = renderProofBadgeMarkdown(presentation({ verification: { verified: true, error: null, verifierVersion: 'wasm-v1' } }));
    expect(md).toContain('data:image/svg+xml;base64,');
    expect(md).toMatch(/Attests agent, threshold and score; the score is a bound public input/);
    // The caption must NOT claim the proof withholds the score — it does not.
    expect(md).not.toMatch(/attests the threshold, not the score/);
  });
});

describe('CLI `badge` (mocked SDK — no network)', () => {
  it('verified proof → prints SVG, exit 0', async () => {
    const client = {
      presentProof: async () => presentation({ verification: { verified: true, error: null, verifierVersion: 'wasm-v1' } }),
    } as unknown as TrustShell;
    const { io, out } = captureIO();
    const code = await run(parseArgs(['badge', 'trinity-shofet']), client, io);
    expect(code).toBe(EXIT.OK);
    expect(out.join('')).toContain('<svg');
  });

  it('unverified/failed proof → still prints an honest badge but exits RUNTIME (never reads as success)', async () => {
    const client = {
      presentProof: async () => presentation({ verification: { verified: false, error: 'verifier unavailable', verifierVersion: 'unavailable' } }),
    } as unknown as TrustShell;
    const { io, out, err } = captureIO();
    const code = await run(parseArgs(['badge', 'trinity-shofet']), client, io);
    expect(code).toBe(EXIT.RUNTIME);
    expect(out.join('')).toContain('<svg'); // the honest (red) badge is still emitted
    expect(err.join('\n')).toMatch(/do NOT present it as a verified proof/);
  });

  it('--markdown emits the data-URI snippet', async () => {
    const client = {
      presentProof: async () => presentation({ verification: { verified: true, error: null, verifierVersion: 'v' } }),
    } as unknown as TrustShell;
    const { io, out } = captureIO();
    const code = await run(parseArgs(['badge', 'trinity-shofet', '--markdown']), client, io);
    expect(code).toBe(EXIT.OK);
    expect(out.join('')).toContain('data:image/svg+xml;base64,');
  });

  it('parseArgs routes badge + operand + --markdown', () => {
    const a = parseArgs(['badge', 'sophia', '--markdown']);
    expect(a.command).toBe('badge');
    expect(a.operand).toBe('sophia');
    expect(a.markdown).toBe(true);
  });
});
