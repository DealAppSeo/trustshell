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
import { readFileSync, readdirSync, statSync } from 'node:fs';
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
      // The header above promises these two; they were missing from the list.
      'timeline', 'event',
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

describe('/trust-medical: the sentences about today say what the code does', () => {
  it('idea 4: the check is a vote; matching a quote to its source is a separate local command, not the check', () => {
    // The live check is the family vote. Quote-against-source is `trustshell ground` (docs/api-reference.md), local,
    // no model and no network, and not part of the check.
    expect(COPY).toContain('which is a vote by independent model families');
    expect(COPY).toContain('a local command, trustshell ground,');
    expect(COPY).toContain('with no model and no network');
    expect(COPY).toContain('It is not part of the check.');
    // The old sentence folded the two together.
    expect(COPY).not.toContain('the same check as everything else');
    expect(COPY).not.toContain('quotes matched against their source');
    expect(COPY).toContain('Claims about a study would be checked');
  });

  it('idea 3: RepID for research agents is future only, and does not define today’s tool as how it is earned', () => {
    // A /check vote writes no score (lib/check-receipt.ts), so "earned from work that was checked" was false today.
    expect(COPY).not.toMatch(/the way any agent does/);
    expect(COPY).not.toMatch(/from work that was checked/);
    expect(COPY).toContain('Those rules do not exist yet.');
    expect(COPY).toContain('Reputation would decide who gets near a study');
  });
});

describe('/trust-medical: the places that point at it', () => {
  it('the /vision card is conditional: would, never a present tense that reads as live', () => {
    const vision = readFileSync(join(__dirname, '..', 'app', 'vision', 'page.tsx'), 'utf8').replace(/\s+/g, ' ');
    const card = vision.slice(vision.indexOf("name: 'TrustMedical'"), vision.indexOf("link: { href: '/trust-medical'"));
    expect(card.length).toBeGreaterThan(100);
    expect(card).toContain('a person would opt in and share a proof');
    expect(card).toContain('only the fields a study needs would ever cross');
    expect(card).toContain('it would open the way everything else does');
    expect(card).not.toMatch(/a person opts in|needs ever cross|it opens the way/);
  });

  it('the footer link says it is a vision', () => {
    const footer = readFileSync(join(__dirname, '..', 'components', 'footer.tsx'), 'utf8');
    expect(footer).toContain("name: 'TrustMedical (vision)'");
    expect(footer).not.toContain("name: 'TrustMedical',");
  });

  it('the page does not claim the footer is a way in while no page mounts Footer', () => {
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx|ts)$/.test(name) && /from '@\/components\/footer'/.test(readFileSync(p, 'utf8'))) importers.push(p);
      }
    };
    walk(join(__dirname, '..', 'app'));
    // If a page starts mounting Footer, update the comment in app/trust-medical/page.tsx (and lib/site.ts) and this test.
    expect(importers).toEqual([]);
    expect(SOURCE.replace(/\s+/g, ' ')).toContain('no page mounts that Footer today');
    expect(SOURCE).not.toMatch(/Reached from \/vision, the footer/);
  });
});
