/**
 * The home-sample measure script. It does not dial production from this file.
 * A live run is `npm run test:home-samples`, and the workflow that calls it
 * is workflow_dispatch only, so a pull request never spends the checker budget.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function probe(code: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15000,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('home sample measure', () => {
  it('is a dispatch-only workflow and an npm script', () => {
    const yml = readFileSync(join(ROOT, '.github/workflows/home-samples.yml'), 'utf8');
    const pkg = readFileSync(join(ROOT, 'package.json'), 'utf8');
    const trigger = yml.slice(yml.indexOf('\non:'), yml.indexOf('\njobs:'));
    expect(trigger).toBe('\non:\n  workflow_dispatch:\n');
    expect(pkg).toContain('node --experimental-strip-types scripts/measure-home-samples.mjs');
  });

  it('paces one call per 20 seconds and exits 0 when every why matches', () => {
    const out = probe(`
      import { PACE_MS, DEFAULT_RUNS, measure } from './scripts/measure-home-samples.mjs';
      const sleeps = [];
      const posts = [];
      const result = await measure(
        [
          { label: 'speed', text: '45', why: { when: 'veto', text: '40' } },
          { label: 'opinion', text: 'pizza' },
        ],
        {
          n: DEFAULT_RUNS,
          paceMs: PACE_MS,
          sleep: async (ms) => { sleeps.push(ms); },
          post: async (text) => { posts.push(text); return { label: text === 'pizza' ? 'not-checked' : 'veto' }; },
        },
      );
      console.log(JSON.stringify({ pace: PACE_MS, runs: DEFAULT_RUNS, sleeps, posts, exit: result.exit }));
    `);
    expect(out.status).toBe(0);
    expect(JSON.parse(out.stdout)).toEqual({
      pace: 20000,
      runs: 3,
      sleeps: [20000, 20000, 20000, 20000, 20000],
      posts: ['45', '45', '45', 'pizza', 'pizza', 'pizza'],
      exit: 0,
    });
  });

  it('exits 1 when a why sample misses its label on any run', () => {
    const out = probe(`
      import { measure, formatReport } from './scripts/measure-home-samples.mjs';
      let n = 0;
      const result = await measure(
        [{ label: 'speed', text: '45', why: { when: 'veto', text: '40' } }],
        {
          n: 3,
          paceMs: 20000,
          sleep: async () => {},
          post: async () => ({ label: ++n === 2 ? 'not-checked' : 'veto' }),
        },
      );
      console.log(JSON.stringify({ exit: result.exit, text: formatReport(result) }));
    `);
    expect(out.status).toBe(0);
    const parsed = JSON.parse(out.stdout) as { exit: number; text: string };
    expect(parsed.exit).toBe(1);
    expect(parsed.text).toContain('why did not match every time: 1');
    expect(parsed.text).toContain('expected veto, got veto, not-checked, veto');
  });

  it('exits 2 on a network failure and does not send the next call', () => {
    const out = probe(`
      import { measure, formatReport } from './scripts/measure-home-samples.mjs';
      let n = 0;
      const result = await measure(
        [{ label: 'speed', text: '45', why: { when: 'veto', text: '40' } }],
        {
          n: 3,
          paceMs: 20000,
          sleep: async () => {},
          post: async () => { n += 1; if (n === 2) throw new Error('down'); return { label: 'veto' }; },
        },
      );
      console.log(JSON.stringify({ exit: result.exit, calls: n, text: formatReport(result) }));
    `);
    expect(out.status).toBe(0);
    const parsed = JSON.parse(out.stdout) as { exit: number; calls: number; text: string };
    expect(parsed.exit).toBe(2);
    expect(parsed.calls).toBe(2);
    expect(parsed.text.startsWith('NOT_CHECKED')).toBe(true);
  });

  it('posts the sentence to /api/v1/classify', () => {
    const out = probe(`
      import { classifyRequest } from './scripts/measure-home-samples.mjs';
      const req = classifyRequest('A sentence.', {});
      const over = classifyRequest('A sentence.', { TRUSTSHELL_API_URL: 'http://127.0.0.1:9/' });
      console.log(JSON.stringify({ req, over }));
    `);
    expect(out.status).toBe(0);
    const parsed = JSON.parse(out.stdout) as {
      req: { url: string; body: { text: string; labels: string[] } };
      over: { url: string };
    };
    expect(parsed.req.url).toBe('https://repid-engine-production.up.railway.app/api/v1/classify');
    expect(parsed.req.body).toEqual({ text: 'A sentence.', labels: ['pass', 'veto', 'not-checked'] });
    expect(parsed.over.url).toBe('http://127.0.0.1:9/api/v1/classify');
  });
});
