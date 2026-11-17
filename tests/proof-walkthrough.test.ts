/**
 * The five-case proof walkthrough (demo/zk-walkthrough/run.mjs), run through the committed dist/ CLI.
 *
 * The walkthrough exits 1 if any case decides differently, any report fails `trust-report verify`, either tamper
 * control fails to go red, or a network attempt is logged. This pins the outcomes too, so that a change to
 * today's proof (or to the gate) is a visible decision, not a silent one. Above all: `replayed` is GRANTED, because
 * an old proof still verifies. When the private eligibility proof replaces this one, that line is expected to flip.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('the five-case proof walkthrough', () => {
  jest.setTimeout(600000);

  it('each case decides as expected, and its evidence re-checks offline', () => {
    const base = mkdtempSync(join(tmpdir(), 'proof-walkthrough-test-'));
    const out = join(base, 'out');
    try {
      const r = spawnSync(process.execPath, [join(ROOT, 'demo', 'zk-walkthrough', 'run.mjs'), '--out', out], { cwd: ROOT, encoding: 'utf8', timeout: 590000 });
      expect(r.stdout).toContain('RESULT  5 of 5 cases came out as expected');
      expect(r.status).toBe(0);
      const decided = (name: string) => JSON.parse(readFileSync(join(out, name, 'decision.json'), 'utf8'));
      expect(decided('pass').decision).toBe('GRANTED');
      expect(decided('below-the-bar').decision).toBe('DENIED');
      expect(decided('below-the-bar').cheats[0].verified).toBe(false);
      expect(decided('tampered').decision).toBe('DENIED');
      expect(decided('expired').decision).toBe('DENIED');
      expect(decided('replayed').decision).toBe('GRANTED');
      expect(decided('replayed').verifier.verified).toBe(true);
      expect(decided('pass').stayed_private).toMatch(/^nothing/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
