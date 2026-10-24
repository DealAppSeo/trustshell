/**
 * /run sent every unlocked vault key with a prompt, but the engine reads only the OpenAI and Anthropic
 * keys (tier-1 chain; see lib/run-keys.ts). Loop sprint 5 (2026-10-23) added least-keys mode behind a flag
 * that was off by default. It is now the DEFAULT: only an explicit NEXT_PUBLIC_RUN_LEAST_KEYS=0 at build
 * time sends everything again. Both ends are pinned here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE_READS_KEYS_FOR, keysToSend } from '../lib/run-keys';
import type { ProviderKeys } from '../lib/vault';

// Fixture values, not credentials.
const vault: ProviderKeys = {
  openai: 'fixture-openai',
  anthropic: 'fixture-anthropic',
  groq: 'fixture-groq',
  gemini: 'fixture-gemini',
  cerebras: 'fixture-cerebras',
  deepseek: 'fixture-deepseek',
  cohere: 'fixture-cohere',
};

describe('keysToSend', () => {
  it('the DEFAULT (no argument, no env): sends only the keys the engine can use', () => {
    expect(process.env.NEXT_PUBLIC_RUN_LEAST_KEYS).toBeUndefined();
    expect(keysToSend(vault)).toEqual({ openai: 'fixture-openai', anthropic: 'fixture-anthropic' });
  });

  it('opted out (leastKeys false): sends every unlocked key, as it did before', () => {
    expect(keysToSend(vault, false)).toEqual(vault);
    expect(Object.keys(keysToSend(vault, false))).toHaveLength(7);
  });

  it('least-keys: sends only the keys the engine can use, and nothing else', () => {
    expect(keysToSend(vault, true)).toEqual({ openai: 'fixture-openai', anthropic: 'fixture-anthropic' });
    expect([...ENGINE_READS_KEYS_FOR].sort()).toEqual(['anthropic', 'openai']);
  });

  it('least-keys: a vault holding only keys the engine cannot use sends none; a missing key is not invented', () => {
    expect(keysToSend({ groq: 'g', gemini: 'm' }, true)).toEqual({});
    expect(keysToSend({ anthropic: 'a' }, true)).toEqual({ anthropic: 'a' });
    expect(keysToSend({ openai: '' }, true)).toEqual({});
  });

  it('a locked vault (null) sends nothing either way', () => {
    expect(keysToSend(null, false)).toEqual({});
    expect(keysToSend(null, true)).toEqual({});
  });

  it('does not change the vault it was given', () => {
    const copy = { ...vault };
    keysToSend(vault, true);
    expect(vault).toEqual(copy);
  });

  // LEAST_KEYS is read once, when the module loads (and at build time in the app), so each case loads a
  // fresh copy of the module under its own environment.
  const loaded = (flag: string | undefined) => {
    const prev = process.env.NEXT_PUBLIC_RUN_LEAST_KEYS;
    if (flag === undefined) delete process.env.NEXT_PUBLIC_RUN_LEAST_KEYS;
    else process.env.NEXT_PUBLIC_RUN_LEAST_KEYS = flag;
    try {
      let mod: typeof import('../lib/run-keys') | undefined;
      jest.isolateModules(() => {
        mod = require('../lib/run-keys');
      });
      return mod!;
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_RUN_LEAST_KEYS;
      else process.env.NEXT_PUBLIC_RUN_LEAST_KEYS = prev;
    }
  };

  it.each([[undefined], ['1'], [''], ['true']])('the build-time flag %p keeps least-keys ON: only "0" turns it off', (flag) => {
    const m = loaded(flag);
    expect(m.LEAST_KEYS).toBe(true);
    expect(m.keysToSend(vault)).toEqual({ openai: 'fixture-openai', anthropic: 'fixture-anthropic' });
  });

  it('the build-time flag "0" is the one opt-out: every unlocked key goes again', () => {
    const m = loaded('0');
    expect(m.LEAST_KEYS).toBe(false);
    expect(m.keysToSend(vault)).toEqual(vault);
  });
});

describe('the helper has a caller (not built and left unwired)', () => {
  const run = readFileSync(join(__dirname, '..', 'app', 'run', '[agentId]', 'page.tsx'), 'utf8');

  it('/run builds user_paid_keys through keysToSend, not from the raw vault', () => {
    expect(run).toContain("from '@/lib/run-keys'");
    expect(run).toContain('user_paid_keys = keysToSend(keys)');
    expect(run).not.toMatch(/user_paid_keys\s*=\s*keys\b/);
  });
});
