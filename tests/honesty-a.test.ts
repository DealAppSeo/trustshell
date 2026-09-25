import { cardFromPayload, helpBLabel, loadHonestyCard } from '../lib/honesty-a';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const counted = {
  status: 'counted',
  rows: [
    { family: 'glm', host: 'cerebras', TRUE: 4, FALSE: 1, NOT_CHECKED: 2, n: 0 },
    { family: 'qwen', host: 'deepseek', TRUE: 3, FALSE: 0, NOT_CHECKED: 1, n: 5 },
  ],
};

describe('Honesty A wiring', () => {
  it('uses live rows when status is counted', async () => {
    const card = await loadHonestyCard({
      env: { NODE_ENV: 'test' },
      fetchImpl: async () => jsonResponse(200, counted),
    });
    expect(card.source).toBe('counted');
    expect(card.rows[0]).toMatchObject({
      family: 'glm',
      TRUE: 4,
      FALSE: 1,
      NOT_CHECKED: 2,
      helpB: 'no ratings',
    });
    expect(card.rows[1].helpB).toBe('5');
    expect(card.source).not.toBe('FIXTURE');
  });

  it('falls back to the FIXTURE file when the endpoint is not counted', async () => {
    const down = await loadHonestyCard({
      env: { NODE_ENV: 'test' },
      fetchImpl: async () => jsonResponse(503, { status: 'down' }),
    });
    expect(down.source).toBe('FIXTURE');
    expect(down.rows.map((row) => row.family)).toEqual(['glm', 'openai', 'qwen']);
    expect(down.rows.every((row) => row.helpB === 'no ratings')).toBe(true);

    const other = cardFromPayload({ status: 'empty', rows: [] });
    expect(other).toBeNull();
  });

  it('does not treat n below 1 as ratings and does not blend A with B', () => {
    expect(helpBLabel(0)).toBe('no ratings');
    expect(helpBLabel(undefined)).toBe('no ratings');
    expect(helpBLabel(1)).toBe('1');
    const src = require('fs').readFileSync(require('path').join(__dirname, '../lib/honesty-a.ts'), 'utf8');
    expect(src).not.toMatch(/average|blend/i);
  });
});
