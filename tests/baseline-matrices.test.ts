/**
 * OVERNIGHT 2026-11-01, item 1: the truthful baseline.
 *
 * docs/SECURITY_GAP_MATRIX.md and docs/CONTAINMENT_MATRIX.md are claims about what is enforced. A matrix
 * nobody checks rots into the comfortable direction: a row says ENFORCED long after its test was deleted,
 * or an "MCP is not covered" row stays true-sounding after someone wires MCP and the doc is never touched.
 * These tests make the two files fail the build when:
 *   - a file or its table is missing (a missing table is not a pass: at least MIN_ROWS rows must parse);
 *   - a status is outside the vocabulary;
 *   - a row cites local evidence that does not exist;
 *   - an ENFORCED row has no test behind it (a local tests/ file, or a dated cross-repo pointer);
 *   - the containment matrix's Guard-coverage rows disagree with GUARD_DOES_NOT_COVER in the code;
 *   - either file claims an OS sandbox or uses launch language.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GUARD_DOES_NOT_COVER } from '../src/lib/guardrails';

const ROOT = join(__dirname, '..');
const FILES = ['docs/SECURITY_GAP_MATRIX.md', 'docs/CONTAINMENT_MATRIX.md'] as const;
const STATUSES = ['ENFORCED', 'PARTIAL', 'OBSERVE', 'NOT_ENFORCED', 'NOT_CHECKED'] as const;
const MIN_ROWS = 8;

interface Row { id: string; control: string; status: string; evidence: string; gap: string; line: number }

/** Rows of the first markdown table after the `## Matrix` heading. Columns: ID | Control | Status | Evidence | Gap. */
export function parseMatrix(md: string): Row[] {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^##\s+Matrix\s*$/.test(l));
  if (start < 0) return [];
  const rows: Row[] = [];
  let inTable = false;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i] ?? '';
    if (!l.startsWith('|')) { if (inTable) break; continue; }
    inTable = true;
    const cells = l.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 5) throw new Error(`line ${i + 1}: expected 5 cells, got ${cells.length}`);
    const [id, control, status, evidence, gap] = cells as [string, string, string, string, string];
    if (id === 'ID' || /^-+$/.test(id.replace(/:/g, ''))) continue;
    rows.push({ id, control, status: status.replace(/\*/g, ''), evidence, gap, line: i + 1 });
  }
  return rows;
}

/** Backticked evidence pointers. `repid-engine:path` is cross-repo; anything else is a path in this repo. */
export function pointers(evidence: string): { local: string[]; crossRepo: string[] } {
  const all = [...evidence.matchAll(/`([^`]+)`/g)].map((m) => (m[1] ?? '').trim());
  return {
    local: all.filter((p) => !p.includes(':') && /[/.]/.test(p)),
    crossRepo: all.filter((p) => /^[a-z-]+:/.test(p)),
  };
}

const exists = (p: string) => existsSync(join(ROOT, p.replace(/#.*$/, '').replace(/:\d+$/, '')));

describe('baseline matrix parser (non-vacuity)', () => {
  it('finds rows in a real table and none in a file without one', () => {
    const md = '# x\n\n## Matrix\n\n| ID | Control | Status | Evidence | Gap |\n|---|---|---|---|---|\n| A1 | c | ENFORCED | `tests/x.test.ts` | g |\n';
    expect(parseMatrix(md)).toHaveLength(1);
    expect(parseMatrix('# no table here')).toHaveLength(0);
  });
  it('the existence check can say no', () => {
    expect(exists('tests/this-file-does-not-exist.test.ts')).toBe(false);
    expect(exists('src/lib/guardrails.ts')).toBe(true);
  });
});

describe.each(FILES)('%s', (file) => {
  const path = join(ROOT, file);
  const md = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const rows = md ? parseMatrix(md) : [];

  it('exists and has a parsed table of at least MIN_ROWS rows', () => {
    expect(existsSync(path)).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(MIN_ROWS);
  });

  it('uses only the status vocabulary, with unique ids', () => {
    for (const r of rows) expect({ id: r.id, ok: (STATUSES as readonly string[]).includes(r.status) }).toEqual({ id: r.id, ok: true });
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('every row cites evidence, and every local pointer exists', () => {
    for (const r of rows) {
      const { local, crossRepo } = pointers(r.evidence);
      expect({ id: r.id, cites: local.length + crossRepo.length > 0 }).toEqual({ id: r.id, cites: true });
      for (const p of local) expect({ id: r.id, p, exists: exists(p) }).toEqual({ id: r.id, p, exists: true });
    }
  });

  it('every ENFORCED row has a test behind it: a local tests/ file, or a dated cross-repo pointer', () => {
    for (const r of rows.filter((x) => x.status === 'ENFORCED')) {
      const { local, crossRepo } = pointers(r.evidence);
      const localTest = local.some((p) => p.startsWith('tests/') && exists(p));
      const datedCross = crossRepo.length > 0 && /checked 20\d\d-\d\d-\d\d/.test(r.evidence);
      expect({ id: r.id, backed: localTest || datedCross }).toEqual({ id: r.id, backed: true });
    }
  });

  it('claims no OS sandbox and uses no launch language', () => {
    for (const [i, l] of md.split('\n').entries()) {
      if (/sandbox/i.test(l)) expect({ line: i + 1, negated: /\bnot\b|\bno\b/i.test(l) }).toEqual({ line: i + 1, negated: true });
      expect({ line: i + 1, launch: /\blaunch(ed)?\b/i.test(l) }).toEqual({ line: i + 1, launch: false });
    }
  });
});

describe('CONTAINMENT_MATRIX agrees with what Guard says it does not cover', () => {
  const md = existsSync(join(ROOT, FILES[1])) ? readFileSync(join(ROOT, FILES[1]), 'utf8') : '';
  const rows = parseMatrix(md);
  const byId = (id: string) => rows.find((r) => r.id === id);

  it('MCP server and SDK callers are NOT_ENFORCED by Guard while the code says so', () => {
    expect(GUARD_DOES_NOT_COVER[0]).toMatch(/MCP server .* does not read this policy/);
    expect(byId('C3')?.status).toBe('NOT_ENFORCED');
    expect(byId('C3')?.control).toMatch(/MCP/);
    expect(byId('C4')?.status).toBe('NOT_ENFORCED');
    expect(byId('C4')?.control).toMatch(/SDK/);
  });

  it('what a started command does is NOT_ENFORCED while the code says it is not observed', () => {
    expect(GUARD_DOES_NOT_COVER.some((s) => /What a started command does .* is not observed/.test(s))).toBe(true);
    expect(byId('C2')?.status).toBe('NOT_ENFORCED');
  });
});
