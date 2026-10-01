/**
 * belts/cmo.json: an installed row needs a probe file on disk.
 * A missing file prints NOT_CHECKED and the test exits 0.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const BELT_FILES = [join(ROOT, 'skills', 'belts', 'cmo.json'), join(ROOT, 'belts', 'cmo.json')];

type Row = Record<string, unknown>;

function rowsOf(body: unknown): Row[] {
  if (Array.isArray(body)) return body.filter((row) => row && typeof row === 'object') as Row[];
  if (body && typeof body === 'object' && Array.isArray((body as { rows?: unknown }).rows)) {
    return ((body as { rows: unknown[] }).rows).filter((row) => row && typeof row === 'object') as Row[];
  }
  return [];
}

function saysInstalled(row: Row): boolean {
  const status = String(row.status ?? row.state ?? '').toLowerCase();
  if (status === 'installed') return true;
  return row.installed === true || row.installed === 'installed';
}

function probeOf(row: Row): string {
  const value = row.probe ?? row.probe_file ?? row.probeFile;
  return typeof value === 'string' ? value.trim() : '';
}

/** NOT_CHECKED when the file is absent. Otherwise the installed rows whose probe file is missing. */
export function installedWithoutProbe(file: string, root: string): 'NOT_CHECKED' | string[] {
  if (!existsSync(file)) return 'NOT_CHECKED';
  const body = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as unknown;
  const missing: string[] = [];
  for (const row of rowsOf(body)) {
    if (!saysInstalled(row)) continue;
    const probe = probeOf(row);
    const abs = !probe ? '' : /^[A-Za-z]:[\\/]/.test(probe) || probe.startsWith('/') ? probe : join(root, probe);
    if (!abs || !existsSync(abs)) {
      const name = typeof row.name === 'string' ? row.name : typeof row.id === 'string' ? row.id : 'row';
      missing.push(name);
    }
  }
  return missing;
}

describe('belts/cmo.json probe', () => {
  it('prints NOT_CHECKED and exits 0 when the file is absent', () => {
    const present = BELT_FILES.find((file) => existsSync(file));
    if (!present) {
      console.log('NOT_CHECKED');
      expect(installedWithoutProbe(BELT_FILES[0], ROOT)).toBe('NOT_CHECKED');
      return;
    }
    const missing = installedWithoutProbe(present, ROOT);
    expect(missing).toEqual([]);
  });

  it('fails an installed row that has no probe file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cmo-belt-'));
    const belt = join(dir, 'cmo.json');
    try {
      writeFileSync(belt, JSON.stringify({ rows: [{ name: 'openmontage', status: 'installed' }] }));
      expect(installedWithoutProbe(belt, dir)).toEqual(['openmontage']);

      writeFileSync(belt, JSON.stringify({ rows: [{ name: 'openmontage', status: 'installed', probe: 'missing.txt' }] }));
      expect(installedWithoutProbe(belt, dir)).toEqual(['openmontage']);

      writeFileSync(join(dir, 'probe.txt'), 'ok');
      writeFileSync(belt, JSON.stringify([{ name: 'openmontage', status: 'installed', probe: 'probe.txt' }]));
      expect(installedWithoutProbe(belt, dir)).toEqual([]);

      writeFileSync(belt, JSON.stringify([{ name: 'later', status: 'later' }]));
      expect(installedWithoutProbe(belt, dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
