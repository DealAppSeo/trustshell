import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exposedColumns } from '../lib/honesty-a';
import { modelCardRows, HELP_B } from '../lib/model-card';
import type { ReceiptRow } from '../lib/hal-receipt';

const ROOT = join(__dirname, '..');
const fixture = JSON.parse(readFileSync(join(ROOT, 'fixtures/hal-last-week.fixture.json'), 'utf8'));
const page = readFileSync(join(ROOT, 'app/model-card/page.tsx'), 'utf8');

describe('model card', () => {
  const cards = modelCardRows(fixture.rows as ReceiptRow[]);

  it('keeps Honesty A as three counts and Help B as no ratings', () => {
    const glm = cards.find((row) => row.family === 'glm');
    expect(glm).toMatchObject({ host: 'cerebras', TRUE: 0, FALSE: 1, NOT_CHECKED: 1, helpB: 'no ratings' });
    const qwen = cards.find((row) => row.family === 'qwen');
    expect(qwen).toMatchObject({ TRUE: 1, FALSE: 0, NOT_CHECKED: 0, helpB: HELP_B });
    expect(cards.every((row) => row.helpB === 'no ratings')).toBe(true);
  });

  it('labels A FIXTURE and does not blend a score or call B live', () => {
    expect(page).toContain('Model card');
    expect(page).toContain('A portable trust harness so AI has to earn it.');
    expect(page).toContain('FIXTURE');
    expect(page).toContain('no ratings');
    expect(page).toContain('Honesty A');
    expect(page).toContain('Help B');
    expect(page).not.toMatch(/blended|Help B is live|B is live/i);
    expect(page).not.toMatch(/\bscore\b/i);
    expect(page).toContain('TRUE {row.TRUE} / FALSE {row.FALSE} / NOT_CHECKED {row.NOT_CHECKED}');
    expect(page).toContain('GET /api/v1/hal/honesty-a reads family, provider, and verdict. It has no post-HAL column.');
    expect(page).not.toMatch(/first_pass|post_hal/);
  });

  it('prints NOT_CHECKED for post-HAL and does not invent columns', () => {
    expect(exposedColumns()).toBe('NOT_CHECKED');
    const src = readFileSync(join(ROOT, 'lib/honesty-a.ts'), 'utf8');
    expect(src).not.toMatch(/first_pass|post_hal/);
    expect(page).toContain('{card.columns}');
    expect(page).toContain('no ratings');
    expect(page).not.toMatch(/\bscore\b/i);
  });
});
