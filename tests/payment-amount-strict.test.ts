/**
 * S-3 (XC1 ledger): the SDK checked the amount less strictly than the policy kernel does. `assertPaymentCap`
 * did `BigInt(amount)` and compared. So:
 *   - a NEGATIVE amount passed the cap gate (-5 is not greater than any cap) and was stopped only by the
 *     signing library's own range check: luck of a dependency, not a rule of ours;
 *   - an EMPTY string became 0n and signed a zero-value authorization;
 *   - padding, hex, exponent and a sign were all quietly accepted by BigInt().
 *
 * The amount now passes the kernel's intent BEFORE the cap comparison (repid-engine src/kernel/decide.ts
 * parseAmountRaw): a canonical decimal integer string, a safe-integer number, or a bigint; strictly
 * positive; no hex, exponent, padding or sign; and within uint256, which is what the token's `value` is.
 * (The kernel also stops at 2^53; the SDK keeps accepting a larger canonical STRING up to uint256, which its
 * own tests already pin, so this does not narrow anything that worked on purpose.)
 *
 * It can only refuse more. It does not touch the cap, the allowance, or how the two are combined (S-2).
 */
import { assertPaymentCap, buildX402Payment, guardedX402Payment, TrustShellError } from '../src/lib/index';

const TEST_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111';
const TEST_TO = '0x0000000000000000000000000000000000000001';
const CAP = '1000000';
const UINT256_MAX = BigInt('0x' + 'f'.repeat(64));

type Amount = number | bigint | string;
const REFUSED: Array<[string, unknown]> = [
  ['a negative number', -5],
  ['a negative string', '-5'],
  ['negative zero as a string', '-0'],
  ['a negative bigint', BigInt(-1)],
  ['zero', 0],
  ['zero as a string', '0'],
  ['a zero bigint', BigInt(0)],
  ['NaN', NaN],
  ['Infinity', Infinity],
  ['-Infinity', -Infinity],
  ['a fraction', 1.5],
  ['a fraction as a string', '1.5'],
  ['a number past the safe integers', 9007199254740992],
  ['the empty string', ''],
  ['whitespace', '   '],
  ['padded with a leading space', ' 10'],
  ['padded with a trailing space', '10 '],
  ['zero-padded', '010'],
  ['hex', '0x10'],
  ['exponent', '1e3'],
  ['a plus sign', '+5'],
  ['an underscore separator', '1_000'],
  ['words', 'abc'],
  ['a decimal point', '10.0'],
  ['null', null],
  ['undefined', undefined],
  ['an object', {}],
  ['an array', [5]],
  ['a boolean', true],
  ['above uint256', (UINT256_MAX + BigInt(1)).toString()],
];

describe('S-3: assertPaymentCap validates the amount before comparing it to the cap', () => {
  it.each(REFUSED)('REFUSES %s', (_label, amount) => {
    expect.assertions(3);
    try {
      assertPaymentCap({ amount: amount as Amount, cap: CAP });
    } catch (e) {
      expect(e).toBeInstanceOf(TrustShellError);
      expect((e as TrustShellError).status).toBe(400);
      expect((e as Error).message).toMatch(/amount_invalid/);
    }
  });

  it('a negative amount is no longer waved through by "not greater than the cap"', () => {
    expect(() => assertPaymentCap({ amount: -5, cap: 1000 })).toThrow(/amount_invalid/);
    expect(() => assertPaymentCap({ amount: -5, cap: -10 })).toThrow(/amount_invalid/);
  });

  it('the refusal never echoes the offending value (it may be a secret pasted into the wrong field)', () => {
    const hostile = 'sk-live-0123456789abcdefghij';
    try {
      assertPaymentCap({ amount: hostile, cap: CAP });
      throw new Error('should have refused');
    } catch (e) {
      expect((e as Error).message).toMatch(/amount_invalid/);
      expect((e as Error).message).not.toContain(hostile);
    }
  });

  it.each<[string, Amount]>([
    ['1', 1],
    ['a small number', 100000],
    ['a canonical string', '100000'],
    ['a bigint', BigInt(5)],
    ['the largest safe integer', Number.MAX_SAFE_INTEGER],
    ['a string past 2^53 (uint256-safe, pinned by x402-cap)', '9007199254740993'],
    ['uint256 max', UINT256_MAX.toString()],
  ])('still ACCEPTS %s', (_label, amount) => {
    const cap = typeof amount === 'string' ? amount : amount;
    expect(assertPaymentCap({ amount, cap })).toBe(true);
  });

  it('the cap comparison is unchanged: over the cap refuses, at the cap allows', () => {
    expect(() => assertPaymentCap({ amount: 1000, cap: 500 })).toThrow(/cap_exceeded/);
    expect(assertPaymentCap({ amount: 500, cap: 500 })).toBe(true);
    expect(() => assertPaymentCap({ amount: '9007199254740993', cap: '9007199254740992' })).toThrow(/cap_exceeded/);
  });
});

describe('S-3: buildX402Payment refuses a bad amount before it touches the key', () => {
  const BASE = { to: TEST_TO, cap: CAP, origin: 'Cli' as const };

  it.each(REFUSED.filter(([l]) => l !== 'above uint256'))('%s, even with a key that could never sign', async (_label, amount) => {
    // An unusable key proves the refusal came from the amount gate, not from the signer failing later.
    await expect(
      buildX402Payment({ ...BASE, privateKey: 'not-a-key', amount: amount as Amount }),
    ).rejects.toThrow(/amount_invalid/);
  });

  it('the EMPTY-string amount no longer signs a zero-value authorization', async () => {
    await expect(buildX402Payment({ ...BASE, privateKey: TEST_KEY, amount: '' })).rejects.toThrow(/amount_invalid/);
  });

  it('a bad amount refuses before the allowance is even read', async () => {
    let reads = 0;
    const readAllowance = () => { reads += 1; return BigInt(1000000); };
    await expect(
      buildX402Payment({ to: TEST_TO, origin: 'Cli', privateKey: TEST_KEY, amount: -5, agentId: 'trinity-test', readAllowance }),
    ).rejects.toThrow(/amount_invalid/);
    expect(reads).toBe(0);
  });

  it('origin is still checked FIRST: an Unknown origin with a bad amount is origin_refused', async () => {
    await expect(
      buildX402Payment({ ...BASE, origin: 'Unknown', privateKey: TEST_KEY, amount: -5 }),
    ).rejects.toThrow(/origin_refused/);
  });

  it('a valid amount at the cap still signs', async () => {
    const header = await buildX402Payment({ ...BASE, privateKey: TEST_KEY, amount: CAP });
    expect(typeof header).toBe('string');
    const body = JSON.parse(Buffer.from(header, 'base64').toString('utf8')) as { value: string };
    expect(body.value).toBe(CAP);
  });
});

describe('S-3 through the spend entry: a bad amount writes no receipt and signs nothing', () => {
  const BASE = { privateKey: TEST_KEY, to: TEST_TO, cap: CAP, agentId: 'trinity-test', origin: 'Cli' as const, policy: { allow: true } };

  it.each([['a negative amount', -5], ['an empty amount', ''], ['a zero amount', 0], ['a hex amount', '0x10']])(
    '%s',
    async (_label, amount) => {
      const rows: string[] = [];
      let receipts = 0;
      await expect(
        guardedX402Payment(
          { ...BASE, amount: amount as Amount, writeReceipt: () => { receipts += 1; } },
          { stream: { write: (s: string) => rows.push(s) }, now: 't' },
        ),
      ).rejects.toThrow(/amount_invalid/);
      expect(receipts).toBe(0); // no receipt for a spend that cannot be signed
      expect(rows).toHaveLength(1); // the attempt is still on the log (audit before act)
    },
  );

  it('a valid amount still writes its receipt and signs', async () => {
    let receipts = 0;
    const header = await guardedX402Payment(
      { ...BASE, amount: 100, writeReceipt: () => { receipts += 1; } },
      { stream: { write: () => undefined }, now: 't' },
    );
    expect(typeof header).toBe('string');
    expect(receipts).toBe(1);
  });
});

describe('the COMMITTED dist carries the strict amount gate (npm pack ships dist/ as committed)', () => {
  it('dist/lib/trustshell.js and dist/lib/guarded-payment.js refuse a negative and an empty amount', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require('../dist/lib/trustshell.js') as { assertPaymentCap: typeof assertPaymentCap; buildX402Payment: typeof buildX402Payment };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const guarded = require('../dist/lib/guarded-payment.js') as { guardedX402Payment: typeof guardedX402Payment };
    expect(() => lib.assertPaymentCap({ amount: -5, cap: 1000 })).toThrow(/amount_invalid/);
    await expect(lib.buildX402Payment({ to: TEST_TO, cap: CAP, origin: 'Cli', privateKey: TEST_KEY, amount: '' })).rejects.toThrow(/amount_invalid/);
    let receipts = 0;
    await expect(
      guarded.guardedX402Payment(
        { privateKey: TEST_KEY, to: TEST_TO, cap: CAP, amount: -5, agentId: 'a', origin: 'Cli', policy: { allow: true }, writeReceipt: () => { receipts += 1; } },
        { stream: { write: () => undefined } },
      ),
    ).rejects.toThrow(/amount_invalid/);
    expect(receipts).toBe(0);
    expect(lib.assertPaymentCap({ amount: 100, cap: 1000 })).toBe(true);
  });
});
