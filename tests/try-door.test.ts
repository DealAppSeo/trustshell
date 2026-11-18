/**
 * The zero-account try-door (/lab/try): one verdict per run URL and sentence, from the same code `check --claims` runs.
 *
 * Runs against RECORDED api.github.com answers (tests/fixtures/action-evidence, real public runs of this repo).
 * Any request that was not recorded fails the test rather than going out. The three verdict renderings and every
 * failure path are pinned: a failure must read NOT_CHECKED, never SUPPORTED.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { publicWhy, tryRun, verifyReceipt, verdictOf, type TryResult, type VerifyResult } from '../lib/try-door';
import { CheckError } from '../src/lib/check';
import { TRY_SAMPLES } from '../lib/try-samples';

// TSX is loaded by require so ts-jest does not type-check JSX (`tsc --noEmit` does that).
type ViewProps = { result: TryResult; verify: VerifyResult | null; busy: boolean; onVerify: () => void };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TryResultView } = require('../components/try-result-view') as { TryResultView: (p: ViewProps) => ReactElement };

const FX = join(__dirname, 'fixtures', 'action-evidence');
const NOW = () => new Date('2026-11-18T12:00:00.000Z');

type Fixture = { run_url: string; responses: Record<string, { status: number; body: unknown }> };
const load = (name: string): Fixture => JSON.parse(readFileSync(join(FX, name), 'utf8'));

const GREEN = load('green-run.json');
const FAILED = load('failed-run.json');
const GREEN_ID = '39290226738';
const FAILED_ID = '39166529852';

function replay(fx: Fixture, alter?: (url: string, r: { status: number; body: unknown }) => { status: number; body: unknown }) {
  const calls: string[] = [];
  (globalThis as { fetch?: unknown }).fetch = async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    if (u.host !== 'api.github.com') throw new Error(`egress to ${u.host}`);
    const rec = fx.responses[u.pathname + u.search];
    if (!rec) throw new Error(`unrecorded request: ${url}`);
    const r = alter ? alter(url, rec) : rec;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => JSON.stringify(r.body) };
  };
  return calls;
}

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('the three verdicts, from the real mapping', () => {
  it('SUPPORTED: a run that passed, and a sentence that says so and names the run', async () => {
    replay(GREEN);
    const r = await tryRun(GREEN.run_url, `The workflow passed in run ${GREEN_ID}.`, { now: NOW });
    expect(r.verdict).toBe('SUPPORTED');
    expect(r.evidence).toMatch(/succeeded|conclusion|success/i);
    expect(r.timestamp).toBe('2026-11-18T12:00:00.000Z');
    expect(r.record && r.digest?.value).toMatch(/^[0-9a-f]{64}$/);
  });

  it('CONTRADICTED: a run that failed, and a sentence that says it passed', async () => {
    replay(FAILED);
    const r = await tryRun(FAILED.run_url, `The workflow passed in run ${FAILED_ID}.`, { now: NOW });
    expect(r.verdict).toBe('CONTRADICTED');
    expect(r.evidence.length).toBeGreaterThan(10);
  });

  it('NOT_CHECKED: a claim no template can settle is never promoted to a verdict', async () => {
    replay(GREEN);
    const r = await tryRun(GREEN.run_url, `All tests pass in run ${GREEN_ID}.`, { now: NOW });
    expect(r.verdict).toBe('NOT_CHECKED');
  });

  it('an empty sentence is replaced by the plain claim about this run, and reads SUPPORTED on the green run', async () => {
    replay(GREEN);
    expect((await tryRun(GREEN.run_url, '   ', { now: NOW })).verdict).toBe('SUPPORTED');
  });

  it('only the two requests `check` makes leave, to api.github.com, with no token', async () => {
    const calls = replay(GREEN);
    process.env['GITHUB_TOKEN'] = 'must-not-be-used';
    try {
      await tryRun(GREEN.run_url, `The workflow passed in run ${GREEN_ID}.`, { now: NOW });
    } finally {
      delete process.env['GITHUB_TOKEN'];
    }
    expect(calls).toEqual([
      `https://api.github.com/repos/DealAppSeo/trustshell/actions/runs/${GREEN_ID}`,
      `https://api.github.com/repos/DealAppSeo/trustshell/actions/runs/${GREEN_ID}/jobs?per_page=100`,
    ]);
  });

  it('a mixed text is not SUPPORTED unless every entry is', () => {
    const c = (status: string) => ({ status }) as never;
    expect(verdictOf([])).toBe('NOT_CHECKED');
    expect(verdictOf([c('SUPPORTED'), c('NOT_CHECKED')])).toBe('NOT_CHECKED');
    expect(verdictOf([c('SUPPORTED'), c('CONTRADICTED')])).toBe('CONTRADICTED');
    expect(verdictOf([c('SUPPORTED')])).toBe('SUPPORTED');
  });
});

describe('every failure is NOT_CHECKED with a reason, never a pass', () => {
  it('GitHub\x27s own error text never reaches the caller: its rate-limit message names the server IP', async () => {
    const leak = 'API rate limit exceeded for 203.0.113.7. (But here is the good news...)';
    const inspect = (async () => { throw new CheckError(`GitHub 403: ${leak}`); }) as never;
    const r = await tryRun(GREEN.run_url, 'the run passed', { now: NOW, inspect });
    expect(r.verdict).toBe('NOT_CHECKED');
    expect(r.evidence).toBe('Could not read the run: GitHub 403.');
    expect(JSON.stringify(r)).not.toContain('203.0.113.7');
    // A message this codebase wrote still reaches the reader, and a non-CheckError is never shown.
    expect(publicWhy(new CheckError('need https://github.com/owner/repo/actions/runs/123'), 'x')).toMatch(/^need https/);
    expect(publicWhy(new Error('ECONNRESET 10.0.0.5'), 'fallback')).toBe('fallback');
  });

  it('an unsupported URL is NOT_CHECKED and sends nothing', async () => {
    const calls = replay(GREEN);
    for (const bad of ['', 'https://example.com/a/b/actions/runs/1', 'https://github.com/o/r/pull/3', 'https://evil-github.com/o/r/actions/runs/1', null, 42]) {
      const r = await tryRun(bad, 'x', { now: NOW });
      expect(r.verdict).toBe('NOT_CHECKED');
      expect(r.evidence).toMatch(/Not a GitHub Actions run URL/);
    }
    expect(calls).toEqual([]);
  });

  it('a network failure is NOT_CHECKED and the reason names the failure without leaking internals', async () => {
    (globalThis as { fetch?: unknown }).fetch = async () => {
      throw new Error('ECONNRESET at 10.0.0.7:443 secret-internal');
    };
    const r = await tryRun(GREEN.run_url, `The workflow passed in run ${GREEN_ID}.`, { now: NOW });
    expect(r.verdict).toBe('NOT_CHECKED');
    expect(r.evidence).toMatch(/Could not read the run/);
    expect(r.evidence).not.toMatch(/10\.0\.0\.7|secret-internal/);
    expect(r.record).toBeUndefined();
  });

  it('GitHub rate-limiting this server (403) or a missing run (404) is NOT_CHECKED', async () => {
    for (const status of [403, 404, 500]) {
      replay(GREEN, () => ({ status, body: { message: 'API rate limit exceeded' } }));
      const r = await tryRun(GREEN.run_url, `The workflow passed in run ${GREEN_ID}.`, { now: NOW });
      expect(r.verdict).toBe('NOT_CHECKED');
      expect(r.evidence).toMatch(new RegExp(String(status)));
    }
  });

  it('an over-long sentence is NOT_CHECKED before anything is sent', async () => {
    const calls = replay(GREEN);
    const r = await tryRun(GREEN.run_url, 'x'.repeat(301), { now: NOW });
    expect(r.verdict).toBe('NOT_CHECKED');
    expect(calls).toEqual([]);
  });
});

describe('Verify receipt', () => {
  async function receipt(fx: Fixture, claim: string) {
    replay(fx);
    return tryRun(fx.run_url, claim, { now: NOW });
  }

  it('MATCH when the digest holds and GitHub, read again, says the same', async () => {
    const r = await receipt(GREEN, `The workflow passed in run ${GREEN_ID}.`);
    replay(GREEN);
    const v = await verifyReceipt(r.record, r.digest, { now: NOW });
    expect(v.outcome).toBe('MATCH');
    expect(v.lines.join(' ')).toMatch(/does not show GitHub is right/);
  });

  it('MISMATCH when the record was edited after it was made (digest fails, nothing is fetched)', async () => {
    const r = await receipt(FAILED, `The workflow passed in run ${FAILED_ID}.`);
    const edited = JSON.parse(JSON.stringify(r.record));
    edited.claims[0].status = 'SUPPORTED';
    const calls = replay(FAILED);
    const v = await verifyReceipt(edited, r.digest, { now: NOW });
    expect(v.outcome).toBe('MISMATCH');
    expect(calls).toEqual([]);
  });

  it('MISMATCH when GitHub now reports a different conclusion for the run', async () => {
    const r = await receipt(GREEN, `The workflow passed in run ${GREEN_ID}.`);
    replay(GREEN, (url, rec) => (url.endsWith(GREEN_ID) ? { status: 200, body: { ...(rec.body as object), conclusion: 'failure' } } : rec));
    const v = await verifyReceipt(r.record, r.digest, { now: NOW });
    expect(v.outcome).toBe('MISMATCH');
    expect(v.lines.join(' ')).toMatch(/conclusion/);
  });

  it('NOT_CHECKED, never MATCH, when GitHub cannot be reached or the input is not a receipt', async () => {
    const r = await receipt(GREEN, `The workflow passed in run ${GREEN_ID}.`);
    (globalThis as { fetch?: unknown }).fetch = async () => {
      throw new Error('offline');
    };
    expect((await verifyReceipt(r.record, r.digest, { now: NOW })).outcome).toBe('NOT_CHECKED');
    expect((await verifyReceipt({ nope: 1 }, { value: 'x' }, { now: NOW })).outcome).toBe('NOT_CHECKED');
    expect((await verifyReceipt(r.record, undefined, { now: NOW })).outcome).toBe('NOT_CHECKED');
  });
});

describe('what a visitor sees', () => {
  const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
  const view = (result: TryResult) => html(createElement(TryResultView, { result, verify: null, busy: false, onVerify: () => {} }));

  it.each([
    ['SUPPORTED', GREEN, `The workflow passed in run ${GREEN_ID}.`, /Supported: GitHub.s record agrees/],
    ['CONTRADICTED', FAILED, `The workflow passed in run ${FAILED_ID}.`, /Contradicted: GitHub.s record disagrees/],
    ['NOT_CHECKED', GREEN, `All tests pass in run ${GREEN_ID}.`, /Not checked: nothing was decided\. This is not a pass\./],
  ] as const)('%s shows the verdict, one line of evidence, a time and the verify action', async (verdict, fx, claim, words) => {
    replay(fx);
    const r = await tryRun(fx.run_url, claim, { now: NOW });
    const out = view(r);
    expect(out).toContain(`data-verdict="${verdict}"`);
    expect(out).toMatch(words);
    expect(out).toContain('data-testid="try-evidence"');
    expect(out).toContain('2026-11-18T12:00:00.000Z');
    expect(out).toContain('Verify receipt');
  });

  it('a failure shows NOT_CHECKED with its reason and offers no receipt to verify', async () => {
    const r = await tryRun('not a url', '', { now: NOW });
    const out = view(r);
    expect(out).toContain('data-verdict="NOT_CHECKED"');
    expect(out).toContain('Not a GitHub Actions run URL');
    expect(out).not.toContain('Verify receipt');
    expect(out).not.toMatch(/Supported:/);
  });

  it('the samples are real public runs of this repo with no stored verdict, and each names its own run', () => {
    expect(TRY_SAMPLES).toHaveLength(3);
    for (const s of TRY_SAMPLES) {
      const id = s.url.match(/runs\/(\d+)$/)![1];
      expect(s.url).toMatch(/^https:\/\/github\.com\/DealAppSeo\/trustshell\/actions\/runs\/\d+$/);
      expect(s.claim).toContain(id);
      expect(Object.keys(s).sort()).toEqual(['claim', 'id', 'label', 'url']);
    }
  });
});
