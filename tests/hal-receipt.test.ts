import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyVerdict, countByFamily, receiptLine, type ReceiptRow } from '../lib/hal-receipt';

const ROOT = join(__dirname, '..');
const fixture = JSON.parse(readFileSync(join(ROOT, 'fixtures/hal-last-week.fixture.json'), 'utf8'));
const page = readFileSync(join(ROOT, 'app/hal-receipt/page.tsx'), 'utf8');

describe('HAL family receipt', () => {
  const rows = fixture.rows as ReceiptRow[];

  it('is a FIXTURE, not a live query', () => {
    expect(fixture.label).toBe('FIXTURE');
    expect(fixture.live).toBe(false);
    expect(fixture.writes.durable_table).toBe('llm_call_log');
    expect(fixture.writes.verdict_file).toBe('repid-engine/src/hal/fact-check.ts');
  });

  it('keeps NOT_CHECKED out of FALSE', () => {
    expect(classifyVerdict('FALSE')).toBe('FALSE');
    expect(classifyVerdict('NOT_CHECKED')).toBe('NOT_CHECKED');
    expect(classifyVerdict('ERROR')).toBe('NOT_CHECKED');
    expect(classifyVerdict('UNCERTAIN')).toBe('UNCERTAIN');

    const glm = countByFamily(rows).find((row) => row.family === 'glm');
    expect(glm).toMatchObject({ FALSE: 1, NOT_CHECKED: 1, TRUE: 0, UNCERTAIN: 0 });
    const qwen = countByFamily(rows).find((row) => row.family === 'qwen');
    expect(qwen).toMatchObject({ TRUE: 1, FALSE: 0, UNCERTAIN: 1, NOT_CHECKED: 0 });
    expect(page).toMatch(/font-semibold">NOT_CHECKED/);
    expect(page).not.toMatch(/font-semibold">UNCERTAIN/);
  });

  it('copies one line of family, host, and verdict', () => {
    expect(receiptLine({ family: 'glm', host: 'cerebras', verdict: 'FALSE' })).toBe('glm cerebras FALSE');
    expect(receiptLine({ family: 'glm', host: 'cerebras', verdict: 'ERROR' })).toBe('glm cerebras NOT_CHECKED');
    expect(receiptLine({ family: 'openai', host: 'openai', verdict: 'NOT_CHECKED' })).toBe(
      'openai openai NOT_CHECKED',
    );
    const lines = rows.map((row) => receiptLine(row));
    expect(lines.join('\n')).not.toMatch(/user_id|agent_id|prompt/i);
    expect(page).toContain('Copy a line');
  });

  it('counts one row per family and does not publish prompts or ids', () => {
    const counts = countByFamily(rows);
    expect(counts.map((row) => row.family)).toEqual(['glm', 'openai', 'qwen']);
    const blob = JSON.stringify(fixture);
    expect(blob).not.toMatch(/prompt|wallet|user_id|agent_id/i);
    expect(page).toContain('Agents rate families by outcomes. Vendors do not score themselves.');
    expect(page).toContain('FIXTURE, not live');
    expect(page).toContain('Last measured week');
    expect(page).not.toMatch(/wallet|user_id|agent_id/i);
  });
});
