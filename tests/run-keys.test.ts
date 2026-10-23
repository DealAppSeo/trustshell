/**
 * Loop sprint 5 (claims-vs-code, 2026-10-23), SHADOW. /run sent every unlocked vault key with a
 * prompt, but the engine reads only the OpenAI and Anthropic keys (tier-1 chain; see lib/run-keys.ts).
 * Least-keys mode sends only those. Off by default, so the default behaviour is pinned here too.
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
  it('OFF (the default): sends every unlocked key, exactly as before', () => {
    expect(keysToSend(vault, false)).toEqual(vault);
    expect(Object.keys(keysToSend(vault, false))).toHaveLength(7);
  });

  it('ON: sends only the keys the engine can use, and nothing else', () => {
    expect(keysToSend(vault, true)).toEqual({ openai: 'fixture-openai', anthropic: 'fixture-anthropic' });
    expect([...ENGINE_READS_KEYS_FOR].sort()).toEqual(['anthropic', 'openai']);
  });

  it('ON: a vault holding only keys the engine cannot use sends none; a missing key is not invented', () => {
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

  it('the build-time flag defaults to OFF', () => {
    expect(process.env.NEXT_PUBLIC_RUN_LEAST_KEYS).toBeUndefined();
    expect(keysToSend(vault)).toEqual(vault);
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
