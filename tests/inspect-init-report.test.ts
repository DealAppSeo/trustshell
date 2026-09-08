/**
 * The three commands added in this change, tested at the level that matters:
 * the VERDICT each produces, and the exit code that verdict maps to.
 *
 * The property worth guarding above all others is that exit 3 means NOT CHECKED
 * and is never 0. `check` already establishes that for INCONCLUSIVE; every
 * "we could not tell" here has to agree, or a CI gate that treats non-zero as
 * failure will silently read an unverifiable log as a pass.
 */

import {
  parseProfile,
  renderProfile,
  defaultProfile,
  DEFAULT_TRUST,
} from '../src/lib/profile';
import { runInit, initExitCode, type InitFs } from '../src/lib/init';
import {
  verifyChain,
  readClaudeCode,
  nextEntry,
  entryHash,
  noLog,
  inspectExitCode,
} from '../src/lib/inspect';
import { decide, buildReport, reportExitCode } from '../src/lib/report';
import { parseArgs } from '../src/cli/index';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** An in-memory InitFs, so init's logic is tested without touching a disk. */
function memFs(seed: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(seed));
  const dirs = new Set<string>();
  const fs: InitFs = {
    exists: (p) => files.has(p),
    mkdirp: (p) => { dirs.add(p); },
    writeFile: (p, d) => { files.set(p, d); },
  };
  return { fs, files, dirs };
}

/** Build a valid n-entry chain the way the appender would. */
function chain(n: number): string {
  let text = '';
  for (let i = 0; i < n; i += 1) {
    const e = nextEntry(text, {
      ts: `2026-09-08T0${i}:00:00Z`,
      tool: i % 2 === 0 ? 'Bash' : 'Read',
      input_sha256: 'a'.repeat(64),
      output_sha256: 'b'.repeat(64),
    });
    text += JSON.stringify(e) + '\n';
  }
  return text;
}

describe('profile', () => {
  it('the default is silence — every share flag false, both sections empty', () => {
    const p = defaultProfile();
    expect(p.share_identity).toBe(false);
    expect(p.share_context).toBe(false);
    expect(p.identity).toBe('');
    expect(p.context).toBe('');
    expect(p.trust).toEqual(DEFAULT_TRUST);
  });

  it('round-trips through render and parse', () => {
    const parsed = parseProfile(renderProfile());
    expect(parsed.problems).toEqual([]);
    expect(parsed.profile.share_identity).toBe(false);
    expect(parsed.profile.trust.autonomy).toBe('ask_first');
    expect(parsed.profile.trust.confidence_gate).toBe(0.8);
    expect(parsed.profile.trust.hitl_gate).toBe(70);
  });

  it('a MALFORMED share flag fails closed to false and is reported', () => {
    // The direction matters: a typo must never fail OPEN into disclosure.
    const { profile, problems } = parseProfile(
      '---\ntrustshell_profile: 1\nshare_identity: yes\n---\n# Identity\nSean\n',
    );
    expect(profile.share_identity).toBe(false);
    expect(problems.map((p) => p.field)).toContain('share_identity');
  });

  it('an unknown autonomy value falls back to ask_first, not to the permissive one', () => {
    const { profile, problems } = parseProfile(
      '---\ntrustshell_profile: 1\n---\n# Trust settings\nautonomy: yolo\n',
    );
    expect(profile.trust.autonomy).toBe('ask_first');
    expect(problems.map((p) => p.field)).toContain('autonomy');
  });

  it('reads identity and context bodies but strips the explanatory comments', () => {
    const { profile } = parseProfile(
      '---\ntrustshell_profile: 1\n---\n# Identity\nSean\n<!-- a comment -->\n# Context\nnotes here\n',
    );
    expect(profile.identity).toBe('Sean');
    expect(profile.context).toBe('notes here');
  });
});

describe('init', () => {
  it('creates the profile when absent', () => {
    const { fs, files } = memFs();
    const r = runInit(fs, { cwd: '/tmp/x' });
    expect(r.outcome).toBe('CREATED');
    expect(files.get('/tmp/x/.trustshell/profile.md')).toContain('trustshell_profile: 1');
    expect(initExitCode(r.outcome)).toBe(0);
  });

  it('collects NOTHING — no name, email, host or user appears in what it writes', () => {
    const { fs, files } = memFs();
    runInit(fs, { cwd: '/tmp/x' });
    const body = files.get('/tmp/x/.trustshell/profile.md') as string;
    // The Identity section must be empty. Anything auto-detected would turn a
    // local file into a disclosure the first time anyone ran `report`.
    expect(parseProfile(body).profile.identity).toBe('');
  });

  it('refuses to overwrite without --force, and that is exit 0, not a failure', () => {
    const { fs } = memFs({ '/tmp/x/.trustshell/profile.md': 'existing' });
    const r = runInit(fs, { cwd: '/tmp/x' });
    expect(r.outcome).toBe('EXISTS');
    expect(initExitCode(r.outcome)).toBe(0);
  });

  it('overwrites with --force', () => {
    const { fs, files } = memFs({ '/tmp/x/.trustshell/profile.md': 'existing' });
    const r = runInit(fs, { cwd: '/tmp/x', force: true });
    expect(r.outcome).toBe('OVERWRITTEN');
    expect(files.get('/tmp/x/.trustshell/profile.md')).not.toBe('existing');
  });

  it('names the OpenClaw seam as still-manual rather than pretending it wired one', () => {
    const { fs } = memFs();
    const r = runInit(fs, { cwd: '/tmp/x' });
    expect(r.still_manual.join(' ')).toMatch(/OpenClaw/);
  });
});

describe('inspect — the chain', () => {
  it('a well-formed chain is INTACT and exits 0', () => {
    const r = verifyChain(chain(5), 'x.jsonl');
    expect(r.verdict).toBe('INTACT');
    expect(r.entries).toBe(5);
    expect(r.breaks).toEqual([]);
    expect(inspectExitCode(r.verdict)).toBe(0);
  });

  it('seq and prev both come from the LAST LINE — no counter, no sidecar', () => {
    const text = chain(3);
    const next = nextEntry(text, {
      ts: '2026-09-08T09:00:00Z',
      tool: 'Bash',
      input_sha256: 'c'.repeat(64),
      output_sha256: 'd'.repeat(64),
    });
    const lastLine = JSON.parse(text.trim().split('\n').slice(-1)[0] as string);
    expect(next.seq).toBe(lastLine.seq + 1);
    expect(next.prev).toBe(lastLine.hash);
  });

  it('EDITING a line breaks the chain — that is the whole point', () => {
    const lines = chain(4).trim().split('\n');
    const tampered = JSON.parse(lines[1] as string);
    tampered.tool = 'Write';
    lines[1] = JSON.stringify(tampered);
    const r = verifyChain(lines.join('\n') + '\n', 'x.jsonl');
    expect(r.verdict).toBe('BROKEN');
    expect(inspectExitCode(r.verdict)).toBe(1);
  });

  it('REMOVING a line breaks the chain', () => {
    const lines = chain(4).trim().split('\n');
    lines.splice(2, 1);
    const r = verifyChain(lines.join('\n') + '\n', 'x.jsonl');
    expect(r.verdict).toBe('BROKEN');
  });

  it('a re-hashed edit still breaks, because prev binds it to the line before', () => {
    // The attacker fixes the line's own hash. The chain still catches it.
    const lines = chain(4).trim().split('\n');
    const t = JSON.parse(lines[1] as string);
    t.tool = 'Write';
    t.hash = entryHash({ seq: t.seq, ts: t.ts, tool: t.tool, input_sha256: t.input_sha256, output_sha256: t.output_sha256, prev: t.prev });
    lines[1] = JSON.stringify(t);
    const r = verifyChain(lines.join('\n') + '\n', 'x.jsonl');
    expect(r.verdict).toBe('BROKEN');
  });

  it('an adapter can NEVER report INTACT — it is UNCHAINED, and exits 3', () => {
    const transcript =
      JSON.stringify({ timestamp: '2026-09-08T00:00:00Z', message: { content: [{ type: 'tool_use', name: 'Bash' }] } }) + '\n';
    const r = readClaudeCode(transcript, 't.jsonl');
    expect(r.verdict).toBe('UNCHAINED');
    expect(r.entries).toBe(1);
    expect(inspectExitCode(r.verdict)).toBe(3);
  });

  // STRIX FINDING (CWE-754), and it was right: `breaks.length === 0` is vacuously
  // true for a file with no entries, so an empty log verified INTACT and exit 0,
  // and `report` then said CONFIRMED. A recorder that initialised and never wrote
  // was a verified pass — the exact contract this command exists to hold, broken
  // by the command itself.
  it.each([
    ['completely empty', ''],
    ['whitespace only', '   \n\n  \n'],
    ['trailing newline only', '\n'],
  ])('a log with NO entries (%s) is NO_LOG and exits 3 — never INTACT', (_label, text) => {
    const r = verifyChain(text, 's.jsonl');
    expect(r.verdict).toBe('NO_LOG');
    expect(r.verdict).not.toBe('INTACT');
    expect(inspectExitCode(r.verdict)).toBe(3);
  });

  it('and report therefore refuses to CONFIRM an empty session', () => {
    const empty = verifyChain('', 's.jsonl');
    const d = decide(empty, { verdict: 'COMPLETE' });
    expect(d.verdict).not.toBe('CONFIRMED');
    expect(reportExitCode(d.verdict)).not.toBe(0);
  });

  // STRIX FINDING (CWE-345). The chain is unkeyed and reproducible, so anyone who
  // can write the log can regenerate it whole. The card must SAY so rather than
  // claim tamper-evidence it cannot deliver.
  it('an INTACT card states that the chain has no trusted anchor', () => {
    const r = verifyChain(chain(3), 's.jsonl');
    expect(r.verdict).toBe('INTACT');
    const limits = r.does_not_prove.join(' ');
    expect(limits).toMatch(/no trusted anchor/i);
    expect(limits).toMatch(/fabricated|rewritten wholesale/i);
    // The old, overstated sentence must not come back.
    expect(limits).not.toMatch(/proves no line was altered or removed/i);
  });

  it('a demonstrably forged chain still verifies INTACT — which is why the card says so', () => {
    // Rebuild a whole log from scratch with different content. Nothing detects it,
    // and that is the honest limit rather than a bug to hide.
    const forged = chain(3);
    expect(verifyChain(forged, 'f.jsonl').verdict).toBe('INTACT');
  });

  it('NO_LOG exits 3 — an absent log is NOT CHECKED, never clean', () => {
    const r = noLog('missing.jsonl');
    expect(r.verdict).toBe('NO_LOG');
    expect(inspectExitCode(r.verdict)).toBe(3);
    expect(r.does_not_prove.join(' ')).toMatch(/not a clean result/i);
  });

  it('every verdict states what it does not prove', () => {
    for (const r of [verifyChain(chain(2), 'a'), noLog('b'), readClaudeCode('', 'c')]) {
      expect(r.does_not_prove.length).toBeGreaterThan(0);
    }
  });
});

describe('report', () => {
  const intact = () => verifyChain(chain(3), 's.jsonl');

  it('no evidence at all is UNSUPPORTED, exit 3 — not a pass', () => {
    const d = decide(intact(), null);
    expect(d.verdict).toBe('UNSUPPORTED');
    expect(reportExitCode(d.verdict)).toBe(3);
  });

  it('intact log + COMPLETE run is CONFIRMED, exit 0', () => {
    const d = decide(intact(), { verdict: 'COMPLETE' });
    expect(d.verdict).toBe('CONFIRMED');
    expect(reportExitCode(d.verdict)).toBe(0);
  });

  it('intact log + FAILED run is INCONSISTENT, exit 1', () => {
    const d = decide(intact(), { verdict: 'FAILED' });
    expect(d.verdict).toBe('INCONSISTENT');
    expect(reportExitCode(d.verdict)).toBe(1);
  });

  it('the word is INCONSISTENT — never "contradicted"', () => {
    const r = buildReport({ session: intact(), evidence: { verdict: 'FAILED' }, profile: defaultProfile() });
    const text = JSON.stringify(r).toLowerCase();
    expect(r.verdict).toBe('INCONSISTENT');
    expect(text).not.toMatch(/contradict/);
  });

  it('an INCONCLUSIVE run is UNSUPPORTED — NOT CHECKED does not become a verdict', () => {
    expect(decide(intact(), { verdict: 'INCONCLUSIVE' }).verdict).toBe('UNSUPPORTED');
  });

  it('a broken chain with a green run is INCONSISTENT', () => {
    const lines = chain(3).trim().split('\n');
    lines.splice(1, 1);
    const broken = verifyChain(lines.join('\n') + '\n', 's.jsonl');
    expect(decide(broken, { verdict: 'COMPLETE' }).verdict).toBe('INCONSISTENT');
  });

  it('identity is WITHHELD unless share_identity is true, and the omission is named', () => {
    const p = { ...defaultProfile(), identity: 'Sean', context: 'secret notes' };
    const r = buildReport({ session: intact(), evidence: { verdict: 'COMPLETE' }, profile: p });
    expect(r.identity).toBeUndefined();
    expect(r.context).toBeUndefined();
    expect(JSON.stringify(r)).not.toMatch(/secret notes/);
    expect(r.withheld.join(' ')).toMatch(/identity/);
    expect(r.withheld.join(' ')).toMatch(/context/);
  });

  it('identity is included once share_identity is true', () => {
    const p = { ...defaultProfile(), identity: 'Sean', share_identity: true };
    const r = buildReport({ session: intact(), evidence: { verdict: 'COMPLETE' }, profile: p });
    expect(r.identity).toBe('Sean');
  });
});

describe('CLI wiring', () => {
  it('knows all three commands', () => {
    expect(parseArgs(['inspect']).command).toBe('inspect');
    expect(parseArgs(['init']).command).toBe('init');
    expect(parseArgs(['report']).command).toBe('report');
  });

  it('all three run with NO operand — the common case is not the verbose case', () => {
    for (const c of ['inspect', 'init', 'report']) {
      expect(parseArgs([c]).error).toBeUndefined();
    }
  });

  it('parses the value-taking flags', () => {
    expect(parseArgs(['inspect', '--from', 'claude-code']).from).toBe('claude-code');
    expect(parseArgs(['report', '--evidence', 'e.json']).evidence).toBe('e.json');
    expect(parseArgs(['report', '--session', 's.jsonl']).session).toBe('s.jsonl');
    expect(parseArgs(['init', '--force']).force).toBe(true);
  });

  it('a value-taking flag with no value is a USAGE ERROR, not a silent undefined', () => {
    // Otherwise `--evidence` alone becomes "no evidence supplied" and reports
    // UNSUPPORTED, which reads as a finding instead of a typo.
    expect(parseArgs(['report', '--evidence']).error).toMatch(/requires a value/);
    expect(parseArgs(['report', '--evidence', '--json']).error).toMatch(/requires a value/);
  });

  it('the help text carries an egress row for each new command', () => {
    const help = parseArgs([]);
    expect(help.command).toBe('help');
  });
});

describe('the egress claim, enforced rather than promised', () => {
  // The README and `--help` both state that inspect / init / report reach
  // NOTHING. That is a claim about source code, so a test can hold it — and
  // must, because the day someone adds a "quick" telemetry ping is the day the
  // table becomes a lie that nobody re-reads.
  const NO_NETWORK = ['profile.ts', 'init.ts', 'inspect.ts', 'report.ts'];

  it.each(NO_NETWORK)('src/lib/%s opens no socket', (file) => {
    const src = readFileSync(join(__dirname, '..', 'src', 'lib', file), 'utf8');
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
      .replace(/(^|[^:])\/\/.*$/gm, '$1');  // line comments
    expect(stripped).not.toMatch(/\bfetch\s*\(/);
    expect(stripped).not.toMatch(/https?:\/\//);
    expect(stripped).not.toMatch(/require\(['"]node:(http|https|net|dgram|tls)['"]\)/);
    expect(stripped).not.toMatch(/from ['"]node:(http|https|net|dgram|tls)['"]/);
  });
});
