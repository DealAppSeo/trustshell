/**
 * six-claim-receipt.test.ts — the receipt renders SIX separate claims, a top-level
 * "what this does not establish" line, and NEVER one rollup badge; NOT_CHECKED and
 * NOT_APPLICABLE never render as a pass (glossary §v0.2.7, S5).
 *
 * RENDERED, NOT GREPPED. This renders the real component with the worked EXAMPLE envelope and
 * asserts on the markup, the way tests/home-check.test.ts renders the home page.
 */
import type { ReactElement } from 'react';
import {
  EXAMPLE_SIX_CLAIM_STATEMENT,
  SIX_CLAIM_KEYS,
  SIX_CLAIMS_PREDICATE_TYPE,
  CLAIM_TITLE,
  type InTotoStatement,
} from '../lib/six-claims';

function render(statement: InTotoStatement): string {
  let html = '';
  jest.isolateModules(() => {
    const { createElement } = require('react') as typeof import('react');
    const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
    const { SixClaimReceipt } = require('../components/six-claim-receipt') as {
      SixClaimReceipt: (p: { statement: InTotoStatement }) => ReactElement;
    };
    html = renderToStaticMarkup(createElement(SixClaimReceipt, { statement }));
  });
  return html;
}

function words(html: string): string {
  return html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // &amp; is decoded LAST, after every other entity. Decoding it first would
    // double-unescape — e.g. the literal text `&amp;lt;` would collapse to `<`
    // instead of staying `&lt;` (CodeQL js/double-escaping). The ampersand is the
    // escape of the escape char, so it unescapes last.
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

const html = render(EXAMPLE_SIX_CLAIM_STATEMENT);
const text = words(html);

describe('the example envelope exercises all four statuses', () => {
  it('names every claim key and a non-empty does-not-establish list', () => {
    const claims = EXAMPLE_SIX_CLAIM_STATEMENT.predicate.claims;
    for (const k of SIX_CLAIM_KEYS) expect(claims[k]).toBeDefined();
    expect(EXAMPLE_SIX_CLAIM_STATEMENT.predicateType).toBe(SIX_CLAIMS_PREDICATE_TYPE);
    expect(EXAMPLE_SIX_CLAIM_STATEMENT.predicate.what_this_does_not_establish.length).toBeGreaterThan(0);
    const statuses = SIX_CLAIM_KEYS.map((k) => claims[k].status).sort();
    // A deliberate mix: 2 VERIFIED, 2 NOT_CHECKED, 1 FAILED, 1 NOT_APPLICABLE.
    expect(statuses).toEqual(['FAILED', 'NOT_APPLICABLE', 'NOT_CHECKED', 'NOT_CHECKED', 'VERIFIED', 'VERIFIED']);
  });
});

describe('six claims, separately, in order — never one badge', () => {
  it('renders the receipt and all six claim blocks in canonical order', () => {
    expect(html).toContain('data-testid="six-claim-receipt"');
    const positions = SIX_CLAIM_KEYS.map((k) => html.indexOf(`data-testid="claim-${k}"`));
    for (const p of positions) expect(p).toBeGreaterThan(-1);
    // strictly increasing ⇒ rendered in SIX_CLAIM_KEYS order
    for (let i = 1; i < positions.length; i++) expect(positions[i]!).toBeGreaterThan(positions[i - 1]!);
    for (const k of SIX_CLAIM_KEYS) expect(text).toContain(CLAIM_TITLE[k]);
  });

  it('says plainly there is no single verdict', () => {
    expect(html).toContain('data-testid="no-single-verdict"');
    expect(text).toContain('There is no single verdict.');
  });

  it('renders exactly one status pill per claim — six in all, none fused into a rollup', () => {
    expect((html.match(/data-status="/g) ?? [])).toHaveLength(6);
    for (const k of SIX_CLAIM_KEYS) expect(html).toContain(`data-testid="claim-status-${k}"`);
  });
});

describe('every status renders as itself — NOT_CHECKED and NOT_APPLICABLE never read as a pass', () => {
  const statusOf = (html.match(/data-status="(\w+)"/g) ?? []).map((m) => m.replace(/data-status="|"/g, ''));

  it('shows two VERIFIED (as Measured), two NOT_CHECKED, one FAILED, one NOT_APPLICABLE', () => {
    const count = (s: string) => statusOf.filter((x) => x === s).length;
    expect(count('VERIFIED')).toBe(2);
    expect(count('NOT_CHECKED')).toBe(2);
    expect(count('FAILED')).toBe(1);
    expect(count('NOT_APPLICABLE')).toBe(1);
  });

  it('the NOT_CHECKED claim renders the neutral "Not checked" label, not a pass', () => {
    const block = html.slice(html.indexOf('data-testid="claim-authenticity"'), html.indexOf('data-testid="claim-observation"'));
    expect(words(block)).toContain('Not checked');
    expect(block).not.toContain('>Measured<');
    expect(words(block)).not.toContain('Measured');
  });

  it('the NOT_APPLICABLE claim renders "Not applicable", never a pass', () => {
    const block = html.slice(html.indexOf('data-testid="claim-observation"'), html.indexOf('data-testid="claim-correctness"'));
    expect(words(block)).toContain('Not applicable');
    expect(words(block)).not.toContain('Measured');
    expect(words(block)).not.toContain('Failed');
  });

  it('the FAILED claim renders "Failed", distinct from an absence', () => {
    const block = html.slice(html.indexOf('data-testid="claim-correctness"'), html.indexOf('data-testid="claim-authorization"'));
    expect(words(block)).toContain('Failed');
    expect(words(block)).not.toContain('Not checked');
  });

  it('"Measured" appears exactly twice — once per VERIFIED claim, never as a single rollup', () => {
    expect((text.match(/\bMeasured\b/g) ?? [])).toHaveLength(2);
  });
});

describe('the top-level "what this does not establish" line is present', () => {
  it('renders the block and each of its lines', () => {
    expect(html).toContain('data-testid="does-not-establish"');
    expect(text).toContain('What this does not establish');
    for (const line of EXAMPLE_SIX_CLAIM_STATEMENT.predicate.what_this_does_not_establish) {
      expect(text).toContain(line);
    }
  });

  it('surfaces each claim\'s own gaps too (does not establish, per claim)', () => {
    // The VERIFIED integrity claim still states what it does NOT establish (it is unsigned).
    const block = html.slice(html.indexOf('data-testid="claim-integrity"'), html.indexOf('data-testid="claim-authenticity"'));
    expect(block).toContain('data-testid="claim-gaps-integrity"');
    expect(words(block)).toContain('Does not establish:');
  });
});
