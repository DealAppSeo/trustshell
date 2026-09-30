/**
 * /belts has no npm and no "stake now".
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(__dirname, '../app/belts/page.tsx'), 'utf8').replace(/\r/g, '');

describe('/belts copy', () => {
  it('has no npm and no stake now', () => {
    expect(page).not.toMatch(/npm/);
    expect(page).not.toMatch(/stake now/i);
  });
});
