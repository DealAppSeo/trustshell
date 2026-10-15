/**
 * Two small claims kept true:
 *  - /earn-trust's "receipt" button opens a real receipt (the engine's newest settled deal, through the
 *    /receipt/:id redirect in next.config.ts), not the /hal-receipt fixture.
 *  - docs/glossary.md names every status the site's glossary uses, with the page's label for it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STATUS_LABEL } from '../lib/glossary';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('the /earn-trust receipt button opens a real receipt', () => {
  it('links /receipt/latest, which next.config.ts redirects to the engine, and never the fixture', () => {
    const page = read('app/earn-trust/page.tsx');
    expect(page).toContain('href="/receipt/latest"');
    expect(page).not.toContain('/hal-receipt');
    expect(read('next.config.ts')).toMatch(/source: [`'"]\/receipt\/:id/);
  });
});

describe('docs/glossary.md matches the statuses lib/glossary.ts uses', () => {
  it('lists every status with the label the page shows', () => {
    const doc = read('docs/glossary.md');
    for (const [status, label] of Object.entries(STATUS_LABEL)) {
      expect(doc).toContain(`| \`${status}\` | ${label} |`);
    }
  });
});
