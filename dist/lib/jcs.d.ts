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
export declare class JcsError extends Error {
    constructor(message: string);
}
/** The RFC 8785 canonical form of a JSON value. Throws {@link JcsError} on anything that is not I-JSON. */
export declare function canonicalize(value: unknown): string;
/** Lowercase hex SHA-256 of the UTF-8 bytes of the canonical form. */
export declare function jcsSha256(value: unknown): string;
