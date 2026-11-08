/**
 * NEGATIVE CONTROL for the execution→observation trust boundary (L-AUDIT, hop "actual execution →
 * runtime observation"). test-only; no source change.
 *
 * The guard proves exactly two things about a command: that the owner policy let it START, and the
 * EXIT CODE it ended with. It never watches what the command did (files, network, child processes)
 * and no outside party observes it. The silent-promotion risk at this hop is the most natural
 * over-claim there is: reading "exited 0" as "succeeded / was correct / was observed / was verified".
 *
 * guardrails.test.ts already pins that the run card CONTAINS the 'independently observed' label — but
 * NOT the words that follow it, so an edit of guard.ts's honest line to "…verified" would still pass
 * there. This is the control that bites: a run carrying the STRONGEST honest signal the guard has
 * (exit 0) must promote to NOTHING beyond {started, exit-code-0}. If the honesty regresses — the card
 * line, the record shape, or the mediated scope — one of these fails.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CliIO } from '../src/cli';
import { RUN_SCOPE, runRun, type Spawner } from '../src/cli/guard';
import { GUARD_RECEIPTS_FILE, POLICY_FILE, defaultPolicy, renderPolicyDocument, type GuardRecord, type LocalPolicy } from '../src/lib/guardrails';

const NOW = 1_800_000_000; // 2027-01-15
// Words that would turn a start-decision or an exit code into an outcome, correctness, or observation
// claim. The guard's one legitimate use of "observed" is to DENY observation ("observed  nothing"),
// which is stripped before this net is applied.
const PROMOTION = /\b(succe|verif|correct|validat|confirm|attest|observed it|observed the|did the job|trustworthy)/i;

describe('execution→observation honesty (L-AUDIT negative control)', () => {
  const prevEnv = { ...process.env };
  let home = '';
  let err: string[] = [];
  const io: CliIO = { out: () => {}, err: (s) => err.push(s) };
  const ok0: Spawner = () => ({ status: 0, signal: null }); // exit 0 — the strongest honest signal the guard sees
  const policyFile = () => writeFileSync(join(home, POLICY_FILE), renderPolicyDocument({ policy: { ...defaultPolicy(NOW), actions: ['tool:git'] } as LocalPolicy, signature: null }));
  const records = (): GuardRecord[] => readFileSync(join(home, GUARD_RECEIPTS_FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as GuardRecord);

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'ts-exec-honesty-'));
    process.env.TRUSTSHELL_HOME = home;
    err = [];
    policyFile();
  });
  afterEach(() => {
    process.env = { ...prevEnv };
    rmSync(home, { recursive: true, force: true });
  });

  it('a command that EXITED 0 is promoted to nothing beyond {started, exit 0}: the card states observation as "nothing", never success/correctness', () => {
    expect(runRun(['--tool', 'git', '--', 'git', 'status'], io, process.env, ok0)).toBe(0);
    const card = err.join('\n');
    // the honest line is pinned IN FULL (guardrails.test.ts pins only the bare 'independently observed' label)
    expect(card).toContain('independently observed  nothing: no outside party watched this command');
    // exit 0 reads as a bare exit code, never as success / correctness / observation
    expect(card).toMatch(/executed\s+started; exited 0 after \d+ ms/);
    // with the one honest denial-of-observation removed, no word promotes the start/exit into an outcome claim
    const rest = card.replace('independently observed  nothing', '');
    expect(rest).not.toMatch(PROMOTION);
  });

  it('the outcome record carries ONLY {exit_code, signal, duration_ms}: no field can smuggle a success/observation claim', () => {
    runRun(['--tool', 'git', '--', 'git', 'status'], io, process.env, ok0);
    const outcome = records().find((r) => r.kind === 'outcome');
    expect(outcome?.executed).toEqual({ exit_code: 0, signal: null, duration_ms: expect.any(Number) });
    expect(Object.keys(outcome?.executed as object).sort()).toEqual(['duration_ms', 'exit_code', 'signal']);
  });

  it('RUN_SCOPE names only the start-decision and the exit code as mediated — never that the command did its job — and lists the blind spots', () => {
    for (const m of RUN_SCOPE.mediated) expect(m).not.toMatch(PROMOTION);
    expect(RUN_SCOPE.mediated.join(' ')).toMatch(/decision to start/i);
    expect(RUN_SCOPE.mediated.join(' ')).toMatch(/exit code/i);
    // what the command actually did is explicitly OUT of scope, not quietly assumed fine
    expect(RUN_SCOPE.not_mediated.join(' ')).toMatch(/what the command did after it started/i);
  });
});
