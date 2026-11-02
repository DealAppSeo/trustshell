/**
 * Every refusal happens BEFORE the pre-pay receipt is written.
 *
 * guardedX402Payment writes a provenance receipt before it signs, and that receipt is a gate: if the writer
 * throws, the payment refuses. Until now the order inside was receipt -> buildX402Payment, and buildX402Payment
 * is where the cap, the address and key checks and (since #665) the Guard's spend decision happen. So a payment
 * the Guard denied, or the cap refused, still left a receipt behind: a receipt for a payment that never happened.
 *
 * Now the order is decide -> receipt -> sign. A refusal leaves no receipt and signs nothing; an allowed spend
 * writes one Guard record, counted once, then the receipt, then the signature.
 *
 * Every assertion is on an effect: the receipt writer was (not) called, the signer was (not) called, the Guard
 * ledger holds exactly the records and the count stated here.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Wallet } from 'ethers';
import * as sdk from '../src/lib/index';
import { GUARD_RECEIPTS_FILE, POLICY_FILE, defaultPolicy, readLedger, renderPolicyDocument, type GuardRecord } from '../src/lib/guardrails';

// Disposable local-sign key only, never a funded wallet, never logged.
const TEST_KEY = '0x1111111111111111111111111111111111111111111111111111111111111111';
const TEST_TO = '0x0000000000000000000000000000000000000001';
const BASE = { privateKey: TEST_KEY, to: TEST_TO, cap: 1000, origin: 'Cli' as const, agentId: 'agent-1', policy: { allow: true } };

describe('guardedX402Payment decides every refusal before it writes the receipt', () => {
  const prevEnv = { ...process.env };
  let root = '';
  const home = () => join(root, 'home');
  const ledgerText = () => (existsSync(join(home(), GUARD_RECEIPTS_FILE)) ? readFileSync(join(home(), GUARD_RECEIPTS_FILE), 'utf8') : '');
  const records = (): GuardRecord[] => ledgerText().trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as GuardRecord);
  const spentToday = () => String(readLedger(ledgerText()).spent?.today);
  const writePolicy = (actions: string[], over: Record<string, unknown> = {}) => {
    mkdirSync(home(), { recursive: true });
    writeFileSync(join(home(), POLICY_FILE), renderPolicyDocument({ policy: { ...defaultPolicy(), actions, ...over } as never, signature: null }));
  };

  let sign: jest.SpyInstance;
  /** The Guard ledger length each time the receipt writer ran: the decision must already be on it. */
  let ledgerAtReceipt: number[] = [];
  const receipt = () =>
    jest.fn(async () => {
      ledgerAtReceipt.push(records().length);
    });
  const intent = { write: () => true };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ts-before-receipt-'));
    process.env.TRUSTSHELL_HOME = home();
    ledgerAtReceipt = [];
    sign = jest.spyOn(Wallet.prototype, 'signTypedData'); // calls through; counts and orders the signatures
  });
  afterEach(() => {
    sign.mockRestore();
    process.env = { ...prevEnv };
    rmSync(root, { recursive: true, force: true });
  });

  describe('the Guard denies the spend', () => {
    it('over per_tx_raw: no receipt, no signature, the denial recorded once, nothing counted', async () => {
      writePolicy(['spend'], { per_tx_raw: '100', daily_raw: '1000', total_raw: '1000' });
      const writeReceipt = receipt();
      const err = await sdk.guardedX402Payment({ ...BASE, amount: 500, writeReceipt }, { stream: intent }).catch((e) => e);
      expect(err).toMatchObject({ name: 'GuardDeniedError', action: 'spend' });
      expect(writeReceipt).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
      expect(records()).toHaveLength(1);
      expect(records()[0]).toMatchObject({ origin: 'Sdk', requested: { amount_raw: '500' }, authorized: { decision: 'DENIED' } });
      expect(spentToday()).toBe('0');
    });

    it('over what daily_raw leaves: no receipt, no signature', async () => {
      writePolicy(['spend'], { per_tx_raw: '100', daily_raw: '120', total_raw: '1000' });
      await sdk.guardedX402Payment({ ...BASE, amount: 100, writeReceipt: receipt() }, { stream: intent });
      const writeReceipt = receipt();
      sign.mockClear();
      await expect(sdk.guardedX402Payment({ ...BASE, amount: 50, writeReceipt }, { stream: intent })).rejects.toMatchObject({ name: 'GuardDeniedError' });
      expect(writeReceipt).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
      expect(spentToday()).toBe('100'); // only the first payment is counted
    });

    it('a policy that does not list spend: no receipt, no signature', async () => {
      writePolicy(['tool:ground']);
      const writeReceipt = receipt();
      await expect(sdk.guardedX402Payment({ ...BASE, amount: 1, writeReceipt }, { stream: intent })).rejects.toMatchObject({ name: 'GuardDeniedError' });
      expect(writeReceipt).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
    });
  });

  describe('the cap refuses the spend', () => {
    beforeEach(() => writePolicy(['spend'], { per_tx_raw: '1000', daily_raw: '10000', total_raw: '10000' }));

    it('amount over the declared cap: no receipt, no signature, no Guard record (nothing to count)', async () => {
      const writeReceipt = receipt();
      await expect(sdk.guardedX402Payment({ ...BASE, cap: 10, amount: 50, writeReceipt }, { stream: intent })).rejects.toThrow(/cap_exceeded/);
      expect(writeReceipt).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
      expect(records()).toHaveLength(0);
    });

    it('amount over the allowance, which is lower than the declared cap: no receipt, no signature, no Guard record', async () => {
      const writeReceipt = receipt();
      await expect(sdk.guardedX402Payment({ ...BASE, cap: 1000, readAllowance: () => BigInt(10), amount: 50, writeReceipt }, { stream: intent })).rejects.toThrow(/cap_exceeded/);
      expect(writeReceipt).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
      expect(records()).toHaveLength(0);
    });
  });

  describe('a payment the signer cannot build leaves no receipt and counts nothing', () => {
    beforeEach(() => writePolicy(['spend'], { per_tx_raw: '1000', daily_raw: '10000', total_raw: '10000' }));

    it.each([
      ['an address that is not an address', { to: '0xnot-an-address' }],
      ['a private key that is not a key', { privateKey: '0x12' }],
      ['a nonce that is not 32 bytes', { nonce: '0x1234' }],
    ])('%s', async (_why, over) => {
      const writeReceipt = receipt();
      await expect(sdk.guardedX402Payment({ ...BASE, amount: 50, ...over, writeReceipt }, { stream: intent })).rejects.toBeInstanceOf(Error);
      expect(writeReceipt).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
      expect(records()).toHaveLength(0);
    });
  });

  describe('an allowed spend', () => {
    beforeEach(() => writePolicy(['spend'], { per_tx_raw: '100', daily_raw: '1000', total_raw: '1000' }));

    it('is decided, then the receipt is written, then the signature: one Guard record, counted once', async () => {
      const writeReceipt = receipt();
      const header = await sdk.guardedX402Payment({ ...BASE, amount: 50, writeReceipt }, { stream: intent });
      expect(JSON.parse(Buffer.from(header, 'base64').toString('utf8')).value).toBe('50');
      expect(writeReceipt).toHaveBeenCalledTimes(1);
      expect(sign).toHaveBeenCalledTimes(1);
      expect(writeReceipt.mock.invocationCallOrder[0]).toBeLessThan(sign.mock.invocationCallOrder[0]);
      expect(ledgerAtReceipt).toEqual([1]); // the ALLOWED decision was already on the ledger when the receipt was written
      expect(records()).toHaveLength(1);
      expect(records()[0]).toMatchObject({ origin: 'Sdk', requested: { action: 'spend', amount_raw: '50' }, authorized: { decision: 'ALLOWED' } });
      expect(spentToday()).toBe('50');
    });

    it('with no receipt writer it still signs, with one record counted once', async () => {
      await sdk.guardedX402Payment({ ...BASE, amount: 50 }, { stream: intent });
      expect(sign).toHaveBeenCalledTimes(1);
      expect(records()).toHaveLength(1);
      expect(spentToday()).toBe('50');
    });

    it('the receipt writer THROWS: nothing is signed. The amount STAYS counted (it errs high, never low)', async () => {
      const writeReceipt = jest.fn(async () => {
        throw new Error('receipt invalid');
      });
      await expect(sdk.guardedX402Payment({ ...BASE, amount: 50, writeReceipt }, { stream: intent })).rejects.toThrow(/receipt invalid/);
      expect(writeReceipt).toHaveBeenCalledTimes(1);
      expect(sign).not.toHaveBeenCalled();
      // The ledger is append-only and only an ALLOWED decision record counts; there is no release record. So a
      // payment that is decided and then not made stays counted: the ledger can read higher than what was signed,
      // never lower. A retry is a new payment, counted again.
      expect(records()).toHaveLength(1);
      expect(spentToday()).toBe('50');
    });

    it('never counts below what was signed: every signature has its own ALLOWED record', async () => {
      await sdk.guardedX402Payment({ ...BASE, amount: 30, writeReceipt: receipt() }, { stream: intent });
      await sdk.guardedX402Payment({ ...BASE, amount: 40, writeReceipt: async () => { throw new Error('receipt invalid'); } }, { stream: intent }).catch(() => null);
      await sdk.guardedX402Payment({ ...BASE, amount: 20, writeReceipt: receipt() }, { stream: intent });
      expect(sign).toHaveBeenCalledTimes(2);
      expect(records().filter((r) => r.authorized.decision === 'ALLOWED')).toHaveLength(3);
      expect(spentToday()).toBe('90'); // 30 + 20 signed, plus the 40 that was decided and then not made
    });
  });

  describe('buildX402Payment, called directly, is unchanged', () => {
    beforeEach(() => writePolicy(['spend'], { per_tx_raw: '100', daily_raw: '1000', total_raw: '1000' }));
    const direct = { privateKey: TEST_KEY, to: TEST_TO, cap: 1000, origin: 'Cli' as const };

    it('allowed: signs once, one Guard record, counted once', async () => {
      const header = await sdk.buildX402Payment({ ...direct, amount: 50 });
      expect(JSON.parse(Buffer.from(header, 'base64').toString('utf8')).value).toBe('50');
      expect(sign).toHaveBeenCalledTimes(1);
      expect(records()).toHaveLength(1);
      expect(spentToday()).toBe('50');
    });

    it('denied: GuardDeniedError, no signature, nothing counted', async () => {
      await expect(sdk.buildX402Payment({ ...direct, amount: 500 })).rejects.toMatchObject({ name: 'GuardDeniedError', action: 'spend' });
      expect(sign).not.toHaveBeenCalled();
      expect(spentToday()).toBe('0');
    });

    it('over the cap: cap_exceeded, no signature, no Guard record', async () => {
      await expect(sdk.buildX402Payment({ ...direct, cap: 10, amount: 50 })).rejects.toThrow(/cap_exceeded/);
      expect(sign).not.toHaveBeenCalled();
      expect(records()).toHaveLength(0);
    });
  });

  it('no Guard policy (the gate is off): receipt, then signature, and no ledger is written', async () => {
    const writeReceipt = receipt();
    await sdk.guardedX402Payment({ ...BASE, amount: 50, writeReceipt }, { stream: intent });
    expect(writeReceipt.mock.invocationCallOrder[0]).toBeLessThan(sign.mock.invocationCallOrder[0]);
    expect(existsSync(join(home(), GUARD_RECEIPTS_FILE))).toBe(false);
  });
});
