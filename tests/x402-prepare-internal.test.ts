/**
 * prepareX402Payment is internal, and what it returns signs ONCE.
 *
 * prepareX402Payment makes the Guard's one spend decision (counted once) and hands back { sign() }. If sign()
 * could be called again, one decision would pay N times, past the per-tx, daily and total limits C8 enforces.
 * And if the package root exposed the deciding step, an SDK caller could hold a decision and sign from it
 * whenever it liked. So: sign() is single-use, enforced in the closure, and the root does not export the step.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Wallet } from 'ethers';
import * as sdk from '../src/lib/index';
// The internal module: the package root does not export it.
import { prepareX402Payment } from '../src/lib/x402-prepare';
import { GUARD_RECEIPTS_FILE, POLICY_FILE, defaultPolicy, readLedger, renderPolicyDocument, type GuardRecord } from '../src/lib/guardrails';

// Disposable local-sign key only, never a funded wallet, never logged.
const PAY = { privateKey: '0x1111111111111111111111111111111111111111111111111111111111111111', to: '0x0000000000000000000000000000000000000001', cap: 1000, origin: 'Cli' as const };

describe('a prepared payment signs once', () => {
  const prevEnv = { ...process.env };
  let root = '';
  let sign: jest.SpyInstance;
  const home = () => join(root, 'home');
  const ledgerText = () => (existsSync(join(home(), GUARD_RECEIPTS_FILE)) ? readFileSync(join(home(), GUARD_RECEIPTS_FILE), 'utf8') : '');
  const records = (): GuardRecord[] => ledgerText().trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as GuardRecord);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ts-prepare-once-'));
    process.env.TRUSTSHELL_HOME = home();
    mkdirSync(home(), { recursive: true });
    writeFileSync(join(home(), POLICY_FILE), renderPolicyDocument({ policy: { ...defaultPolicy(), actions: ['spend'], per_tx_raw: '100', daily_raw: '1000', total_raw: '1000' } as never, signature: null }));
    sign = jest.spyOn(Wallet.prototype, 'signTypedData'); // calls through; counts the signatures
  });
  afterEach(() => {
    sign.mockRestore();
    process.env = { ...prevEnv };
    rmSync(root, { recursive: true, force: true });
  });

  it('the second sign() throws and signs nothing: one decision, one signature, one count', async () => {
    const prepared = await prepareX402Payment({ ...PAY, amount: 50 });
    const header = await prepared.sign();
    expect(JSON.parse(Buffer.from(header, 'base64').toString('utf8')).value).toBe('50');
    await expect(prepared.sign()).rejects.toThrow(/already/);
    await expect(prepared.sign()).rejects.toThrow(/already/);
    expect(sign).toHaveBeenCalledTimes(1);
    expect(records()).toHaveLength(1);
    expect(String(readLedger(ledgerText()).spent?.today)).toBe('50');
  });

  it('two sign() calls started together sign once', async () => {
    const prepared = await prepareX402Payment({ ...PAY, amount: 50 });
    const settled = await Promise.allSettled([prepared.sign(), prepared.sign()]);
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter((s) => s.status === 'rejected')).toHaveLength(1);
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it('a second payment needs its own decision: prepare again, and it is counted again', async () => {
    await (await prepareX402Payment({ ...PAY, amount: 50 })).sign();
    await (await prepareX402Payment({ ...PAY, amount: 50 })).sign();
    expect(sign).toHaveBeenCalledTimes(2);
    expect(records()).toHaveLength(2);
    expect(String(readLedger(ledgerText()).spent?.today)).toBe('100');
  });
});

describe('the package root does not expose the deciding step', () => {
  it('the source entry has no prepareX402Payment', () => {
    expect(Object.keys(sdk)).not.toContain('prepareX402Payment');
    expect((sdk as Record<string, unknown>).prepareX402Payment).toBeUndefined();
  });

  it('the built package entry (dist/lib/index.js, what "." resolves to) has no prepareX402Payment', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const built = require('../dist/lib/index.js') as Record<string, unknown>;
    expect(Object.keys(built)).not.toContain('prepareX402Payment');
    expect(built.prepareX402Payment).toBeUndefined();
    expect(typeof built.buildX402Payment).toBe('function'); // the public signer is still there
    expect(typeof built.guardedX402Payment).toBe('function');
  });

  it('package.json exposes only ".", "./cli" and "./mcp": no subpath reaches the module that holds it', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    expect(Object.keys(pkg.exports).sort()).toEqual(['.', './cli', './mcp']);
  });
});
