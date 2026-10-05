/**
 * `ethers` is an OPTIONAL peer dependency from 1.6.0. Only two SDK functions use it: signing an
 * x402 payment (`buildX402Payment` / `guardedX402Payment`) and the keyless on-chain read behind
 * `verifySigner`. Measured on the published 1.5.0, it was 23 of the 50 MB every install pulled,
 * for `verify`, `check`, `repid` and `proof` users who never touch a chain.
 *
 * A caller of those two paths who has not installed it gets this error, which says what to run,
 * instead of a module-resolution stack trace. Any other failure inside ethers is rethrown as is.
 */
export class MissingDependencyError extends Error {
  readonly code = 'ETHERS_MISSING';
  constructor(purpose: string) {
    super(`${purpose} needs the ethers package, which is optional since @hyperdag/trustshell 1.6.0. Install it next to trustshell: npm i ethers@^6`);
    this.name = 'MissingDependencyError';
  }
}

function isMissing(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  if (!e) return false;
  if (e.code === 'MODULE_NOT_FOUND' || e.code === 'ERR_MODULE_NOT_FOUND') return /ethers/.test(String(e.message ?? ''));
  return false;
}

export async function loadEthers(purpose: string): Promise<typeof import('ethers')> {
  try {
    return await import('ethers');
  } catch (err) {
    if (isMissing(err)) throw new MissingDependencyError(purpose);
    throw err;
  }
}
