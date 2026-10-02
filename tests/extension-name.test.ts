import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const name = require('../extension/name.js') as {
  LINE: string;
  STORAGE_KEY: string;
  nameField(input?: {
    text?: string;
    stored?: string;
    receipts?: { stamp?: string }[];
    fetchImpl?: (url: string, init: { body?: string }) => Promise<{ status: number; json: () => Promise<unknown> }>;
  }): Promise<{ hidden: boolean; line: string }>;
  saveName(storage: { local?: { set: (items: Record<string, string>) => void } }, value: string): boolean;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const badge = require('../extension/badge.js') as {
  LABEL: string;
  badge: () => { label: string; ask: boolean };
};

function reply(status: number, body: unknown) {
  return Promise.resolve({ status, json: async () => body });
}

describe('extension name', () => {
  it('hides the name field before a real receipt', async () => {
    expect((await name.nameField()).hidden).toBe(true);
    expect((await name.nameField({ text: 'pass', receipts: [{ stamp: 'pass' }] })).hidden).toBe(true);
    expect((await name.nameField({ text: 'veto' })).line).toBe('');

    const keyword = await name.nameField({
      text: 'the last line is pass',
      fetchImpl: (url) => {
        expect(url).toContain('/api/v1/hal/evaluate');
        return reply(200, { decision: 'maybe', hal_verdict: 'pass' });
      },
    });
    expect(keyword.hidden).toBe(true);
    expect(keyword.line).toBe('');

    const late = await name.nameField({
      text: 'pass',
      fetchImpl: () => reply(200, { decision: 'PASS', provider_responses: [{ late: true }] }),
    });
    expect(late.hidden).toBe(true);

    const missed = await name.nameField({
      text: 'veto',
      fetchImpl: () => reply(504, { decision: 'VETO' }),
    });
    expect(missed.hidden).toBe(true);

    const real = await name.nameField({
      text: 'water boils at 100 C at sea level',
      fetchImpl: () => reply(200, { decision: 'clean' }),
    });
    expect(real.hidden).toBe(false);
    expect(real.line).toBe('Name this one. It keeps your notes. It does not share them.');
    expect(real.line).toBe(name.LINE);

    const veto = await name.nameField({
      text: 'one dollar is missing',
      fetchImpl: () => reply(200, { decision: 'vetoed' }),
    });
    expect(veto.hidden).toBe(false);

    const bag: Record<string, string> = {};
    expect(name.saveName({ local: { set: (items) => Object.assign(bag, items) } }, 'Ada')).toBe(true);
    expect(bag[name.STORAGE_KEY]).toBe('Ada');
    const again = await name.nameField({
      text: 'water boils at 100 C at sea level',
      stored: bag[name.STORAGE_KEY],
      fetchImpl: () => reply(200, { decision: 'PASS' }),
    });
    expect(again.hidden).toBe(true);
    expect(again.line).toBe('');

    expect(badge.LABEL).toBe('Trust Harness');
    expect(badge.badge()).toEqual({ label: 'Trust Harness', ask: false });
    const src = [
      readFileSync(join(__dirname, '../extension/name.js'), 'utf8'),
      readFileSync(join(__dirname, '../extension/badge.js'), 'utf8'),
    ].join('\n');
    expect(src).not.toMatch(/\bCTO\b/);
    expect(src).not.toMatch(/\bCMO\b/);
    expect(src).not.toMatch(/\bCFO\b/);
  });
});
