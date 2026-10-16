/**
 * ux-quick-wins.test.ts — the LOW-weight fixes from the 2026-10-16 UX audit (E:\dev\reports\2026-10-16\
 * UX_AUDIT_2026-10-16.md, "Quick wins"), pinned so they cannot quietly go back.
 *
 * Mostly a source scan, like the other page tests here. The /check rail is RENDERED (jest compiles TSX,
 * see jest.config.js): its whole point is what is on the page before a check, and markup shows that.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// require, not import: this suite compiles against tsconfig.sdk.json, which does not type-check TSX.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { StrangerNext, StrangerRail } = require('../components/stranger-rail') as Record<string, FunctionComponent<Record<string, unknown>>>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CheckForm = (require('../app/check/CheckForm') as { default: FunctionComponent<Record<string, unknown>> }).default;

const ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r/g, '');
const flat = (rel: string) => read(rel).replace(/\s+/g, ' ');

/** WCAG 2 contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('UX-02 privacy policy link, /privacy, and a footer', () => {
  it('links the policy from the /check and compare privacy lines, the popup and the extension README', () => {
    expect(read('app/check/CheckForm.tsx')).toContain('<a href="/privacy.html"');
    expect(read('app/check/CompareForm.tsx')).toContain('<a href="/privacy.html"');
    expect(read('extension/popup.html')).toContain('<a href="https://trustshell.dev/privacy.html" target="_blank">Privacy policy</a>');
    expect(read('extension/README.md')).toContain('https://trustshell.dev/privacy.html');
  });

  it('sends /privacy to /privacy.html with a permanent redirect', () => {
    expect(read('app/privacy/page.tsx')).toContain("permanentRedirect('/privacy.html')");
  });

  it('puts a site footer with the policy, the source and the package on every page', () => {
    const layout = read('app/layout.tsx');
    expect(layout).toContain('<footer');
    for (const href of ['/privacy.html', 'https://github.com/DealAppSeo/trustshell', 'https://www.npmjs.com/package/@hyperdag/trustshell']) {
      expect(layout).toContain(`href="${href}"`);
    }
  });
});

describe('UX-08 contrast', () => {
  // Tailwind v4 amber-600 / amber-500 and the slate tokens, as rendered (the audit measured them in-page).
  const AMBER_600 = '#e17100';
  const AMBER_500 = '#fe9a00';
  const PANEL = '#0f172a';

  it('the amber buttons carry dark text: white on amber fails AA, black passes', () => {
    expect(contrast('#ffffff', AMBER_600)).toBeLessThan(4.5);
    expect(contrast('#000000', AMBER_600)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#000000', AMBER_500)).toBeGreaterThanOrEqual(4.5);
    for (const f of ['app/check/CheckForm.tsx', 'app/check/CompareForm.tsx', 'components/sticky-check.tsx', 'components/stranger-rail.tsx', 'components/home-agent.tsx']) {
      const classes = [...read(f).matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{[^}]*'([^']*bg-amber-600[^']*)')/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
      for (const c of classes.filter((x) => /(^|\s)bg-amber-600(\s|$)/.test(x))) expect(c).not.toMatch(/(^|\s)text-white(\s|$)/);
    }
    expect(read('components/hero.tsx')).not.toContain('hover:bg-amber-600 hover:text-white');
  });

  it('small meta text on the check surfaces is slate-400, not slate-500', () => {
    expect(contrast('#64748b', PANEL)).toBeLessThan(4.5);
    expect(contrast('#94a3b8', PANEL)).toBeGreaterThanOrEqual(4.5);
    for (const f of ['app/check/CheckForm.tsx', 'app/check/CompareForm.tsx', 'components/agent-two-fields.tsx', 'components/stranger-rail.tsx']) {
      expect(read(f)).not.toContain('#64748b');
    }
  });
});

describe('UX-46 /earn-trust says what runs today', () => {
  it('two families today; the golden-ratio supermajority is the design target', () => {
    const src = flat('app/earn-trust/page.tsx');
    expect(src).toContain('Today two model families, from different builders, must both agree for a pass');
    expect(src).toContain('A golden-ratio supermajority across more families is the design target, not what runs.');
    expect(src).not.toContain('must clear a golden-ratio supermajority, so no single provider');
  });
});

describe('UX-45 /how-verification evidence links', () => {
  const src = flat('app/how-verification/page.tsx');

  it('"see a receipt" opens a real receipt, not the fixture', () => {
    expect(src).toContain('href="/receipt/latest"');
    expect(src).toContain('See the newest real receipt');
    expect(src).not.toContain('href="/hal-receipt"');
    expect(src).not.toContain('The receipt page is a fixture');
  });

  it('the model card link says it may be example data', () => {
    expect(src).toContain('Read the model card (may be example data)');
  });
});

describe('UX-26 the passport sends "check it yourself" to the chain', () => {
  const src = read('app/passport/[agentId]/page.tsx');

  it('links ownerOf on BaseScan for the canonical IdentityRegistry, and labels the engine read as the engine\'s', () => {
    expect(src).toContain('https://sepolia.basescan.org/address/${IDENTITY_REGISTRY_BASE_SEPOLIA}#readProxyContract');
    expect(src).toContain('yourself on BaseScan');
    expect(src).toContain('the engine&apos;s own read');
    expect(src).not.toContain('Cross-verify ownerOf() on-chain now');
  });
});

describe('UX-11 extension/README.md is install instructions, not a word list', () => {
  const readme = read('extension/README.md');

  it('has the six numbered steps and says what is sent where before them', () => {
    for (let n = 1; n <= 6; n++) expect(readme).toMatch(new RegExp(`^${n}\\. `, 'm'));
    expect(readme.indexOf('## What is sent where')).toBeLessThan(readme.indexOf('## Install'));
    expect(readme).toContain('Load unpacked');
    expect(readme).not.toMatch(/^this folder$/m);
  });
});

describe('UX-16 /check: the box first, Next only after an answer', () => {
  it('prints the rail folded to one line, with no Next and no strip', () => {
    const html = renderToStaticMarkup(createElement(StrangerRail, { step: 'check', compact: true }));
    expect(html).toContain('Step 3 of 4');
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).not.toContain('data-testid="rail-next"');
    expect(html).not.toContain('aria-label="The four screens"');
  });

  it('the full rail on the other screens still opens with its Next', () => {
    const html = renderToStaticMarkup(createElement(StrangerRail, { step: 'name' }));
    expect(html).toMatch(/<details[^>]*\sopen/);
    expect(html).toContain('data-testid="rail-next"');
  });

  it('/check hands Next to the form, which shows it only once there is an answer', () => {
    const page = read('app/check/page.tsx');
    expect(page).toContain('<StrangerRail step="check" compact />');
    expect(page).toContain('afterResult={<StrangerNext step="check" />}');
    expect(read('app/check/CheckForm.tsx')).toContain('{result && afterResult}');
    const before = renderToStaticMarkup(createElement(CheckForm, { afterResult: createElement(StrangerNext, { step: 'check' }) }));
    expect(before).not.toContain('data-testid="rail-next"');
  });
});

describe('UX-03 / UX-07 / UX-04 / UX-33', () => {
  it('nav Check goes to /check', () => {
    expect(read('components/top-nav.tsx')).toContain("{ href: '/check', label: 'Check' }");
  });

  it('the docs spell HAL the canonical way', () => {
    for (const f of ['docs/getting-started.md', 'docs/api-reference.md']) {
      expect(read(f)).toContain('Hallucination Assessment Layer');
      expect(read(f)).not.toContain('Hallucination Auditor Layer');
    }
  });

  it('the docs index leads with the jobs and puts the example data under How we measure', () => {
    const docs = flat('app/docs/page.tsx');
    expect(docs).toContain('Install in 60 seconds');
    expect(docs).toContain('How we measure');
    expect(docs).toContain('Last measured week (example data)');
    expect(docs).not.toContain('Honesty A is FIXTURE. Help B is no ratings.');
    expect(docs).not.toContain('FIXTURE, not live');
    expect(docs.indexOf('API reference')).toBeLessThan(docs.indexOf('How we measure'));
  });

  it('/agents has a side gutter on a phone', () => {
    expect(read('app/agents/page.tsx')).toContain('<div className="max-w-5xl mx-auto space-y-8 px-4">');
  });
});
