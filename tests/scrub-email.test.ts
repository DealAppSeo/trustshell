/**
 * X-3 (XC1 ledger): the scrubber's EMAIL rule was QUADRATIC.
 *
 *     /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
 *
 * The local part `[A-Za-z0-9._%+-]+` is anchored only by a word boundary, so on a long run of those characters
 * with no `@` it re-scanned to the end of the run from EVERY word-boundary position: about 1.6 s at 50,000
 * characters, 6 s at 100,000, 28 s at 200,000 (and the same in extension/scrub.js). The Chrome extension runs
 * the scrubber on the page's MAIN THREAD for every reply, and a reply the user does not control (a summarised
 * document, a prompt injection) can be that long, so a hostile reply could stall the chat tab for tens of
 * seconds. This is the twin of the PEM quadratic fixed in #519.
 *
 * The rule is now bounded by the limits of an address itself (RFC 5321): local part up to 64 characters, the
 * domain up to 253, a top-level label up to 63. Every quantifier is bounded, so each start position scans a
 * bounded amount and the whole is linear. For anything that IS an address, it removes exactly what it did
 * before; this file pins that with the old pattern as an oracle.
 */
import { containsSecret, redact } from '../src/memory/redact';

const ext = require('../extension/scrub.js') as { redact: (v: unknown) => string };
const both = (text: string): string => {
  const a = redact(text);
  expect(ext.redact(text)).toBe(a); // byte for byte
  return a;
};

/** The pattern before the fix. Kept ONLY as the oracle for "removes exactly what it did before". */
const OLD_EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

describe('ordinary email addresses are still removed, on both scrubbers', () => {
  it.each([
    ['a plain address', 'Mail jane@example.com now', 'Mail  now'],
    ['dots in the local part', 'Mail jane.doe@example.com now', 'Mail  now'],
    ['a plus tag', 'Mail jane.doe+tag@example.com now', 'Mail  now'],
    ['a percent and underscore', 'Mail jane_doe%x@example.com now', 'Mail  now'],
    ['a hyphen in the domain', 'Mail jane@my-company.example.org now', 'Mail  now'],
    ['subdomains and a two-label tld', 'Mail jane.doe+tag@sub.example.co.uk, thanks.', 'Mail , thanks.'],
    ['upper case', 'Mail JANE.DOE@EXAMPLE.COM now', 'Mail  now'],
    ['a two-letter tld', 'Mail j@x.io now', 'Mail  now'],
    ['a long tld', 'Mail jane@example.photography now', 'Mail  now'],
    ['digits', 'Mail j4ne99@ex4mple.com now', 'Mail  now'],
    ['at the start', 'jane@example.com wrote this', ' wrote this'],
    ['at the end', 'Write to jane@example.com', 'Write to '],
    ['two in one sentence', 'From a@example.com to b.c@example.org today', 'From  to  today'],
    ['inside angle brackets', 'From Jane <jane@example.com> today', 'From Jane <> today'],
    ['inside quotes', 'The address "jane@example.com" is hers', 'The address "" is hers'],
    ['followed by a full stop', 'Reach me at jane@example.com.', 'Reach me at .'],
    // z, not a: sixty-four hex characters are a different secret (a key) and another rule would take them first
    ['a local part of exactly 64 characters', 'x ' + 'z'.repeat(64) + '@example.com y', 'x  y'],
    ['a domain of many labels', 'x jane@a.b.c.d.e.f.example.com y', 'x  y'],
  ])('%s', (_label, text, expected) => {
    expect(both(text)).toBe(expected);
  });

  it('containsSecret does NOT flag an email: it is personal data, not a credential, so `remember` keeps it', () => {
    expect(containsSecret('write to jane@example.com')).toBe(false);
  });

  it.each([
    'The ratio is 3@4 and the tag is @mention, plus user@host without a tld.',
    'Use the at sign (@) to mention someone, e.g. @jane or @jane.doe.',
    'Meet at 5pm @ the cafe, or at noon @ home.',
    'a@b is not an address, and neither is @example.com',
    'Version 1.2.3-beta.4+build.5 was tagged on the 1st.',
  ])('text that only looks a little like an address is kept: %s', (t) => {
    expect(both(t)).toBe(t);
  });
});

describe('it removes exactly what the unbounded rule removed (oracle: the old pattern)', () => {
  // A deterministic generator over an alphabet that no OTHER rule in redact() reacts to (no digits, no
  // labels), so `redact(s)` and `s.replace(OLD_EMAIL, '')` can be compared directly. Every string is at most
  // 60 characters, which is inside the new bounds, so the two must agree on every one.
  let state = 12345;
  const rnd = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const PIECES = ['a', 'b', 'c', 'jane', 'doe', '.', '.', '-', '_', '+', '%', '@', '@', ' ', ' ', 'com', 'org', 'io', 'x.y', ',', '<', '>'];
  const gen = (): string => {
    let s = '';
    const target = 1 + Math.floor(rnd() * 58);
    while (s.length < target) s += PIECES[Math.floor(rnd() * PIECES.length)];
    return s.slice(0, 60);
  };

  it('30,000 random strings agree with the old pattern', () => {
    const disagreements: string[] = [];
    let withAnAddress = 0;
    for (let i = 0; i < 30000; i += 1) {
      const s = gen();
      const want = s.replace(OLD_EMAIL, '');
      if (want !== s) withAnAddress += 1;
      if (redact(s) !== want) disagreements.push(JSON.stringify(s));
      if (disagreements.length > 5) break;
    }
    expect(disagreements).toEqual([]);
    // The generator really does produce addresses, so "agree" is not agreement on nothing.
    expect(withAnAddress).toBeGreaterThan(1000);
  });

  it('the extension port agrees too on a sample of them', () => {
    for (let i = 0; i < 3000; i += 1) {
      const s = gen();
      expect(ext.redact(s)).toBe(s.replace(OLD_EMAIL, ''));
    }
  });
});

describe('the limits of an address are the limits of the rule', () => {
  // These pin DELIBERATE limits so nobody mistakes them for accidents. Each is outside RFC 5321, so none is
  // an address a person can have. z, not a/c: sixty-four hex characters are a different secret (a key) and
  // another rule would take them first.
  it('a local part of 65 characters with no word boundary in it is not matched (an address cannot have one)', () => {
    const t = 'x ' + 'z'.repeat(65) + '@example.com y';
    expect(both(t)).toBe(t);
  });

  it('a local part over 64 characters WITH word boundaries in it: the last 64 and the domain still go', () => {
    const out = both('x ' + 'ab.'.repeat(30) + 'cd@example.com y');
    expect(out).not.toContain('@');
    expect(out).not.toContain('example');
    expect(out.endsWith(' y')).toBe(true);
    expect(out.length).toBeLessThan(40); // the last 64 of the 92-character local part went, its leading excess stays
  });

  it('a top-level label of 64 letters is not an address and is kept; 63 is removed', () => {
    expect(both('x jane@example.' + 'z'.repeat(63) + ' y')).toBe('x  y');
    const long = 'x jane@example.' + 'z'.repeat(64) + ' y';
    expect(both(long)).toBe(long);
  });

  it('a domain over 253 characters is not a domain: the local part and the first 253 characters still go', () => {
    const out = both('x jane@' + 'ab.'.repeat(100) + 'com y');
    expect(out).not.toContain('jane');
    expect(out).not.toContain('@');
    expect(out.endsWith('com y')).toBe(true);
    const ok = 'x jane@' + 'ab.'.repeat(60) + 'com y';
    expect(both(ok)).toBe('x  y');
  });
});

describe('linear, not quadratic', () => {
  jest.setTimeout(180000); // the old rule needs seconds per shape; the fixed one needs milliseconds
  // 8x the input is ~8x the time if linear and ~64x if quadratic; 24 splits them. Best of three runs each
  // (and the second and third are skipped when the first is already slow), so a pause from a busy machine,
  // the full suite runs in parallel, cannot make a linear scan look quadratic.
  const best = (fn: (t: string) => unknown, text: string): number => {
    fn(text); // warm
    let fastest = Infinity;
    for (let i = 0; i < 3; i += 1) {
      const t0 = process.hrtime.bigint();
      fn(text);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      fastest = Math.min(fastest, ms);
      if (ms > 1500) break;
    }
    return fastest;
  };

  // The shapes XC1 measured, and the ones the domain side of the rule adds.
  const SHAPES: Array<[string, (n: number) => string]> = [
    ['dots: a.a.a.', (n) => 'a.'.repeat(n / 2)],
    ['hyphens: a-a-a-', (n) => 'a-'.repeat(n / 2)],
    ['plus: a+a+a+', (n) => 'a+'.repeat(n / 2)],
    ['percent: a%a%a%', (n) => 'a%'.repeat(n / 2)],
    ['an @ first, then a long dotted run (the domain side)', (n) => 'x@' + 'a.'.repeat(n / 2)],
    ['a long local part, @, a long domain with no tld', (n) => 'a.'.repeat(n / 4) + '@' + 'b-'.repeat(n / 4)],
    ['@ everywhere', (n) => 'a@'.repeat(n / 2)],
    ['addresses without a tld, back to back', (n) => 'jane@example '.repeat(n / 13)],
    ['a 64-character local part and a long domain, repeated', (n) => ('a.'.repeat(32) + '@' + 'b.'.repeat(100)).repeat(n / 265)],
  ];

  describe.each([
    ['src/memory/redact.ts', redact],
    ['extension/scrub.js', ext.redact],
  ] as Array<[string, (v: string) => unknown]>)('%s', (_name, fn) => {
    it.each(SHAPES)('%s', (_label, make) => {
      const small = Math.max(best(fn, make(8000)), 1);
      const bigText = make(64000);
      const big = best(fn, bigText);
      expect(big / small).toBeLessThan(24);
      expect(big).toBeLessThan(1500);
    });
  });
});
