#!/usr/bin/env node
/**
 * TrustShell CLI — guest-first onboarding + claim.
 * Usage:
 *   npx @hyperdag/trustshell init [agentName]        # zero-input guest onboard; earns RepID now
 *   npx @hyperdag/trustshell claim --email <x>       # bind a handle so you can return & claim
 *                              claim --wallet <0x..> | claim --2fa <code>
 *   npx @hyperdag/trustshell whoami                  # DID + nullifier + RepID + per-vertical
 *   npx @hyperdag/trustshell credential              # full credential view (commitment, never raw)
 *   npx @hyperdag/trustshell score "<text>"          # HAL-check on free models
 *   npx @hyperdag/trustshell verify <agentId>
 *
 * Env: REPID_API_URL (or TRUSTSHELL_API_URL), REPID_API_KEY, BYOK_PROVIDER (optional).
 * Privacy: prints DID + nullifier (commitment), never raw identity/handle.
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
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function loadConfig(): any {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return null; }
}
function saveConfig(cfg: any): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}
function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Custodial keypair (web3 deferred). Private key stays LOCAL — never sent to the server. */
function generateCustodialIdentity(): { address: string; privateKeyPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const pubDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const address = '0x' + crypto.createHash('sha256').update(pubDer).digest().subarray(-20).toString('hex');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  return { address, privateKeyPem };
}

/** Anonymous holder DID + a privacy nullifier (one-way commitment) — reveals NOTHING about identity. */
function deriveHolderIdentity(privateKeyPem: string, address: string): { holderDid: string; nullifier: string } {
  const holderDid = 'did:hyperdag:' + crypto.createHash('sha256').update(address).digest('hex').slice(0, 32);
  const nullifier = crypto.createHash('sha256').update(privateKeyPem + ':claim-scope').digest('hex').slice(0, 32);
  return { holderDid, nullifier };
}

function banner() {
  console.log('  ⚠  Early stage — here be dragons. Your value is saved LOCALLY (~/.trustshell) and');
  console.log('     earns RepID now; run `trustshell claim` anytime to bind it to email/wallet/2FA.');
}

async function runInit() {
  const byok = process.env.BYOK_PROVIDER; // BYOK optional
  const shell = new TrustShell({ apiUrl: API_URL, apiKey: process.env.REPID_API_KEY });

  const { health } = await TrustShell.init({ apiUrl: API_URL });
  if (!health.ok) {
    console.error(`✗ Backend unreachable (${API_URL ?? 'default backend'}): ${health.error ?? health.status ?? 'unknown'}`);
    process.exit(1);
  }

  // Custodial identity + anonymous holder DID (web3 + signup BOTH deferred — zero required input)
  const { address, privateKeyPem } = generateCustodialIdentity();
  const keyFile = path.join(CONFIG_DIR, 'custodial-key.pem');
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(keyFile, privateKeyPem, { mode: 0o600 });
  const { holderDid, nullifier } = deriveHolderIdentity(privateKeyPem, address);

  const agentName = args[1] || `agent-${address.slice(2, 10)}`;
  const result = await shell.onboard({
    agentName,
    conservatorAddress: address,
    isHuman: false,
    byokProvider: byok,
    llmProvider: byok || 'litellm-free',
  });

  saveConfig({
    holderDid, nullifier,
    agentId: result.agentId, apiKey: result.apiKey,
    conservatorAddress: address, custodialKeyFile: keyFile,
    apiUrl: API_URL ?? null, byokProvider: byok ?? null,
    claim: { status: 'unclaimed' },
    onboardedAt: new Date().toISOString(),
  });

  // demo: a HAL-checked call on a free model (the quorum runs free OSS providers)
  let halLine = '(skipped)';
  try {
    const hal = await shell.halCheck('The capital of France is Paris.');
    halLine = `${hal.verdict} (trustScore ${hal.trustScore}/100)${hal.evidence?.length ? ' — ' + hal.evidence.slice(0, 2).join('; ') : ''}`;
  } catch (e: any) { halLine = `(HAL check unavailable: ${e?.message ?? e})`; }

  const rep = await shell.getRepID(result.agentId);

  console.log('');
  console.log('  ✓ TrustShell — guest onboarded (no wallet, no email, no signup)');
  console.log('  ────────────────────────────────────────────');
  console.log(`  Holder DID         ${holderDid}`);
  console.log(`  Nullifier          ${nullifier}   (privacy commitment — never your raw identity)`);
  console.log(`  Agent              ${agentName}  ·  ${result.agentId}`);
  console.log(`  Model              ${byok || 'free OSS (LiteLLM gateway)'}`);
  console.log(`  HAL check (free)   ${halLine}`);
  console.log(`  RepID              ${rep.repid}  (${rep.tier})`);
  console.log('  ────────────────────────────────────────────');
  banner();
  console.log(`  Saved → ${CONFIG_FILE}`);
  console.log('');
}

async function runClaim() {
  const cfg = loadConfig();
  if (!cfg?.holderDid) { console.error('✗ No local identity — run `trustshell init` first.'); process.exit(1); }

  const email = flag('--email'); const wallet = flag('--wallet'); const twofa = flag('--2fa');
  const handleType = email ? 'email' : wallet ? 'wallet' : twofa ? '2fa' : undefined;
  const handle = email || wallet || twofa;
  if (!handleType || !handle) {
    console.error('✗ Provide ONE handle: --email <addr> | --wallet <0x..> | --2fa <code>');
    process.exit(1);
  }

  // privacy: store only a hash preview locally, never the raw handle
  const handlePreview = crypto.createHash('sha256').update(handle).digest('hex').slice(0, 12);

  // Stub behind a flag: POST /api/v1/identity/claim is GA-owned (identity lane) and not live yet
  // (it currently 401/403s from the auth layer because the route doesn't exist). By default we STAGE
  // the claim LOCALLY — never write identity tables directly. Set TRUSTSHELL_CLAIM_ENABLED=true to
  // attempt the real endpoint once GA ships it; any not-live response degrades back to staged-local.
  let status = 'staged-local';
  let detail = 'endpoint POST /api/v1/identity/claim is GA-owned and not live yet — staged locally; re-run after it ships, or set TRUSTSHELL_CLAIM_ENABLED=true to attempt';
  if (process.env.TRUSTSHELL_CLAIM_ENABLED === 'true') {
    const shell = new TrustShell({ apiUrl: cfg.apiUrl || API_URL, apiKey: cfg.apiKey });
    try {
      const r = await shell.claimIdentity({ holderDid: cfg.holderDid, handleType: handleType as any, handle });
      status = r?.claimable === false ? 'bound' : (r?.status || 'bound');
      detail = 'bound on backend';
    } catch (e: any) {
      status = 'staged-local';
      detail = `claim endpoint returned ${e?.status ?? '?'} (not live yet, GA-owned) — staged locally`;
    }
  }

  cfg.claim = { status, handleType, handlePreview, claimedAt: new Date().toISOString(), detail };
  saveConfig(cfg);

  console.log('');
  console.log(`  ${status === 'bound' ? '✓ Claimed' : '◑ Claim staged'} — ${detail}`);
  console.log(`  Holder DID   ${cfg.holderDid}`);
  console.log(`  Handle       ${handleType}:${handlePreview}…   (hashed — raw value never stored)`);
  console.log(`  Agent        ${cfg.agentId}`);
  console.log('');
}

/** Per-vertical breakdown — consumes GA's credential payload defensively (may not be live yet). */
async function fetchVerticals(shell: TrustShell, agentId: string): Promise<string> {
  const base = (shell as any).baseUrl ?? (API_URL ?? 'https://repid-engine-production.up.railway.app');
  try {
    const res = await fetch(`${base}/api/v1/repid/${encodeURIComponent(agentId)}/credential`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return res.status === 404 ? 'per-vertical: pending (GA credential payload not live yet)' : `per-vertical: unavailable (${res.status})`;
    const data: any = await res.json();
    const verticals = data.verticals || data.by_vertical || data.v_repid_by_vertical;
    if (!verticals || (Array.isArray(verticals) && verticals.length === 0)) return 'per-vertical: none yet';
    const rows = Array.isArray(verticals) ? verticals : Object.entries(verticals).map(([vertical, repid]) => ({ vertical, repid }));
    return rows.map((r: any) => `${r.vertical}:${r.repid ?? r.repid_score}`).join('  ');
  } catch {
    return 'per-vertical: pending (GA credential payload not live yet)';
  }
}

async function runWhoami(full: boolean) {
  const cfg = loadConfig();
  if (!cfg?.agentId) { console.error('✗ No local identity — run `trustshell init` first.'); process.exit(1); }
  const shell = new TrustShell({ apiUrl: cfg.apiUrl || API_URL, apiKey: cfg.apiKey });
  const rep = await shell.getRepID(cfg.agentId);
  const verticals = await fetchVerticals(shell, cfg.agentId);

  console.log('');
  console.log(full ? '  TrustShell credential' : '  whoami');
  console.log('  ────────────────────────────────────────────');
  console.log(`  Holder DID     ${cfg.holderDid}`);
  console.log(`  Nullifier      ${cfg.nullifier}   (commitment — never raw identity)`);
  console.log(`  Agent          ${cfg.agentId}`);
  console.log(`  RepID overall  ${rep.repid}  (${rep.tier})`);
  console.log(`  By vertical    ${verticals}`);
  console.log(`  Claim          ${cfg.claim?.status ?? 'unclaimed'}${cfg.claim?.handleType ? ` (${cfg.claim.handleType}:${cfg.claim.handlePreview}…)` : ''}`);
  if (full) {
    console.log(`  Latest proof   ${rep.latestProofHash ?? '(none yet)'}`);
    console.log(`  Anchor tx      ${rep.lastAnchorTx ?? '(none yet)'}`);
  }
  console.log('  ────────────────────────────────────────────');
  console.log('');
}

async function main() {
  if (cmd === 'init') return runInit();
  if (cmd === 'claim') return runClaim();
  if (cmd === 'whoami') return runWhoami(false);
  if (cmd === 'credential') return runWhoami(true);

  const shell = new TrustShell({ apiUrl: API_URL, apiKey: process.env.REPID_API_KEY });
  if (cmd === 'score') { console.log(JSON.stringify(await shell.halCheck(args[1] || 'The capital of France is Paris.'), null, 2)); return; }
  if (cmd === 'verify') { console.log(JSON.stringify(await shell.verify(args[1] || 'trinity-veritas'), null, 2)); return; }
  if (cmd === 'audit') { console.log(JSON.stringify(await shell.audit(), null, 2)); return; }

  console.log('TrustShell CLI');
  console.log('  init [agentName]                 guest onboard (no input) — earns RepID now');
  console.log('  claim --email|--wallet|--2fa <x> bind a handle to claim your agent + XP later');
  console.log('  whoami                           DID + nullifier + RepID + per-vertical');
  console.log('  credential                       full credential view (commitment, never raw)');
  console.log('  score <text>                     HAL-check on free models');
  console.log('  verify <agentId>                 RepID + proof lookup');
}

main().catch((err) => { console.error(err?.message ?? err); process.exit(1); });
