/**
 * The variant sweep: three families of secret that the first rules caught in their common form and let
 * through in a form that is just as real (XC1, acceptance of #519). Every case asserts on BOTH scrubbers,
 * src/memory/redact.ts and extension/scrub.js, and the output must be byte for byte the same.
 *
 * 1. A Google OAuth SERVICE-ACCOUNT token, `ya29.c.<long>`, has dots in its body. The rule needed ten
 *    URL-safe characters right after `ya29.`, so it stopped at the second dot and the whole token left.
 * 2. A webhook signing secret (`whsec_`) has a BASE64 body: `+`, `/` and a trailing `=`. The generic
 *    prefixed-token rule stopped at the first of them and the rest of the secret left.
 * 3. A recovery phrase split by `-`, `_`, `/`, `|`, a full stop with nothing around it, zero-width
 *    characters, or the quotes and brackets of a JSON or CSV list was not recognised: only spaces, commas
 *    and semicolons were.
 *
 * Over-redaction is checked as hard as the leak: a claim that merely mentions the word "ya29", or is
 * written in hyphenated prose, must come out byte for byte.
 */
import { containsSecret, redact } from '../src/memory/redact';
import { WORDS_12, WORDS_24, leakedWindow } from './fixtures/scrub-shapes';

const ext = require('../extension/scrub.js') as { redact: (v: unknown) => string };
const both = (text: string): string => {
  const a = redact(text);
  expect(ext.redact(text)).toBe(a); // byte for byte
  return a;
};
const rep = (n: number, ch: string) => ch.repeat(n);

describe('1. a Google OAuth token whose body has dots (service-account form)', () => {
  const SA = ['ya29', 'c', 'b0Aaekm1' + rep(20, 'Q') + '-' + rep(10, 'z') + '_' + rep(30, 'K'), rep(24, 'M')].join('.');

  it('is removed whole, and the sentence around it stays', () => {
    expect(both(`The token ${SA} was rotated.`)).toBe('The token  was rotated.');
    expect(leakedWindow(both(`x ${SA} y`), SA)).toBeNull();
  });

  it.each([
    ['one dot after the c', 'ya29.c.' + rep(40, 'a')],
    ['many segments', ['ya29', 'a0', 'Af', rep(30, 'Wq'), rep(30, 'Zk')].join('.')],
    ['dashes and underscores between dots', 'ya29.' + rep(8, 'a') + '-' + rep(8, 'b') + '.' + rep(8, 'c') + '_' + rep(8, 'd')],
    ['a long token (a real one runs to a kilobyte)', 'ya29.c.' + rep(900, 'xY9_-') + '.' + rep(100, 'k')],
  ])('%s', (_label, tok) => {
    expect(both(`Use ${tok} now`)).toBe('Use  now');
  });

  it('the common user-credential form (no dots) is still removed', () => {
    const t = 'ya29.' + 'a0Af' + rep(40, 'B');
    expect(both(`t=${t}.`)).toBe('t=');
  });

  it('containsSecret flags the dotted form, so `remember` refuses it', () => {
    expect(containsSecret(`token: ${SA}`)).toBe(true);
  });

  it.each([
    'The word ya29 is a prefix.',
    'A ya29 prefix, a ya29. prefix and the bare word ya29 all appear in this sentence about access tokens.',
    'Google tokens begin with ya29. and are long, while ya29.short is not one and ya29.1.2 is a version.',
    'See ya29. Then ya29, then ya29; then ya29.',
    'The id ya29 and the id ya29-x are both short.',
    'In 2029 the ya29 project (ya29.org is not a token) ended.',
  ])('an ordinary sentence with the word "ya29" comes out byte for byte: %s', (t) => {
    expect(both(t)).toBe(t);
    expect(containsSecret(t)).toBe(false);
  });

  it('the body needs ten characters: ya29.<9> is kept, ya29.<10> goes', () => {
    expect(both('x ya29.' + rep(9, 'a') + ' y')).toBe('x ya29.' + rep(9, 'a') + ' y');
    expect(both('x ya29.' + rep(10, 'a') + ' y')).toBe('x  y');
  });
});

describe('2. a webhook signing secret with a base64 body', () => {
  it.each([
    ['plus, slash and two equals', 'whsec_' + 'MfKQ9r8GKYqr' + '+' + 'TwjUPD8ILPZ' + '/' + 'Io2LaLaSw' + '=='],
    ['a trailing equals', 'whsec_' + 'dGhpcyBpcyBhIGZha2Ugc2VjcmV0IGJvZHk' + '='],
    ['a slash first', 'whsec_' + '/' + rep(12, 'Zk') + '+' + rep(8, 'p')],
    ['plus in the middle only', 'whsec_' + rep(10, 'aB') + '+' + rep(10, 'cD')],
    ['no base64 characters at all (the old case)', 'whsec_' + rep(32, 'q')],
    ['dashes and underscores', 'whsec_' + rep(10, 'a') + '-' + rep(10, 'b') + '_' + rep(10, 'c')],
  ])('%s: removed whole', (_label, tok) => {
    expect(both(`Signing secret: ${tok} (keep it safe).`)).toBe('Signing secret:  (keep it safe).');
    expect(leakedWindow(both(`x ${tok} y`), tok)).toBeNull();
  });

  it('the text after the secret is not eaten', () => {
    expect(both('whsec_' + rep(12, 'a') + '+' + rep(12, 'b') + '== and then more text')).toBe(' and then more text');
  });

  it('containsSecret flags it', () => {
    expect(containsSecret('whsec_' + rep(10, 'a') + '/' + rep(10, 'b'))).toBe(true);
  });

  it.each([
    'The word whsec is a prefix, and whsec_ alone is a prefix.',
    'The webhook signing secret starts with whsec_ and is shown only once, so whsec_ alone is a prefix.',
    'whsec_short is seven characters',
  ])('a mention of the prefix comes out byte for byte: %s', (t) => {
    expect(both(t)).toBe(t);
  });
});

describe('3. a recovery phrase with a separator the first rule did not know', () => {
  const GAPS: Array<[string, (w: string[]) => string]> = [
    ['hyphens', (w) => w.join('-')],
    ['underscores', (w) => w.join('_')],
    ['slashes', (w) => w.join('/')],
    ['pipes', (w) => w.join('|')],
    ['spaced pipes', (w) => w.join(' | ')],
    ['spaced hyphens', (w) => w.join(' - ')],
    ['full stops with no spaces', (w) => w.join('.')],
    ['a JSON array', (w) => JSON.stringify(w)],
    ['a pretty JSON array', (w) => JSON.stringify(w, null, 2)],
    ['a JSON array with spaces', (w) => JSON.stringify(w).replace(/","/g, '", "')],
    ['quoted CSV', (w) => w.map((x) => '"' + x + '"').join(',')],
    ['single-quoted items', (w) => w.map((x) => "'" + x + "'").join(', ')],
    ['backtick items', (w) => w.map((x) => '`' + x + '`').join(' ')],
    ['bracketed items', (w) => w.map((x) => '(' + x + ')').join(' ')],
    ['zero-width spaces', (w) => w.join('​')],
    ['zero-width joiners', (w) => w.join('‍')],
    ['a word joiner and a byte-order mark', (w) => w.map((x, i) => x + (i % 2 ? '⁠' : '﻿')).join('')],
    ['a soft hyphen', (w) => w.join('­')],
    ['spaces plus a zero-width space', (w) => w.join(' ​')],
    ['a mix of every separator', (w) => w.map((x, i) => x + ['-', '_', '/', '|', '.', ' ', ',', ';'][i % 8]).join('').slice(0, -1)],
  ];

  it.each(GAPS)('12 words split by %s are removed, the label and the tail stay', (_label, join) => {
    const out = both(`Backup: ${join(WORDS_12)} thanks`);
    for (const w of WORDS_12) expect(out).not.toContain(w);
    expect(out.startsWith('Backup:')).toBe(true);
    expect(out.endsWith('thanks')).toBe(true);
  });

  it.each(GAPS)('24 words split by %s are removed', (_label, join) => {
    const out = both(join(WORDS_24));
    for (const w of WORDS_24) expect(out).not.toContain(w);
  });

  it('plain separators leave exactly the text around them', () => {
    expect(both(`Backup: ${WORDS_12.join('-')} thanks`)).toBe('Backup:  thanks');
    expect(both(`Backup: ${WORDS_12.join('|')} thanks`)).toBe('Backup:  thanks');
    expect(both(`Backup: ${WORDS_12.join('.')} thanks`)).toBe('Backup:  thanks');
  });

  it('numbered lists with the new separators leave nothing behind', () => {
    const numbered = WORDS_12.map((w, i) => `${i + 1}. ${w}`).join(' | ');
    const out = both(`Backup: ${numbered}`);
    for (const w of WORDS_12) expect(out).not.toContain(w);
  });

  it('containsSecret flags each, so `remember` refuses them', () => {
    for (const [, join] of GAPS) expect(containsSecret(`note: ${join(WORDS_12)}`)).toBe(true);
  });

  describe('and ordinary text with those characters is left alone', () => {
    it.each([
      ['hyphenated prose', 'A well-known, long-term, state-of-the-art, first-rate, hand-written, so-called, easy-going and low-cost design was chosen for the about-face.'],
      ['two short hyphenated runs split by a word that is not on the list', `${WORDS_12.slice(0, 6).join('-')}-zzz-${WORDS_12.slice(6).join('-')}`],
      ['two short pipe runs split by a word that is not on the list', `${WORDS_12.slice(0, 6).join('|')}|zzz|${WORDS_12.slice(6).join('|')}`],
      ['eleven words, hyphenated', WORDS_12.slice(0, 11).join('-')],
      ['eleven words in a JSON array', JSON.stringify(WORDS_12.slice(0, 11))],
      ['eleven words, zero-width separated', WORDS_12.slice(0, 11).join('​')],
      ['slashes in prose', 'The pairs and/or, either/or, he/she, yes/no, input/output, read/write and true/false are all just slashes in prose.'],
      ['a table row', 'The list a | b | c | d | e | f | g | h | i | j | k | l | m is a table row, not a phrase.'],
      ['snake_case names', 'The note_taking_tool, the read_only_flag and the build_step_name are snake_case names.'],
      ['twelve list words, each its own sentence', WORDS_12.map((w) => w + '.').join(' ')],
      ['twelve list words, each its own sentence, with capitals', WORDS_12.map((w) => w[0]!.toUpperCase() + w.slice(1) + '.').join(' ')],
      ['a full stop then a space is a sentence boundary', `${WORDS_12.slice(0, 6).join('. ')}. ${WORDS_12.slice(6).join('. ')}`],
      ['a colon between words', WORDS_12.join(': ')],
      ['file paths', 'See src/lib/audit.ts, src/lib/trustshell.ts and tests/payment-amount-strict.test.ts for the three gates.'],
    ])('%s', (_label, t) => {
      expect(both(t)).toBe(t);
      expect(containsSecret(t)).toBe(false);
    });
  });
});

describe('linear, not quadratic, on the new rules (bounded classes, nothing nested)', () => {
  // Inputs the NEW scans own. (The pre-existing EMAIL rule is quadratic on a very long unbroken run of
  // `.`, `-` or `_`; that is recorded in the PR and is not what this file measures.)
  const timed = (text: string): number => {
    const t0 = Date.now();
    redact(text);
    ext.redact(text);
    return Date.now() - t0;
  };

  it('a very long run of words split by pipes, slashes and quotes', () => {
    const t = ('"abandon"|"ability"/' + 'word, ').repeat(40000);
    expect(timed(t)).toBeLessThan(4000);
  });

  it('a very long gap of separators between two list words', () => {
    const t = 'abandon' + ' |"\'/,;'.repeat(100000) + 'ability';
    expect(timed(t)).toBeLessThan(4000);
  });

  it('a very long run of zero-width characters', () => {
    expect(timed('abandon' + '​'.repeat(300000) + 'ability')).toBeLessThan(4000);
  });

  it('many ya29. and whsec_ prefixes with short bodies', () => {
    expect(timed('ya29.short whsec_x '.repeat(30000))).toBeLessThan(4000);
  });

  it('one very long ya29 or whsec_ body is removed in one pass', () => {
    expect(redact('a ya29.' + rep(200000, 'x.') + ' b')).toBe('a  b');
    expect(redact('a whsec_' + rep(200000, '+/') + ' b')).toBe('a  b');
  });

  it('a long phrase that never completes (eleven words, repeated) is cheap and untouched', () => {
    const t = (WORDS_12.slice(0, 11).join('|') + ' zzz ').repeat(8000);
    expect(redact(t)).toBe(t);
    expect(timed(t)).toBeLessThan(4000);
  });
});
