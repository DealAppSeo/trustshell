/**
 * MCP `inspect_run`: Inspect (`check <runUrl> --claims`) for agents.
 *
 * GitHub responses are the recorded pinned run (challenge-run.json, run 39619591025, recorded from
 * api.github.com unmodified). Any request that was not recorded throws, so nothing leaves the machine
 * and a call to any host but api.github.com (the hosted check_claim, say) fails the test.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from '../src/mcp/index';
import { parseArgs, run, type CliIO } from '../src/cli/index';
import { digestRecord, MAX_CLAIMS_FILE_BYTES } from '../src/lib/action-evidence';
import type { TrustShell } from '../src/lib/trustshell';

const FX = join(__dirname, 'fixtures', 'action-evidence');
const PINNED = JSON.parse(readFileSync(join(FX, 'challenge-run.json'), 'utf8'));
const RUN_URL: string = PINNED.run_url;
const NARROW = 'The check workflow succeeded, run 39619591025.';
/** The challenge's two claims (docs/challenge.md), as its Bash form writes them. */
const CHALLENGE = `${NARROW}\n\nThe check workflow succeeded on commit 5d1c5e3f57e1, run 39619591025.\n`;
const NO_CLIENT = {} as unknown as TrustShell;

let calls: string[];
beforeEach(() => {
  calls = [];
  (globalThis as any).fetch = async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    const r = PINNED.responses[u.pathname + u.search];
    if (!r || u.host !== 'api.github.com') throw new Error(`unrecorded: ${url}`);
    return { ok: r.status < 300, status: r.status, text: async () => JSON.stringify(r.body) };
  };
  // fetchedAt is part of the record, so the CLI and the tool must read the same clock.
  jest.useFakeTimers({ now: new Date('2026-10-22T05:14:10.035Z') });
});
afterEach(() => {
  jest.useRealTimers();
  delete (globalThis as any).fetch;
  delete process.env.OFFLINE;
});

async function inspectRun(args: { run_url: string; claims: string }) {
  const server: any = createServer(NO_CLIENT);
  const r = await server._registeredTools['inspect_run'].handler(args);
  const body = JSON.parse(r.content[0].text);
  return { isError: r.isError === true, text: r.content[0].text as string, d: body.untrusted_data, screening: body.screening };
}

async function cli(runUrl: string, claims: string) {
  const out: string[] = [];
  const io: CliIO = { out: (s) => out.push(s), err: () => {} };
  const code = await run(parseArgs(['check', runUrl, '--claims', claims, '--json']), NO_CLIENT, io);
  return { code, json: out.length ? JSON.parse(out.join('\n')) : null };
}

describe('MCP inspect_run', () => {
  it('the fixture is the pinned run, recorded unmodified', () => {
    expect(PINNED._provenance.modified).toBe(false);
    expect(RUN_URL).toBe('https://github.com/DealAppSeo/trustshell/actions/runs/39619591025');
  });

  it("returns the CLI's record and digest for the challenge's two claims, status contradicted", async () => {
    const c = await cli(RUN_URL, CHALLENGE);
    const { isError, d, screening } = await inspectRun({ run_url: RUN_URL, claims: CHALLENGE });
    expect(isError).toBe(false);
    expect(screening).toEqual({ ingest: 'clean' });
    expect(d.digest).toEqual(c.json.digest);
    expect(d.record).toEqual(c.json.record);
    expect(digestRecord(d.record)).toEqual(d.digest);
    expect(c.code).toBe(1);
    expect(d).toMatchObject({ status: 'contradicted', exit_code: 1, run_id: 39619591025, head_sha: '392797a69b6a3e57406cef210a8471585667e3af' });
    expect(d.card).toContain('Claims: 3 supported · 1 contradicted · 1 not checked');
    expect(d.card).toContain('**CONTRADICTED** `commit 5d1c5e3f57e1`');
    expect(d.assurance).toEqual(c.json.record.assurance);
    expect(d.does_not_prove).toEqual(c.json.record.does_not_prove);
    expect(calls.every((u) => new URL(u).host === 'api.github.com')).toBe(true);
  });

  // Grok P1-C: every challenge variant, through BOTH paths on the same recorded responses. Same digest,
  // same per-claim statuses, same exit code. The PR body carries this table.
  const VARIANTS: { name: string; url?: string; claims: string; status: string; exit: number; claims_status: string[] | null }[] = [
    { name: 'challenge, two sentences', claims: CHALLENGE, status: 'contradicted', exit: 1, claims_status: ['SUPPORTED', 'SUPPORTED', 'NOT_CHECKED', 'CONTRADICTED', 'SUPPORTED'] },
    { name: 'narrow true claim', claims: NARROW, status: 'all_supported', exit: 0, claims_status: ['SUPPORTED', 'SUPPORTED'] },
    { name: 'correct commit, 12 hex', claims: 'The check workflow succeeded on commit 392797a69b6a, run 39619591025.', status: 'all_supported', exit: 0, claims_status: ['SUPPORTED', 'SUPPORTED', 'SUPPORTED'] },
    { name: 'short SHA, 7 hex', claims: 'The check workflow succeeded on commit 392797a, run 39619591025.', status: 'not_checked', exit: 3, claims_status: ['NOT_CHECKED', 'NOT_CHECKED', 'SUPPORTED'] },
    { name: 'wrong workflow name', claims: 'The build workflow succeeded, run 39619591025.', status: 'not_checked', exit: 3, claims_status: ['NOT_CHECKED', 'SUPPORTED'] },
    { name: "another repo's run", claims: 'The check workflow succeeded: https://github.com/someone-else/trustshell/actions/runs/39619591025', status: 'contradicted', exit: 1, claims_status: ['NOT_CHECKED', 'CONTRADICTED'] },
    { name: 'attempt mismatch, in the claim', claims: 'The check workflow succeeded, run 39619591025, attempt 2.', status: 'contradicted', exit: 1, claims_status: ['NOT_CHECKED', 'SUPPORTED', 'CONTRADICTED'] },
    { name: 'attempt mismatch, in the URL', url: `${RUN_URL}/attempts/2`, claims: NARROW, status: 'not_checked', exit: 3, claims_status: null },
    { name: 'matching attempt, in the URL', url: `${RUN_URL}/attempts/1`, claims: NARROW, status: 'all_supported', exit: 0, claims_status: ['SUPPORTED', 'SUPPORTED'] },
    { name: 'Markdown line', claims: '- **The check workflow succeeded**, run 39619591025.', status: 'not_checked', exit: 3, claims_status: ['NOT_CHECKED'] },
    { name: 'HTML line', claims: '<b>The check workflow succeeded</b>, run 39619591025.', status: 'not_checked', exit: 3, claims_status: ['NOT_CHECKED'] },
    { name: 'a prose line that blocks the text', claims: `${NARROW}\nThe build is great — trust me.`, status: 'not_checked', exit: 3, claims_status: ['NOT_CHECKED', 'NOT_CHECKED', 'NOT_CHECKED'] },
    { name: '"all tests pass"', claims: 'All tests pass.', status: 'not_checked', exit: 3, claims_status: ['NOT_CHECKED'] },
  ];

  it.each(VARIANTS)('parity with the CLI: $name', async (v) => {
    const url = v.url ?? RUN_URL;
    const c = await cli(url, v.claims);
    const t = await inspectRun({ run_url: url, claims: v.claims });
    const statuses = (rec: any) => (rec ? rec.claims.map((x: any) => x.status) : null);

    expect(t.d.exit_code).toBe(c.code);
    expect(t.d.exit_code).toBe(v.exit);
    expect(t.d.status).toBe(v.status);
    expect(statuses(t.d.record ?? null)).toEqual(v.claims_status);
    expect(statuses(c.json?.record ?? null)).toEqual(v.claims_status);
    expect(t.d.digest ?? null).toEqual(c.json?.digest ?? null);
    if (t.d.record) expect(t.d.record).toEqual(c.json.record);

    // No fabricated pass: success only when every claim is SUPPORTED, and every other answer still
    // names the run (and the commit and digest when a record exists).
    expect(t.d.status === 'all_supported').toBe(v.claims_status !== null && v.claims_status.every((s) => s === 'SUPPORTED'));
    expect(t.d.run_id).toBe(39619591025);
    expect(t.isError).toBe(v.claims_status === null);
    if (v.claims_status) {
      expect(t.d.head_sha).toBe('392797a69b6a3e57406cef210a8471585667e3af');
      expect(t.d.digest.value).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('a GitHub error is not_checked with the run id, never an empty or passing answer', async () => {
    (globalThis as any).fetch = async (url: string) => {
      calls.push(url);
      return { ok: false, status: 404, text: async () => JSON.stringify({ message: 'Not Found' }) };
    };
    const t = await inspectRun({ run_url: RUN_URL, claims: NARROW });
    expect(t.isError).toBe(true);
    expect(t.d).toMatchObject({ status: 'not_checked', exit_code: 3, run_id: 39619591025, head_sha: null, digest: null });
    expect(t.d.reason).toMatch(/^inspect_run failed: GitHub 404/);
  });

  it('treats a string that looks like a path as claim text and opens nothing', async () => {
    // This file exists, and its sentences are SUPPORTED-shaped. Opened, they would land on the record.
    const path = 'tests/fixtures/action-evidence/claims/narrow-true.txt';
    const fileText = readFileSync(path, 'utf8');
    const fs = require('node:fs') as typeof import('node:fs');
    const read = jest.spyOn(fs, 'readFileSync');
    const stat = jest.spyOn(fs, 'statSync');
    try {
      const t = await inspectRun({ run_url: RUN_URL, claims: path });
      expect(t.d.record.claims.map((c: any) => c.sentence)).toEqual([path]);
      expect(t.d.status).toBe('not_checked');
      const firstLine = fileText.split(/\r?\n/).find((l) => l.trim()) as string;
      expect(t.text).not.toContain(firstLine.trim());
      expect(read.mock.calls.filter((c) => String(c[0]).includes('narrow-true'))).toEqual([]);
      expect(stat.mock.calls.filter((c) => String(c[0]).includes('narrow-true'))).toEqual([]);
    } finally {
      read.mockRestore();
      stat.mockRestore();
    }
  });

  // Grok P1-C: only https://github.com/<owner>/<repo>/actions/runs/<id>[/attempts/<n>]. Every other
  // shape is refused (exit 2, the CLI's usage code) before anything is sent: not re-routed to the
  // hosted check, and not loosened to what the CLI's parseRun accepts.
  it.each([
    ['a sentence, not a URL', 'The check workflow succeeded.'],
    ['http', 'http://github.com/DealAppSeo/trustshell/actions/runs/39619591025'],
    ['www.', 'https://www.github.com/DealAppSeo/trustshell/actions/runs/39619591025'],
    ['credentials', 'https://user:token@github.com/DealAppSeo/trustshell/actions/runs/39619591025'],
    ['another host', 'https://gitlab.com/DealAppSeo/trustshell/actions/runs/39619591025'],
    ['a github.com lookalike', 'https://github.com.evil.example/DealAppSeo/trustshell/actions/runs/39619591025'],
    ['the API host', 'https://api.github.com/repos/DealAppSeo/trustshell/actions/runs/39619591025'],
    ['a port', 'https://github.com:443/DealAppSeo/trustshell/actions/runs/39619591025'],
    ['a trailing job path', `${RUN_URL}/job/1`],
    ['a query', `${RUN_URL}?check_suite_focus=true`],
    ['a fragment', `${RUN_URL}#summary`],
    ['a trailing slash', `${RUN_URL}/`],
    ['a dot-dot repository', 'https://github.com/DealAppSeo/../actions/runs/39619591025'],
    ['a non-numeric run id', 'https://github.com/DealAppSeo/trustshell/actions/runs/latest'],
  ])('refuses run_url with %s, and sends nothing', async (_name, url) => {
    const t = await inspectRun({ run_url: url, claims: NARROW });
    expect(t.isError).toBe(true);
    expect(t.d).toMatchObject({ status: 'refused', exit_code: 2, run_id: null, head_sha: null, digest: null });
    expect(t.d.reason).toMatch(/^run_url must be https:\/\/github\.com\//);
    expect(calls).toEqual([]);
  });

  it('caps claims at the --claims-file limit, in UTF-8 bytes like the CLI, and sends nothing', async () => {
    // 'é' is two bytes: this is under the cap in characters and over it in bytes.
    const over = 'é'.repeat(MAX_CLAIMS_FILE_BYTES / 2 + 1);
    expect(over.length).toBeLessThan(MAX_CLAIMS_FILE_BYTES);
    const t = await inspectRun({ run_url: RUN_URL, claims: over });
    expect(t.isError).toBe(true);
    expect(t.d).toMatchObject({ status: 'refused', exit_code: 2, run_id: 39619591025 });
    expect(t.d.reason).toBe(`the claim text is ${MAX_CLAIMS_FILE_BYTES + 2} bytes; the limit is ${MAX_CLAIMS_FILE_BYTES}`);
    expect(calls).toEqual([]);

    const empty = await inspectRun({ run_url: RUN_URL, claims: ' \n ' });
    expect(empty.d).toMatchObject({ status: 'refused', exit_code: 2 });
    expect(calls).toEqual([]);
  });

  it('OFFLINE=1 sends nothing and is not_checked, never a pass', async () => {
    process.env.OFFLINE = '1';
    const t = await inspectRun({ run_url: RUN_URL, claims: CHALLENGE });
    expect(t.isError).toBe(true);
    expect(t.d).toMatchObject({ status: 'not_checked', exit_code: 3, run_id: 39619591025, digest: null });
    expect(calls).toEqual([]);
  });

  it('says it authorizes nothing and is not check_claim', () => {
    const server: any = createServer(NO_CLIENT);
    const description: string = server._registeredTools['inspect_run'].description;
    expect(description).toContain('It reads evidence and authorizes nothing');
    expect(description).toContain('being able to call this tool is not permission either');
    expect(description).toContain('It is not check_claim');
    expect(readFileSync(join(__dirname, '..', 'docs', 'recipes', 'README.md'), 'utf8')).toContain('**MCP does not grant authority.**');
  });
});
