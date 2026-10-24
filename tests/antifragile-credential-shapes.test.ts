/**
 * Antifragile night, lane A, cycle 3 (2026-10-24). The credential detector is a list of SHAPES (src/memory/redact.ts says
 * so). It refused an OpenAI-style key, a GitHub token, a labelled `GROQ_API_KEY=` -- and stored, or sent on, a bare Groq,
 * Cerebras, xAI, Perplexity, Fireworks, Supabase, Tavily or Replicate key: the providers this ecosystem is built on, and
 * shapes the loop's own scrubber already knew. `remember` and `bundle export` rely on the same detector ("a bundle never
 * carries credentials"), and the redactor runs on text before `check "<sentence>"` sends it to the hosted engine.
 * Corpus fixture af-review-remember-accepts-provider-keys.
 *
 * Every key below is fake and assembled from parts at runtime, so no secret-shaped literal sits in this file.
 */
import { refusedValue } from '../src/cli/remember';
import { containsSecret, redact } from '../src/memory/redact';

const scrubJs = require('../extension/scrub.js') as { redact: (v: unknown) => string };
const j = (...p: string[]) => p.join('');
const body = (n: number, alphabet: string) => Array.from({ length: n }, (_, i) => alphabet[i % alphabet.length]).join('');
const AN = 'aB1';
const HEX = 'abcdef0123456789';

const KEYS: Array<[string, string]> = [
  ['Groq', j('gs', 'k_', body(52, AN))],
  ['Cerebras', j('cs', 'k-', body(48, 'ab1'))],
  ['xAI', j('xa', 'i-', body(80, AN))],
  ['Perplexity', j('pp', 'lx-', body(48, AN))],
  ['Fireworks', j('f', 'w_', body(24, AN))],
  ['Supabase', j('sb', 'p_', body(40, HEX))],
  ['Tavily', j('tv', 'ly-dev-', body(28, AN))],
  ['Replicate', j('r', '8_', body(37, AN))],
];

describe('antifragile: a bare provider API key is a credential shape', () => {
  it('control: shapes the detector already knows are still refused and removed', () => {
    const known = j('s', 'k-', body(48, AN));
    expect(refusedValue(known)).toBe(true);
    expect(redact(`my key ${known} ok`)).not.toContain(known);
  });

  it.each(KEYS)('%s key: remember refuses it, and redact removes it', (_name, key) => {
    expect(refusedValue(key)).toBe(true);
    expect(containsSecret(key)).toBe(true);
    const out = redact(`please check that ${key} is rotated`);
    expect(out).not.toContain(key);
    expect(out).toContain('please check that');
  });

  it.each(KEYS)('%s key: the Chrome extension port removes it too (one scrubber, every door)', (_name, key) => {
    const text = `a note with ${key} in it`;
    expect(scrubJs.redact(text)).toBe(redact(text));
    expect(scrubJs.redact(text)).not.toContain(key);
  });

  it('the label that names a key is not enough on its own to refuse an unrelated word', () => {
    // Ordinary words and identifiers that merely share a prefix with a key stay readable: over-redaction is safe, but a
    // `fw_update_package` in a claim about a build should survive.
    for (const t of ['fw_update_package', 'fw_checked_status_flag', 'gsk_', 'gsk_short', 'csk-ok', 'xai-grok', 'pplx-api', 'sbp_12345', 'tvly-x', 'r8_ready_to_go']) {
      expect(refusedValue(t)).toBe(false);
      expect(redact(`the value is ${t} today`)).toBe(`the value is ${t} today`);
    }
  });
});
