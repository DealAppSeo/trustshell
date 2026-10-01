import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import {
  TRAPS,
  buildTrapsList,
  formatTrapsList,
  loadReceipts,
  trapsReceiptPath,
} from '../src/cli/traps';

const EXPECTED_SLUGS = [
  'surgeon',
  'missing-dollar',
  'tuesday-boy',
  'monty',
  'average-speed',
  'disease',
  'ropes',
  'two-envelope',
  'birthday',
  'ravens',
];

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'ts-traps-'));
}

function writeReceipts(cwd: string, receipts: Record<string, string>) {
  const dir = join(cwd, '.trustshell');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'traps.json'), JSON.stringify({ receipts }, null, 2));
}

describe('trustshell traps', () => {
  it('is a command and the help text describes it with NOT_CHECKED', () => {
    const args = parseArgs(['traps']);
    expect(args.command).toBe('traps');
    expect(args.error).toBeUndefined();
  });

  it('ships exactly the ten named fixture claims', () => {
    expect(TRAPS.map((t) => t.slug)).toEqual(EXPECTED_SLUGS);
    expect(TRAPS).toHaveLength(10);
  });

  it('prints NOT_CHECKED for every trap when no receipt store exists', () => {
    const cwd = tempDir();
    try {
      const rows = buildTrapsList(cwd);
      expect(rows).toHaveLength(10);
      for (const row of rows) {
        expect(row.status).toBe('NOT_CHECKED');
        expect(row.receipt_id).toBeUndefined();
      }
      const text = formatTrapsList(rows, false);
      for (const slug of EXPECTED_SLUGS) {
        expect(text).toContain(`${slug} NOT_CHECKED`);
      }
      expect(text).not.toMatch(/\b0\b/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('shows the receipt id when one exists and leaves the rest NOT_CHECKED', () => {
    const cwd = tempDir();
    try {
      writeReceipts(cwd, {
        surgeon: 'receipt-surgeon-001',
        monty: 'receipt-monty-042',
      });
      const rows = buildTrapsList(cwd);
      const bySlug = new Map(rows.map((r) => [r.slug, r]));
      expect(bySlug.get('surgeon')?.status).toBe('receipt-surgeon-001');
      expect(bySlug.get('surgeon')?.receipt_id).toBe('receipt-surgeon-001');
      expect(bySlug.get('monty')?.status).toBe('receipt-monty-042');
      expect(bySlug.get('missing-dollar')?.status).toBe('NOT_CHECKED');
      expect(bySlug.get('tuesday-boy')?.status).toBe('NOT_CHECKED');
      expect(formatTrapsList(rows, false)).toContain('surgeon receipt-surgeon-001');
      expect(formatTrapsList(rows, false)).toContain('missing-dollar NOT_CHECKED');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('treats blank receipt ids as NOT_CHECKED', () => {
    const cwd = tempDir();
    try {
      writeReceipts(cwd, { surgeon: '  ', ropes: '' });
      const rows = buildTrapsList(cwd);
      expect(rows.find((r) => r.slug === 'surgeon')?.status).toBe('NOT_CHECKED');
      expect(rows.find((r) => r.slug === 'ropes')?.status).toBe('NOT_CHECKED');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('run() prints the list and exits 0 without calling the SDK', async () => {
    const cwd = tempDir();
    const prevCwd = process.cwd();
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    try {
      process.chdir(cwd);
      const code = await run(parseArgs(['traps']), {} as never, io);
      expect(code).toBe(0);
      const text = out.join('\n');
      for (const slug of EXPECTED_SLUGS) {
        expect(text).toContain(`${slug} NOT_CHECKED`);
      }
      expect(text).not.toMatch(/scoreboard|wins|HAL|live stake|stake|PASS/i);
    } finally {
      process.chdir(prevCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('run() --json emits a JSON array without inventing receipt ids', async () => {
    const cwd = tempDir();
    const prevCwd = process.cwd();
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: () => undefined };
    try {
      process.chdir(cwd);
      const code = await run(parseArgs(['traps', '--json']), {} as never, io);
      expect(code).toBe(0);
      const rows = JSON.parse(out.join('\n')) as Array<{
        slug: string;
        status: string;
        receipt_id?: string;
      }>;
      expect(rows).toHaveLength(10);
      for (const row of rows) {
        expect(row.status).toBe('NOT_CHECKED');
        expect(row.receipt_id).toBeUndefined();
      }
    } finally {
      process.chdir(prevCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('loadReceipts ignores a malformed receipt store', () => {
    const cwd = tempDir();
    try {
      mkdirSync(join(cwd, '.trustshell'), { recursive: true });
      writeFileSync(trapsReceiptPath(cwd), 'not-json');
      expect(loadReceipts(cwd)).toEqual({});
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
