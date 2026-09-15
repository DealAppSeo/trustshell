#!/usr/bin/env node
/**
 * T6 A1 — keyless verifySigner against the public Base Sepolia registry.
 * Exit 0 VERIFIED, 2 NOT_CHECKED (RPC), 1 FAILED.
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

execSync('npm run sdk:build', { stdio: 'inherit' });
const require = createRequire(import.meta.url);
const { verifySigner, HYPERDAG_REPID_SIGNERS } = require(resolve(process.cwd(), 'dist/lib/index.js'));

const tokenId = process.env.T6_TOKEN_ID || '6705';
const r = await verifySigner({ tokenId });
if (r.reasons?.fetch) {
  console.error('NOT_CHECKED', r.reasons.fetch);
  process.exit(2);
}
console.log(JSON.stringify({ tokenId: r.tokenId, n: r.signers.length, signers: r.signers, roles: HYPERDAG_REPID_SIGNERS.map((s) => s.role) }, null, 2));
if (!Array.isArray(r.signers)) {
  console.error('FAILED signers missing');
  process.exit(1);
}
process.exit(0);
