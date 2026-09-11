import { envelope } from '../src/lib/trustshell';
import type { ProofPresentation } from '../src/lib/trustshell';

const postcard: ProofPresentation = {
  agentId: 'trinity-shofet',
  tier: 'postcard',
  proofBytes: 'Ynl0ZXM=',
  scheme: 'plonky3_range_check',
  statement: {
    agent_id: '32e0e809-c1c4-4405-913f-135c8a2d6626',
    repid_score: 2150,
    threshold: 999,
    tier: 'ESTABLISHED',
  },
  createdAt: '2026-09-01',
};

describe('envelope disclosure', () => {
  it('postcard still contains the score (control)', () => {
    expect(postcard.statement && postcard.statement.repid_score).toBe(2150);
    expect(JSON.stringify(postcard)).toMatch(/repid_score/);
  });

  it('CLIENT_STRIP_NOT_CIRCUIT: envelope has no repid_score; postcard statement still binds the score', () => {
    const env = envelope(postcard);
    const json = JSON.stringify(env);
    expect(env.tier).toBe('envelope');
    expect(json.includes('repid_score')).toBe(false);
    expect(json.includes('repid_score:')).toBe(false);
    expect(env.statement && env.statement.threshold).toBe(999);
    expect(env.statement && env.statement.tier).toBe('ESTABLISHED');
    expect(postcard.statement && postcard.statement.repid_score).toBe(2150);
  });
});
