/**
 * trustkeys-submit.test.ts — the client's THREE OUTCOMES, never two.
 *
 * submitJob must report `verified` only for a 200 receipt, `refused` for a definite verifier deny,
 * and `could_not_check` whenever nobody looked — a network/parse failure our side, or the
 * verifier's own honest 503 `not_checked`. This pins that mapping so "we did not look" can never
 * silently become "it passed", which is this system's recurring defect.
 */
import { submitJob, type VerifyBody } from '../lib/trustkeys-signer';

const BODY = {
  policy: { v: 1, type: 'trustkeys-policy', owner: '0x' + '1'.repeat(40), chain_id: 84532, cap: '1', token: 'USDC', payee_hashes: ['0x0'], expiry: 1, policy_nonce: '0x0' },
  policy_signature: '0x00',
  job: { v: 1, type: 'trustkeys-job', owner: '0x' + '1'.repeat(40), chain_id: 84532, action: 'spend', cap: '1', payee_hash: '0x0', expiry: 1, nonce: '0x0' },
  job_signature: '0x00',
} as unknown as VerifyBody;

const URL_BASE = 'https://engine.example';

function mockFetch(impl: () => Promise<unknown>) {
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockImplementation(impl);
}
const jsonResponse = (status: number, body: unknown) => ({ status, json: async () => body }) as unknown as Response;

afterEach(() => {
  jest.restoreAllMocks();
  delete (globalThis as unknown as { fetch?: unknown }).fetch;
});

describe('submitJob — honest three-outcome verdict', () => {
  it('200 + verified receipt → verified, and it hits POST /api/v1/jobs/verify', async () => {
    const receipt = { action: 'spend', cap: '1', payee_hash: '0x0', chain_id: 84532, time: 'T', signature_status: 'verified' };
    const spy = jest.fn().mockResolvedValue(jsonResponse(200, { verified: true, receipt }));
    (globalThis as unknown as { fetch: unknown }).fetch = spy;
    const r = await submitJob(URL_BASE, BODY);
    expect(r.outcome).toBe('verified');
    if (r.outcome === 'verified') expect(r.receipt).toEqual(receipt);
    expect(spy).toHaveBeenCalledWith('https://engine.example/api/v1/jobs/verify', expect.objectContaining({ method: 'POST' }));
  });

  it('a definite deny (403 cap_exceeded) → refused with the verifier reason', async () => {
    mockFetch(async () => jsonResponse(403, { verified: false, error: 'cap_exceeded', message: 'too big' }));
    const r = await submitJob(URL_BASE, BODY);
    expect(r.outcome).toBe('refused');
    if (r.outcome === 'refused') {
      expect(r.status).toBe(403);
      expect(r.error).toBe('cap_exceeded');
    }
  });

  it('401 signature_mismatch → refused', async () => {
    mockFetch(async () => jsonResponse(401, { verified: false, error: 'signature_mismatch', message: 'nope' }));
    const r = await submitJob(URL_BASE, BODY);
    expect(r.outcome).toBe('refused');
  });

  it("the verifier's own 503 not_checked → could_not_check, NOT refused and NOT verified", async () => {
    mockFetch(async () => jsonResponse(503, { verified: false, error: 'not_checked', message: 'db down' }));
    const r = await submitJob(URL_BASE, BODY);
    expect(r.outcome).toBe('could_not_check');
  });

  it('a network error (fetch throws) → could_not_check, status null', async () => {
    mockFetch(async () => { throw new Error('ECONNREFUSED'); });
    const r = await submitJob(URL_BASE, BODY);
    expect(r.outcome).toBe('could_not_check');
    if (r.outcome === 'could_not_check') expect(r.status).toBeNull();
  });

  it('a non-JSON response → could_not_check', async () => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({ status: 502, json: async () => { throw new Error('not json'); } } as unknown as Response);
    const r = await submitJob(URL_BASE, BODY);
    expect(r.outcome).toBe('could_not_check');
  });

  it('no engine URL → could_not_check (never silently verified)', async () => {
    const r = await submitJob('', BODY);
    expect(r.outcome).toBe('could_not_check');
    if (r.outcome === 'could_not_check') expect(r.error).toBe('no_engine');
  });
});
