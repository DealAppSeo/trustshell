import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const CLOSE_LINE = "Your agent. Your keys. A receipt when it's right or wrong.";
const END_CARD_TEXT = 'THERE IS NO TRY';

/**
 * The end-card label may stand alone. A sentence that says the product
 * says, is, or returns that label is a product claim.
 */
export function spokenAsProductClaim(text: string): boolean {
  return /(?:product claim|TrustShell says|the product says|this product says|verdict is|returns)(?:\s+is)?\s+["']?THERE IS NO TRY|THERE IS NO TRY\s+is\s+(?:the|a|our)\s+(?:product|verdict|claim)/i.test(
    text,
  );
}

describe('landing close', () => {
  const close = readFileSync(join(ROOT, 'components/landing-close.tsx'), 'utf8');
  const page = readFileSync(join(ROOT, 'app/page.tsx'), 'utf8');
  const hero = readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8');
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');

  it('uses the close line and the end card, and does not say VETO in the headline', () => {
    expect(close).toContain(CLOSE_LINE);
    expect(close).toContain(`data-end-card`);
    expect(close).toContain(END_CARD_TEXT);
    expect(page).toContain('<LandingClose');
    const headline = close.slice(close.indexOf('<h2'), close.indexOf('</h2>'));
    expect(headline).toContain(CLOSE_LINE);
    expect(headline).not.toMatch(/VETO/);
    expect(hero).toMatch(/A portable trust harness so AI has to earn it\./);
    expect(hero).not.toMatch(/wallet/i);
  });

  it('fails if THERE IS NO TRY is spoken as a product claim', () => {
    expect(spokenAsProductClaim('The product claim is THERE IS NO TRY')).toBe(true);
    expect(spokenAsProductClaim('TrustShell says THERE IS NO TRY')).toBe(true);
    expect(spokenAsProductClaim('THERE IS NO TRY is the verdict')).toBe(true);
    expect(spokenAsProductClaim(END_CARD_TEXT)).toBe(false);
    for (const src of [close, page, hero, readme]) {
      expect(spokenAsProductClaim(src)).toBe(false);
    }
  });
});
