/**
 * Claims the 2026-10-22 audit (E:\dev\reports\2026-10-22\CLAIMS_CODE_AUDIT.md) found false or overstated on
 * pages strangers reach, pinned so they cannot come back. Each assertion names the code that makes the old
 * sentence untrue.
 */
import { readdirSync, readFileSync } from 'node:fs';
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

describe('F7 and HAL-guarantee claims, on every surface that ships (a discovery rule, not a list)', () => {
  // The F7 block above reads four page files by name. The same claim survived on /how-verification
  // inside components/compatibility-info.tsx, which that page renders, and was live until 2026-11-13;
  // its wording also slipped past the narrow pattern. And `init --pai` wrote a "guarantees" heading
  // into every user's wiki from scripts/init-pai.mjs, which ships in the npm package. So: walk every
  // source a page or the package can show, and match the claim's shape, not one sentence.
  const SKIP = new Set(['node_modules', '.next', 'dist', 'tests', '__tests__']);
  const walk = (rel: string): string[] =>
    readdirSync(join(ROOT, rel), { withFileTypes: true }).flatMap((d) => {
      const child = join(rel, d.name);
      if (d.isDirectory()) return SKIP.has(d.name) ? [] : walk(child);
      return /\.(tsx?|mjs|md)$/.test(d.name) ? [child] : [];
    });
  const files = [...walk('app'), ...walk('components'), ...walk('lib'), join('scripts', 'init-pai.mjs'), 'README.md'];
  const FORBIDDEN: RegExp[] = [
    /grades? its own family/i,
    /independent model families/i,
    // 2026-11-14 (Chat's cross-check): JSX split the phrase across expressions, `independent model{' '}` then
    // `{state.families === 1 ? 'family' : 'families'}`, so the pattern above never saw it on the live card.
    /independent model\b[^<]{0,80}?famil/i,
    /no independent pair/i,
    // 2026-11-14: the free-votes rule (repid-engine src/classify/free-votes.ts) is two TRUE = pass, two FALSE = veto,
    // anything else not checked. A lone FALSE does not catch, and a family that answers wrongly CAN block a verdict.
    /lone FALSE flags/i,
    /no independent second/i,
    /cannot block the others from reaching one/i,
    /the shape of the guarantee/i,
    // Grok, #712 round 1: the same overclaim in other words. free-votes.ts:16 says "errors correlate across families".
    /uncorrelated model families/i,
    /decorrelated (validators|family|families)/i,
    /independence behind it/i,
    /<em>\s*independent<\/em>\s*families/i,
    /did not write the answer/i,
    /two guarantees/i,
    /HAL (vetoes|VETOs|blocks|stops|catches) (a|any|every) false claim/i,
  ];
  it('scans the files the old list missed', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain(join('components', 'compatibility-info.tsx'));
    expect(files).toContain(join('scripts', 'init-pai.mjs'));
  });
  it('no shipped surface makes the claim', () => {
    const hits = files.flatMap((rel) => FORBIDDEN.filter((re) => re.test(read(rel))).map((re) => `${rel}: ${re}`));
    expect(hits).toEqual([]);
  });
});

describe('the CLI reads local files (2026-11-14, Chat cross-check P3)', () => {
  it('the API reference does not say the CLI reads no config file', () => {
    // guard.ts reads ~/.trustshell/policy.json, and a denial exits 5 (src/cli/index.ts help text).
    expect(read('docs/api-reference.md')).not.toMatch(/The CLI reads no config file/i);
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
