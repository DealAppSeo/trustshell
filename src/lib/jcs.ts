/**
 * RFC 8785 JSON Canonicalization Scheme (JCS): the exact bytes an action-evidence record hash covers.
 * ------------------------------------------------------------------
 * WHY NOT REUSE THE CANONICALIZERS ALREADY HERE. `kernelCanonicalJson` (src/lib/kernel-client.ts)
 * and `canonicalize` (lib/trustkeys-signer.ts) sort keys and drop whitespace, which is the same
 * output as JCS for strings, safe integers, booleans and null. But both are pinned to the
 * engine's hashes, and both are lenient where RFC 8785 is not: NaN and Infinity become `null`,
 * an `undefined` member silently disappears, and a lone surrogate is escaped instead of refused.
 * A record hash that quietly hashes `null` where the record held NaN is a hash over something
 * the record never said. They must not change to suit this file, so this one is separate,
 * strict, and tested against the RFC's own vectors (tests/jcs.test.ts).
 *
 * WHAT IS DELEGATED TO JSON.stringify, AND WHY THAT IS THE RFC'S OWN DESIGN. RFC 8785 §3.2.2
 * defines number and string serialisation as ECMAScript's: numbers by Number.prototype.toString
 * (so -0 is "0" and 1e21 is "1e+21"), strings with only `"`, `\` and C0 controls escaped, using
 * the short forms and lowercase `\u00xx`. `JSON.stringify` on a finite number or a well-formed
 * string IS that algorithm. What it does not do is refuse the inputs RFC 8785 excludes, so this
 * file adds exactly those refusals and the UTF-16 key sort (§3.2.3), and nothing else.
 */

import { createHash } from 'node:crypto';

export class JcsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JcsError';
  }
}

// A high surrogate not followed by a low one, or a low one not preceded by a high one.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function str(s: string, at: string): string {
  // RFC 8785 §3.1 requires I-JSON (RFC 7493), which forbids unpaired surrogates: they have no
  // UTF-8 encoding, so "the UTF-8 bytes of the canonical form" would not be defined.
  if (LONE_SURROGATE.test(s)) throw new JcsError(`${at}: string contains an unpaired surrogate`);
  return JSON.stringify(s);
}

function serialize(v: unknown, at: string): string {
  if (v === null) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new JcsError(`${at}: ${v} has no JSON representation`);
    return JSON.stringify(v);
  }
  if (typeof v === 'string') return str(v, at);
  if (Array.isArray(v)) {
    return '[' + v.map((x, i) => serialize(x, `${at}[${i}]`)).join(',') + ']';
  }
  if (typeof v === 'object') {
    const proto = Object.getPrototypeOf(v);
    // A Date, Map or class instance has no single JSON meaning; JSON.stringify would pick one
    // (toJSON, or `{}`) without saying so.
    if (proto !== Object.prototype && proto !== null) throw new JcsError(`${at}: only plain objects are JSON`);
    const obj = v as Record<string, unknown>;
    // Array.prototype.sort with no comparator orders strings by UTF-16 code units, which is the
    // order RFC 8785 §3.2.3 specifies. (Sorting by code point or UTF-8 bytes differs for keys
    // outside the BMP; the RFC's own sorting vector in the tests catches that.)
    const keys = Object.keys(obj).sort();
    return (
      '{' +
      keys
        .map((k) => {
          const x = obj[k];
          if (x === undefined) throw new JcsError(`${at}.${k}: undefined is not JSON; use null`);
          return str(k, `${at}.${k}`) + ':' + serialize(x, `${at}.${k}`);
        })
        .join(',') +
      '}'
    );
  }
  throw new JcsError(`${at}: a ${typeof v} is not JSON`);
}

/** The RFC 8785 canonical form of a JSON value. Throws {@link JcsError} on anything that is not I-JSON. */
export function canonicalize(value: unknown): string {
  return serialize(value, '$');
}

/** Lowercase hex SHA-256 of the UTF-8 bytes of the canonical form. */
export function jcsSha256(value: unknown): string {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}
