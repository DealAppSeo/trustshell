/**
 * The page a store reviewer reads, and the line Chrome shows under the extension name.
 * The stamp says Checks out, Caught, or Not checked.
 */
export {};

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('privacy page stamp words', () => {
  const privacy = readFileSync(join(ROOT, 'public/privacy.html'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(ROOT, 'extension/manifest.json'), 'utf8')) as {
    description: string;
  };

  it('names the three stamp words and the scrub that is true today', () => {
    expect(privacy).toContain('Checks out');
    expect(privacy).toContain('Caught');
    expect(privacy).toContain('Not checked');
    expect(privacy).toContain('Known key and personal-data formats are removed before sending.');
    expect(privacy).toContain('after the reply is on screen');
    expect(privacy).not.toContain('The answer is one word');
    expect(privacy).not.toContain('pass, veto, or not-checked');
    expect(privacy).not.toMatch(/filtered before it reaches you/i);
    expect(privacy).not.toMatch(/private by default/i);
    expect(privacy).not.toMatch(/\bLaya\b/);
    expect(privacy).not.toMatch(/\bJev\b/);
    expect(privacy).not.toMatch(/receipt/i);
  });

  it('the listing names the public privacy URL', () => {
    const listing = readFileSync(join(ROOT, 'store/LISTING.md'), 'utf8');
    expect(listing).toContain('https://www.trustshell.dev/privacy.html');
  });

  it('the extension description uses those words and fits the Chrome field', () => {
    expect(manifest.description).toBe(
      'Reads the last assistant reply and stamps Checks out, Caught, or Not checked.',
    );
    expect(manifest.description).not.toContain('pass, veto, or not-checked');
    expect(manifest.description.length).toBeLessThanOrEqual(132);
  });
});
