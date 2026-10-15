/**
 * PEM private-key blocks: the scan that replaced the one-regex form.
 *
 * The old rule was `-----BEGIN ... PRIVATE KEY-----[\s\S]*?-----END ... PRIVATE KEY-----`. On a string of many
 * BEGIN markers with no END, every marker re-scanned to the end of the text: quadratic (CodeQL
 * js/polynomial-redos on src/memory/redact.ts, and 879 ms at 216,000 characters). It is now a two-step
 * linear scan (BEGIN, then the nearest END after it). These tests pin both halves: it still removes every
 * block the old rule removed (src/ and the extension port agree), and it no longer degrades on the input
 * that made the old rule quadratic.
 */
import { redact, containsSecret } from '../src/memory/redact';
import { LINEAR_LIMIT, growth } from './growth';

type Scrub = { redact: (v: unknown) => string; containsSecret?: (v: string) => boolean };
const ext = require('../extension/scrub.js') as Scrub;

const BODY = 'MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC7VJTUt9Us8cKj\nMzEfYyjiWA4R4/M2bS1GB4t7NXp98C3SC6dVMvDuictGeurT8jNbvJZHtCSuYEvu\n';
// The markers are assembled, never written out whole: a literal BEGIN..END pair in source is exactly what the
// repository's secret scan (rule private-key) is built to refuse, even when the body is made up.
const D = '-----';
const BEGIN = (kind: string) => `${D}BEGIN ${kind}${D}`;
const END = (kind: string) => `${D}END ${kind}${D}`;
const block = (kind: string) => `${BEGIN(kind)}\n${BODY}${END(kind)}`;

const KINDS = ['PRIVATE KEY', 'RSA PRIVATE KEY', 'EC PRIVATE KEY', 'OPENSSH PRIVATE KEY', 'ENCRYPTED PRIVATE KEY', 'DSA PRIVATE KEY'];

describe('PEM private-key blocks are removed, on both scrubbers', () => {
  it.each(KINDS)('%s', (kind) => {
    const t = `before\n${block(kind)}\nafter`;
    expect(redact(t)).toBe('before\n\nafter');
    expect(ext.redact(t)).toBe(redact(t));
    expect(containsSecret(t)).toBe(true);
  });

  it('removes several blocks in one text and keeps what is between them', () => {
    const t = `a ${block('RSA PRIVATE KEY')} b ${block('EC PRIVATE KEY')} c`;
    expect(redact(t)).toBe('a  b  c');
    expect(ext.redact(t)).toBe(redact(t));
  });

  it('a block whose body contains another BEGIN marker still goes to the nearest END', () => {
    const t = `x ${BEGIN('PRIVATE KEY')} junk ${BEGIN('PRIVATE KEY')}\n${BODY}${END('PRIVATE KEY')} y`;
    expect(redact(t)).toBe('x  y');
    expect(ext.redact(t)).toBe(redact(t));
  });

  it('an END marker with no BEGIN before it is left alone', () => {
    const t = `text ${END('PRIVATE KEY')} more text`;
    expect(redact(t)).toBe(t);
    expect(ext.redact(t)).toBe(t);
    expect(containsSecret(t)).toBe(false);
  });

  it('a PUBLIC key block is not a private key and is kept', () => {
    const t = `${BEGIN('PUBLIC KEY')}\n${BODY}${END('PUBLIC KEY')}`;
    expect(redact(t)).toBe(t);
    expect(ext.redact(t)).toBe(t);
    expect(containsSecret(t)).toBe(false);
  });

  it('a lone BEGIN with no END behaves as the one-regex form did: nothing to remove, text kept', () => {
    // Recorded rather than endorsed: a truncated paste leaves the BEGIN line and body in place. Widening the
    // rule to eat to the end of the text is a separate decision; this change does not alter coverage.
    const t = `${BEGIN('PRIVATE KEY')}\n${BODY}`;
    expect(redact(t)).toBe(t);
    expect(ext.redact(t)).toBe(redact(t));
  });
});

describe('the PEM scan is linear', () => {
  jest.setTimeout(180000);
  // The old rule: 61 / 272 / 879 ms for 2000 / 4000 / 8000 markers, i.e. quadratic. Timing is a growth
  // ratio on 8x the input with interleaved medians (tests/growth.ts), never absolute milliseconds, so a
  // busy machine cannot fail linear code and a quadratic scan still reads ~64 against a limit of 24.
  const MARKER = `${BEGIN('RSA PRIVATE KEY')} `;
  const ENDS = `${END('RSA PRIVATE KEY')} `;
  const ONE = block('PRIVATE KEY') + ' z ';

  it.each([2000, 8000, 32000])('%i BEGIN markers and no END: nothing removed, on both scrubbers', (n) => {
    const t = MARKER.repeat(n);
    expect(redact(t)).toBe(t);
    expect(ext.redact(t)).toBe(t);
  });

  it('many complete blocks are all removed in one pass', () => {
    expect(redact(ONE.repeat(3000))).toBe(' z '.repeat(3000));
  });

  it('many END markers and no BEGIN: nothing removed', () => {
    const t = ENDS.repeat(32000);
    expect(redact(t)).toBe(t);
  });

  it.each([
    ['BEGIN markers and no END', (n: number) => MARKER.repeat(n), 4000],
    ['END markers and no BEGIN', (n: number) => ENDS.repeat(n), 8000],
    ['complete blocks', (n: number) => ONE.repeat(n), 3000],
  ] as Array<[string, (n: number) => string, number]>)('time grows with the input, not its square: %s', (label, make, n) => {
    expect(growth(`pem ts ${label}`, redact, make, n).ratio).toBeLessThan(LINEAR_LIMIT);
    expect(growth(`pem ext ${label}`, ext.redact, make, n).ratio).toBeLessThan(LINEAR_LIMIT);
  });
});
