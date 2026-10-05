/**
 * Install notes for the three apps. Each file records a version that was measured
 * and the config that was actually written or, when the app was not loaded, says so.
 */
export {};

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function doc(name: string): string {
  return readFileSync(join(ROOT, 'docs/install', name), 'utf8');
}

describe('install docs', () => {
  const claude = doc('claude-code.md');
  const cursor = doc('cursor.md');
  const desktop = doc('claude-desktop.md');

  it('Claude Code records the version, the package, and the config it wrote', () => {
    expect(claude).toContain('2.1.157');
    expect(claude).toContain('npm i -g @hyperdag/trustshell@1.5.0');
    expect(claude).toContain('"command": "trustshell-mcp"');
    expect(claude).toContain('Pending approval');
    expect(claude).toContain('trustshell 1.5.0');
  });

  it('Cursor records the installed version and that the server was not loaded', () => {
    expect(cursor).toContain('3.23.12');
    expect(cursor).toContain('npm i -g @hyperdag/trustshell@1.5.0');
    expect(cursor).toContain('"command": "trustshell-mcp"');
    expect(cursor).toMatch(/not loaded/i);
  });

  it('Claude Desktop records the installed version and that the live file was not changed', () => {
    expect(desktop).toContain('2.19675.0.0');
    expect(desktop).toContain('npm i -g @hyperdag/trustshell@1.5.0');
    expect(desktop).toContain('"command": "trustshell-mcp"');
    expect(desktop).toMatch(/not changed/i);
    expect(desktop).toMatch(/not loaded/i);
  });

  it('does not invent a private product or a receipt', () => {
    const all = [claude, cursor, desktop].join('\n');
    expect(all).not.toMatch(/filtered before it reaches you/i);
    expect(all).not.toMatch(/private by default/i);
    expect(all).not.toMatch(/\bLaya\b/);
    expect(all).not.toMatch(/\bJev\b/);
    expect(all).not.toMatch(/receipt/i);
    expect(all).not.toContain('npx @hyperdag/trustshell@1.4.0');
    expect(all).not.toMatch(/\d+\s*%/);
  });
});
