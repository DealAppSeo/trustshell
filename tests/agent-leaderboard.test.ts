/**
 * The leaderboard lookup and the standing arithmetic.
 *
 * WHAT IS WORTH ASSERTING HERE. A "it returns the rows" test passes for an
 * implementation that also returns a fabricated row, a defaulted zero, or an
 * empty board dressed as a real one. The load-bearing cases are the ones where
 * the wrong answer is the comfortable one:
 *
 *   empty `agents: []`        → reads as "nobody has scored yet". It is
 *                               indistinguishable from a shape we failed to
 *                               understand, and the board is never actually empty.
 *   row without repid_total   → defaulting to 0 claims the agent earned nothing
 *                               AND sinks it to last place, as though measured.
 *   position without outOf    → "4th" implies a population this endpoint does
 *                               not describe. The board is 12 agents, not all.
 *   empty board → "1st of 1"  → arithmetically true, tells the reader nothing,
 *                               and they will believe it.
 */
import {
  standingAmong,
  ordinal,
  type LeaderboardEntry,
} from '../lib/agent-leaderboard';

type Lib = typeof import('../lib/agent-leaderboard');

/**
 * `REPID_ENGINE_URL` is read into a module-level const at import time, so the env
 * has to be set BEFORE the module is evaluated — a static import hoists above any
 * assignment and would capture the empty jest default. Loading it per-test is also
 * what lets the `no_engine` branch be exercised for real rather than asserted at.
 *
 * This was found the direct way: the first version of these tests used a static
 * import, and every fetch case returned `no_engine` — the guard was correct and
 * the tests were exercising nothing.
 */
function loadLib(engineUrl: string | undefined): Lib {
  let lib!: Lib;
  jest.isolateModules(() => {
    const prev = process.env.NEXT_PUBLIC_REPID_ENGINE_URL;
    if (engineUrl === undefined) delete process.env.NEXT_PUBLIC_REPID_ENGINE_URL;
    else process.env.NEXT_PUBLIC_REPID_ENGINE_URL = engineUrl;
    lib = require('../lib/agent-leaderboard') as Lib;
    if (prev === undefined) delete process.env.NEXT_PUBLIC_REPID_ENGINE_URL;
    else process.env.NEXT_PUBLIC_REPID_ENGINE_URL = prev;
  });
  return lib;
}

const ENGINE = 'https://engine.test';

const ENTRIES: LeaderboardEntry[] = [
  { agentId: 'trinity-shofet', repid: 2177, model: null },
  { agentId: 'trinity-nexus', repid: 1978, model: null },
  { agentId: 'trinity-orch', repid: 1839, model: null },
  { agentId: 'trinity-veritas', repid: 1816, model: null },
];

const okResponse = (body: unknown) =>
  ({ ok: true, json: async () => body }) as unknown as Response;

describe('standingAmong', () => {
  it('counts only entries STRICTLY above, so a tie takes the better place', () => {
    // Equal to nexus (1978). One entry is strictly above (shofet, 2177), so 2nd.
    // With `>=` the tie would push this to 3rd — behind an agent it matched.
    expect(standingAmong(1978, ENTRIES)).toEqual({ position: 2, outOf: 5 });
  });

  it('places a new agent last when it is below everyone', () => {
    expect(standingAmong(200, ENTRIES)).toEqual({ position: 5, outOf: 5 });
  });

  it('places a new agent first when it is above everyone', () => {
    expect(standingAmong(9999, ENTRIES)).toEqual({ position: 1, outOf: 5 });
  });

  it('counts outOf as the board PLUS the agent being placed', () => {
    // The agent is not already on the board. Reporting outOf as 4 would describe
    // a five-way comparison as a four-way one.
    expect(standingAmong(1, ENTRIES)?.outOf).toBe(ENTRIES.length + 1);
  });

  it('refuses an empty board rather than reporting "1st of 1"', () => {
    expect(standingAmong(500, [])).toBeNull();
  });

  it('refuses a non-finite score instead of ranking NaN', () => {
    expect(standingAmong(Number.NaN, ENTRIES)).toBeNull();
    expect(standingAmong(Number.POSITIVE_INFINITY, ENTRIES)).toBeNull();
  });
});

describe('ordinal', () => {
  it('handles the teens, which the naive mod-10 rule gets wrong', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
  });
  it('handles the ordinary cases', () => {
    expect([1, 2, 3, 4, 21, 22, 23].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '21st', '22nd', '23rd',
    ]);
  });
});

describe('fetchLeaderboard', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('sorts by RepID descending regardless of the order the engine sent', () => {
    global.fetch = (async () =>
      okResponse({
        agents: [
          { agent_id: 'low', repid_total: 100 },
          { agent_id: 'high', repid_total: 9000 },
          { agent_id: 'mid', repid_total: 500 },
        ],
        total_agents: 3,
        last_updated: '2026-09-23T00:00:00Z',
      })) as typeof fetch;

    return loadLib(ENGINE).fetchLeaderboard().then((r) => {
      expect(r.state).toBe('LOADED');
      if (r.state !== 'LOADED') return;
      expect(r.entries.map((e) => e.agentId)).toEqual(['high', 'mid', 'low']);
      expect(r.totalAgents).toBe(3);
    });
  });

  it('DROPS a row with no numeric score — never defaults it to 0', () => {
    // A 0 would assert the agent earned nothing AND put it last, as if measured.
    global.fetch = (async () =>
      okResponse({
        agents: [
          { agent_id: 'good', repid_total: 500 },
          { agent_id: 'scoreless' },
          { agent_id: 'stringy', repid_total: '700' },
        ],
      })) as typeof fetch;

    return loadLib(ENGINE).fetchLeaderboard().then((r) => {
      expect(r.state).toBe('LOADED');
      if (r.state !== 'LOADED') return;
      expect(r.entries.map((e) => e.agentId)).toEqual(['good']);
      expect(r.entries.some((e) => e.repid === 0)).toBe(false);
    });
  });

  it('treats an EMPTY agents array as bad_response, not an empty board', () => {
    global.fetch = (async () => okResponse({ agents: [] })) as typeof fetch;
    return loadLib(ENGINE).fetchLeaderboard().then((r) => {
      expect(r).toEqual({ state: 'FAILED', reason: 'bad_response' });
    });
  });

  it('treats a non-array agents field as bad_response', () => {
    global.fetch = (async () => okResponse({ agents: { nope: true } })) as typeof fetch;
    return loadLib(ENGINE).fetchLeaderboard().then((r) => {
      expect(r).toEqual({ state: 'FAILED', reason: 'bad_response' });
    });
  });

  it('a network throw is NOT_CHECKED/unreachable — a lookup failure, not an empty board', () => {
    global.fetch = (async () => { throw new Error('offline'); }) as typeof fetch;
    return loadLib(ENGINE).fetchLeaderboard().then((r) => {
      expect(r).toEqual({ state: 'NOT_CHECKED', reason: 'unreachable' });
    });
  });

  it('a non-ok status is NOT_CHECKED/unreachable', () => {
    global.fetch = (async () => ({ ok: false, status: 503 }) as unknown as Response) as typeof fetch;
    return loadLib(ENGINE).fetchLeaderboard().then((r) => {
      expect(r).toEqual({ state: 'NOT_CHECKED', reason: 'unreachable' });
    });
  });

  it('an unconfigured engine URL is NOT_CHECKED/no_engine — it never requests at all', () => {
    // The guard that made the first draft of this file test nothing. It is real
    // behaviour and deserves its own case rather than being an accident.
    let called = false;
    global.fetch = (async () => { called = true; return okResponse({ agents: [] }); }) as typeof fetch;
    return loadLib(undefined).fetchLeaderboard().then((r) => {
      expect(r).toEqual({ state: 'NOT_CHECKED', reason: 'no_engine' });
      expect(called).toBe(false);
    });
  });

  it('unparseable JSON is FAILED/bad_response, distinct from unreachable', () => {
    global.fetch = (async () =>
      ({ ok: true, json: async () => { throw new Error('not json'); } }) as unknown as Response) as typeof fetch;
    return loadLib(ENGINE).fetchLeaderboard().then((r) => {
      expect(r).toEqual({ state: 'FAILED', reason: 'bad_response' });
    });
  });
});
