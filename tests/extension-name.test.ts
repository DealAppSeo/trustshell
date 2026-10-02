import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const name = require('../extension/name.js') as {
  LINE: string;
  STORAGE_KEY: string;
  nameField(input?: { receipts?: { stamp?: string; verdict?: string; hal?: { verdict?: string } }[]; stored?: string }): {
    hidden: boolean;
    line: string;
  };
  saveName(storage: { local?: { set: (items: Record<string, string>) => void } }, value: string): boolean;
};

describe('extension name', () => {
  it('hides the name field before the first receipt', () => {
    expect(name.nameField().hidden).toBe(true);
    expect(name.nameField({ receipts: [] }).hidden).toBe(true);
    expect(name.nameField({ receipts: [] }).line).toBe('');
    expect(name.nameField({ receipts: [{ stamp: 'not-checked' }] }).hidden).toBe(true);
    expect(name.nameField({ receipts: [{ stamp: 'NOT_CHECKED' }] }).line).toBe('');

    const shown = name.nameField({ receipts: [{ stamp: 'pass' }] });
    expect(shown.hidden).toBe(false);
    expect(shown.line).toBe('Name this one. It keeps your notes. It does not share them.');
    expect(shown.line).toBe(name.LINE);

    expect(name.nameField({ receipts: [{ hal: { verdict: 'VETO' } }] }).hidden).toBe(false);
    expect(name.nameField({ receipts: [{ stamp: 'not-checked' }, { verdict: 'pass' }] }).line).toBe(name.LINE);
    expect(name.nameField({ receipts: [{ stamp: 'pass' }], stored: 'Ada' }).hidden).toBe(true);
    expect(name.nameField({ receipts: [{ stamp: 'pass' }], stored: 'Ada' }).line).toBe('');

    const bag: Record<string, string> = {};
    expect(name.saveName({ local: { set: (items) => Object.assign(bag, items) } }, 'Ada')).toBe(true);
    expect(bag[name.STORAGE_KEY]).toBe('Ada');
    expect(name.nameField({ receipts: [{ stamp: 'veto' }], stored: bag[name.STORAGE_KEY] }).hidden).toBe(true);

    const src = readFileSync(join(__dirname, '../extension/name.js'), 'utf8');
    expect(src).not.toMatch(/\bCTO\b/);
    expect(src).not.toMatch(/\bCMO\b/);
    expect(src).not.toMatch(/\bCFO\b/);
  });
});
