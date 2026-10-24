/**
 * What the site says about which provider keys leave the browser, held to what the code does.
 *
 * The code (lib/run-keys.ts, app/run/[agentId]/page.tsx): on Auto (the default) and Paid only, /run
 * sends the vault's OpenAI and Anthropic keys with the prompt, because those are the only two the engine
 * reads (repid-engine src/providers/router.ts, tier1Adapters). The other five providers' keys are not sent
 * with a prompt. Test sends the one key being tested. Free only sends none.
 *
 * That is true by default in code (#629): only a build with NEXT_PUBLIC_RUN_LEAST_KEYS=0 sends every key.
 * (It was first true because the Vercel variable was set 2026-10-24, rebuilt and read back from the live
 * bundle; the default no longer depends on that variable.) Before that, /run sent every unlocked key, and three of these
 * surfaces said so; two others said "the one key needed", which was never true (up to two go), and one
 * said provider keys "never reach our servers", which was never true. Each assertion below names the
 * sentence it keeps from coming back.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE_READS_KEYS_FOR } from '../lib/run-keys';

const ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\s+/g, ' ');

const SURFACES = [
  'app/connect/page.tsx',
  'app/connect/layout.tsx',
  'lib/glossary.ts',
  'components/privacy-posture.tsx',
  'app/settings/page.tsx',
  'app/mission/page.tsx',
  'docs/KNOWN-LIMITS.md',
  'lib/founder-mode.ts',
];

describe('keys: the copy says which keys go, and it is the two the engine reads', () => {
  it('the two names in the copy are the two in the code', () => {
    expect([...ENGINE_READS_KEYS_FOR].sort()).toEqual(['anthropic', 'openai']);
  });

  it.each(SURFACES)('%s no longer says every key goes, or that only one does, or that none do', (rel) => {
    const text = read(rel);
    expect(text).not.toMatch(/sends every unlocked key/i);
    expect(text).not.toMatch(/the one key needed/i);
    expect(text).not.toMatch(/key is sent with that one request/i);
    expect(text).not.toMatch(/provider keys are stored in your browser and never reach our servers/i);
    expect(text).not.toMatch(/never transmitted/i);
    expect(text).not.toMatch(/accurate claim is \*?"we never receive your keys"/i);
  });

  it('the connect page names the four cases and the two providers a prompt sends', () => {
    const text = read('app/connect/page.tsx');
    for (const word of ['Test', 'Auto', 'Paid only', 'Free only']) expect(text).toContain(word);
    expect(text).toContain('your OpenAI and Anthropic keys');
    expect(text).toMatch(/other keys are not sent with a prompt/i);
  });

  it('the glossary, the privacy card and settings say the same two', () => {
    expect(read('lib/glossary.ts')).toContain('your OpenAI and Anthropic keys');
    expect(read('components/privacy-posture.tsx')).toContain('your OpenAI and Anthropic keys');
    expect(read('app/settings/page.tsx')).toContain('your OpenAI and Anthropic keys');
  });

  it('the privacy card says a provider key does reach our engine when it is used', () => {
    expect(read('components/privacy-posture.tsx')).toMatch(/a key is sent to our engine when you use it/i);
  });

  it('the known-limits page says the accurate claim is "we receive them only when you use them"', () => {
    expect(read('docs/KNOWN-LIMITS.md')).toMatch(/we do not store your keys, and we receive them only when you use them/i);
  });

  it('the run page still sends keys through keysToSend (so the copy has code behind it)', () => {
    const run = read('app/run/[agentId]/page.tsx');
    expect(run).toContain('user_paid_keys = keysToSend(keys)');
  });
});
