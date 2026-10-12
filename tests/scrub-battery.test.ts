/**
 * XC1's independent CLI secret battery (scripts/e2e/), run as a gate. It spawns the committed CLI
 * (dist/cli/index.js) once per shape against a LOCAL capture server and reads the bytes the CLI would
 * send, so it proves the outbound body of the real process, not just the function. Every shape must be
 * scrubbed (`--mode fixed`); a shape that leaks fails this test and names itself.
 *
 * The battery runs the CLI ASYNCHRONOUSLY on purpose: with spawnSync the in-process capture server is
 * starved, the body reads back null, and "nothing sent" passes vacuously (see the note in the script).
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('the CLI secret battery (scripts/e2e/cli-secret-battery.mjs)', () => {
  jest.setTimeout(180000);

  it('holds every shape in fixed mode against the committed build', async () => {
    const { code, out } = await new Promise<{ code: number | null; out: string }>((resolve) => {
      const c = spawn(process.execPath, [join(ROOT, 'scripts/e2e/cli-secret-battery.mjs'), '--mode', 'fixed'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      let buf = '';
      c.stdout.on('data', (d) => (buf += d));
      c.stderr.on('data', (d) => (buf += d));
      c.on('close', (status) => resolve({ code: status, out: buf }));
    });
    const summary = out.split('\n').filter((l) => /^(FAIL|\d+ checks|FAILED|OK)/.test(l)).join('\n');
    expect({ code, summary }).toEqual({ code: 0, summary: expect.stringContaining('OK (fixed)') });
    expect(out).toMatch(/\| BREACHED 0 \|/);
    expect(out).toMatch(/NOT_CAPTURED|SCRUBBED/); // it saw requests
    expect(out).not.toMatch(/NOT_CAPTURED/);
  });
});
