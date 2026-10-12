/**
 * A red scheduled gate must reach a human, and the mechanism that does it must not fail quietly.
 *
 * e2e-honesty.yml was red on every scheduled run from 2026-09-30 to 2026-10-11 and nothing
 * announced it. `scripts/announce-gate.mjs` is the carrier; this pins its behaviour by running the
 * REAL script against a fake GitHub API (nothing inside it is mocked), and pins the workflow wiring
 * that decides when it may write — because a carrier that is correct and never invoked, or invoked
 * on the wrong event, is the same silence again.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

jest.setTimeout(30000);

const ROOT = join(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'announce-gate.mjs');
const MARKER = '<!-- e2e-honesty-gate:tracking-issue -->';

interface Issue { number: number; title: string; body: string; state: string; pull_request?: object }
interface Fake {
  server: Server; url: string; issues: Issue[]; comments: { issue: number; body: string }[];
  writes: string[]; calls: string[];
}

/** A just-enough GitHub: the five endpoints the script touches, recording every call it receives. */
async function fakeGitHub(opts: { seed?: Issue[]; failCreate?: boolean; jobs?: unknown[]; jobsStatus?: number } = {}): Promise<Fake> {
  const f = { issues: [...(opts.seed ?? [])], comments: [], writes: [], calls: [] } as unknown as Fake;
  f.server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const path = (req.url ?? '').split('?')[0];
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      const call = `${req.method} ${path}`;
      f.calls.push(call);
      const send = (status: number, json: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(json)); };
      if (req.method === 'GET' && path === '/repos/o/r/issues') return send(200, f.issues.filter((i) => i.state === 'open'));
      if (req.method === 'GET' && path === '/repos/o/r/actions/runs/123/jobs') {
        return opts.jobsStatus ? send(opts.jobsStatus, { message: 'nope' }) : send(200, { jobs: opts.jobs ?? [] });
      }
      f.writes.push(call);
      if (req.method === 'POST' && path === '/repos/o/r/issues') {
        if (opts.failCreate) return send(403, { message: 'Resource not accessible by integration' });
        const made = { number: 900 + f.issues.length, title: body.title, body: body.body, state: 'open' };
        f.issues.push(made);
        return send(201, made);
      }
      const patch = /^\/repos\/o\/r\/issues\/(\d+)$/.exec(path);
      if (req.method === 'PATCH' && patch) {
        const i = f.issues.find((x) => x.number === Number(patch[1]));
        if (!i) return send(404, {});
        Object.assign(i, body);
        return send(200, i);
      }
      const cm = /^\/repos\/o\/r\/issues\/(\d+)\/comments$/.exec(path);
      if (req.method === 'POST' && cm) { f.comments.push({ issue: Number(cm[1]), body: body.body }); return send(201, {}); }
      return send(404, { message: `unexpected ${call}` });
    });
  });
  await new Promise<void>((r) => f.server.listen(0, '127.0.0.1', r));
  f.url = `http://127.0.0.1:${(f.server.address() as AddressInfo).port}`;
  return f;
}

// A CLEAN env on purpose: in CI the runner's own GITHUB_* (notably GITHUB_STEP_SUMMARY) must not leak in.
function runScript(env: Record<string, string>): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [SCRIPT], { env: { PATH: process.env.PATH ?? '', ...env } as unknown as NodeJS.ProcessEnv });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('error', reject);
    p.on('close', (code) => resolve({ code, out }));
  });
}

const dirs: string[] = [];
const servers: Server[] = [];
afterAll(() => { dirs.forEach((d) => rmSync(d, { recursive: true, force: true })); servers.forEach((s) => s.close()); });

/** A receipts dir holding the comparator's verdict, or none. */
function receipts(verdict?: unknown): string {
  const d = mkdtempSync(join(tmpdir(), 'announce-'));
  dirs.push(d);
  if (verdict !== undefined) writeFileSync(join(d, 'acceptance-baseline.json'), JSON.stringify(verdict));
  return d;
}

const ETHERS = { kind: 'NOT_CHECKED', leg: 'x402.payment_header', detail: "could not drive buildX402Payment: Cannot find module 'ethers'" };
const RED_VERDICT = { ok: false, installed: '1.6.0', problems: [ETHERS] };

async function go(
  fake: Fake,
  o: { acceptance: string; honesty: string; write?: boolean; verdict?: unknown; withoutRecept?: boolean; omit?: string },
) {
  servers.push(fake.server);
  const env: Record<string, string> = {
    GITHUB_API_URL: fake.url, GITHUB_TOKEN: 'test-token-not-a-secret', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '123',
    GITHUB_SHA: 'ce3b98c13d4f09d65eabc098d5fbac6ac47dd89c', GITHUB_SERVER_URL: 'https://github.example',
    ACCEPTANCE_RESULT: o.acceptance, HONESTY_RESULT: o.honesty, ANNOUNCE_WRITE: o.write === false ? 'false' : 'true',
    RECEIPT_DIR: receipts(o.withoutRecept ? undefined : (o.verdict ?? RED_VERDICT)),
  };
  if (o.omit) delete env[o.omit];
  return runScript(env);
}

describe('announce-gate: red', () => {
  it('opens ONE tracking issue naming the failed leg, with the marker and the date in the title', async () => {
    const fake = await fakeGitHub();
    const r = await go(fake, { acceptance: 'failure', honesty: 'success' });
    expect(r.code).toBe(0);
    expect(fake.issues).toHaveLength(1);
    const [issue] = fake.issues;
    expect(issue!.title).toMatch(/^🔴 e2e-honesty RED — since \d{4}-\d{2}-\d{2}$/);
    expect(issue!.body).toContain(MARKER);
    expect(issue!.body).toContain('x402.payment_header');
    expect(issue!.body).toContain('NOT_CHECKED');
    expect(issue!.body).toContain('https://github.example/o/r/actions/runs/123');
    expect(issue!.body).toContain('`ce3b98c`');
  });

  it('puts leg detail inside a code fence that the detail itself cannot close', async () => {
    const fake = await fakeGitHub();
    const evil = { ok: false, problems: [{ kind: 'REGRESSION', leg: 'x', detail: 'a ``` @hyperdag/trustshell #1 ```' }] };
    await go(fake, { acceptance: 'failure', honesty: 'success', verdict: evil });
    const body = fake.issues[0]!.body;
    expect(body).not.toContain('a ```');
    expect(body).toMatch(/```\n {2}a '''/);
  });

  it('lists the failed steps of the browser job from the Actions API', async () => {
    const fake = await fakeGitHub({ jobs: [
      { name: 'honesty', conclusion: 'failure', steps: [{ name: 'MVP walk', conclusion: 'success' }, { name: 'Phone door, live against production', conclusion: 'failure' }] },
      { name: 'acceptance', conclusion: 'success', steps: [] },
    ] });
    await go(fake, { acceptance: 'success', honesty: 'failure' });
    expect(fake.issues[0]!.body).toContain('failed step: Phone door, live against production');
    expect(fake.issues[0]!.body).not.toContain('failed step: MVP walk');
  });

  it('still announces when the jobs API fails: enrichment is not the red', async () => {
    const fake = await fakeGitHub({ jobsStatus: 500 });
    const r = await go(fake, { acceptance: 'success', honesty: 'failure' });
    expect(r.code).toBe(0);
    expect(fake.issues).toHaveLength(1);
    expect(fake.issues[0]!.body).toContain('no failed step could be listed');
  });

  it('says the legs cannot be listed when there is no verdict file, instead of reading absence as "no problems"', async () => {
    const fake = await fakeGitHub();
    await go(fake, { acceptance: 'failure', honesty: 'success', withoutRecept: true });
    expect(fake.issues).toHaveLength(1);
    expect(fake.issues[0]!.body).toContain('its legs cannot be listed');
  });

  it.each(['cancelled', 'skipped'])('treats a %s job as red: a run that looked at nothing is not green', async (result) => {
    const fake = await fakeGitHub();
    await go(fake, { acceptance: 'success', honesty: result });
    expect(fake.issues).toHaveLength(1);
  });

  it('does not open a second issue while one is open: it refreshes the body (keeping first-red) and comments', async () => {
    const seed: Issue = { number: 77, state: 'open', title: '🔴 e2e-honesty RED — since 2026-10-06', body: `${MARKER}\n<!-- first-red:2026-10-06 -->\nold` };
    const fake = await fakeGitHub({ seed: [seed] });
    const r = await go(fake, { acceptance: 'failure', honesty: 'success' });
    expect(r.code).toBe(0);
    expect(fake.writes).toEqual(['PATCH /repos/o/r/issues/77', 'POST /repos/o/r/issues/77/comments']);
    expect(fake.issues).toHaveLength(1);
    expect(seed.body).toContain('First red: 2026-10-06');
    expect(seed.body).toContain('x402.payment_header');
    expect(fake.comments[0]!.body).toContain('Still red');
    expect(fake.comments[0]!.body).toContain('x402.payment_header');
  });

  it('ignores a pull request, or an unrelated issue, that does not carry the marker', async () => {
    const fake = await fakeGitHub({ seed: [
      { number: 5, state: 'open', title: 'other', body: 'no marker here' },
      { number: 6, state: 'open', title: 'pr', body: MARKER, pull_request: {} },
    ] });
    await go(fake, { acceptance: 'failure', honesty: 'success' });
    expect(fake.writes).toEqual(['POST /repos/o/r/issues']);
  });

  it('exits non-zero when it cannot post: an announcer that fails quietly has moved the problem', async () => {
    const fake = await fakeGitHub({ failCreate: true });
    const r = await go(fake, { acceptance: 'failure', honesty: 'success' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('the red could not be announced');
  });
});

describe('announce-gate: green', () => {
  const open: Issue = { number: 77, state: 'open', title: '🔴 e2e-honesty RED — since 2026-10-06', body: `${MARKER}\n<!-- first-red:2026-10-06 -->` };

  it('comments and CLOSES the open tracking issue', async () => {
    const fake = await fakeGitHub({ seed: [{ ...open }] });
    const r = await go(fake, { acceptance: 'success', honesty: 'success' });
    expect(r.code).toBe(0);
    expect(fake.writes).toEqual(['POST /repos/o/r/issues/77/comments', 'PATCH /repos/o/r/issues/77']);
    expect(fake.issues[0]!.state).toBe('closed');
    expect(fake.comments[0]!.body).toContain('Green again');
  });

  it('writes nothing when green and nothing is open', async () => {
    const fake = await fakeGitHub();
    const r = await go(fake, { acceptance: 'success', honesty: 'success' });
    expect(r.code).toBe(0);
    expect(fake.writes).toEqual([]);
    expect(r.out).toContain('nothing to do');
  });
});

describe('announce-gate: only a scheduled run writes', () => {
  it('DRY RUN (ANNOUNCE_WRITE=false): reads, reports what it would do, posts nothing', async () => {
    const fake = await fakeGitHub();
    const r = await go(fake, { acceptance: 'failure', honesty: 'success', write: false });
    expect(r.code).toBe(0);
    expect(fake.writes).toEqual([]);
    expect(r.out).toContain('DRY RUN');
    expect(r.out).toContain('would open a new tracking issue');
  });

  it('a dry run does not close an open issue on a green manual run', async () => {
    const fake = await fakeGitHub({ seed: [{ number: 77, state: 'open', title: 't', body: MARKER }] });
    await go(fake, { acceptance: 'success', honesty: 'success', write: false });
    expect(fake.writes).toEqual([]);
    expect(fake.issues[0]!.state).toBe('open');
  });

  it.each(['ACCEPTANCE_RESULT', 'HONESTY_RESULT', 'GITHUB_TOKEN'])('refuses to guess when %s was not wired in', async (name) => {
    const fake = await fakeGitHub();
    const r = await go(fake, { acceptance: 'success', honesty: 'success', omit: name });
    expect(r.code).toBe(1);
    expect(fake.writes).toEqual([]);
    expect(r.out).toContain(name);
  });
});

describe('e2e-honesty.yml wiring', () => {
  const wf = readFileSync(join(ROOT, '.github', 'workflows', 'e2e-honesty.yml'), 'utf8').replace(/\r/g, '');
  const jobsText = wf.slice(wf.search(/^jobs:/m));
  const jobNames = [...jobsText.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)].map((m) => m[1]!);
  const block = (name: string): string => {
    const start = jobsText.search(new RegExp(`^ {2}${name}:\\s*$`, 'm'));
    const rest = jobsText.slice(start + 1);
    const next = rest.search(/^ {2}\S/m);
    return next < 0 ? rest : rest.slice(0, next);
  };
  const announce = block('announce');

  it('has an announce job at all (not vacuously green)', () => {
    expect(jobNames).toContain('announce');
    expect(announce.length).toBeGreaterThan(0);
  });

  it('waits for EVERY other job, so a job added later cannot be red in silence', () => {
    const needs = /needs:\s*\[([^\]]*)\]/.exec(announce)?.[1] ?? '';
    const listed = needs.split(',').map((s) => s.trim()).filter(Boolean).sort();
    expect(listed).toEqual(jobNames.filter((n) => n !== 'announce').sort());
  });

  it('runs after a failure, cancellation or skip: always(), not a bare success path', () => {
    expect(announce).toMatch(/^\s+if:\s*\$\{\{\s*always\(\)\s*\}\}/m);
  });

  it('writes only on the schedule event', () => {
    const line = announce.split('\n').find((l) => l.includes('ANNOUNCE_WRITE:')) ?? '';
    expect(line).toContain("github.event_name == 'schedule'");
    expect(line).toContain("'true'");
    expect(line).toContain("'false'");
  });

  it('hands the script both job results, not just one', () => {
    expect(announce).toContain('ACCEPTANCE_RESULT: ${{ needs.acceptance.result }}');
    expect(announce).toContain('HONESTY_RESULT: ${{ needs.honesty.result }}');
  });

  it('gives issues: write to the announce job alone', () => {
    expect(announce).toMatch(/issues:\s*write/);
    const topLevel = wf.slice(0, wf.search(/^jobs:/m));
    expect(topLevel).not.toMatch(/issues:/);
    for (const n of jobNames.filter((j) => j !== 'announce')) expect(block(n)).not.toMatch(/issues:\s*write/);
  });

  it('downloads the same artifact name the acceptance job uploads', () => {
    expect(block('acceptance')).toContain('name: receipts-acceptance');
    expect(announce).toContain('name: receipts-acceptance');
  });

  it('keeps the producer and the consumer of the verdict file on the same name', () => {
    const producer = readFileSync(join(ROOT, 'tests', 'e2e', 'acceptance-baseline.mjs'), 'utf8');
    const consumer = readFileSync(SCRIPT, 'utf8');
    expect(producer).toContain("'acceptance-baseline.json'");
    expect(consumer).toContain("'acceptance-baseline.json'");
  });

  it('still has no pull_request trigger: this gate stays off the PR path', () => {
    expect(wf.slice(0, wf.search(/^jobs:/m))).not.toMatch(/^\s*pull_request/m);
  });
});
