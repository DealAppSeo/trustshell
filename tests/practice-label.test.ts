/**
 * [P1] Every page that shows a value says, in the same place, that it is practice: the test network,
 * no real funds (docs/PRACTICE_LANE.md, "Progressive disclosure"). A page that shows a value and
 * drops the badge fails here, so a practice number can never be read as a real one.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const VALUE_PAGES = ['app/stake/page.tsx', 'app/spend/page.tsx', 'app/market/page.tsx'];

describe('the Practice badge', () => {
  it.each(VALUE_PAGES)('%s imports and renders it', (page) => {
    const src = readFileSync(join(ROOT, page), 'utf8');
    expect(src).toMatch(/import \{ PracticeBadge \} from '@\/components\/practice-badge';/);
    expect(src).toMatch(/<PracticeBadge \/>/);
  });

  it('says what practice means, plainly', () => {
    const src = readFileSync(join(ROOT, 'components/practice-badge.tsx'), 'utf8');
    expect(src).toMatch(/Practice/);
    expect(src).toMatch(/Test network/);
    expect(src).toMatch(/No real funds/);
    expect(src).not.toMatch(/real collateral/i);
  });
});
