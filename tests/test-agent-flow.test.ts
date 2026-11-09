import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATH_TWO_COMMANDS, inspectCommand, isRunUrl, isShellSafe, parseTrustReport } from '../lib/trust-report-view';

const ROOT = join(__dirname, '..');

describe('the guided page reads a Trust Report', () => {
  const example = readFileSync(join(ROOT, 'public', 'examples', 'trust-report-example.json'), 'utf8');

  it('shows the shipped example, a real report with a contradiction and both paths', () => {
    const parsed = parseTrustReport(example);
    if (!parsed.ok) throw new Error(parsed.why);
    expect(parsed.report.bound_claims.some((b) => b.status === 'CONTRADICTED')).toBe(true);
    expect(parsed.report.inspect.length).toBeGreaterThan(0);
    expect(parsed.report.guard.commands.length).toBeGreaterThan(0);
  });

  it('holds no local path of the machine that made it', () => {
    expect(example).not.toMatch(/[A-Za-z]:\\\\|\/Users\/|\/home\//);
  });

  it.each([
    ['not JSON', '{nope', 'not JSON'],
    ['another JSON file', '{"a":1}', 'not a Trust Report'],
    ['a report with parts missing', '{"schema":"dev.trustshell.trust-report/0.1-draft","title":"t"}', 'incomplete'],
  ])('refuses %s with a reason', (_name, text, why) => {
    const parsed = parseTrustReport(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.why).toContain(why);
  });

  it('reads a report saved with a byte-order mark', () => {
    expect(parseTrustReport(`﻿${example}`).ok).toBe(true);
  });
});

describe('the commands the page builds', () => {
  it('takes only GitHub Actions run URLs', () => {
    expect(isRunUrl('https://github.com/o/r/actions/runs/123')).toBe(true);
    expect(isRunUrl('https://github.com/o/r/actions/runs/123/attempts/2')).toBe(true);
    for (const bad of ['http://github.com/o/r/actions/runs/1', 'https://evil.test/o/r/actions/runs/1', 'https://github.com/o/r/actions/runs/1; rm -rf /', 'https://github.com/o/r/pull/1']) {
      expect(isRunUrl(bad)).toBe(false);
    }
  });

  it('never puts text in a command that a shell would reinterpret', () => {
    for (const bad of ['a"b', 'a`b', '$(x)', 'a\\b', 'a\nb', '', 'passed!!', 'a!b', 'a“b', 'a”b', 'a„b']) expect(isShellSafe(bad)).toBe(false);
    expect(isShellSafe('The check workflow succeeded, run 123.')).toBe(true);
    expect(inspectCommand('https://github.com/o/r/actions/runs/1', 'ok')).toBe('npx @hyperdag/trustshell@latest check https://github.com/o/r/actions/runs/1 --claims "ok" --out evidence');
  });

  it('lists the commands the example guide documents', () => {
    const guide = readFileSync(join(ROOT, 'examples', 'own-agent', 'README.md'), 'utf8');
    for (const c of PATH_TWO_COMMANDS.slice(0, 3)) expect(guide).toContain(c);
  });
});
