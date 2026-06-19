#!/usr/bin/env node
/**
 * TrustShell CLI
 * Usage:
 *   npx @hyperdag/trustshell init [agentName]   # onboard a custodian + agent (no API key needed)
 *   npx @hyperdag/trustshell score "<text>"     # HAL-check text
 *   npx @hyperdag/trustshell verify <agentId>   # RepID + proof lookup
 *   npx @hyperdag/trustshell audit
 *
 * Env: REPID_API_URL (or TRUSTSHELL_API_URL), REPID_API_KEY, BYOK_PROVIDER (optional).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TrustShell } from './lib/trustshell';

const args = process.argv.slice(2);
const cmd = args[0];

const API_URL = process.env.REPID_API_URL || process.env.TRUSTSHELL_API_URL || undefined;
const CONFIG_DIR = path.join(os.homedir(), '.trustshell');

/**
 * Generate a custodial keypair (defer-web3). The private key stays LOCAL (never sent to the
 * server). The "address" is a stable custodial identifier — NOT a real EVM address (we avoid a
 * keccak/ethers dependency); a real wallet is attached later via BYOK. Honest by construction.
 */
function generateCustodialIdentity(): { address: string; privateKeyPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const pubDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const address = '0x' + crypto.createHash('sha256').update(pubDer).digest().subarray(-20).toString('hex');
  const privateKeyPem = (privateKey.export({ type: 'pkcs8', format: 'pem' }) as string);
  return { address, privateKeyPem };
}

async function runInit() {
  const byok = process.env.BYOK_PROVIDER; // BYOK optional
  const shell = new TrustShell({ apiUrl: API_URL, apiKey: process.env.REPID_API_KEY });

  // 1. connectivity (real probe, fail fast)
  const { health } = await TrustShell.init({ apiUrl: API_URL });
  if (!health.ok) {
    console.error(`✗ Backend unreachable (${API_URL ?? 'default backend'}): ${health.error ?? health.status ?? 'unknown'}`);
    process.exit(1);
  }

  // 2. custodial identity (web3 deferred) — private key saved LOCAL only
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const { address, privateKeyPem } = generateCustodialIdentity();
  const keyFile = path.join(CONFIG_DIR, 'custodial-key.pem');
  fs.writeFileSync(keyFile, privateKeyPem, { mode: 0o600 });

  // 3. onboard custodian + agent
  const agentName = args[1] || `agent-${address.slice(2, 10)}`;
  const result = await shell.onboard({
    agentName,
    conservatorAddress: address, // the human custodian (custodial; attach a real wallet via BYOK later)
    isHuman: false, // the AGENT row
    byokProvider: byok,
    llmProvider: byok || 'litellm-free', // default = free OSS via LiteLLM
  });

  // 4. save config (api key shown once → persist it)
  const configFile = path.join(CONFIG_DIR, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify({
    agentId: result.agentId,
    apiKey: result.apiKey,
    conservatorAddress: address,
    custodialKeyFile: keyFile,
    apiUrl: API_URL ?? null,
    byokProvider: byok ?? null,
    onboardedAt: new Date().toISOString(),
  }, null, 2), { mode: 0o600 });

  // 5. demo: a HAL-checked call on a free model (the quorum runs free OSS providers)
  let halLine = '(skipped)';
  try {
    const hal = await shell.halCheck('The capital of France is Paris.');
    halLine = `${hal.verdict} (trustScore ${hal.trustScore}/100)${hal.evidence?.length ? ' — ' + hal.evidence.slice(0, 2).join('; ') : ''}`;
  } catch (e: any) {
    halLine = `(HAL check unavailable: ${e?.message ?? e})`;
  }

  // 6. fetch + print the agent's RepID
  const rep = await shell.getRepID(result.agentId);

  console.log('');
  console.log('  ✓ TrustShell onboarded');
  console.log('  ────────────────────────────────────────────');
  console.log(`  Custodian (human)  ${address}  ${byok ? '(BYOK: ' + byok + ')' : '(custodial — attach a wallet later)'}`);
  console.log(`  Agent              ${agentName}`);
  console.log(`  Agent ID           ${result.agentId}`);
  console.log(`  Model              ${byok || 'free OSS (LiteLLM gateway)'}`);
  console.log(`  HAL check (free)   ${halLine}`);
  console.log(`  RepID              ${rep.repid}  (${rep.tier})`);
  console.log('  ────────────────────────────────────────────');
  console.log(`  Saved → ${configFile}  (API key inside — keep it safe)`);
  console.log(`  Next: import { TrustShell } from '@hyperdag/trustshell'`);
  console.log('');
}

async function main() {
  if (cmd === 'init') return runInit();

  const shell = new TrustShell({ apiUrl: API_URL, apiKey: process.env.REPID_API_KEY });

  if (cmd === 'score') {
    const text = args[1] || 'The capital of France is Paris.';
    console.log(JSON.stringify(await shell.halCheck(text), null, 2));
    return;
  }
  if (cmd === 'verify') {
    const agentId = args[1] || 'trinity-veritas';
    console.log(JSON.stringify(await shell.verify(agentId), null, 2));
    return;
  }
  if (cmd === 'audit') {
    console.log(JSON.stringify(await shell.audit(), null, 2));
    return;
  }

  console.log('TrustShell CLI');
  console.log('  init [agentName]   onboard a custodian + agent (no API key needed)');
  console.log('  score <text>       HAL-check text on free models');
  console.log('  verify <agentId>   RepID + proof lookup');
  console.log('  audit              verify the HAL audit chain');
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
