/**
 * `trustshell init --pai dry-run` does not mint ERC-8004.
 * NOT_MINTED until engine bind is on. This path does not spawn and does not fetch.
 */
jest.mock('node:child_process', () => {
  const actual = jest.requireActual('node:child_process') as typeof import('node:child_process');
  return {
    ...actual,
    spawnSync: jest.fn(() => ({ status: 0 })),
  };
});

import { spawnSync } from 'node:child_process';
import { parseArgs, run, type CliIO } from '../src/cli';
import { TrustShell } from '../src/lib/trustshell';

const spawn = spawnSync as unknown as jest.Mock;

function capture(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

describe('trustshell init --pai dry-run stays NOT_MINTED', () => {
  const prevFetch = global.fetch;

  beforeEach(() => {
    spawn.mockClear();
    spawn.mockReturnValue({ status: 0 });
  });

  afterEach(() => {
    global.fetch = prevFetch;
  });

  it('parses --dry-run and the positional dry-run word', () => {
    const flagged = parseArgs(['init', '--pai', '--dry-run', '--name', 'pai-night-1']);
    expect(flagged.command).toBe('init');
    expect(flagged.pai).toBe(true);
    expect(flagged.dryRun).toBe(true);
    expect(flagged.name).toBe('pai-night-1');

    const word = parseArgs(['init', '--pai', 'dry-run']);
    expect(word.pai).toBe(true);
    expect(word.dryRun).toBe(true);
    expect(word.operand).toBeUndefined();

    const live = parseArgs(['init', '--pai', '--name', 'pai-night-1']);
    expect(live.pai).toBe(true);
    expect(live.dryRun).toBeFalsy();
  });

  it('prints NOT_MINTED and does not spawn or fetch', async () => {
    const urls: string[] = [];
    global.fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      throw new Error('network');
    }) as typeof fetch;

    const client = new TrustShell({ apiUrl: 'https://engine.test' });
    for (const argv of [
      ['init', '--pai', '--dry-run'],
      ['init', '--pai', 'dry-run'],
    ]) {
      urls.length = 0;
      spawn.mockClear();
      const cap = capture();
      const code = await run(parseArgs(argv), client, cap.io);
      expect(code).toBe(0);
      expect(cap.out.join('\n')).toBe('NOT_MINTED');
      expect(cap.err).toEqual([]);
      expect(spawn).not.toHaveBeenCalled();
      expect(urls).toEqual([]);
    }
  });

  it('--help documents the dry-run as no network and NOT_MINTED', async () => {
    const cap = capture();
    const code = await run(parseArgs(['--help']), {} as never, cap.io);
    const help = cap.out.join('\n');
    expect(code).toBe(0);
    expect(help).toMatch(/--dry-run/);
    expect(help).toContain('NOT_MINTED');
    expect(help).toMatch(/No network/i);
    expect(help).not.toMatch(/staking is live/i);
  });

  it('init --pai without dry-run still spawns the register script', async () => {
    const cap = capture();
    const code = await run(
      parseArgs(['init', '--pai', '--name', 'pai-night-1']),
      new TrustShell({ apiUrl: 'https://engine.test' }),
      cap.io,
    );
    expect(code).toBe(0);
    expect(spawn).toHaveBeenCalledTimes(1);
    const args = spawn.mock.calls[0]?.[1] as string[];
    expect(args[0]).toMatch(/init-pai\.mjs$/);
    expect(args).toEqual(expect.arrayContaining(['--name', 'pai-night-1']));
    expect(cap.out.join('\n')).not.toContain('NOT_MINTED');
  });
});
