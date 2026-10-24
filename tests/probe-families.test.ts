/**
 * Loop sprint 4 (claims-vs-code, 2026-10-23): scripts/probe-families.mjs.
 *
 * The site says a check is made by two model families. Whether it is true is a question for the
 * running engine, so there is a probe that asks it (and a dated record, docs/measurements/
 * families-2026-10-23.md). This holds the probe itself to account:
 *   - fed the two real production answers recorded on 2026-10-23, it says VERIFIED and names the
 *     families;
 *   - fed the answer it exists to catch (one family twice: the default before repid-engine#1462 on a
 *     deployment with no Cerebras key), it says FAILED. A probe that cannot say no has measured nothing;
 *   - anything it cannot read is NOT_CHECKED with an exit code that is never 0;
 *   - OFFLINE=1 and TRUSTSHELL_LOCAL_ONLY=1 make it send nothing.
 *
 * The module is ESM and jest here is CommonJS, so each check runs the real module in a child `node`.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.setTimeout(60000);

const ROOT = join(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'probe-families.mjs');
const FIXTURE = join(ROOT, 'fixtures', 'families-probe-2026-10-23.json');
const URL_OF_SCRIPT = 'file:///' + SCRIPT.replace(/\\/g, '/');

function esm(expr: string, env: Record<string, string> = {}) {
  const src = `import { readFileSync } from 'node:fs'; import * as m from ${JSON.stringify(URL_OF_SCRIPT)}; const rec = JSON.parse(readFileSync(${JSON.stringify(FIXTURE)}, 'utf8')); const out = await (async () => (${expr}))(); console.log(JSON.stringify(out));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', src], { encoding: 'utf8', env: { ...process.env, OFFLINE: '', TRUSTSHELL_LOCAL_ONLY: '', ...env } });
  if (r.status !== 0) throw new Error(`node exited ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout.trim().split('\n').pop() as string);
}

const rec = JSON.parse(readFileSync(FIXTURE, 'utf8'));

describe('the recording is what production answered', () => {
  it('both bodies are 200s from the production engine on 2026-10-23, with a model-made answer', () => {
    expect(rec.engine).toBe('https://repid-engine-production.up.railway.app');
    expect(rec.recordedAt).toMatch(/^2026-10-23T/);
    expect(rec.classify.status).toBe(200);
    expect(rec.hal.status).toBe(200);
    expect(rec.classify.body.by).toBe('votes');
    expect(rec.hal.body.mode).toBe('fact-check');
  });
});

describe('judge: the verdicts', () => {
  it('VERIFIED on the real production answers, naming the families', () => {
    const r = esm('m.judge({ classify: m.classifyFamilies(rec.classify.body), hal: m.halFamilies(rec.hal.body) })');
    expect(r.verdict).toBe('VERIFIED');
    expect(r.exit).toBe(0);
    expect(r.lines.join('\n')).toContain('gpt-oss, qwen');
    expect(r.lines.join('\n')).toContain('qwen, openai');
    expect(r.lines.join('\n')).toContain('independent_hosts 2');
  });

  it('FAILED on one family twice (the answer the check exists to catch), on either endpoint', () => {
    const oneClassify = esm(`m.judge({ classify: m.classifyFamilies({ by: 'votes', votes: [{ voter: 'groq', family: 'gpt-oss', verdict: 'TRUE' }, { voter: 'groq', family: 'gpt-oss', verdict: 'TRUE' }] }), hal: m.halFamilies(rec.hal.body) })`);
    expect(oneClassify.verdict).toBe('FAILED');
    expect(oneClassify.exit).toBe(1);
    expect(oneClassify.lines[0]).toContain('1 named family');
    const oneHal = esm(`m.judge({ classify: m.classifyFamilies(rec.classify.body), hal: m.halFamilies({ mode: 'fact-check', signals: { families: ['openai', 'openai'] } }) })`);
    expect(oneHal.verdict).toBe('FAILED');
    expect(oneHal.exit).toBe(1);
  });

  it('NOT_CHECKED, never 0, when no model was asked or the quorum did not run', () => {
    const arithmetic = esm(`m.judge({ classify: m.classifyFamilies({ label: 'veto', by: 'arithmetic' }), hal: m.halFamilies(rec.hal.body) })`);
    expect(arithmetic.verdict).toBe('NOT_CHECKED');
    expect(arithmetic.exit).toBe(3);
    const fallback = esm(`m.judge({ classify: m.classifyFamilies(rec.classify.body), hal: m.halFamilies({ mode: 'extractor-fallback', signals: { families: ['openai', 'qwen'] } }) })`);
    expect(fallback.verdict).toBe('NOT_CHECKED');
    expect(fallback.exit).toBe(3);
    const empty = esm(`m.judge({ classify: m.classifyFamilies(null), hal: m.halFamilies({}) })`);
    expect(empty.exit).toBe(3);
  });

  it('a known-false endpoint is not softened by a gap on the other one', () => {
    const r = esm(`m.judge({ classify: m.classifyFamilies({ by: 'votes', votes: [{ family: 'qwen' }] }), hal: { notChecked: 'unreachable' } })`);
    expect(r.verdict).toBe('FAILED');
  });

  it('blank, missing and repeated family names do not count as families', () => {
    const r = esm(`m.classifyFamilies({ by: 'votes', votes: [{ family: '' }, {}, { family: ' qwen ' }, { family: 'qwen' }, null] })`);
    expect(r.families).toEqual(['qwen']);
  });
});

describe('probe: what it sends', () => {
  it('asks both endpoints once with the fixed public sentence, and VERIFIES on the recorded answers', () => {
    const r = esm(`(async () => { const calls = []; const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); const u = String(url); return { status: 200, json: async () => (u.endsWith('/classify') ? rec.classify.body : rec.hal.body) }; }; const out = await m.probe({ env: {}, fetchImpl, now: () => new Date('2026-10-23T00:00:00Z') }); return { verdict: out.verdict, exit: out.exit, urls: calls.map((c) => c.url).sort(), texts: [...new Set(calls.map((c) => c.body.text))] }; })()`);
    expect(r.verdict).toBe('VERIFIED');
    expect(r.urls).toEqual(['https://repid-engine-production.up.railway.app/api/v1/classify', 'https://repid-engine-production.up.railway.app/api/v1/hal/evaluate']);
    expect(r.texts).toEqual(['Paris is the capital of France.']);
  });

  it.each([['OFFLINE', '1'], ['TRUSTSHELL_LOCAL_ONLY', '1']])('%s=%s: nothing is sent, NOT_CHECKED, exit 3', (name, value) => {
    const r = esm(`(async () => { let calls = 0; const out = await m.probe({ env: { ${name}: '${value}' }, fetchImpl: async () => { calls++; throw new Error('sent'); } }); return { calls, verdict: out.verdict, exit: out.exit }; })()`);
    expect(r).toEqual({ calls: 0, verdict: 'NOT_CHECKED', exit: 3 });
  });

  it('an unreachable or non-200 engine is NOT_CHECKED, not a pass', () => {
    const down = esm(`m.probe({ env: {}, fetchImpl: async () => { throw new Error('connect ECONNREFUSED'); } }).then((o) => ({ verdict: o.verdict, exit: o.exit }))`);
    expect(down).toEqual({ verdict: 'NOT_CHECKED', exit: 3 });
    const five = esm(`m.probe({ env: {}, fetchImpl: async () => ({ status: 503, json: async () => ({}) }) }).then((o) => ({ verdict: o.verdict, exit: o.exit }))`);
    expect(five).toEqual({ verdict: 'NOT_CHECKED', exit: 3 });
  });

  it('the command itself, run with OFFLINE=1, exits 3 and says so', () => {
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env: { ...process.env, OFFLINE: '1' } });
    expect(r.status).toBe(3);
    expect(r.stdout).toContain('NOT_CHECKED');
    expect(r.stdout).toContain('nothing was sent');
  });
});
