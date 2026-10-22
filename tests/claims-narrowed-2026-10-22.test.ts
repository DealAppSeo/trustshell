/**
 * Claims the 2026-10-22 audit (E:\dev\reports\2026-10-22\CLAIMS_CODE_AUDIT.md) found false or overstated on
 * pages strangers reach, pinned so they cannot come back. Each assertion names the code that makes the old
 * sentence untrue.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\s+/g, ' ');

describe('provider keys: say when they leave the browser (F1)', () => {
  // app/run/[agentId]/page.tsx sends every unlocked key as user_paid_keys on Auto and Paid only;
  // app/connect/page.tsx's Test sends that one key.
  const surfaces = ['app/connect/page.tsx', 'app/connect/layout.tsx', 'lib/glossary.ts', 'app/mission/page.tsx'];
  it.each(surfaces)('%s does not say keys never reach a server', (rel) => {
    const text = read(rel);
    expect(text).not.toMatch(/never sent to a server/i);
    expect(text).not.toMatch(/we never receive (your|them|the)/i);
    expect(text).not.toMatch(/never on our servers/i);
    expect(text).not.toMatch(/vault we never receive/i);
  });
  it('the connect page names the three cases', () => {
    const text = read('app/connect/page.tsx');
    expect(text).toContain('Test');
    expect(text).toContain('Auto');
    expect(text).toContain('Paid only');
    expect(text).toContain('Free only');
  });
  it('the run page really does send unlocked keys on Auto, so the narrowed wording stays necessary', () => {
    const run = read('app/run/[agentId]/page.tsx');
    expect(run).toMatch(/tierPref === 'tier1_only' \|\| tierPref === 'auto'/);
    expect(run).toContain('user_paid_keys');
  });
});

describe('model families: different, not independent (F7)', () => {
  it('no page says a model never grades its own family or that checkers did not write the answer', () => {
    for (const rel of ['app/mission/page.tsx', 'app/why/blame/page.tsx', 'app/how-verification/page.tsx', 'app/trust-medical/page.tsx']) {
      const text = read(rel);
      expect(text).not.toMatch(/never let a model grade its own family/i);
      expect(text).not.toMatch(/did not write the answer/i);
      expect(text).not.toMatch(/independent model families/i);
    }
  });
  it('mission makes no unmeasured production-integrity claim', () => {
    expect(read('app/mission/page.tsx')).not.toMatch(/integrity holds under adversarial pressure/i);
  });
});

describe('metadata strangers see before the page (F11)', () => {
  it('the site keywords name no framework we have no recipe for, and no "payment gating"', () => {
    const layout = read('app/layout.tsx');
    expect(layout).not.toContain('LlamaIndex');
    expect(layout).not.toMatch(/payment gating/i);
  });
});

describe('/inspect (docs/challenge.md): the commands and the numbers are true (F20, F21)', () => {
  const doc = read('docs/challenge.md');
  it('gives a PowerShell install line without &&, which Windows PowerShell 5.1 rejects', () => {
    expect(doc).toContain('mkdir ts-challenge; cd ts-challenge; npm init -y');
  });
  it('says a check makes two GitHub requests and that the digest differs per run', () => {
    expect(doc).not.toMatch(/about five per check/);
    expect(doc).toMatch(/a check makes two/);
    expect(doc).toMatch(/same verdicts/);
  });
});
