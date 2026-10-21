/**
 * Mission 1 test #6 hole-closer (b): a PR must not run with secrets in CI.
 *
 * A pull_request build runs code FROM THE PR. If that build can read a configured secret or exchange
 * an OIDC token, an attacker's PR exfiltrates credentials before a human ever reviews it. This guard
 * pins the three load-bearing invariants as a BUILD-ENFORCED property (it runs in `npm run verify` /
 * check.yml), so the safe-today state cannot silently regress:
 *
 *   1. No workflow uses `pull_request_target` — the trigger that runs fork code WITH repo secrets.
 *   2. No `pull_request`-triggered workflow references a configured secret (the automatic
 *      GITHUB_TOKEN is not a configured secret and is excepted).
 *   3. No `pull_request`-triggered workflow can exchange an OIDC token (`id-token: write`), which
 *      would let it mint short-lived cloud/registry credentials.
 *
 * No YAML dependency: the scan strips comments (so prose mentioning `pull_request_target` or
 * `secrets.X` does not trip it) and reads the trigger keys and token references directly. The scan is
 * conservative — it fails toward refusing, not toward allowing.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const WF_DIR = join(process.cwd(), '.github', 'workflows');

/** Drop full-line and trailing ` #...` comments so prose cannot trip the scan. */
function stripComments(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      if (/^\s*#/.test(line)) return '';
      const i = line.indexOf(' #');
      return i >= 0 ? line.slice(0, i) : line;
    })
    .join('\n');
}

interface Workflow { name: string; body: string }

function workflows(): Workflow[] {
  return readdirSync(WF_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((name) => ({ name, body: stripComments(readFileSync(join(WF_DIR, name), 'utf8')) }));
}

/** Does this workflow declare the given trigger? Handles both the block and inline-list forms of `on:`. */
function triggersOn(body: string, event: 'pull_request' | 'pull_request_target'): boolean {
  // Block form: a `  <event>:` key. `pull_request:` does not match `pull_request_target:` because the
  // char after `pull_request` is `_`, not `:`.
  const block = new RegExp(`(^|\\n)\\s*${event}:`, 'm');
  if (block.test(body)) return true;
  // Inline list form: `on: [push, pull_request]`. The negative lookahead keeps `pull_request` from
  // matching inside `pull_request_target`.
  const inline = /\bon:\s*\[([^\]]*)\]/m.exec(body);
  return inline ? new RegExp(`\\b${event}\\b(?!_)`).test(inline[1]!) : false;
}

const configuredSecrets = (body: string): string[] =>
  [...body.matchAll(/secrets\.([A-Za-z_][A-Za-z0-9_]*)/g)]
    .map((m) => m[1]!)
    .filter((n) => n !== 'GITHUB_TOKEN');

describe('Mission 1 #6 — a PR must not run with secrets in CI', () => {
  const wfs = workflows();

  it('finds the workflows to guard', () => {
    expect(wfs.length).toBeGreaterThan(0);
  });

  it('(1) no workflow uses the pull_request_target trigger', () => {
    const offenders = wfs.filter((w) => triggersOn(w.body, 'pull_request_target')).map((w) => w.name);
    expect(offenders).toEqual([]);
  });

  it('(2) no pull_request-triggered workflow references a configured secret (GITHUB_TOKEN excepted)', () => {
    const offenders = wfs
      .filter((w) => triggersOn(w.body, 'pull_request'))
      .map((w) => ({ name: w.name, secrets: [...new Set(configuredSecrets(w.body))] }))
      .filter((w) => w.secrets.length > 0);
    expect(offenders).toEqual([]);
  });

  it('(3) no pull_request-triggered workflow can exchange an OIDC token (id-token: write)', () => {
    const offenders = wfs
      .filter((w) => triggersOn(w.body, 'pull_request') && /id-token:\s*write/.test(w.body))
      .map((w) => w.name);
    expect(offenders).toEqual([]);
  });

  // (4) A PR can change package-lock.json, and `npm ci` runs every dependency's install scripts.
  // With no secrets that code still gets the job's token and network, so PR installs skip them
  // (repid-engine #1458 applied the same rule). Nothing these jobs run needs an install script.
  it('(4) every npm install in a pull_request-triggered workflow passes --ignore-scripts', () => {
    const offenders = wfs
      .filter((w) => triggersOn(w.body, 'pull_request'))
      .flatMap((w) => [...w.body.matchAll(/\bnpm (?:ci|install|i)\b[^\n]*/g)]
        .map((m) => m[0])
        .filter((cmd) => !/--ignore-scripts\b/.test(cmd))
        .map((cmd) => `${w.name}: ${cmd.trim()}`));
    expect(offenders).toEqual([]);
  });

  it('(5) no checkout in a pull_request-triggered workflow leaves the token in .git/config', () => {
    const offenders = wfs
      .filter((w) => triggersOn(w.body, 'pull_request'))
      .flatMap((w) => w.body.split(/\n(?=\s*- )/)
        .filter((step) => /uses:\s*actions\/checkout@/.test(step) && !/persist-credentials:\s*false/.test(step))
        .map(() => w.name));
    expect(offenders).toEqual([]);
  });

  it('the PR gate (check.yml) exists, triggers on pull_request, and pins a read-only token', () => {
    const check = wfs.find((w) => w.name === 'check.yml');
    expect(check).toBeDefined();
    expect(triggersOn(check!.body, 'pull_request')).toBe(true);
    expect(/permissions:\s*(?:\n|.)*?contents:\s*read/.test(check!.body)).toBe(true);
    expect(configuredSecrets(check!.body)).toEqual([]);
  });

  // Non-vacuity: the secret scan would actually catch a secret if one were added to a PR workflow.
  it('(non-vacuity) the scan detects a planted secret in a pull_request workflow', () => {
    const planted = 'on:\n  pull_request:\njobs:\n  x:\n    steps:\n      - run: echo ${{ secrets.NPM_TOKEN }}\n';
    expect(triggersOn(planted, 'pull_request')).toBe(true);
    expect(configuredSecrets(planted)).toEqual(['NPM_TOKEN']);
  });
});
