import { rejectEmptyName, parseHalVerdict, parseRegister } from '../lib/create-pai-parse';

describe('create PAI parsers (live HAL decision field)', () => {
  it('empty name is refused before register', () => {
    expect(rejectEmptyName('')).toBe('Give your PAI a name first.');
    expect(rejectEmptyName('   ')).toBe('Give your PAI a name first.');
    expect(rejectEmptyName('Atlas')).toBeNull();
  });

  it('live HAL decision vetoed → VETO (not verdict/hal_decision)', () => {
    expect(parseHalVerdict({ decision: 'vetoed' })).toBe('VETO');
    expect(parseHalVerdict({ decision: 'clean' })).toBe('PASS');
    expect(parseHalVerdict({ verdict: 'PASS' })).toBe('PASS');
    expect(parseHalVerdict({})).toBeNull();
  });

  it('429 with empty body is name taken, not a stack', () => {
    expect(parseRegister(429, {})).toEqual({
      ok: false,
      message: 'That name is taken — pick another.',
    });
  });

  it('201 shows api_key; camelCase apiKey also accepted', () => {
    expect(parseRegister(201, { agent_id: 'abc', api_key: 'ts_live_x' })).toEqual({
      ok: true,
      agentId: 'abc',
      apiKey: 'ts_live_x',
    });
    expect(parseRegister(201, { agentId: 'abc', apiKey: 'ts_live_y' })).toEqual({
      ok: true,
      agentId: 'abc',
      apiKey: 'ts_live_y',
    });
  });

  it('201 without a key is honest — not returned, not invented', () => {
    expect(parseRegister(201, { agent_id: 'abc' })).toEqual({
      ok: true,
      agentId: 'abc',
      apiKey: null,
    });
  });

  // CREATE_PAI_UI.md caveat (b), encoded: the engine's per-IP 429 dedup is a per-process in-memory
  // Map that does NOT fire in the multi-replica Railway deployment, so registering the SAME name twice
  // returns 201 both times with DISTINCT agent_ids. That is a fresh agent each time — NEVER reuse. The
  // parser must therefore treat each 201 as its own new agent and must not collapse a duplicate name to
  // the same id. [V live 2026-09-13: 3 identical POSTs → 201/201/201, distinct ids]
  it('duplicate name → two 201s are two DISTINCT fresh agents, never reuse (caveat b)', () => {
    const first = parseRegister(201, { agent_id: 'agent-uuid-1', api_key: 'ts_live_1' });
    const second = parseRegister(201, { agent_id: 'agent-uuid-2', api_key: 'ts_live_2' });
    expect(first).toEqual({ ok: true, agentId: 'agent-uuid-1', apiKey: 'ts_live_1' });
    expect(second).toEqual({ ok: true, agentId: 'agent-uuid-2', apiKey: 'ts_live_2' });
    if (!first.ok || !second.ok) throw new Error('expected two 201 parses');
    expect(first.agentId).not.toBe(second.agentId);
  });
});

import { parseHalEvidence, parseRepidScore } from '../lib/create-pai-parse';

describe('create PAI evidence (synthetic shape of the live HAL response)', () => {
  const resp = {
    decision: 'vetoed',
    latency_ms: 400,
    signals: { quorum: 'full', families: ['openai', 'qwen'] },
    provider_responses: [
      { provider: 'a', model: 'm1', verdict: 'FALSE', note: 'It is in Paris.', latency_ms: 200 },
      { provider: 'b', model: 'm2', verdict: 'FALSE', note: 'Paris.', latency_ms: 300 },
      { provider: 'c', model: 'm3', verdict: 'UNCERTAIN', note: 'NOT_CHECKED: late after 2-family agreement', counted: false, late: true },
    ],
  };
  it('keeps only votes that counted; late NOT_CHECKED providers are not agreement', () => {
    const ev = parseHalEvidence(resp);
    expect(ev.verdict).toBe('VETO');
    expect(ev.votes.map((v) => v.provider)).toEqual(['a', 'b']);
    expect(ev.families).toEqual(['openai', 'qwen']);
    expect(ev.quorum).toBe('full');
  });
  it('no provider rows → verdict null and zero votes (shown as NOT CHECKED, not invented)', () => {
    const ev = parseHalEvidence({});
    expect(ev.verdict).toBeNull();
    expect(ev.votes).toEqual([]);
  });
  it('RepID is read from `score`, the field the live route returns', () => {
    expect(parseRepidScore({ score: 200, tier: 'PROBATIONARY' })).toBe(200);
    expect(parseRepidScore({ repid_score: 350 })).toBe(350);
    expect(parseRepidScore({})).toBeNull();
    expect(parseRepidScore(null)).toBeNull();
  });
});
