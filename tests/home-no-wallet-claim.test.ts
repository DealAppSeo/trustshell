/**
 * The first page does not ask a stranger for a wallet.
 *
 * Sean, 2026-10-24: "take out the copy on the first page that says claim it with your wallet, that will turn
 * a lot of people off." The section "Want an agent you can trust?" (components/home-your-agent.tsx) said "Claim it
 * with your wallet, set how much it may spend", then a testnet note about claiming, funding and spending. A wallet
 * is a step a visitor meets later, on /bind, once they have an agent worth claiming; it is not what the first page
 * sells. The door (three questions, then /pai) stays.
 *
 * RENDERED, like tests/home-check.test.ts: the real app/page.tsx with fetch stubbed, and the words a reader sees.
 * The two lines that SAY "no wallet" (the check is free, no signup, no wallet) are the positive control: the
 * assertion can tell a mention of the word from an ask, so it is not vacuous.
 */
import type { ReactElement } from 'react';

function renderHome(): string {
  const prev = global.fetch;
  global.fetch = (() => Promise.reject(new Error('no request may leave while the page renders'))) as typeof fetch;
  try {
    let html = '';
    jest.isolateModules(() => {
      const { createElement } = require('react') as typeof import('react');
      const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
      const Page = (require('../app/page') as { default: () => ReactElement }).default;
      html = renderToStaticMarkup(createElement(Page));
    });
    return html;
  } finally {
    global.fetch = prev;
  }
}

const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

describe('the home page does not ask for a wallet', () => {
  const text = words(renderHome());

  it('does not say to claim the agent with a wallet, or to set how much it may spend', () => {
    expect(text).not.toMatch(/claim it with your wallet/i);
    expect(text).not.toMatch(/with your wallet/i);
    expect(text).not.toMatch(/how much it may spend/i);
    expect(text).not.toMatch(/claiming, funding and spending/i);
  });

  it('control: the render is the real home page, so the absence above is a reading', () => {
    expect(text).toContain('Check what your AI agent did, not what it says it did.');
  });
});
