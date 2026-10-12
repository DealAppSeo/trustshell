/**
 * S-1 (XC1 ledger): the spend entry's policy gate was a TRUTHINESS test (`if (!policy.allow)`), so a policy
 * whose `allow` was the string "false", the string "no", the number 1 or an object PASSED, and the spend went on
 * to the receipt writer and the signer. A policy parsed from config or model output carries strings, not
 * booleans. Only the boolean `true` admits a spend; anything else is `policy_denied`, and the act never runs.
 *
 * This can only make the gate refuse more. It cannot enable a spend that was refused before.
 */
import { auditThenAct, guardedX402Payment } from '../src/lib/index';

const INTENT = { origin: 'Cli' as const, amount: 5, cap: 10, agentId: 'trinity-test' };
const TEST_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111';
const TEST_TO = '0x0000000000000000000000000000000000000001';

function sink() {
  const lines: string[] = [];
  return { stream: { write: (s: string) => lines.push(s) }, lines };
}

// What a policy built from config / JSON / a model's output can carry in `allow`.
const NOT_TRUE: Array<[string, unknown]> = [
  ['the string "false"', 'false'],
  ['the string "no"', 'no'],
  ['the string "true"', 'true'],
  ['the string "yes"', 'yes'],
  ['the string "1"', '1'],
  ['a non-empty string', 'allow'],
  ['the number 1', 1],
  ['the number 2', 2],
  ['a non-empty object', { yes: true }],
  ['an empty object', {}],
  ['a non-empty array', [true]],
  ['a function', () => true],
  ['null', null],
  ['undefined', undefined],
  ['boolean false', false],
  ['the number 0', 0],
  ['NaN', NaN],
  ['the empty string', ''],
];

describe('S-1: only the boolean true admits a spend (auditThenAct)', () => {
  it.each(NOT_TRUE)('REFUSES allow = %s, never acts', async (_label, allow) => {
    const s = sink();
    let acted = false;
    await expect(
      auditThenAct(INTENT, { allow } as never, async () => { acted = true; return 'signed'; }, { stream: s.stream, now: 't' }),
    ).rejects.toThrow(/policy_denied/);
    expect(acted).toBe(false);
    // The attempt is still on the device log: audit before act is unchanged.
    expect(s.lines).toHaveLength(1);
  });

  it('REFUSES with a 403 TrustShellError, and a message that says what was wrong', async () => {
    expect.assertions(3);
    try {
      await auditThenAct(INTENT, { allow: 'false' } as never, async () => 'signed', { stream: sink().stream });
    } catch (e) {
      expect((e as { status?: number }).status).toBe(403);
      expect((e as Error).message).toMatch(/policy_denied/);
      expect((e as Error).message).toMatch(/true/);
    }
  });

  it('a policy that is not an object refuses (the policy itself is the wrong type)', async () => {
    for (const bad of ['allow', 'true', 1, true, [], () => ({ allow: true })]) {
      let acted = false;
      await expect(
        auditThenAct(INTENT, bad as never, async () => { acted = true; }, { stream: sink().stream }),
      ).rejects.toThrow(/policy_(denied|required)/);
      expect(acted).toBe(false);
    }
  });

  it('a denying policy still carries its own reason through', async () => {
    await expect(
      auditThenAct(INTENT, { allow: false, reason: 'over budget' }, async () => 'signed', { stream: sink().stream }),
    ).rejects.toThrow(/policy_denied: over budget/);
  });

  it('the boolean true still admits the spend, after the intent row', async () => {
    const s = sink();
    const out = await auditThenAct(INTENT, { allow: true }, async () => 'signed', { stream: s.stream, now: 't' });
    expect(out).toBe('signed');
    expect(s.lines).toHaveLength(1);
  });

  it('a missing policy is still policy_required, not policy_denied', async () => {
    await expect(auditThenAct(INTENT, undefined, async () => 'x', { stream: sink().stream })).rejects.toThrow(/policy_required/);
    await expect(auditThenAct(INTENT, null, async () => 'x', { stream: sink().stream })).rejects.toThrow(/policy_required/);
  });
});

describe('S-1 through the spend entry: a non-boolean allow reaches neither the receipt writer nor the signer', () => {
  const BASE = { privateKey: TEST_KEY, to: TEST_TO, amount: 100, cap: 1000, agentId: 'trinity-test', origin: 'Cli' as const };

  it.each(NOT_TRUE.filter(([, v]) => v !== undefined && v !== null))('allow = %s', async (_label, allow) => {
    let receipts = 0;
    await expect(
      guardedX402Payment(
        { ...BASE, policy: { allow } as never, writeReceipt: () => { receipts += 1; } },
        { stream: sink().stream, now: 't' },
      ),
    ).rejects.toThrow(/policy_denied/);
    expect(receipts).toBe(0); // the receipt is written AFTER the policy gate; it must not be reached
  });

  it('allow = true still signs (the gate is stricter, not closed)', async () => {
    let receipts = 0;
    const header = await guardedX402Payment(
      { ...BASE, policy: { allow: true }, writeReceipt: () => { receipts += 1; } },
      { stream: sink().stream, now: 't' },
    );
    expect(typeof header).toBe('string');
    expect(receipts).toBe(1);
  });
});

describe('the COMMITTED dist carries the strict gate (npm pack ships dist/ as committed)', () => {
  // Behavioural, not a text match: load the built module and make the probe.
  it('dist/lib/audit.js refuses allow = "false" and never acts', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const built = require('../dist/lib/audit.js') as { auditThenAct: typeof auditThenAct };
    let acted = false;
    await expect(
      built.auditThenAct(INTENT, { allow: 'false' } as never, async () => { acted = true; }, { stream: sink().stream }),
    ).rejects.toThrow(/policy_denied/);
    expect(acted).toBe(false);
    expect(await built.auditThenAct(INTENT, { allow: true }, async () => 'signed', { stream: sink().stream })).toBe('signed');
  });
});
