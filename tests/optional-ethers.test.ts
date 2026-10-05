/**
 * ethers is an optional peer from 1.6.0 (src/lib/optional-ethers.ts). Measured on 1.5.0 it was 23
 * of the 50 MB every install pulled; only payment signing and verifySigner's chain read use it.
 * Missing, those two paths must say what to install, never print a module-resolution stack trace.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

afterEach(() => {
  jest.resetModules();
  jest.dontMock('ethers');
});

describe('ethers is optional for installers', () => {
  it('is not a dependency; it is an optional peer, and still a devDependency for this repo', () => {
    expect(pkg.dependencies?.ethers).toBeUndefined();
    expect(pkg.peerDependencies?.ethers).toMatch(/^\^6/);
    expect(pkg.peerDependenciesMeta?.ethers?.optional).toBe(true);
    expect(pkg.devDependencies?.ethers).toMatch(/^\^6/);
  });
});

describe('loadEthers', () => {
  it('missing ethers: the payment path says what to install', async () => {
    jest.doMock('ethers', () => {
      const e = new Error("Cannot find module 'ethers' from 'src/lib/optional-ethers.ts'") as Error & { code?: string };
      e.code = 'MODULE_NOT_FOUND';
      throw e;
    });
    const { loadEthers, MissingDependencyError } = await import('../src/lib/optional-ethers');
    const p = loadEthers('Signing an x402 payment');
    await expect(p).rejects.toBeInstanceOf(MissingDependencyError);
    await expect(loadEthers('Signing an x402 payment')).rejects.toThrow(/Signing an x402 payment needs the ethers package.*npm i ethers@\^6/);
  });

  it('missing ethers: verifySigner\'s chain read says what to install too', async () => {
    jest.doMock('ethers', () => {
      const e = new Error("Cannot find module 'ethers'") as Error & { code?: string };
      e.code = 'MODULE_NOT_FOUND';
      throw e;
    });
    const { onchainFeedbackClients } = await import('../src/lib/verify-signer');
    await expect(onchainFeedbackClients('1')).rejects.toThrow(/needs the ethers package.*npm i ethers/);
  });

  it('any other failure inside ethers is rethrown as is, not relabelled missing', async () => {
    jest.doMock('ethers', () => {
      throw new Error('boom inside ethers');
    });
    const { loadEthers } = await import('../src/lib/optional-ethers');
    await expect(loadEthers('x')).rejects.toThrow('boom inside ethers');
  });

  it('present: it returns ethers', async () => {
    const { loadEthers } = await import('../src/lib/optional-ethers');
    const ethers = await loadEthers('x');
    expect(typeof ethers.Wallet).toBe('function');
  });

  it('the SDK exports the error so callers can catch it by type', async () => {
    const sdk = await import('../src/lib/index');
    expect(typeof (sdk as { MissingDependencyError?: unknown }).MissingDependencyError).toBe('function');
  });
});
