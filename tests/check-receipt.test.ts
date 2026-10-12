/**
 * The receipt under a check's answer. A vote alone is PROVISIONAL; SETTLED needs a holdout, a known
 * answer or a person, and the /check page has none of those, so it never says SETTLED. Not checked is
 * a no for a spend and a post. The copyable lines never carry the sentence.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GATE_LINE, SCORE_LINE, receiptOf } from '../lib/check-receipt';

const ROOT = join(__dirname, '..');
const SENTENCE = 'The capital of France is Paris.';

const vote = (voter: string, family: string, verdict: 'TRUE' | 'FALSE' | 'UNSURE' | 'NONE') => ({ voter, family, verdict });

describe('receiptOf', () => {
  it('a two-checker pass is PROVISIONAL, not settled, and says the score did not move', () => {
    const r = receiptOf({ label: 'pass', by: 'votes', votes: [vote('groq', 'gpt-oss', 'TRUE'), vote('cerebras', 'qwen', 'TRUE')] });
    expect(r.status).toBe('PROVISIONAL');
    expect(r.word).toBe('PROVISIONAL');
    expect(r.statusLine).toMatch(/A vote on its own is PROVISIONAL/);
    expect(r.lines).toEqual(['gpt-oss groq TRUE', 'qwen cerebras TRUE']);
    expect(r.scoreLine).toBe(SCORE_LINE);
    expect(r.gateLine).toBeNull();
  });

  it('a caught claim is equally PROVISIONAL: a vote is a vote, caught or not', () => {
    const r = receiptOf({ label: 'veto', by: 'votes', votes: [vote('groq', 'gpt-oss', 'FALSE'), vote('cerebras', 'qwen', 'FALSE')] });
    expect(r.status).toBe('PROVISIONAL');
    expect(r.lines).toEqual(['gpt-oss groq FALSE', 'qwen cerebras FALSE']);
  });

  it('a split or unsure vote is NOT CHECKED, a no for spend and post, and UNSURE reads NOT_CHECKED', () => {
    const r = receiptOf({ label: 'not-checked', by: 'votes', votes: [vote('groq', 'gpt-oss', 'TRUE'), vote('cerebras', 'qwen', 'UNSURE')] });
    expect(r.status).toBe('NOT_CHECKED');
    expect(r.word).toBe('NOT CHECKED');
    expect(r.gateLine).toBe(GATE_LINE);
    expect(r.gateLine).toMatch(/no for spending and for posting/);
    expect(r.lines).toEqual(['gpt-oss groq TRUE', 'qwen cerebras NOT_CHECKED']);
  });

  it('an equation decided by exact calculation has no vote to settle and no lines', () => {
    const r = receiptOf({ label: 'veto', by: 'arithmetic' });
    expect(r.status).toBe('EXACT_CALCULATION');
    expect(r.statusLine).toMatch(/No model was asked/);
    expect(r.lines).toEqual([]);
    expect(r.gateLine).toBeNull();
  });

  it('a check the page could not finish is NOT CHECKED and says the page got no usable answer', () => {
    const r = receiptOf({ label: 'not-checked', reason: 'network: Failed to fetch' });
    expect(r.status).toBe('NOT_CHECKED');
    expect(r.statusLine).toMatch(/did not get a usable answer/);
    expect(r.gateLine).toBe(GATE_LINE);
  });

  it('an older endpoint that sends no path is still only PROVISIONAL, never settled', () => {
    const r = receiptOf({ label: 'pass' });
    expect(r.status).toBe('PROVISIONAL');
    expect(r.statusLine).toMatch(/Nothing here shows a holdout, a known answer or a person/);
  });

  it('never says SETTLED, for any input', () => {
    const inputs = [
      { label: 'pass', by: 'votes' },
      { label: 'veto', by: 'votes' },
      { label: 'pass', by: 'arithmetic' },
      { label: 'not-checked', by: 'skipped' },
      { label: 'not-checked', by: 'deadline' },
      { label: 'not-checked', reason: 'timeout' },
      { label: 'pass' },
    ] as const;
    for (const i of inputs) {
      const r = receiptOf(i as never);
      expect(JSON.stringify(r)).not.toMatch(/\bSETTLED\b/);
      expect(r.status).not.toBe('SETTLED' as never);
    }
  });

  it('the copyable lines carry who said what and nothing else: no sentence, no id, no key', () => {
    const r = receiptOf({ label: 'pass', by: 'votes', votes: [vote('groq', 'gpt-oss', 'TRUE'), vote('cerebras', 'qwen', 'TRUE')] });
    for (const line of r.lines) {
      expect(line).not.toContain(SENTENCE);
      expect(line.split(' ')).toHaveLength(3);
      expect(line).not.toMatch(/agent|key|sk-|0x/i);
    }
  });

  it('the score line says nothing was written and that even a two-to-one vote never moves it', () => {
    expect(SCORE_LINE).toMatch(/Nothing was written to any score/);
    expect(SCORE_LINE).toMatch(/holdout, a known answer or a person/);
    expect(SCORE_LINE).toMatch(/two-to-one/);
  });
});

describe('where the receipt is printed', () => {
  const form = readFileSync(join(ROOT, 'app/check/CheckForm.tsx'), 'utf8');
  const page = readFileSync(join(ROOT, 'app/check/page.tsx'), 'utf8');
  const hero = readFileSync(join(ROOT, 'components/hero.tsx'), 'utf8');
  it('the /check page turns it on and the home page does not', () => {
    expect(page).toContain('<CheckForm receipt agent />');
    expect(form).toContain('receipt = false');
    expect(form).toContain('agent = false');
    // The home page's check (components/hero.tsx) keeps its own card unchanged: no receipt, no agent strip.
    expect(hero).toMatch(/<CheckForm samples=\{HOME_SAMPLES\} boxLabel="[^"]+" \/>/);
  });
});
