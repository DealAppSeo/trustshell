import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('CTO belt', () => {
  const belt = readFileSync(join(ROOT, 'skills/belts/CTO.md'), 'utf8');

  it('names status and proof --verify and does not print a secret', () => {
    const status = belt.indexOf('trustshell status');
    const proof = belt.indexOf('trustshell proof <agentIdOrSlug> --verify');
    expect(status).toBeGreaterThanOrEqual(0);
    expect(proof).toBeGreaterThan(status);
    expect(belt).toMatch(/Do not print a secret/);
    expect(belt).not.toMatch(/sb_secret_|DATABASE_URL|TRUSTSHELL_KEY|API_KEY\s*=/);
    expect(belt).not.toMatch(/staking is live|stake now/i);
    expect(belt).not.toMatch(/console\.log\(/);
  });
});
