import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('T12 belt', () => {
  const doc = readFileSync(join(ROOT, 'docs/T12_BELT.md'), 'utf8');
  const status = readFileSync(join(ROOT, 'src/cli/status.ts'), 'utf8');
  const origin = status.match(/DEFAULT_ENGINE = '([^']+)'/)?.[1];

  it('points at the engine heartbeat and the trustshell CLI only', () => {
    expect(origin).toBe('https://repid-engine-production.up.railway.app');
    expect(doc).toContain('T12 cannot live in this repo.');
    expect(doc).toContain(`GET /health`);
    expect(doc).toContain(origin as string);
    expect(doc.indexOf('trustshell status')).toBeGreaterThanOrEqual(0);
    expect(doc.indexOf('trustshell proof <agentIdOrSlug> --verify')).toBeGreaterThan(
      doc.indexOf('trustshell status'),
    );
    expect(doc).toMatch(/Do not print a secret/);
    expect(doc).toMatch(/Do not add a worker/);
    expect(doc).not.toMatch(/stake now|staking is live/i);
    expect(doc).not.toMatch(/HeyGen/i);
    expect(doc).not.toMatch(/sb_secret_|DATABASE_URL/);
  });
});
