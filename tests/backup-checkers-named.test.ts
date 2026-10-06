/**
 * Every door that sends text names the backup that can receive it (Sean and Grok, 2026-10-06).
 *
 * Cloudflare Workers AI (Llama) became the third checker family in the engine's pool
 * (repid-engine src/classify/free-votes.ts VOTER_POOL). A backup can receive the text, so each
 * page that says where the text goes names it, in the same change, and this change merges before
 * the engine's. If the engine went first, a fallback could send text to Cloudflare before any page
 * said so.
 */
export {};

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const NAME = 'Cloudflare Workers AI (Llama)';
const BACKUP = `If one cannot answer, a backup checker takes its turn: ${NAME}, or another listed in our privacy policy.`;

describe('the backup checker is named wherever the text is sent from', () => {
  it.each(['public/install.html', 'extension/popup.html', 'extension/README.md', 'app/check/CheckForm.tsx', 'store/LISTING.md'])(
    '%s says the backup sentence word for word',
    (file) => {
      expect(read(file)).toContain(BACKUP);
    },
  );

  it('the privacy page lists it first among the backups, with the Llama licence', () => {
    const privacy = read('public/privacy.html');
    expect(privacy).toContain(`from this list and no other: ${NAME}, Meta's Llama model run by Cloudflare under Meta's Llama license;`);
  });

  it('the homepage names it in what is live today', () => {
    expect(read('components/home-where.tsx').replace(/\s+/g, ' ')).toContain(`takes its turn, such as ${NAME}.`);
  });

  it('the old line that named no backup is gone everywhere', () => {
    const old = 'a backup checker listed in our privacy policy takes its turn';
    for (const f of ['public/install.html', 'extension/popup.html', 'extension/README.md', 'app/check/CheckForm.tsx', 'store/LISTING.md']) {
      expect(read(f)).not.toContain(old);
    }
  });

  it('the stamp line names the host the same way on both clients', () => {
    expect(read('extension/classify.js')).toContain("'workers-ai': 'Cloudflare Workers AI'");
    expect(read('src/lib/claim.ts')).toContain("'workers-ai': 'Cloudflare Workers AI'");
  });
});
