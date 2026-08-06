/**
 * LEG 1 EVIDENCE — client-side Plonky3 verification, proven by forgery attempts.
 *
 * `trustshell proof --verify` prints "verified ✓ (client-side, 0.2.0)". Until
 * this file existed, nothing established whether that was real STARK
 * verification or a shape check that would have printed the same tick for any
 * bytes at all. A verifier that accepts everything is worse than no verifier:
 * it converts an unchecked claim into a checked-looking one.
 *
 * So the load-bearing tests here are the REJECTIONS, not the acceptance. Four
 * distinct forgeries, each a thing an attacker would actually try:
 *
 *   flip one byte     → does the proof itself carry integrity?
 *   inflate the score → can you keep a real proof and lie about what it proves?
 *   raise the bound   → can you claim it clears a threshold it does not?
 *   swap the agent    → can you present someone else's proof as your own?
 *
 * Live evidence, 2026-08-06, against the production engine:
 *   genuine            verified:true, 10,673 bytes, 29ms
 *   1 byte flipped     "deser: Value is out of range"
 *   score → 9999       "plonky3: InvalidOpeningArgument(InvalidPowWitness)"
 *   threshold → 99999  "Statement claim (score <= threshold) is invalid for proof"
 *   agent swapped      "plonky3: InvalidOpeningArgument(InvalidPowWitness)"
 *
 * Those errors come from inside the Plonky3 verifier, which is the strongest
 * available signal that real STARK verification is running rather than a
 * well-behaved mock.
 */
const RUN = process.env.ECOSYSTEM_E2E === '1' || process.env.CI === 'true';
const d = RUN ? describe : describe.skip;

const ENGINE = process.env.TRUSTSHELL_API_URL || 'https://repid-engine-production.up.railway.app';
const AGENT = 'trinity-shofet';
const TIMEOUT = 60_000;

interface VerifyResult {
  verified: boolean;
  error: string | null;
  proof_size_bytes: number;
  verifier_version: string;
}
type Statement = Record<string, unknown>;

let b64: string;
let statement: Statement;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let verify: (proofB64: string, s: Statement) => Promise<VerifyResult>;

beforeAll(async () => {
  const mod = (await import('@hyperdag/proof-verifier')) as unknown as {
    verify: typeof verify;
  };
  verify = mod.verify;
  const res = await fetch(`${ENGINE}/api/v1/repid/${AGENT}/proof`, {
    signal: AbortSignal.timeout(45_000),
  });
  const j = (await res.json()) as { proof_bytes: string; statement?: Statement; agent_id: string };
  b64 = j.proof_bytes;
  statement =
    j.statement ?? { agent_id: j.agent_id, repid_score: 2070, threshold: 999, tier: 'ESTABLISHED' };
}, TIMEOUT);

/** Flip one byte in the middle. The smallest possible corruption. */
function flipOneByte(base64: string): string {
  const raw = Buffer.from(base64, 'base64');
  const copy = Buffer.from(raw);
  copy[Math.floor(copy.length / 2)] ^= 0xff;
  return copy.toString('base64');
}

d('client-side Plonky3 verification', () => {
  it(
    'accepts a genuine live proof',
    async () => {
      const r = await verify(b64, statement);
      expect(`verified=${r.verified} error=${r.error}`).toBe('verified=true error=null');
      // A verifier reporting zero bytes examined has not examined the proof.
      expect(r.proof_size_bytes).toBeGreaterThan(1000);
    },
    TIMEOUT,
  );

  it(
    'REJECTS a proof with a single flipped byte',
    async () => {
      const r = await verify(flipOneByte(b64), statement);
      expect(r.verified).toBe(false);
      expect(r.error).toBeTruthy();
    },
    TIMEOUT,
  );

  it(
    'REJECTS a genuine proof paired with an inflated score',
    async () => {
      // Keep the real proof, lie about what it proves. If this passed, the proof
      // would be decorative — anyone could restate it as any score.
      const r = await verify(b64, { ...statement, repid_score: 9999 });
      expect(r.verified).toBe(false);
    },
    TIMEOUT,
  );

  it(
    'REJECTS a threshold the proof does not actually clear',
    async () => {
      const r = await verify(b64, { ...statement, threshold: 99_999 });
      expect(r.verified).toBe(false);
      // This one fails on the STATEMENT relation rather than the crypto, which
      // is the correct place for it to fail.
      expect(String(r.error)).toMatch(/statement|threshold|invalid/i);
    },
    TIMEOUT,
  );

  it(
    'REJECTS presenting another agent\'s proof as your own',
    async () => {
      const r = await verify(b64, { ...statement, agent_id: 'attacker-agent' });
      expect(r.verified).toBe(false);
    },
    TIMEOUT,
  );

  it(
    'verifies fast enough to sit in a request path',
    async () => {
      const t0 = Date.now();
      await verify(b64, statement);
      const ms = Date.now() - t0;
      // Observed 29ms. A generous ceiling — this asserts the order of magnitude,
      // so a regression to seconds fails while normal variance does not.
      expect(ms).toBeLessThan(2000);
    },
    TIMEOUT,
  );
});
