/**
 * The model is a replaceable input: same harness, same bundle, two different "models", and the owner's
 * guardrails still hold on the second host.
 *
 * WHAT THIS PROVES, AND WITH WHAT. Deterministic stubs, not LLMs: a model here would add noise and a network
 * call to a test whose subject is the harness. Each stub may read ONLY the context string the harness builds
 * (brainContext), two different ways, standing in for two model families. The test proves:
 *   1. after export -> import -> re-export from host B (B's own key), B's context is byte-identical to A's
 *      except the carried notes, which are quarantined on B and so do not re-travel; the policy is the same;
 *   2. every known answer (tests/fixtures/bundle-swap/known-answers.json) is in that context, for both readers;
 *   3. the fact held only in a QUARANTINED note never reaches it;
 *   4. A GUARDRAIL IS NOT DROPPED BY THE SWAP: whatever tool either "model" proposes, the policy enforced on
 *      host B (owner-signed, carried by hash) denies the forbidden one before it starts, and allows the other.
 * What it does not prove: that a real model answers correctly. That run uses two free model families on the
 * same fixture and is reported, with its ruler, in the lane B report (2026-10-21).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { RUN_SCOPE } from '../src/cli/guard';
import { brainContext, type Bundle } from '../src/lib/bundle';
import { POLICY_FILE, guardDecide, renderPolicyDocument, type LocalPolicy } from '../src/lib/guardrails';
import { insertMemory } from '../src/memory/local-store';
import { rememberUntrusted } from '../src/memory/quarantine';

type Q = { id: string; q: string; match: 'exact' | 'contains'; a: string };
const FIXTURE = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'bundle-swap', 'known-answers.json'), 'utf8')) as {
  seed: { profile: string; policy: LocalPolicy; trusted_notes: string[]; quarantined_notes: { text: string; source: string }[] };
  questions: Q[];
  proposals: { id: string; task: string; allowed: boolean }[];
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
  const actions = new Set(line('- allowed actions:').split(':').slice(1).join(':').split(',').map((s) => s.trim()));
  switch (id) {
    case 'top_value': return after('Values, most important first:').replace(/^1\.\s*/, '');
    case 'helps': return after('People they help:').replace(/^-\s*/, '');
    case 'constraint': return after('Constraints that must hold:').replace(/^1\.\s*/, '');
    case 'autonomy': return line('Trust settings:').split(';')[0]?.split(' ').pop() ?? '';
    case 'tool_ok': return actions.has('tool:git') ? 'yes' : 'no';
    case 'tool_no': return actions.has('tool:shell') ? 'yes' : 'no';
    case 'spend_cap': return line('- limits:').match(/per action (\d+)/)?.[1] ?? '';
    case 'rule': return lines.find((l) => /standing rule/i.test(l)) ?? '';
    case 'quarantined': return lines.find((l) => /delivery/i.test(l))?.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i)?.[1] ?? 'unknown';
    default: return '';
  }
}

/** Reader 2: never splits lines; pattern-matches the whole text. */
function patternReader(ctx: string, id: string): string {
  const m = (re: RegExp) => ctx.match(re)?.[1]?.trim() ?? '';
  const allowed = (a: string) => new Set(m(/allowed actions: ([^\n]*)/).split(', ')).has(a);
  switch (id) {
    case 'top_value': return m(/Values[^\n]*\n1\. ([^\n]+)/);
    case 'helps': return m(/People they help:\n- ([^(\n]+)/);
    case 'constraint': return m(/must hold:\n1\. ([^\n]+)/);
    case 'autonomy': return m(/autonomy (\S+?);/);
    case 'tool_ok': return allowed('tool:git') ? 'yes' : 'no';
    case 'tool_no': return allowed('tool:shell') ? 'yes' : 'no';
    case 'spend_cap': return m(/per action (\d+)/);
    case 'rule': return m(/(show the [^\n]+)/);
    case 'quarantined': return m(/delivery is (\w+)/) || 'unknown';
    default: return '';
  }
}

/**
 * Two "models" proposing one tool per task. The careful one reads the policy in its context and declines what
 * it does not allow; the careless one ignores the context. The guardrail must hold for BOTH, because the
 * harness enforces it, not the model.
 */
const proposeCareful = (ctx: string, task: string): string | null => (/commit/i.test(task) ? 'git' : /tool:shell/.test(ctx) ? 'shell' : null);
const proposeCareless = (_ctx: string, task: string): string | null => (/commit/i.test(task) ? 'git' : 'shell');

describe('bundle model swap: same bundle, two readers, same answers, guardrail still enforced', () => {
  const prevEnv = { ...process.env };
  const prevCwd = process.cwd();
  const prevFetch = global.fetch;
  let root = '';
  const io: CliIO = { out: () => undefined, err: () => undefined };

  function as(m: string): void {
    process.env.TRUSTSHELL_HOME = join(root, m, 'home');
    process.env.TRUSTSHELL_MEMORY = join(root, m, 'home', 'memory.sqlite');
    process.chdir(join(root, m));
  }
  async function cli(m: string, ...argv: string[]): Promise<number> {
    as(m);
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

  it('round-trips, hands both readers the same context, gets every known answer, and B still denies the forbidden tool', async () => {
    const s = FIXTURE.seed;
    as('a');
    mkdirSync(join(root, 'a', '.trustshell'));
    writeFileSync(join(root, 'a', '.trustshell', 'profile.md'), s.profile);
    writeFileSync(join(root, 'a', 'home', POLICY_FILE), renderPolicyDocument({ policy: s.policy, signature: null }));
    expect(await cli('a', 'guard', 'sign')).toBe(0);
    for (const n of s.trusted_notes) insertMemory(process.env.TRUSTSHELL_MEMORY as string, 'note', n, '2026-10-21T10:00:00.000Z');
    for (const n of s.quarantined_notes) rememberUntrusted(n.text, { source: n.source });

    const fileA = join(root, 'a.json');
    expect(await cli('a', 'bundle', 'export', fileA, '--notes', 'released')).toBe(0);
    const a = JSON.parse(readFileSync(fileA, 'utf8')) as Bundle;
    expect(await cli('b', 'bundle', 'import', fileA, '--signer', a.author.fingerprint)).toBe(0);
    // B re-exports with ITS OWN key. Its imported notes are quarantined (untrusted on B), so they do not
    // re-travel; the profile and the owner-signed policy do. B's context must equal A's without the notes.
    const fileB = join(root, 'b.json');
    expect(await cli('b', 'bundle', 'export', fileB)).toBe(0);
    const b = JSON.parse(readFileSync(fileB, 'utf8')) as Bundle;
    expect(b.author.fingerprint).not.toBe(a.author.fingerprint);
    expect(b.payload.policy).toEqual(a.payload.policy);
    expect(brainContext(b.payload)).toBe(brainContext({ ...a.payload, memories: [] }));
    const ctxA = brainContext(a.payload);
    expect(ctxA).not.toMatch(/friday/i);

    for (const [name, reader] of [['lineReader', lineReader], ['patternReader', patternReader]] as const) {
      for (const q of FIXTURE.questions) {
        const got = reader(ctxA, q.id);
        if (!matches(got, q)) throw new Error(`${name}, ${q.id}: got "${got}", want ${q.match} "${q.a}"`);
      }
    }

    // THE GUARDRAIL SURVIVES THE SWAP: B enforces the carried, owner-signed policy whatever a model proposes.
    as('b');
    const seen: string[] = [];
    for (const [model, propose] of [['careful', proposeCareful], ['careless', proposeCareless]] as const) {
      for (const p of FIXTURE.proposals) {
        const tool = propose(ctxA, p.task);
        if (tool === null) {
          seen.push(`${model} ${p.id}: declined`);
          continue;
        }
        const d = guardDecide(process.env.TRUSTSHELL_HOME as string, { tool, class: 'other' }, RUN_SCOPE);
        seen.push(`${model} ${p.id}: ${tool} ${d?.decision.decision}`);
      }
    }
    expect(seen).toEqual([
      'careful commit: git ALLOWED',
      'careful wipe: declined',
      'careless commit: git ALLOWED',
      'careless wipe: shell DENIED', // the swap to a careless model did NOT drop the guardrail
    ]);
  });

  it('the scorer is strict: a wrong or leaked answer fails', () => {
    const q = (id: string) => FIXTURE.questions.find((x) => x.id === id) as Q;
    expect(matches('Friday', q('quarantined'))).toBe(false);
    expect(matches('Unknown.', q('quarantined'))).toBe(true);
    expect(matches('no, it is not allowed', q('tool_no'))).toBe(false);
    expect(matches('150', q('spend_cap'))).toBe(false);
  });
});
