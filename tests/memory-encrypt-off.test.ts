/**
 * Memory encryption default/off path.
 *
 * When TRUSTSHELL_MEMORY_ENCRYPT is unset or explicitly off, remember/recall
 * still works without encrypting. No network. No stake or bind flags are touched.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decryptMemory, encryptMemory } from '../src/memory/encrypt';

const src = readFileSync(join(__dirname, '../src/memory/encrypt.ts'), 'utf8');
const STAKE_BIND_FLAGS = ['SAYS_STAKE_LIVE', 'REAL_STAKING_ENABLED', 'HUMAN_AGENT_BIND_ENABLED'];

type FlagSnapshot = Record<string, string | undefined>;

function snapshotFlags(): FlagSnapshot {
  const out: FlagSnapshot = {};
  for (const flag of STAKE_BIND_FLAGS) out[flag] = process.env[flag];
  return out;
}

function flagsEqual(a: FlagSnapshot, b: FlagSnapshot): boolean {
  for (const flag of STAKE_BIND_FLAGS) {
    if (a[flag] !== b[flag]) return false;
  }
  return true;
}

describe('memory encrypt off/unset path', () => {
  const prevFetch = global.fetch;
  const prevEncrypt = process.env.TRUSTSHELL_MEMORY_ENCRYPT;
  const prevKey = process.env.TRUSTSHELL_MEMORY_KEY;

  afterEach(() => {
    global.fetch = prevFetch;
    if (prevEncrypt === undefined) delete process.env.TRUSTSHELL_MEMORY_ENCRYPT;
    else process.env.TRUSTSHELL_MEMORY_ENCRYPT = prevEncrypt;
    if (prevKey === undefined) delete process.env.TRUSTSHELL_MEMORY_KEY;
    else process.env.TRUSTSHELL_MEMORY_KEY = prevKey;
    for (const flag of STAKE_BIND_FLAGS) {
      delete process.env[flag];
    }
  });

  it('round-trips unchanged when TRUSTSHELL_MEMORY_ENCRYPT is unset', () => {
    delete process.env.TRUSTSHELL_MEMORY_ENCRYPT;
    delete process.env.TRUSTSHELL_MEMORY_KEY;
    const before = snapshotFlags();
    const body = 'ship the receipt';
    expect(encryptMemory(body)).toBe(body);
    expect(decryptMemory(body)).toBe(body);
    expect(flagsEqual(snapshotFlags(), before)).toBe(true);
  });

  it('round-trips unchanged when TRUSTSHELL_MEMORY_ENCRYPT is off', () => {
    process.env.TRUSTSHELL_MEMORY_ENCRYPT = 'off';
    delete process.env.TRUSTSHELL_MEMORY_KEY;
    const before = snapshotFlags();
    const body = 'then look at it';
    expect(encryptMemory(body)).toBe(body);
    expect(decryptMemory(body)).toBe(body);
    expect(flagsEqual(snapshotFlags(), before)).toBe(true);
  });

  it('round-trips unchanged when TRUSTSHELL_MEMORY_ENCRYPT is empty or whitespace', () => {
    for (const value of ['', '  ', ' \t\n ']) {
      process.env.TRUSTSHELL_MEMORY_ENCRYPT = value;
      const body = `note-${value.length}`;
      expect(encryptMemory(body)).toBe(body);
      expect(decryptMemory(body)).toBe(body);
    }
  });

  it('has no network calls and does not reference stake/bind flags', () => {
    const calls: string[] = [];
    global.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      throw new Error('network');
    }) as typeof fetch;

    expect(src).not.toMatch(/\bPOST\b|fetch\(|https?:\/\/|from ['"]node:http/);
    expect(src).not.toMatch(/\b(REAL_STAKING|HUMAN_AGENT_BIND|SAYS_STAKE_LIVE)\b/);

    encryptMemory('plain');
    decryptMemory('plain');

    expect(calls).toEqual([]);
  });
});
