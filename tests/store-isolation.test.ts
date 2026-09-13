/**
 * Second-store isolation: a second PAI created under TRUSTSHELL_HOME=.trustshell/pai-b must NOT
 * overwrite the first PAI's credentials at .trustshell/pai-a.
 *
 * init-pai.mjs resolves its store as `DIR = process.env.TRUSTSHELL_HOME || '.trustshell'` and writes
 * credentials.json / profile.json / wiki under DIR via interview.writePrivate. This test exercises
 * that exact mechanism (DIR resolution + writePrivate) against a temp dir — deterministic, no network,
 * no live register (which would create real agents). It proves the isolation guarantee, not the HTTP leg.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// init-pai.mjs uses `require('../lib/interview.js')` — same writer, same repo (CJS module).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const interview: { writePrivate(file: string, text: string): void } = require('../lib/interview.js');

// The store-resolution line from scripts/init-pai.mjs, verbatim.
const resolveDir = (home: string | undefined) => home || '.trustshell';
const creds = (agentId: string, apiKey: string) =>
  JSON.stringify({ agentId, apiKey, erc8004TokenId: null, createdAt: 'T' }, null, 2) + '\n';

describe('second-store isolation — TRUSTSHELL_HOME keeps PAI-b from overwriting PAI-a', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'pai-store-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('writing PAI-b under its own TRUSTSHELL_HOME leaves PAI-a credentials untouched', () => {
    const prev = process.env.TRUSTSHELL_HOME;
    try {
      // PAI-a: TRUSTSHELL_HOME=<root>/pai-a → its own store.
      process.env.TRUSTSHELL_HOME = join(root, 'pai-a');
      const dirA = resolveDir(process.env.TRUSTSHELL_HOME);
      interview.writePrivate(join(dirA, 'credentials.json'), creds('agent-a', 'ts_live_AAAA'));
      const aBefore = readFileSync(join(dirA, 'credentials.json'), 'utf8');

      // PAI-b: a DIFFERENT TRUSTSHELL_HOME=<root>/pai-b → a distinct store.
      process.env.TRUSTSHELL_HOME = join(root, 'pai-b');
      const dirB = resolveDir(process.env.TRUSTSHELL_HOME);
      interview.writePrivate(join(dirB, 'credentials.json'), creds('agent-b', 'ts_live_BBBB'));

      // PAI-a's credentials must be byte-identical afterwards — never overwritten by PAI-b.
      expect(readFileSync(join(dirA, 'credentials.json'), 'utf8')).toBe(aBefore);
      expect(JSON.parse(readFileSync(join(dirA, 'credentials.json'), 'utf8')).agentId).toBe('agent-a');
      expect(JSON.parse(readFileSync(join(dirB, 'credentials.json'), 'utf8')).agentId).toBe('agent-b');
      expect(dirA).not.toBe(dirB);
    } finally {
      if (prev === undefined) delete process.env.TRUSTSHELL_HOME; else process.env.TRUSTSHELL_HOME = prev;
    }
  });

  it('the default store (no TRUSTSHELL_HOME) is a different path than a named second store', () => {
    expect(resolveDir(undefined)).toBe('.trustshell');
    expect(resolveDir(join(root, 'pai-b'))).not.toBe('.trustshell');
  });
});
