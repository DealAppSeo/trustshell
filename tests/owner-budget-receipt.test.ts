/**
 * The owner-budget run on /market: a recorded testnet run, readable by a stranger.
 *
 * The fixture must add up (deposit = spent + returned, refusals counted), every transaction must be a
 * real-shaped hash linked to BaseScan, the plain sentence must come before any hash, no wallet address
 * is printed, and the page says it is one recorded run, not a live feed. The render sends nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import RUN from '../lib/recordings/owner-budget-2026-11-16.json';

const ROOT = join(__dirname, '..');
const micro = (s: string) => Math.round(Number(s) * 1e6);

function render(): { html: string; calls: unknown[] } {
  const calls: unknown[] = [];
  const prev = global.fetch;
  global.fetch = ((...args: unknown[]) => {
    calls.push(args);
    return Promise.reject(new Error('no request may leave while the receipt renders'));
  }) as typeof fetch;
  try {
    let html = '';
    jest.isolateModules(() => {
      const { createElement } = require('react') as typeof import('react');
      const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
      const { OwnerBudgetReceipt } = require(join(ROOT, 'components', 'owner-budget-receipt.tsx')) as { OwnerBudgetReceipt: () => ReactElement };
      html = renderToStaticMarkup(createElement(OwnerBudgetReceipt));
    });
    return { html, calls };
  } finally {
    global.fetch = prev;
  }
}

describe('the recorded run adds up', () => {
  const sum = (dir: string) => RUN.moved.filter((m) => m.direction === dir).reduce((a, m) => a + micro(m.amount), 0);

  it('is testnet, and says where it comes from and when', () => {
    expect(RUN.chain).toMatchObject({ name: 'Base Sepolia', id: 84532 });
    expect(RUN.source).toMatch(/2026-11-16/);
    expect(RUN.run.from < RUN.run.to).toBe(true);
  });

  it('moves money only as deposit = spent + returned', () => {
    expect(sum('owner to budget')).toBe(micro(RUN.budget));
    expect(sum('budget to payee') + sum('budget to owner')).toBe(micro(RUN.budget));
    expect(micro(RUN.net.payee_received)).toBe(sum('budget to payee'));
    expect(micro(RUN.net.owner_paid)).toBe(sum('owner to budget') - sum('budget to owner'));
  });

  it('counts ten refusals, each with the engine answer', () => {
    expect(RUN.refused.reduce((a, r) => a + r.times, 0)).toBe(10);
    for (const r of RUN.refused) expect(r.answer).toMatch(/^[a-z_ ]+$/);
  });

  it('names real-shaped transactions', () => {
    for (const m of RUN.moved) expect(m.tx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(new Set(RUN.moved.map((m) => m.tx)).size).toBe(RUN.moved.length);
  });
});

describe('the receipt a stranger reads', () => {
  const { html, calls } = render();
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  it('says it plainly before any hash', () => {
    const lead = text.indexOf('an owner put 1.0 test USDC into one budget shared by 2 agents. The agents spent 0.9 between them, and the owner took back the 0.1 left. 10 other attempts were refused, and none of them moved any money.');
    expect(lead).toBeGreaterThan(-1);
    expect(lead).toBeLessThan(text.search(/0x[0-9a-f]{8}/));
  });

  it('links every transaction to BaseScan', () => {
    for (const m of RUN.moved) expect(html).toContain(`href="https://sepolia.basescan.org/tx/${m.tx}"`);
  });

  it('labels itself testnet and a recording, not a live feed', () => {
    expect(html).toContain('data-status="testnet"');
    expect(text).toContain('One recorded run, not a live feed');
    expect(text).toContain('Test network only');
  });

  it('prints no wallet address and none of the forbidden claims', () => {
    expect(text).not.toMatch(/\b0x[0-9a-fA-F]{40}\b/);
    for (const re of [/fully autonomous/i, /zero[- ]knowledge/i, /mainnet/i, /\balways\b/i, /guarantee/i]) expect(text).not.toMatch(re);
  });

  it('sends nothing while it renders', () => {
    expect(calls).toEqual([]);
  });

  it('is on /market', () => {
    expect(readFileSync(join(ROOT, 'app', 'market', 'page.tsx'), 'utf8')).toContain('<OwnerBudgetReceipt />');
  });
});
