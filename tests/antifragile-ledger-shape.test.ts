/**
 * Antifragile night, lane A (2026-10-24). Found by reading the guard code and confirmed by a shape fuzz of 15 readers
 * (165 runs; docs/measurements/antifragile/): a guard ledger line that is valid JSON but not a record -- `null` -- made
 * `readLedger` throw "Cannot destructure property 'hash' of 'r' as it is null". Every command that reads the ledger died
 * with a stack trace and exit 3: guard show, guard check, guard init --force (the recovery), run, and bundle. The
 * documented behaviour is that a ledger that does not verify reads BROKEN, no amount is allowed, and `guard show` says
 * so and says how to recover. Corpus fixture: af-review-ledger-null-line-crashes-guard.
 */
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { buildBundle } from '../src/lib/bundle';
import { GUARD_RECEIPTS_FILE, readLedger, readLedgerCheckpointed } from '../src/lib/guardrails';
import { signingKey } from '../src/lib/install-key';

describe('antifragile: a ledger line that is JSON but not a record reads BROKEN, never a crash', () => {
  it.each([['null'], ['5'], ['"x"'], ['true'], ['[]'], ['[null]']])('readLedger on a ledger whose only line is %s', (line) => {
    const l = readLedger(`${line}\n`);
    expect(l.verdict).toBe('BROKEN');
    expect(l.spent).toBeNull();
    expect(l.breaks.join(';')).toMatch(/line 1: not a record|line 1: hash does not match/);
  });

  it('a null line after good records still reads BROKEN, and the checkpoint path does not throw either', () => {
    const good = readLedger('');
    expect(good.verdict).toBe('EMPTY');
    expect(() => readLedgerCheckpointed('null\n', JSON.stringify({ bytes: 5, sha256: 'x' }))).not.toThrow();
    expect(readLedgerCheckpointed('null\n', null).verdict).toBe('BROKEN');
  });

  describe('through the CLI', () => {
    const prevEnv = { ...process.env };
    const prevCwd = process.cwd();
    let root = '';
    let out: string[] = [];
    let err: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: (s) => err.push(s) };
    const home = () => join(root, 'home');
    const text = () => `${out.join('\n')}\n${err.join('\n')}`;
    async function cli(...argv: string[]): Promise<number> {
      out = [];
      err = [];
      return run(parseArgs(argv), {} as never, io);
    }
    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'ts-antifragile-'));
      mkdirSync(join(root, 'work'), { recursive: true });
      process.chdir(join(root, 'work'));
      process.env.TRUSTSHELL_HOME = home();
      process.env.TRUSTSHELL_MEMORY = join(home(), 'memory.sqlite');
    });
    afterEach(() => {
      process.chdir(prevCwd);
      process.env = { ...prevEnv };
      rmSync(root, { recursive: true, force: true });
    });

    it('guard show says BROKEN (exit 1) and how to recover; guard check refuses an amount; guard init --force still works', async () => {
      expect(await cli('guard', 'init')).toBe(0);
      appendFileSync(join(home(), GUARD_RECEIPTS_FILE), 'null\n');

      expect(await cli('guard', 'show')).toBe(1);
      expect(text()).toMatch(/chain BROKEN/);
      expect(text()).toMatch(/move it aside/);
      expect(text()).not.toMatch(/TypeError|fatal/);

      // A BROKEN ledger allows no amount (the documented rule); it must say that, not throw.
      expect(await cli('guard', 'allow', 'spend')).toBe(0);
      expect(await cli('guard', 'limit', 'per-tx', '100')).toBe(0);
      expect(await cli('guard', 'check', '--tool', 'pay', '--class', 'spend', '--amount', '5')).toBe(5);
      expect(text()).toMatch(/ledger is BROKEN/);

      // The recovery path the owner is told about must not be the thing that crashes.
      expect(await cli('guard', 'init', '--force')).toBe(0);
      expect(text()).not.toMatch(/TypeError|fatal/);
    });

    it('bundle verify on the same home does not die on the ledger either', async () => {
      await cli('guard', 'init');
      appendFileSync(join(home(), GUARD_RECEIPTS_FILE), 'null\n');
      // A valid, signed bundle, so verify gets as far as the supersession check that reads the ledger.
      const k = signingKey(home());
      const b = join(root, 'work', 'b.json');
      writeFileSync(b, JSON.stringify(buildBundle({ profile: null, policy: null, memories: [], evidence: [] }, k.key, k.signer, '1.9.0-dev.0')));
      const code = await cli('bundle', 'verify', b);
      expect(text()).not.toMatch(/Cannot destructure|fatal|TypeError/);
      expect(code).toBe(0);
    });
  });
});
