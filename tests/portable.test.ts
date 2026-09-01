/**
 * THE ONE THING AN IMPORT MUST NEVER DO IS LOSE SOMETHING.
 *
 * An agent's `apiKey` is issued once by the engine and cannot be reissued. It exists in exactly
 * one place — the browser that registered the agent — so a merge that overwrites a present key
 * with an absent one destroys a credential nobody can get back, and the symptom appears much
 * later as "my score stopped moving". Most of what follows tests that single hazard from every
 * direction it can arrive: file has the key, browser has the key, both have different keys.
 *
 * The other half is refusal. `parseImport` sees a file a person picked out of a downloads folder
 * while trying to recover from a loss, so every unrecognised shape has to stop cold with a reason
 * they can act on. Importing the recognisable half of an unknown file is worse than importing
 * nothing, because from the UI it looks like it worked.
 */
import {
  buildExport,
  parseImport,
  mergeAgents,
  mergeHistory,
  describeMerge,
  exportFilename,
  PORTABLE_FORMAT,
  PORTABLE_VERSION,
  PARSE_ERRORS,
} from '../lib/portable';
import type { Agent, HistoryRow } from '../lib/db';

const A = 'a1c8e0d4-77b2-4f39-8e5a-2b6d0c94f731';
const B = '3f9c1a72-5e84-4b1d-9a06-c7e2f4b81d55';

function agent(over: Partial<Agent> & { id: string }): Agent {
  return {
    name: 'Atlas',
    createdAt: 1_000,
    totalPrompts: 0,
    lastUsedAt: 1_000,
    ...over,
  };
}

function run(over: Partial<HistoryRow> & { id: string; agentId: string }): HistoryRow {
  return {
    prompt: 'p',
    answer: 'a',
    provider: 'groq',
    tier: 0,
    tokensIn: 1,
    tokensOut: 1,
    latencyMs: 10,
    cost: 0,
    timestamp: 1_000,
    repidDelta: 0,
    ...over,
  };
}

describe('parseImport', () => {
  it('accepts a file this app wrote', () => {
    const text = JSON.stringify(buildExport([agent({ id: A })], []));
    const r = parseImport(text);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.file.agents).toHaveLength(1);
    expect(r.file.format).toBe(PORTABLE_FORMAT);
  });

  it('refuses a file that is not JSON at all', () => {
    const r = parseImport('not json {');
    expect(r).toEqual({ ok: false, reason: 'not_json' });
  });

  it('refuses valid JSON that is not one of ours', () => {
    // The realistic case: somebody picks the encrypted vault backup, which is also .json.
    const r = parseImport(JSON.stringify({ salt: 'x', iv: 'y', ciphertext: 'z' }));
    expect(r).toEqual({ ok: false, reason: 'not_ours' });
    expect(PARSE_ERRORS.not_ours).toMatch(/vault/i);
  });

  it('refuses a version it does not understand rather than guessing at its fields', () => {
    const text = JSON.stringify({
      format: PORTABLE_FORMAT,
      version: PORTABLE_VERSION + 1,
      agents: [agent({ id: A })],
    });
    expect(parseImport(text)).toEqual({ ok: false, reason: 'too_new' });
  });

  it('refuses an export with nothing in it, instead of reporting a successful no-op', () => {
    const text = JSON.stringify(buildExport([], []));
    expect(parseImport(text)).toEqual({ ok: false, reason: 'no_agents' });
  });

  it('drops entries that are not agents rather than importing malformed rows', () => {
    const text = JSON.stringify({
      format: PORTABLE_FORMAT,
      version: PORTABLE_VERSION,
      agents: [agent({ id: A }), { nope: true }, null, 'x'],
    });
    const r = parseImport(text);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.file.agents.map((a) => a.id)).toEqual([A]);
  });

  it('every refusal has plain language behind it', () => {
    for (const reason of ['not_json', 'not_ours', 'too_new', 'no_agents'] as const) {
      expect(PARSE_ERRORS[reason]).toBeTruthy();
      expect(PARSE_ERRORS[reason]).not.toMatch(/undefined|null/);
    }
  });
});

describe('mergeAgents — the unreissuable key', () => {
  it('keeps this browser\'s key when the file has none', () => {
    // The common case: the backup was taken before scoring auth landed, or from a browser that
    // only ever recovered the agent by id. Taking the file at its word would delete a working key.
    const local = [agent({ id: A, apiKey: 'sk-live', lastUsedAt: 1_000 })];
    const incoming = [agent({ id: A, lastUsedAt: 9_000 })];
    const r = mergeAgents(local, incoming);
    expect(r.agents[0].apiKey).toBe('sk-live');
    expect(r.keysKept).toBe(1);
    expect(r.keysRestored).toBe(0);
  });

  it('restores a key this browser never had', () => {
    const local = [agent({ id: A, lastUsedAt: 9_000 })];
    const incoming = [agent({ id: A, apiKey: 'sk-live', lastUsedAt: 1_000 })];
    const r = mergeAgents(local, incoming);
    expect(r.agents[0].apiKey).toBe('sk-live');
    expect(r.keysRestored).toBe(1);
  });

  it('reports a genuine key conflict instead of silently picking one', () => {
    const local = [agent({ id: A, apiKey: 'sk-local' })];
    const incoming = [agent({ id: A, apiKey: 'sk-file' })];
    const r = mergeAgents(local, incoming);
    expect(r.agents[0].apiKey).toBe('sk-local');
    expect(r.keyConflicts).toEqual([A]);
    // And it must reach the person, not just the return value.
    expect(describeMerge(r, 0)).toMatch(/different key/i);
  });

  it('never drops an agent that exists only in this browser', () => {
    // Import as replace would delete B — the exact loss the feature exists to prevent.
    const local = [agent({ id: A }), agent({ id: B, name: 'Ledger' })];
    const incoming = [agent({ id: A })];
    const r = mergeAgents(local, incoming);
    expect(r.agents.map((a) => a.id).sort()).toEqual([A, B].sort());
  });
});

describe('mergeAgents — field resolution', () => {
  it('takes the description from whichever copy was used more recently', () => {
    const local = [agent({ id: A, description: 'stale', lastUsedAt: 1_000 })];
    const incoming = [agent({ id: A, description: 'current', lastUsedAt: 9_000 })];
    expect(mergeAgents(local, incoming).agents[0].description).toBe('current');

    const flipped = mergeAgents(
      [agent({ id: A, description: 'current', lastUsedAt: 9_000 })],
      [agent({ id: A, description: 'stale', lastUsedAt: 1_000 })],
    );
    expect(flipped.agents[0].description).toBe('current');
  });

  it('keeps the earliest creation time — an agent is created once', () => {
    const r = mergeAgents(
      [agent({ id: A, createdAt: 5_000 })],
      [agent({ id: A, createdAt: 2_000 })],
    );
    expect(r.agents[0].createdAt).toBe(2_000);
  });

  it('takes the higher prompt count and does not sum it', () => {
    // Summing would invent runs whenever the file is simply an older copy of this same browser,
    // and this counter sits next to a score that is supposed to be auditable.
    const r = mergeAgents(
      [agent({ id: A, totalPrompts: 12 })],
      [agent({ id: A, totalPrompts: 7 })],
    );
    expect(r.agents[0].totalPrompts).toBe(12);
  });

  it('counts an import that changed nothing as unchanged', () => {
    const same = agent({ id: A, apiKey: 'sk-live' });
    const r = mergeAgents([same], [{ ...same }]);
    expect(r.unchanged).toBe(1);
    expect(r.updated).toBe(0);
    expect(describeMerge(r, 0)).toMatch(/nothing new/i);
  });
});

describe('mergeHistory', () => {
  it('unions by id and never duplicates a run', () => {
    const local = [run({ id: 'r1', agentId: A, timestamp: 100 })];
    const incoming = [
      run({ id: 'r1', agentId: A, timestamp: 100 }),
      run({ id: 'r2', agentId: A, timestamp: 200 }),
    ];
    const r = mergeHistory(local, incoming);
    expect(r.added).toBe(1);
    expect(r.history.map((x) => x.id)).toEqual(['r2', 'r1']);
  });
});

describe('the export file', () => {
  it('carries a warning inside it, because somebody will open it in a text editor', () => {
    const file = buildExport([agent({ id: A, apiKey: 'sk-live' })], []);
    expect(file._warning).toMatch(/API keys/i);
    expect(JSON.stringify(file)).toContain('sk-live');
  });

  it('round-trips through JSON with the key intact', () => {
    const original = [agent({ id: A, apiKey: 'sk-live', constitution: 'Never guess.' })];
    const r = parseImport(JSON.stringify(buildExport(original, [])));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(mergeAgents([], r.file.agents).agents[0]).toEqual(original[0]);
  });

  it('names itself sortably and says what it is', () => {
    const name = exportFilename(new Date('2026-09-01T07:30:15Z'));
    expect(name).toBe('trustshell-agents-2026-09-01-07-30-15.json');
  });
});
