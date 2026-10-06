/**
 * L3 STATUS, L4 templates, L5 SECURITY, L6 engine commit fail-closed, L10 release draft.
 * No "MVP launched". npm 1.3.0 until F-PUBLISH.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { engineCommitDisplay } from '../lib/engine-commit';

const ROOT = join(__dirname, '..');

describe('L3 honest STATUS', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const status = readFileSync(join(ROOT, 'docs/STATUS.md'), 'utf8');

  // 2026-10-06: npm latest is 1.6.0 (npm view), and GET /api/v1/hal/stats measured
  // quorum_health 3 answering / 5 configured. The docs now say that, dated. The site strip
  // (components/status-strip.tsx) was not part of that docs change and still pins 2 / 8 below.
  it('names npm 1.6.0, the measured 3 answering / 5 configured, Sepolia, shadow, no MVP launched', () => {
    const strip = readFileSync(join(ROOT, 'components/status-strip.tsx'), 'utf8');
    for (const text of [readme, status]) {
      expect(text).toMatch(/1\.6\.0/);
      expect(text).toMatch(/3 answering \/ 5 configured/);
      expect(text).toMatch(/MEASURED 2026-10-06/);
      expect(text).not.toMatch(/2 answering \/ 8 configured/);
      expect(text).toMatch(/Sepolia/i);
      expect(text).toMatch(/shadow/i);
      expect(text).not.toMatch(/MVP launched/i);
    }
    expect(strip).toMatch(/NPM_LATEST/);
    expect(strip).toMatch(/2 answering/);
    expect(strip).toMatch(/8 configured/);
    expect(strip).not.toMatch(/MVP launched/i);
  });
});

describe('L4 issue templates', () => {
  it('ships bug-stranger-install and break-the-gate', () => {
    expect(existsSync(join(ROOT, '.github/ISSUE_TEMPLATE/bug-stranger-install.yml'))).toBe(true);
    expect(existsSync(join(ROOT, '.github/ISSUE_TEMPLATE/break-the-gate.yml'))).toBe(true);
  });
});

describe('L5 SECURITY.md', () => {
  it('exists and names one contact, no extra product claims', () => {
    const sec = readFileSync(join(ROOT, 'SECURITY.md'), 'utf8');
    expect(sec).toMatch(/github\.com\/DealAppSeo\/trustshell/i);
    expect(sec).not.toMatch(/MVP launched/i);
  });
});

describe('L6 engine commit display is fail-closed', () => {
  it('shows a real deployed_commit', () => {
    const r = engineCommitDisplay({ deployed_commit: '987c8c17abcdef' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commit).toMatch(/^987c8c17/);
  });

  it('does not invent a hash when health is missing', () => {
    const r = engineCommitDisplay({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/missing|unavailable/i);
  });
});

describe('L10 release draft only', () => {
  it('exists and forbids gh release create', () => {
    const notes = readFileSync(join(ROOT, 'docs/handoff/RELEASE_1_4_0.md'), 'utf8');
    expect(notes).toMatch(/1\.4\.0/);
    expect(notes).toMatch(/do not `?gh release create/i);
    expect(notes).toMatch(/F-PUBLISH|Sean/);
  });
});
