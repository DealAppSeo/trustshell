/**
 * The model is a replaceable input: same harness, same bundle, two different "models", same answers.
 *
 * WHAT THIS PROVES, AND WITH WHAT. Deterministic stubs, not LLMs: a model here would add noise and a
 * network call to a test whose subject is the harness. Each stub may read ONLY the context string the
 * harness builds (brainContext); they read it two different ways (by section lines, and by whole-text
 * patterns), standing in for two model families. The test proves:
 *   1. the context a model is handed is BYTE-IDENTICAL before export and after import on a fresh machine;
 *   2. every known answer (tests/fixtures/bundle-swap/known-answers.json) is in that context, for both readers;
 *   3. the fact held only in a QUARANTINED note never reaches it (the right answer is "unknown").
 * What it does not prove: that a real model answers correctly. That run uses two free model families
 * on the same fixture and is reported, with its ruler, in the lane B report (2026-10-21).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { brainContext, type Bundle } from '../src/lib/bundle';
import { insertMemory, writeKeyed } from '../src/memory/local-store';
import { rememberUntrusted } from '../src/memory/quarantine';

type Q = { id: string; q: string; match: 'exact' | 'contains'; a: string };
const FIXTURE = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'bundle-swap', 'known-answers.json'), 'utf8')) as {
  seed: {
    profile: string;
    guardrails: unknown;
    trusted_notes: string[];
    quarantined_notes: { text: string; source: string }[];
    values: Record<string, string>;
  };
  questions: Q[];
};

/** The same rule the live run scores with. */
function matches(answer: string, q: Q): boolean {
  const norm = answer.toLowerCase().replace(/[^a-z0-9_ -]/g, ' ').replace(/\s+/g, ' ').trim();
  return q.match === 'exact' ? norm === q.a : norm.includes(q.a.toLowerCase());
}

/** Reader 1: walks the context line by line, by section heading. */
function lineReader(ctx: string, id: string): string {
  const lines = ctx.split('\n');
  const after = (heading: string) => lines[lines.indexOf(heading) + 1] ?? '';
  const line = (prefix: string) => lines.find((l) => l.startsWith(prefix)) ?? '';
  const hosts = line('- network hosts allowed:').split(':')[1]?.split(',').map((h) => h.trim()) ?? [];
  switch (id) {
    case 'top_value': return after('Values, most important first:').replace(/^1\.\s*/, '');
    case 'helps': return after('People they help:').replace(/^-\s*/, '');
    case 'constraint': return after('Constraints that must hold:').replace(/^1\.\s*/, '');
    case 'autonomy': return line('Trust settings:').split(';')[0]?.split(' ').pop() ?? '';
    case 'host_ok': return hosts.includes('api.github.com') ? 'yes' : 'no';
    case 'host_no': return hosts.includes('evil.example') ? 'yes' : 'no';
    case 'spend_cap': return line('- spend:').match(/up to (\d+) per action/)?.[1] ?? '';
    case 'saved_value': return line('- favorite_model_family:').split(': ')[1] ?? '';
    case 'rule': return lines.find((l) => /standing rule/i.test(l)) ?? '';
    case 'quarantined': return lines.find((l) => /delivery/i.test(l))?.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i)?.[1] ?? 'unknown';
    default: return '';
  }
}

/** Reader 2: never splits lines; pattern-matches the whole text. */
function patternReader(ctx: string, id: string): string {
  const m = (re: RegExp) => ctx.match(re)?.[1]?.trim() ?? '';
  const allowed = (host: string) => new RegExp(`network hosts allowed:[^\\n]*\\b${host.replace(/\./g, '\\.')}\\b`).test(ctx);
  switch (id) {
    case 'top_value': return m(/Values[^\n]*\n1\. ([^\n]+)/);
    case 'helps': return m(/People they help:\n- ([^(\n]+)/);
    case 'constraint': return m(/must hold:\n1\. ([^\n]+)/);
    case 'autonomy': return m(/autonomy (\S+?);/);
    case 'host_ok': return allowed('api.github.com') ? 'yes' : 'no';
    case 'host_no': return allowed('evil.example') ? 'yes' : 'no';
    case 'spend_cap': return m(/up to (\d+) per action/);
    case 'saved_value': return m(/favorite_model_family: (\S+)/);
    case 'rule': return m(/(show the [^\n]+)/);
    case 'quarantined': return m(/delivery is (\w+)/) || 'unknown';
    default: return '';
  }
}

describe('bundle model swap: same bundle, two readers, same answers', () => {
  const prevEnv = { ...process.env };
  const prevCwd = process.cwd();
  const prevFetch = global.fetch;
  let root = '';
  const io: CliIO = { out: () => undefined, err: () => undefined };

  async function as(m: string, ...argv: string[]): Promise<number> {
    process.env.TRUSTSHELL_HOME = join(root, m, 'home');
    process.env.TRUSTSHELL_MEMORY = join(root, m, 'home', 'memory.sqlite');
    process.chdir(join(root, m));
    return run(parseArgs(argv), {} as never, io);
  }

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'ts-bundle-swap-'));
    for (const m of ['a', 'b']) mkdirSync(join(root, m, 'home'), { recursive: true });
    global.fetch = (async () => {
      throw new Error('no network in this test');
    }) as typeof fetch;
  });
  afterAll(() => {
    global.fetch = prevFetch;
    process.chdir(prevCwd);
    process.env = { ...prevEnv };
    rmSync(root, { recursive: true, force: true });
  });

  it('round-trips, hands both readers the same context, and both get every known answer', async () => {
    const s = FIXTURE.seed;
    mkdirSync(join(root, 'a', '.trustshell'));
    writeFileSync(join(root, 'a', '.trustshell', 'profile.md'), s.profile);
    writeFileSync(join(root, 'a', 'home', 'guardrails.json'), JSON.stringify(s.guardrails));
    process.env.TRUSTSHELL_MEMORY = join(root, 'a', 'home', 'memory.sqlite');
    for (const n of s.trusted_notes) insertMemory(process.env.TRUSTSHELL_MEMORY, 'note', n, '2026-10-21T10:00:00.000Z');
    for (const n of s.quarantined_notes) rememberUntrusted(n.text, { source: n.source });
    for (const [k, v] of Object.entries(s.values)) writeKeyed(process.env.TRUSTSHELL_MEMORY, k, v, '2026-10-21T10:01:00.000Z');

    const fileA = join(root, 'a.json');
    expect(await as('a', 'bundle', 'export', fileA)).toBe(0);
    const a = JSON.parse(readFileSync(fileA, 'utf8')) as Bundle;
    expect(await as('b', 'bundle', 'import', fileA, '--signer', a.signer.fingerprint)).toBe(0);
    const fileB = join(root, 'b.json');
    expect(await as('b', 'bundle', 'export', fileB)).toBe(0);
    const b = JSON.parse(readFileSync(fileB, 'utf8')) as Bundle;

    const ctxA = brainContext(a.payload);
    const ctxB = brainContext(b.payload);
    expect(ctxB).toBe(ctxA);
    expect(ctxA).not.toMatch(/friday/i);

    const answers: Record<string, Record<string, string>> = {};
    for (const [name, reader] of [['lineReader', lineReader], ['patternReader', patternReader]] as const) {
      for (const [machine, ctx] of [['a', ctxA], ['b', ctxB]] as const) {
        for (const q of FIXTURE.questions) {
          const got = reader(ctx, q.id);
          (answers[`${name}@${machine}`] ??= {})[q.id] = got;
          if (!matches(got, q)) throw new Error(`${name} on machine ${machine}, ${q.id}: got "${got}", want ${q.match} "${q.a}"`);
        }
      }
    }
    // Every reader on every machine agrees, answer for answer, after normalisation.
    const norm = (r: Record<string, string>) => FIXTURE.questions.map((q) => matches(r[q.id] ?? '', q));
    const runs = Object.values(answers).map(norm);
    for (const r of runs) expect(r).toEqual(runs[0]);
    expect(runs[0]?.every(Boolean)).toBe(true);
  });

  it('the scorer is strict: a wrong or leaked answer fails', () => {
    const q = (id: string) => FIXTURE.questions.find((x) => x.id === id) as Q;
    expect(matches('Friday', q('quarantined'))).toBe(false);
    expect(matches('Unknown.', q('quarantined'))).toBe(true);
    expect(matches('no, it is not allowed', q('host_no'))).toBe(false);
    expect(matches('150', q('spend_cap'))).toBe(false);
  });
});
