/**
 * The outbound scrubber removes every known secret and personal-data shape in the corpus, and
 * leaves ordinary claims exactly as they were. Until 2026-10-05 it caught ten token shapes and
 * missed AWS and Google keys, Stripe `sk_live_`, private keys (64-hex and PEM), most database
 * URLs, labelled passwords, and every personal-data shape.
 */
import { redact, containsSecret } from '../src/memory/redact';
import { SENSITIVE, KEEP } from './fixtures/scrub-corpus';

describe('redact removes each sensitive shape', () => {
  it.each(SENSITIVE.map((r) => [r.kind, r]))('%s', (_kind, row) => {
    const out = redact(row.text);
    expect(out).not.toContain(row.secret);
    // The rest of the sentence survives, so the claim is still checkable.
    expect(out).toMatch(/came from the reply|in it\./);
  });
});

describe('redact leaves ordinary claims untouched', () => {
  it.each(KEEP.map((s) => [s]))('%s', (sentence) => {
    expect(redact(sentence)).toBe(sentence);
  });
});

describe('a Luhn-invalid digit run or a checksum-invalid IBAN is not personal data', () => {
  it('keeps them', () => {
    expect(redact('Ref 4111 1111 1111 1112 is not a card.')).toContain('4111 1111 1111 1112');
    expect(redact('GB00 WEST 1234 5698 7654 32 fails its checksum.')).toContain('GB00 WEST 1234 5698 7654 32');
  });
});

describe('containsSecret: credentials, not personal data', () => {
  const credentialKinds = new Set(SENSITIVE.map((r) => r.kind).filter((k) => !/email|phone|ssn|card|iban/.test(k)));
  it.each(SENSITIVE.filter((r) => credentialKinds.has(r.kind)).map((r) => [r.kind, r]))('flags %s', (_k, row) => {
    expect(containsSecret(row.text)).toBe(true);
  });
  it('does not flag an email or an ordinary claim', () => {
    expect(containsSecret('Write to jane.doe@example.com tomorrow.')).toBe(false);
    for (const s of KEEP) expect(containsSecret(s)).toBe(false);
  });
});
