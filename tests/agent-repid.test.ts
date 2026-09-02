/**
 * A NUMBER THAT CANNOT BE RENDERED WITHOUT THE REASON IT CAN BE BELIEVED.
 *
 * `lib/agent-repid.ts` exists because `/agents` promised "portable, on-chain RepID" and then
 * showed only a local click counter. The hazard in fixing that is not the fetch — it is every
 * way a lookup can turn an absence into a claim:
 *
 *   404 → 0            The engine has never seen this agent. Rendering `RepID 0` says it
 *                      earned nothing THROUGH ITS CONDUCT, which is a statement about honesty
 *                      that nobody measured. Most of what follows pins that distinction.
 *   unreachable → 0    The same lie with a different cause, and the one that appears only when
 *                      the engine is down — i.e. when nobody is watching.
 *   200 → trust it     A 200 with no `repid` is a shape we do not understand. That is FAILED,
 *                      not an absence, because something is broken rather than merely missing.
 *
 * THE REAL-SHAPE FIXTURE IS THE POINT OF THE LAST BLOCK. Every other assertion here drives a
 * hand-written response, so all of them together still cannot catch the engine returning a
 * field under a different name. `PRODUCTION_CARD` is a verbatim capture from
 * `repid-engine-production` on 2026-09-02 (agent 848da285, via pg_net, the only path this
 * sandbox has). If the card's field names ever drift, the parse falls back and this suite says
 * so — which no amount of testing the module against its own mocks would reveal.
 *
 * THE MODULE IS LOADED PER TEST, AND THE FIRST DRAFT GOT THAT WRONG. `REPID_ENGINE_URL` is
 * `process.env.NEXT_PUBLIC_REPID_ENGINE_URL` read at MODULE SCOPE — it has to be a literal
 * reference, because Next inlines `NEXT_PUBLIC_*` by static analysis and `process.env[name]` is
 * `undefined` in the browser. So a top-level import captures whatever the environment held when
 * ts-jest hoisted the require, and setting the variable in `beforeEach` changes nothing: every
 * case silently took the `no_engine` path and eight assertions failed for one reason that had
 * nothing to do with any of them. `load()` makes the environment an explicit input, which is
 * also the only way the no-engine case can be driven at all.
 */

const ID = '848da285-93c5-4e99-a989-3d9e49ebed09';
const ENGINE = 'https://engine.example';

type Mod = typeof import('../lib/agent-repid');

async function load(engineUrl: string = ENGINE): Promise<Mod> {
  jest.resetModules();
  process.env.NEXT_PUBLIC_REPID_ENGINE_URL = engineUrl;
  return import('../lib/agent-repid');
}

/** Verbatim from GET /api/v1/agents/848da285-…/card on production, 2026-09-02, status 200. */
const PRODUCTION_CARD = {
  agent_id: '848da285-93c5-4e99-a989-3d9e49ebed09',
  name: 'trinity-nexus',
  description: null,
  repid: 1752,
  erc8004_token_id: '6711',
  total_decisions: 6619,
  created_at: '2026-04-15T07:11:52.261503+00:00',
  last_active_at: '2026-09-01T12:03:49.743+00:00',
  total_score_events: 6619,
  provenance: {
    sampled: true,
    sample_size: 500,
    verifiable_share_of_gains: 0.9002976190476191,
    summary:
      '500 events · 90% of gains externally verifiable · unbacked self-reported +0 over 0 events · internal scoring 444 events (-8)',
  },
};

function reply(status: number, body?: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      if (body === undefined) throw new SyntaxError('not json');
      return body;
    },
  }) as unknown as typeof fetch;
}

describe('an absence is never a zero', () => {
  it('reports an agent the engine has never seen as NOT_CHECKED, not RepID 0', async () => {
    const { fetchAgentRepId } = await load();
    reply(404, { error: 'Agent not found' });
    const r = await fetchAgentRepId(ID);

    expect(r.state).toBe('NOT_CHECKED');
    if (r.state !== 'NOT_CHECKED') throw new Error('unreachable');
    expect(r.reason).toBe('unregistered');
    // The assertion that matters: no number exists on this result to render by accident.
    expect(r).not.toHaveProperty('repid');
  });

  it('separates "never registered" from "could not reach", because the remedies differ', async () => {
    const { fetchAgentRepId, REPID_LOOKUP_DETAIL } = await load();

    reply(404, {});
    const missing = await fetchAgentRepId(ID);
    global.fetch = jest.fn().mockRejectedValue(new TypeError('network')) as unknown as typeof fetch;
    const down = await fetchAgentRepId(ID);

    if (missing.state !== 'NOT_CHECKED' || down.state !== 'NOT_CHECKED') {
      throw new Error('both should be NOT_CHECKED');
    }
    // Same badge, different cause. One says recreate the agent; the other says try later.
    expect(missing.reason).not.toBe(down.reason);
    expect(REPID_LOOKUP_DETAIL[missing.reason]).toMatch(/recreate it/i);
    expect(REPID_LOOKUP_DETAIL[down.reason]).toMatch(/unchanged|try/i);
  });

  it('reports a 5xx as unreachable rather than inventing a score', async () => {
    const { fetchAgentRepId } = await load();
    reply(503, { error: 'unavailable' });
    expect((await fetchAgentRepId(ID)).state).toBe('NOT_CHECKED');
  });

  it('says NOT_CHECKED when no engine is configured, without attempting a request', async () => {
    const { fetchAgentRepId } = await load('');
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;

    const r = await fetchAgentRepId(ID);
    expect(r.state).toBe('NOT_CHECKED');
    if (r.state !== 'NOT_CHECKED') throw new Error('unreachable');
    expect(r.reason).toBe('no_engine');
    // A deployment with no engine is a known configuration, not a network event.
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('a broken shape is FAILED, not an absence', () => {
  it('reports a 200 with no repid as FAILED — something is wrong, not merely missing', async () => {
    const { fetchAgentRepId, REPID_LOOKUP_DETAIL } = await load();
    reply(200, { agent_id: ID, name: 'trinity-nexus' });
    const r = await fetchAgentRepId(ID);

    expect(r.state).toBe('FAILED');
    if (r.state !== 'FAILED') throw new Error('unreachable');
    expect(REPID_LOOKUP_DETAIL[r.reason]).toMatch(/unknown rather than unchanged/i);
  });

  it('reports a body that is not JSON as FAILED', async () => {
    const { fetchAgentRepId } = await load();
    reply(200, undefined);
    expect((await fetchAgentRepId(ID)).state).toBe('FAILED');
  });
});

describe('the real production card', () => {
  it('parses the exact response production returned on 2026-09-02', async () => {
    // Not a hand-written fixture. If the engine renames a field, this is what notices.
    const { fetchAgentRepId } = await load();
    reply(200, PRODUCTION_CARD);
    const r = await fetchAgentRepId(ID);

    expect(r.state).toBe('MEASURED');
    if (r.state !== 'MEASURED') throw new Error('unreachable');
    expect(r.repid).toBe(1752);
    expect(r.decisions).toBe(6619);
    expect(r.lastActiveAt).toBe('2026-09-01T12:03:49.743+00:00');
  });

  it('carries provenance through, because it is the answer to "is this score real"', async () => {
    const { fetchAgentRepId } = await load();
    reply(200, PRODUCTION_CARD);
    const r = await fetchAgentRepId(ID);
    if (r.state !== 'MEASURED') throw new Error('unreachable');

    expect(r.provenance).not.toBeNull();
    expect(r.provenance!.verifiableShareOfGains).toBeCloseTo(0.9003, 4);
    expect(r.provenance!.sampled).toBe(true);
    expect(r.provenance!.summary).toContain('externally verifiable');
  });

  it('drops a share that arrives with no summary behind it', async () => {
    // A bare percentage with nothing explaining it is the kind of number this module exists to
    // stop rendering, so half a provenance block is treated as none.
    const { fetchAgentRepId } = await load();
    reply(200, { ...PRODUCTION_CARD, provenance: { verifiable_share_of_gains: 0.9 } });
    const r = await fetchAgentRepId(ID);
    if (r.state !== 'MEASURED') throw new Error('unreachable');
    expect(r.provenance).toBeNull();
  });

  it('still reports the score when provenance is absent entirely', async () => {
    // Provenance is an enrichment. Withholding a real RepID because the breakdown is missing
    // would be the opposite failure — refusing to state something that WAS measured.
    const { fetchAgentRepId } = await load();
    const { provenance, ...noProv } = PRODUCTION_CARD;
    void provenance;
    reply(200, noProv);
    const r = await fetchAgentRepId(ID);
    if (r.state !== 'MEASURED') throw new Error('unreachable');
    expect(r.repid).toBe(1752);
    expect(r.provenance).toBeNull();
  });
});

describe('a frozen score is disclosed next to the number, not instead of it', () => {
  it('explains why an agent with no API key cannot earn', async () => {
    const { earningBlockedReason } = await load();
    const reason = earningBlockedReason({});
    expect(reason).toMatch(/no API key/i);
    expect(reason).toMatch(/cannot change|not scored/i);
  });

  it('says nothing when the agent can actually earn', async () => {
    // A warning that is always on is ignored, which would cost the case above its meaning.
    const { earningBlockedReason } = await load();
    expect(earningBlockedReason({ apiKey: 'sk-live' })).toBeNull();
  });
});
