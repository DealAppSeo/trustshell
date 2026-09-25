/**
 * Smoke the local CLI and the read-only card. No live engine.
 *
 * verify / repid / proof dial the hosted HAL backend. This file does not run
 * them. When OFFLINE=1 a live call is NOT_CHECKED, and that state is not PASS.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { receiptLine } from '../lib/hal-receipt';

const ROOT = join(__dirname, '..');

function capture(): { io: CliIO; out: string[] } {
  const out: string[] = [];
  return { io: { out: (s) => out.push(s), err: () => undefined }, out };
}

/** Live-engine work stops here. Never report that stop as PASS. */
export function offlineState(): 'NOT_CHECKED' | 'RUN' {
  return process.env.OFFLINE === '1' ? 'NOT_CHECKED' : 'RUN';
}

describe('e2e CLI smoke (no engine)', () => {
  it('trustshell --version includes 1.4', async () => {
    const { io, out } = capture();
    const code = await run(parseArgs(['--version']), {} as never, io);
    expect(code).toBe(0);
    expect(out.join('\n')).toMatch(/1\.4/);
  });

  it('help lists verify, repid, and proof', async () => {
    const { io, out } = capture();
    const code = await run(parseArgs(['--help']), {} as never, io);
    expect(code).toBe(0);
    const help = out.join('\n');
    expect(help).toMatch(/\n {2}verify /);
    expect(help).toMatch(/\n {2}repid /);
    expect(help).toMatch(/\n {2}proof /);
  });

  it('receipt line is family, host, verdict', () => {
    expect(receiptLine({ family: 'glm', host: 'cerebras', verdict: 'FALSE' })).toBe(
      'glm cerebras FALSE',
    );
    expect(receiptLine({ family: 'openai', host: 'openai', verdict: 'ERROR' })).toBe(
      'openai openai NOT_CHECKED',
    );
    expect(receiptLine({ family: 'qwen', host: 'deepseek', verdict: 'TRUE' })).not.toMatch(
      /user|prompt/i,
    );
  });

  it('Honesty A stays FIXTURE and Help B stays no ratings', () => {
    const page = readFileSync(join(ROOT, 'app/model-card/page.tsx'), 'utf8');
    expect(page).toContain('Honesty A');
    expect(page).toContain('FIXTURE');
    expect(page).toContain('Help B');
    expect(page).toContain('no ratings');
    expect(page).not.toMatch(/Help B is live|blended/i);
  });

  it('trustshell status --help mentions after-create', async () => {
    const { io, out } = capture();
    const code = await run(parseArgs(['status', '--help']), {} as never, io);
    expect(code).toBe(0);
    expect(out.join('\n')).toMatch(/after-create/);
  });

  it('OFFLINE=1 status is NOT_CHECKED and is not PASS', async () => {
    const prevOffline = process.env.OFFLINE;
    const prevUrl = process.env.TRUSTSHELL_API_URL;
    const prevFetch = global.fetch;
    process.env.OFFLINE = '1';
    process.env.TRUSTSHELL_API_URL = 'https://engine.test';
    let called = false;
    global.fetch = (async () => {
      called = true;
      return new Response('no', { status: 200 });
    }) as typeof fetch;
    try {
      const { io, out } = capture();
      const code = await run(parseArgs(['status']), {} as never, io);
      const text = out.join('\n');
      expect(code).toBe(0);
      expect(text).toContain('NOT_CHECKED');
      expect(text).not.toMatch(/\bPASS\b/);
      expect(called).toBe(false);
    } finally {
      global.fetch = prevFetch;
      if (prevOffline === undefined) delete process.env.OFFLINE;
      else process.env.OFFLINE = prevOffline;
      if (prevUrl === undefined) delete process.env.TRUSTSHELL_API_URL;
      else process.env.TRUSTSHELL_API_URL = prevUrl;
    }
  });

  it('OFFLINE=1 is NOT_CHECKED and is not PASS', () => {
    const prev = process.env.OFFLINE;
    process.env.OFFLINE = '1';
    try {
      const state = offlineState();
      expect(state).toBe('NOT_CHECKED');
      expect(state).not.toBe('PASS');
    } finally {
      if (prev === undefined) delete process.env.OFFLINE;
      else process.env.OFFLINE = prev;
    }
  });
});
