/**
 * RFC 8785 (JCS) — the canonical bytes an action-evidence record hash covers.
 *
 * The vectors below are the RFC's own (§3.2.2 serialisation example, §3.2.3 sorting example,
 * Appendix B number samples), copied from https://www.rfc-editor.org/rfc/rfc8785.txt, not
 * regenerated from this implementation. The SHA-256 values were computed outside Node, with
 * coreutils: printf '%s' '<canonical form>' | sha256sum.
 */
import { canonicalize, jcsSha256, JcsError } from '../src/lib/jcs';
import { kernelCanonicalJson } from '../src/lib/kernel-client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A double from its IEEE 754 bit pattern, as Appendix B lists it. */
function fromHex(hex: string): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, BigInt('0x' + hex));
  return view.getFloat64(0);
}

describe('RFC 8785 §3.2.2 / §3.2.3 — the worked example', () => {
  // Both files are the RFC text itself, cut from rfc8785.txt with sed so no escape was retyped:
  // the input is the JSON the RFC parses (lines 223-228), the canonical form is its §3.2.3 output
  // (lines 312-313, display wrap removed). Parsing the input also exercises the RFC's number rounding.
  const dir = join(__dirname, 'fixtures', 'jcs');
  const input = JSON.parse(readFileSync(join(dir, 'rfc8785-3.2.2-input.json'), 'utf8'));
  const expected = readFileSync(join(dir, 'rfc8785-3.2.3-canonical.json'), 'utf8');

  it('produces the RFC canonical form byte for byte', () => {
    expect(canonicalize(input)).toBe(expected);
  });

  it('hashes to the SHA-256 coreutils computes for the canonical file', () => {
    // sha256sum tests/fixtures/jcs/rfc8785-3.2.3-canonical.json
    expect(jcsSha256(input)).toBe('2d5e01a318d0f0879ab568c4be289c8b1f64ef8921a53c6277d5e069978baacb');
  });
});

describe('RFC 8785 §3.2.3 — property sorting by UTF-16 code units', () => {
  it('orders the RFC sorting vector exactly as the RFC lists it', () => {
    const input = {
      '€': 'Euro Sign',
      '\r': 'Carriage Return',
      'דּ': 'Hebrew Letter Dalet With Dagesh',
      '1': 'One',
      '😀': 'Emoji: Grinning Face',
      '\u0080': 'Control',
      'ö': 'Latin Small Letter O With Diaeresis',
    };
    const values = Object.values(JSON.parse(canonicalize(input)) as Record<string, string>);
    // JSON.parse re-orders integer-like keys ("1") first, so read the order off the string instead.
    const order = [...canonicalize(input).matchAll(/:"([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual([
      'Carriage Return',
      'One',
      'Control',
      'Latin Small Letter O With Diaeresis',
      'Euro Sign',
      'Emoji: Grinning Face',
      'Hebrew Letter Dalet With Dagesh',
    ]);
    expect(values).toHaveLength(7);
  });

  it('sorts nested objects too, and keeps array order', () => {
    expect(canonicalize({ b: [3, 1, { z: 1, a: 2 }], a: { y: null, x: true } })).toBe('{"a":{"x":true,"y":null},"b":[3,1,{"a":2,"z":1}]}');
  });
});

describe('RFC 8785 Appendix B — number serialisation samples', () => {
  it.each([
    ['0000000000000000', '0'],
    ['8000000000000000', '0'],
    ['0000000000000001', '5e-324'],
    ['8000000000000001', '-5e-324'],
    ['7fefffffffffffff', '1.7976931348623157e+308'],
    ['ffefffffffffffff', '-1.7976931348623157e+308'],
    ['4340000000000000', '9007199254740992'],
    ['c340000000000000', '-9007199254740992'],
    ['4430000000000000', '295147905179352830000'],
    ['44b52d02c7e14af5', '9.999999999999997e+22'],
    ['44b52d02c7e14af6', '1e+23'],
    ['44b52d02c7e14af7', '1.0000000000000001e+23'],
    ['444b1ae4d6e2ef4e', '999999999999999700000'],
    ['444b1ae4d6e2ef4f', '999999999999999900000'],
    ['444b1ae4d6e2ef50', '1e+21'],
    ['3eb0c6f7a0b5ed8c', '9.999999999999997e-7'],
    ['3eb0c6f7a0b5ed8d', '0.000001'],
    ['41b3de4355555553', '333333333.3333332'],
    ['41b3de4355555554', '333333333.33333325'],
    ['41b3de4355555555', '333333333.3333333'],
    ['41b3de4355555556', '333333333.3333334'],
    ['41b3de4355555557', '333333333.33333343'],
    ['becbf647612f3696', '-0.0000033333333333333333'],
    ['43143ff3c1cb0959', '1424953923781206.2'],
  ])('%s → %s', (hex, want) => {
    expect(canonicalize(fromHex(hex))).toBe(want);
  });

  it.each([['7fffffffffffffff'], ['7ff0000000000000']])('%s (NaN / Infinity) is refused, not written as null', (hex) => {
    expect(() => canonicalize({ n: fromHex(hex) })).toThrow(JcsError);
  });
});

describe('what RFC 8785 excludes is refused, never silently rewritten', () => {
  it.each([
    ['an unpaired high surrogate', { s: 'a\ud800b' }],
    ['an unpaired low surrogate', { s: '\udc00' }],
    ['an unpaired surrogate in a KEY', { ['\ud800']: 1 }],
    ['undefined in an object', { a: undefined }],
    ['undefined in an array', [undefined]],
    ['a function', { f: () => 1 }],
    ['a BigInt', { n: BigInt(1) }],
    ['a Date (not a plain object)', { d: new Date(0) }],
    ['a Map', { m: new Map() }],
  ])('%s', (_label, value) => {
    expect(() => canonicalize(value)).toThrow(JcsError);
  });

  it('accepts a correctly paired surrogate (an emoji)', () => {
    expect(canonicalize({ e: '😀' })).toBe('{"e":"😀"}');
  });

  it('escapes controls as the RFC does: short forms, else lowercase \\u00xx', () => {
    expect(canonicalize('\b\f\n\r\t\u0001\u001f\u007f')).toBe('"\\b\\f\\n\\r\\t\\u0001\\u001f\u007f"');
  });
});

describe('a small independent vector', () => {
  it('{"b":1,"a":"x"} canonicalises and hashes as coreutils says', () => {
    expect(canonicalize({ b: 1, a: 'x' })).toBe('{"a":"x","b":1}');
    expect(jcsSha256({ b: 1, a: 'x' })).toBe('cdab067e9f3beb32d1252cfd63e492592fecbf591b0d08cadb24bb17f3864246');
  });
});

describe('relationship to the canonicalizer already in this repo', () => {
  // kernelCanonicalJson is pinned to the engine's hash and stays as it is. On the values an
  // action-evidence record holds (strings, safe integers, booleans, null, arrays, plain objects)
  // the two agree; they part only where RFC 8785 refuses and the kernel's quietly rewrites.
  it('agrees on record-shaped data', () => {
    const v = { z: [1, 'two', null, true, { b: 'x', a: -0 }], a: { s: 'é €', n: 39290226738 } };
    expect(canonicalize(v)).toBe(kernelCanonicalJson(v));
  });

  it('differs exactly where the kernel one is lenient', () => {
    expect(kernelCanonicalJson({ n: NaN })).toBe('{"n":null}');
    expect(() => canonicalize({ n: NaN })).toThrow(JcsError);
    expect(kernelCanonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(() => canonicalize({ a: undefined, b: 1 })).toThrow(JcsError);
  });
});
