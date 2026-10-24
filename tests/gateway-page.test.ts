/**
 * /gateway: the candidate front door. RENDERED, like tests/home-check.test.ts, so these assert on what
 * a visitor reads, not on source text. The browser half (copy buttons, the join form's success and
 * failure paths) is driven by tests/e2e/gateway-walk.mjs.
 *
 * What must not regress:
 *   - every case on the page links its source and quotes it briefly (lib/ai-incidents.ts);
 *   - every piece of the plan says what runs today AND what does not yet; nothing is promoted to
 *     "today" by copy alone;
 *   - the join form never writes to `waitlist`, whose insert trigger mails a TrustTrader promotion;
 *   - the install commands are the home page's own, so the two pages cannot drift.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- a fresh module registry per render needs require(), as in home-check.test.ts */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { AI_INCIDENTS } from '../lib/ai-incidents';

const ROOT = join(__dirname, '..');

function render(modulePath: string): { html: string; calls: unknown[] } {
  const calls: unknown[] = [];
  const prev = global.fetch;
  global.fetch = ((...args: unknown[]) => {
    calls.push(args);
    return Promise.reject(new Error('no request may leave while the page renders'));
  }) as typeof fetch;
  try {
    let html = '';
    jest.isolateModules(() => {
      const { createElement } = require('react') as typeof import('react');
      const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
      const Page = (require(modulePath) as { default: () => ReactElement }).default;
      html = renderToStaticMarkup(createElement(Page));
    });
    return { html, calls };
  } finally {
    global.fetch = prev;
  }
}

function words(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');
}

describe('/gateway', () => {
  const { html, calls } = render('../app/gateway/page');
  const text = words(html);
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));

  it('sends nothing while rendering', () => {
    expect(calls).toHaveLength(0);
  });

  describe('the cases', () => {
    it('shows every case in lib/ai-incidents.ts, and says how many', () => {
      expect(html.match(/data-testid="incident"/g)).toHaveLength(AI_INCIDENTS.length);
      expect(AI_INCIDENTS).toHaveLength(7);
      expect(text).toContain('Seven documented cases');
    });

    it.each(AI_INCIDENTS.map((c) => [c.id, c]))('%s links an https source and quotes it briefly', (_id, c) => {
      expect(c.source.url).toMatch(/^https:\/\//);
      expect(hrefs).toContain(c.source.url);
      expect(c.quote.split(/\s+/).length).toBeLessThan(15);
      expect(text).toContain(c.quote);
      expect(c.source.published).toMatch(/\b20\d\d\b/);
      expect(c.when).toMatch(/\b20\d\d\b/);
    });

    it('keeps the traps found while checking the sources out of the copy', () => {
      const all = JSON.stringify(AI_INCIDENTS);
      expect(all).not.toMatch(/440,000|\$290,000/); // Deloitte's refund amount was not disclosed
      expect(all).not.toMatch(/separate legal entity/); // the tribunal's summary, not Air Canada's words
      expect(all).not.toMatch(/Ayinde/); // the court did not find AI was the cause in that half
      expect(all).toMatch(/apparent AI-generated errors/); // AP's word, kept
    });
  });

  describe('the plan', () => {
    const pieces = html.match(/<li[^>]*data-testid="piece"[\s\S]*?<\/li>/g) ?? [];

    it('pairs every piece with a Today line and a Not yet line', () => {
      expect(pieces.length).toBe(6);
      for (const p of pieces) {
        expect(words(p)).toMatch(/Today /);
        expect(words(p)).toMatch(/Not yet /);
      }
    });

    it('states the audited limits, not the aims, as today', () => {
      expect(text).toContain('Two checkers agreeing is a second opinion, not proof.');
      expect(text).toContain('it is not a property of this release');
      expect(text).toContain('it is not signed yet');
      expect(text).toContain('is built and not yet released');
      expect(text).toContain('it is paused for anyone without them');
      expect(text).toContain('Base Sepolia, a test network, not mainnet');
    });

    it('makes none of the claims nobody has measured', () => {
      expect(text).not.toMatch(/hallucination[- ]free|guarantee|mathematically|proven to|trustless|unbreakable|zero risk/i);
      expect(text).not.toMatch(/\bsix\b|\b6 (providers|checkers|AIs)/i);
    });

    it('names TrustMarket and TrustTrader as coming soon without linking either', () => {
      expect(text).toContain('Coming soon: TrustMarket.dev and TrustTrader.dev.');
      expect(hrefs.some((h) => /trust(market|trader)\.dev/i.test(h))).toBe(false);
    });

    it('links the two on-chain receipts to BaseScan on Base Sepolia', () => {
      const scans = hrefs.filter((h) => h.startsWith('https://sepolia.basescan.org/tx/0x'));
      expect(scans).toHaveLength(2);
      for (const s of scans) expect(s).toMatch(/\/tx\/0x[0-9a-f]{64}$/);
    });
  });

  describe('install', () => {
    const agent = readFileSync(join(ROOT, 'components/home-agent.tsx'), 'utf8');
    const pinned = agent.match(/export const INSTALL = '([^']+)'/)?.[1];

    it('offers the CLI, the npm package and the MCP server', () => {
      for (const id of ['install-cli', 'install-sdk', 'install-mcp']) expect(html).toContain(`data-testid="${id}"`);
      expect(text).toContain('npm install @hyperdag/trustshell');
      expect(text).toContain('"trustshell-mcp"');
      expect(text).toContain("import { TrustShell } from '@hyperdag/trustshell';");
    });

    it('uses the home page install command, so the two pages pin the same version', () => {
      expect(pinned).toMatch(/^npm i -g @hyperdag\/trustshell@\d+\.\d+\.\d+$/);
      expect(text).toContain(pinned!);
    });
  });

  describe('join', () => {
    const join_ = readFileSync(join(ROOT, 'components/gateway-join.tsx'), 'utf8');

    it('renders the form and the conversation links', () => {
      expect(html).toContain('data-testid="join-form"');
      expect(hrefs).toContain('https://github.com/DealAppSeo/trustshell/issues/new/choose');
    });

    it('writes to gateway_signups, never to waitlist', () => {
      expect(join_).toContain("export const SIGNUP_TABLE = 'gateway_signups'");
      expect(join_).toMatch(/\.from\(SIGNUP_TABLE\)/);
      expect(join_).not.toMatch(/from\(['"]waitlist['"]\)/);
    });

    it('treats a thrown error or an error result as a failure, never as saved', () => {
      expect(join_).toMatch(/setStatus\(error \? 'failed' : 'saved'\)/);
      expect(join_).toMatch(/catch \{[\s\S]*?setStatus\('failed'\)/);
    });
  });
});
