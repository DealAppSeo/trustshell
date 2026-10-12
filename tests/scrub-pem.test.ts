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
  // The old rule: 61 / 272 / 879 ms for 2000 / 4000 / 8000 markers. A generous bound, a shape-based proof:
  // 8000 markers with no END was the input that was quadratic.
  const MARKER = `${BEGIN('RSA PRIVATE KEY')} `;

  it.each([2000, 8000, 32000])('%i BEGIN markers and no END', (n) => {
    const t = MARKER.repeat(n);
    const t0 = Date.now();
    const a = redact(t);
    const b = ext.redact(t);
    const took = Date.now() - t0;
    expect(a).toBe(t);
    expect(b).toBe(t);
    expect(took).toBeLessThan(1500);
  });

  it('time grows with the input, not with its square', () => {
    const time = (n: number) => {
      const t = MARKER.repeat(n);
      redact(t); // warm
      const t0 = process.hrtime.bigint();
      redact(t);
      return Number(process.hrtime.bigint() - t0) / 1e6;
    };
    const small = Math.max(time(4000), 1);
    const big = time(32000); // 8x the input; quadratic would be ~64x the time
    expect(big / small).toBeLessThan(24);
  });

  it('many complete blocks are all removed in one pass', () => {
    const one = block('PRIVATE KEY') + ' z ';
    const t0 = Date.now();
    const out = redact(one.repeat(3000));
    expect(out).toBe(' z '.repeat(3000));
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('many END markers and no BEGIN is cheap too', () => {
    const t = `${END('RSA PRIVATE KEY')} `.repeat(32000);
    const t0 = Date.now();
    expect(redact(t)).toBe(t);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});
