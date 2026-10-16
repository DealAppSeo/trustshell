/**
 * §8.4 of the learning-loop spec: the shipped hook is the caller, and CI runs it.
 *
 * A sample Claude Code UserPromptSubmit event is piped into examples/learn-hook/user-prompt-submit.mjs,
 * which runs `learn inject` from a CLI this suite COMPILES ITSELF (tsconfig.sdk.json, the same build the
 * egress check makes). Pointing it at a dist/ it did not build would measure that build, not this code.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { insertMemory, openMemoryDb } from '../src/memory/local-store';
import { acceptLesson, addCheck, addJob, correct, declineLesson, snapshot } from '../src/learn/store';

const ROOT = join(__dirname, '..');
const HOOK = join(ROOT, 'examples', 'learn-hook', 'user-prompt-submit.mjs');
const DAY = 86_400_000;

let outDir = '';
let cli = '';

beforeAll(() => {
  outDir = mkdtempSync(join(tmpdir(), 'ts-learn-hook-build-'));
  const tsc = require.resolve('typescript/bin/tsc', { paths: [ROOT] });
  const r = spawnSync(process.execPath, [tsc, '--project', join(ROOT, 'tsconfig.sdk.json'), '--outDir', outDir], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`tsc failed (exit ${r.status}): ${(r.stdout || r.stderr).slice(0, 800)}`);
  cli = join(outDir, 'cli', 'index.js');
}, 600_000);

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe('examples/learn-hook/user-prompt-submit.mjs', () => {
  let dir = '';
  let db = '';
  let env: NodeJS.ProcessEnv = {};

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ts-learn-hook-'));
    db = join(dir, 'memory.sqlite');
    env = { TRUSTSHELL_MEMORY: db };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function hook(prompt: string, extra: NodeJS.ProcessEnv = {}) {
    const event = { session_id: 'sess-1', transcript_path: join(dir, 't.jsonl'), cwd: dir, hook_event_name: 'UserPromptSubmit', prompt };
    const childEnv: NodeJS.ProcessEnv = { ...process.env, TRUSTSHELL_MEMORY: db, TRUSTSHELL_CLI: cli, TRUSTSHELL_LEARN_JOB: 'ship', ...extra };
    for (const [k, v] of Object.entries(childEnv)) if (v === undefined) delete childEnv[k];
    return spawnSync(process.execPath, [HOOK], { input: JSON.stringify(event), env: childEnv, encoding: 'utf8', cwd: dir });
  }

  it('prints the accepted lesson; declined, quarantined, expired, other-job lessons and the paraphrase note are absent', () => {
    const now = new Date();
    for (const slug of ['ship', 'other']) {
      addJob(slug, 'delegate', 'When I ship a change, I want the tests green, so I can merge.', env, now);
      addCheck(slug, `${slug}-tests`, 'npm test', env, now);
    }
    const keep = correct({ job: 'ship', text: 'Run the linter before you say done.', note: 'PARAPHRASE: lint first' }, env, now);
    acceptLesson(keep.lesson, env, now);
    const no = correct({ job: 'ship', text: 'DECLINED lesson.' }, env, now);
    declineLesson(no.lesson, env, now);
    correct({ job: 'ship', text: 'QUARANTINED copy of a web page.', source: 'https://example.com' }, env, now);
    const old = new Date(now.getTime() - 31 * DAY);
    const stale = correct({ job: 'ship', text: 'EXPIRED lesson.' }, env, old);
    acceptLesson(stale.lesson, env, old);
    const elsewhere = correct({ job: 'other', text: 'OTHER job lesson.' }, env, now);
    acceptLesson(elsewhere.lesson, env, now);
    insertMemory(db, 'lesson', 'UNTAINTED row.', now.toISOString(), env);

    const r = hook('Ship the fix, please.');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('- Run the linter before you say done.');
    for (const absent of ['DECLINED', 'QUARANTINED copy', 'EXPIRED', 'OTHER job', 'PARAPHRASE', 'UNTAINTED']) expect(r.stdout).not.toContain(absent);

    const [ep] = snapshot(env)!.episodes;
    expect(ep!.injected).toEqual([keep.lesson]);
    expect(ep!.loop_tokens).toBeGreaterThan(0);

    // The same prompt in the same session is the same turn: the episode is updated, not duplicated.
    expect(hook('Ship the fix, please.').status).toBe(0);
    expect(snapshot(env)!.episodes).toHaveLength(1);
    expect(hook('A different prompt.').status).toBe(0);
    expect(snapshot(env)!.episodes).toHaveLength(2);
  }, 300_000);

  it('keeps only a hash of the prompt', () => {
    const now = new Date();
    addJob('ship', 'delegate', 'When I ship a change, I want the tests green, so I can merge.', env, now);
    hook('a private prompt about payroll');
    const conn = openMemoryDb(db);
    const rows = conn.prepare('SELECT ask_sha256 FROM learn_episode').all();
    conn.close();
    expect(rows).toEqual([{ ask_sha256: createHash('sha256').update('a private prompt about payroll').digest('hex') }]);
  }, 300_000);

  it('does nothing, and never fails the prompt, without a job or without a memory file', () => {
    const unset = hook('anything', { TRUSTSHELL_LEARN_JOB: undefined });
    expect([unset.status, unset.stdout]).toEqual([0, '']);
    const missing = hook('anything');
    expect([missing.status, missing.stdout]).toEqual([0, '']);
    const bad = hook('anything', { TRUSTSHELL_LEARN_JOB: 'x & echo pwned' });
    expect([bad.status, bad.stdout]).toEqual([0, '']);
  }, 300_000);
});
