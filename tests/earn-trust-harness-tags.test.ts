/**
 * /earn-trust tags each harness part LIVE vs DIRECTION by what @hyperdag/trustshell 1.7.0 does.
 * Quarantine v0 is live for local memory only; sandboxed execution and adaptive learning are a
 * direction. A part must not read as live without the copy naming what runs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(__dirname, '..', 'app/earn-trust/page.tsx'), 'utf8').replace(/\r\n/g, '\n');

function part(name: string): string {
  const start = page.indexOf(`name: '${name}',`);
  expect(start).toBeGreaterThan(-1);
  return page.slice(start, page.indexOf('\n  },', start));
}

describe('/earn-trust harness parts are tagged live vs direction', () => {
  it('every part carries a direction; only Context has nothing live', () => {
    for (const name of ['Memory', 'Context', 'Permissions', 'The refuse']) {
      expect(part(name)).toMatch(/direction: '/);
    }
    expect(part('Context')).toMatch(/live: null/);
    expect(part('Memory')).toMatch(/live: 'Local only/);
    expect(part('Permissions')).toMatch(/live: '.*my_job/);
    expect(part('The refuse')).toMatch(/live: '.*not checked is never a pass/);
  });

  it('renders the Live tag only for a part with something live', () => {
    expect(page).toMatch(/\{h\.live && \(/);
    expect(page).toMatch(/live: \{ label: 'Live', dashed: false \}/);
  });

  it('quarantine: live in local memory only; sandbox and adaptive learning are direction', () => {
    expect(page).toContain('Live since 1.7.0, in local memory only.');
    expect(page).toContain('it runs nothing in a sandbox');
    expect(page).toContain('not adaptive');
    expect(page).not.toMatch(/quarantine[^.]*\b(sandboxed execution|learns)\b[^.]*\b(live|shipped)\b/i);
  });
});
