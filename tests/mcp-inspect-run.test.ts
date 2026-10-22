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
import { digestRecord } from '../src/lib/action-evidence';
import type { TrustShell } from '../src/lib/trustshell';

const FX = join(__dirname, 'fixtures', 'action-evidence');
const PINNED = JSON.parse(readFileSync(join(FX, 'challenge-run.json'), 'utf8'));
const RUN_URL: string = PINNED.run_url;
/** The challenge's two claims (docs/challenge.md), as its Bash form writes them. */
const CHALLENGE =
  'The check workflow succeeded, run 39619591025.\n\nThe check workflow succeeded on commit 5d1c5e3f57e1, run 39619591025.\n';
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
  return { isError: r.isError === true, text: r.content[0].text as string };
}

async function cliRecord(claims: string) {
  const out: string[] = [];
  const io: CliIO = { out: (s) => out.push(s), err: () => {} };
  const code = await run(parseArgs(['check', RUN_URL, '--claims', claims, '--json']), NO_CLIENT, io);
  return { code, json: JSON.parse(out.join('\n')) };
}

describe('MCP inspect_run', () => {
  it('the fixture is the pinned run, recorded unmodified', () => {
    expect(PINNED._provenance.modified).toBe(false);
    expect(RUN_URL).toBe('https://github.com/DealAppSeo/trustshell/actions/runs/39619591025');
  });

  it("returns the CLI's record and digest for the challenge's two claims, status contradicted", async () => {
    const cli = await cliRecord(CHALLENGE);
    const r = await inspectRun({ run_url: RUN_URL, claims: CHALLENGE });
    expect(r.isError).toBe(false);
    const { untrusted_data: d, screening } = JSON.parse(r.text);
    expect(screening).toEqual({ ingest: 'clean' });

    expect(d.digest).toEqual(cli.json.digest);
    expect(d.record).toEqual(cli.json.record);
    expect(digestRecord(d.record)).toEqual(d.digest);
    expect(d.digest.value).toMatch(/^[0-9a-f]{64}$/);

    expect(cli.code).toBe(1);
    expect(d.exit_code).toBe(1);
    expect(d.status).toBe('contradicted');
    expect(d.card).toContain('Claims: 3 supported · 1 contradicted · 1 not checked');
    expect(d.card).toContain('**CONTRADICTED** `commit 5d1c5e3f57e1`');
    expect(d.assurance).toEqual(cli.json.record.assurance);
    expect(d.does_not_prove).toEqual(cli.json.record.does_not_prove);
    expect(calls.every((u) => new URL(u).host === 'api.github.com')).toBe(true);
  });

  it('treats a string that looks like a path as claim text and opens nothing', async () => {
    // This file exists, and its sentences are SUPPORTED-shaped. Opened, they would land on the record.
    const path = 'tests/fixtures/action-evidence/claims/narrow-true.txt';
    const fileText = readFileSync(path, 'utf8');
    const fs = require('node:fs') as typeof import('node:fs');
    const read = jest.spyOn(fs, 'readFileSync');
    const stat = jest.spyOn(fs, 'statSync');
    try {
      const r = await inspectRun({ run_url: RUN_URL, claims: path });
      const { untrusted_data: d } = JSON.parse(r.text);
      expect(d.record.claims.map((c: any) => c.sentence)).toEqual([path]);
      expect(d.status).toBe('not_checked');
      const firstLine = fileText.split(/\r?\n/).find((l) => l.trim()) as string;
      expect(r.text).not.toContain(firstLine.trim());
      expect(read.mock.calls.filter((c) => String(c[0]).includes('narrow-true'))).toEqual([]);
      expect(stat.mock.calls.filter((c) => String(c[0]).includes('narrow-true'))).toEqual([]);
    } finally {
      read.mockRestore();
      stat.mockRestore();
    }
  });

  it('refuses a run_url that is not a run URL, and never re-routes it to the hosted check', async () => {
    const r = await inspectRun({ run_url: 'The check workflow succeeded.', claims: CHALLENGE });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/^inspect_run failed: need https:\/\/github\.com\//);
    expect(calls).toEqual([]);
  });

  it('OFFLINE=1 sends nothing and is not_checked, never a pass', async () => {
    process.env.OFFLINE = '1';
    const r = await inspectRun({ run_url: RUN_URL, claims: CHALLENGE });
    expect(JSON.parse(r.text)).toMatchObject({ status: 'not_checked', exit_code: 3 });
    expect(calls).toEqual([]);
  });
});
