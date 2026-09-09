/**
 * The published egress table is a claim. These tests pin the parser and the
 * load-bearing pieces a green `npm run check:egress` could hide: that both
 * docs parse, that they agree, and that a missing table is not a pass.
 *
 * The check script itself RUNS the commands with fetch/http/https stubbed.
 * This file does not re-do that — `the check script itself` spawn below is
 * the same process a human runs.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'check-egress.cjs');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const scan = require('../scripts/check-egress.cjs') as {
  parseEgressTable: (md: string) => { cmd: string; egress: string }[] | null;
  classify: (rows: { cmd: string; egress: string }[]) => {
    none: string[];
    githubOnly: string[];
    other: string[];
  };
  DOC_PATHS: string[];
  NONE_PINNED: Record<string, { field: string; value: string; exit: number }>;
  ALLOW_HOST: string;
};

describe('published egress tables — discovery, not a list', () => {
  const tables = scan.DOC_PATHS.map((rel) => ({
    rel,
    rows: scan.parseEgressTable(readFileSync(join(ROOT, rel), 'utf8')),
  }));

  it('parses a Command / Network egress table from every published surface', () => {
    for (const t of tables) {
      expect(t.rows).not.toBeNull();
      expect((t.rows || []).length).toBeGreaterThan(0);
    }
  });

  it('README and api-reference agree on which commands open a socket', () => {
    const [a, b] = tables;
    expect(scan.classify(a.rows || [])).toEqual(scan.classify(b.rows || []));
  });

  it('discovers inspect, init, report as none and check as api.github.com', () => {
    const { none, githubOnly } = scan.classify(tables[0].rows || []);
    expect(none).toEqual(expect.arrayContaining(['inspect', 'init', 'report']));
    expect(githubOnly).toEqual(expect.arrayContaining(['check']));
    expect(none).not.toContain('check');
    expect(none).not.toContain('verify');
  });

  it('picks up a new none-row without anyone editing this test', () => {
    const rows = scan.parseEgressTable(
      [
        '| Command | Network egress | Auth |',
        '|---|---|---|',
        '| `inspect` | **none** | none |',
        '| `foo` | **none** — a new command | none |',
        '| `check` | **`api.github.com` only** | none |',
      ].join('\n'),
    );
    const { none } = scan.classify(rows || []);
    expect(none).toContain('foo');
    expect(none).toContain('inspect');
  });

  it('returns null when the table is missing — the check must NOT CHECKED, not pass', () => {
    expect(scan.parseEgressTable('# no table here\n')).toBeNull();
  });
});

describe('the check script itself', () => {
  it('exits 0 with VERIFIED on this tree', () => {
    const r = spawnSync(process.execPath, [SCRIPT], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    expect(r.stdout).toMatch(/^VERIFIED\b/m);
    expect(r.status).toBe(0);
  }, 60_000);
});
