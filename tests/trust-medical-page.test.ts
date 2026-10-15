/**
 * /trust-medical is a vision story for a vertical that does not exist (Sean, 2026-10-14: "story page
 * only"). This pins what makes it safe to publish:
 *   - it says "Vision — not built yet" in its title, its first line and its badge;
 *   - it has no form or input of any kind, so no health information can be typed into it;
 *   - it makes no compliance, clinical, diagnosis, treatment or advice claim; names no customer,
 *     partner, pilot, timeline or event; and does not call TrustMedical secure or private;
 *   - it carries the plain disclaimer.
 * Only the rendered copy is scanned: comments are removed first, so the page's own guardrail notes
 * do not trip the ban.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, '..', 'app', 'trust-medical', 'page.tsx'), 'utf8');
const LABEL = 'Vision — not built yet';
const DISCLAIMER =
  'Not a medical product. It does not exist yet. Nothing here is medical advice. This page has no form and collects nothing.';

/** The page with block, JSX and line comments removed, and whitespace folded. */
const COPY = SOURCE.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/\s+/g, ' ');

describe('/trust-medical: a vision story, labelled and inert', () => {
  it('says Vision — not built yet in the title, the first line and the badge', () => {
    expect(SOURCE).toContain(`const LABEL = '${LABEL}';`);
    expect(COPY).toContain('title: `TrustMedical (${LABEL})`');
    expect(COPY).toContain('TrustMedical · {LABEL}</p>');
    expect(COPY).toMatch(/function VisionTag\(\)[\s\S]*\{LABEL\}/);
    expect(COPY).toContain('<VisionTag />');
    expect(COPY).toContain('TrustMedical does not exist.');
  });

  it('carries the plain disclaimer, word for word', () => {
    expect(COPY).toContain(DISCLAIMER);
  });

  it('has no form or input of any kind', () => {
    expect(COPY).not.toMatch(/<(form|input|textarea|select|button|option|label)\b/i);
    expect(COPY).not.toMatch(/contentEditable|onSubmit|onChange|useState|'use client'/);
  });

  it('makes no compliance, clinical, advice, customer, timeline or event claim, and no secure/private claim', () => {
    // The only allowed use of "medical advice" is the negation, in the disclaimer and the social card.
    const copy = COPY.replace(DISCLAIMER, ' ').toLowerCase().replace(/nothing here is medical advice/g, ' ');
    const banned = [
      'hipaa', 'gdpr', 'compliant', 'compliance', 'clinical', 'diagnos', 'treatment', 'therapy', 'cure',
      'medical advice', 'customer', 'partner', 'pilot', 'hackathon', 'launch', 'coming soon', 'enrol',
      'secure', 'private', 'privacy-preserving', 'quarter', 'q1', 'q2', 'q3', 'q4',
    ];
    expect(banned.filter((word) => copy.includes(word))).toEqual([]);
    // No year: a year on a vision page reads as a date.
    expect(copy.match(/\b20\d\d\b/g) ?? []).toEqual([]);
  });

  it('links each thing it says exists today to the page that shows it', () => {
    for (const href of ['/check', '/passport/trinity-sophia', '/how-verification']) {
      expect(COPY).toContain(`href="${href}"`);
    }
    // The one place zkRepID is described says what today's proof does NOT do.
    expect(COPY).toContain('Today that proof shows the score rather than hiding it.');
  });
});
