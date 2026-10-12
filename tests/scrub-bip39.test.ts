/**
 * The seed-phrase rule: a run of 12 or more consecutive BIP39 words is removed, in the TypeScript
 * scrubber and in its extension port, and ordinary prose is left alone. The word list itself is
 * pinned, so a typo cannot quietly become a hole.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BIP39_ENGLISH } from '../src/memory/bip39';
import { containsSecret, redact } from '../src/memory/redact';
import { WORDS_12, WORDS_24 } from './fixtures/scrub-shapes';

const ext = require('../extension/scrub.js') as { redact: (v: unknown) => string };
const words = BIP39_ENGLISH.split(' ');
const both = (text: string) => {
  const a = redact(text);
  expect(ext.redact(text)).toBe(a); // the extension port agrees, byte for byte
  return a;
};

describe('the BIP39 word list', () => {
  it('is the published English list: 2048 words, first abandon, last zoo, and its SHA-256', () => {
    expect(words).toHaveLength(2048);
    expect(words[0]).toBe('abandon');
    expect(words[2047]).toBe('zoo');
    expect(new Set(words).size).toBe(2048);
    expect(words.every((w) => /^[a-z]{3,8}$/.test(w))).toBe(true);
    // bitcoin/bips bip-0039/english.txt: one word per line, a trailing newline.
    expect(createHash('sha256').update(words.join('\n') + '\n').digest('hex')).toBe('2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda');
  });

  it('is the same list in extension/scrub.js', () => {
    const js = readFileSync(join(__dirname, '../extension/scrub.js'), 'utf8');
    const m = /const BIP39_ENGLISH = \[([\s\S]*?)\]\.join\(' '\);/.exec(js);
    expect(m).not.toBeNull();
    const fromJs = [...m![1]!.matchAll(/'([^']*)'/g)].map((x) => x[1]).join(' ');
    expect(fromJs).toBe(BIP39_ENGLISH);
  });
});

describe('a run of 12 or more BIP39 words is removed', () => {
  const run = (n: number) => words.slice(100, 100 + n).join(' ');

  it('12, 15, 18, 21 and 24 words, space-separated', () => {
    for (const n of [12, 15, 18, 21, 24]) {
      const out = both(`my wallet words ${run(n)} thanks`);
      expect(out).toBe('my wallet words  thanks');
    }
  });

  it('comma-separated, semicolon-separated, newline-separated and tab-separated', () => {
    const w = WORDS_12;
    for (const sep of [', ', ',', '; ', '\n', '\t', ' ,  ']) {
      const out = both(`Backup: ${w.join(sep)} thanks`);
      for (const word of w) expect(out).not.toContain(word);
      expect(out).toContain('Backup:');
      expect(out).toContain('thanks');
    }
  });

  it('with a label, the label stays and the words go', () => {
    expect(both('My seed phrase: ' + WORDS_12.join(' ') + ' is backed up.')).toBe('My seed phrase:  is backed up.');
    expect(both('Recovery words = ' + WORDS_24.join(', '))).toBe('Recovery words = ');
  });

  it('numbered lists leave nothing behind', () => {
    const numbered = WORDS_12.map((w, i) => `${i + 1}. ${w}`).join(' ');
    const out = both(`Backup: ${numbered}`);
    for (const w of WORDS_12) expect(out).not.toContain(w);
    expect(out).not.toMatch(/\d/);
    const paren = WORDS_12.map((w, i) => `${i + 1}) ${w}`).join('\n');
    expect(both(paren)).not.toMatch(/[a-z]{4}/);
  });

  it('upper and mixed case', () => {
    expect(both(WORDS_12.map((w) => w.toUpperCase()).join(' '))).toBe('');
    expect(both(WORDS_12.map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' '))).toBe('');
  });

  it('two phrases in one message, and a phrase inside ordinary prose', () => {
    // Neighbouring words are chosen off the list (a list word next to a phrase is part of the run).
    expect(both(`Backup ${WORDS_12.join(' ')} thanks maybe ${WORDS_24.join(' ')} done.`)).toBe('Backup  thanks maybe  done.');
    expect(both(`Notes from the meeting: ${WORDS_12.join(' ')}. Thanks again.`)).toBe('Notes from the meeting: . Thanks again.');
  });

  it('containsSecret flags it, so `remember` refuses it', () => {
    expect(containsSecret(`note: ${WORDS_12.join(' ')}`)).toBe(true);
    expect(containsSecret(`note: ${WORDS_12.slice(0, 11).join(' ')}`)).toBe(false);
  });
});

describe('ordinary text is left alone', () => {
  it('11 words is not a seed phrase', () => {
    const eleven = WORDS_12.slice(0, 11).join(' ');
    expect(both(eleven)).toBe(eleven);
  });

  it('a run broken by a word that is not on the list is two short runs', () => {
    const broken = [...WORDS_12.slice(0, 6), 'the', ...WORDS_12.slice(6)].join(' ');
    expect(both(broken)).toBe(broken);
  });

  it('a run broken by a full stop or a colon is two short runs', () => {
    const t = `${WORDS_12.slice(0, 6).join(' ')}. ${WORDS_12.slice(6).join(' ')}`;
    expect(both(t)).toBe(t);
    const c = `${WORDS_12.slice(0, 6).join(' ')}: ${WORDS_12.slice(6).join(' ')}`;
    expect(both(c)).toBe(c);
  });

  it('words that look alike but are not on the list do not count', () => {
    const t = 'abandons abilities ables abouts aboves absents absorbs abstracts absurds abuses accesses accidents';
    expect(both(t)).toBe(t);
  });

  it('long ordinary sentences are untouched', () => {
    for (const t of [
      'The quick brown fox jumps over the lazy dog while the sun sets slowly behind the distant mountains.',
      'We should harvest the forest data before the gadget review in autumn, said the manager to the whole team.',
      'Marking a $100 item up 50% and then down 50% brings it back to $100, which is false.',
      'About above absent: the three words were used in the first sentence of the report.',
    ]) {
      expect(both(t)).toBe(t);
    }
  });
});

describe('the seed-phrase scan is linear, not quadratic', () => {
  it('scrubs a very long run of words, commas and numbered words in well under a few seconds', () => {
    // Letters, spaces, commas and digits only. (Other rules in this file are not linear on a very long
    // unbroken run of `.`/`-`/`_` characters: see the note in the PR. This test is about the new scan.)
    const noise = 'word, '.repeat(40000) + 'zzz yyy '.repeat(40000) + '1. abandon 2. '.repeat(5000);
    const t0 = Date.now();
    redact(noise);
    ext.redact(noise);
    expect(Date.now() - t0).toBeLessThan(4000);
  });

  it('many separate short runs do not make it slow either', () => {
    const noise = (WORDS_12.slice(0, 11).join(' ') + ' zzz ').repeat(8000);
    const t0 = Date.now();
    expect(redact(noise)).toBe(noise);
    expect(Date.now() - t0).toBeLessThan(4000);
  });

  it('many separate full runs are all removed, and slowly growing text stays cheap', () => {
    const one = WORDS_12.join(' ') + ' zzz ';
    const t0 = Date.now();
    const out = redact(one.repeat(3000));
    expect(out).toBe(' zzz '.repeat(3000));
    expect(Date.now() - t0).toBeLessThan(4000);
  });
});
