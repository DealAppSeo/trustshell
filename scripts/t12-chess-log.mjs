/**
 * Log the finished tournament on Base Sepolia.
 *
 * One giveFeedback on the champion's ERC-8004 token, tagged chess / double-elim,
 * so it does not use the hyperdag_repid tag and does not replace their RepID.
 * The value is their final CEP. The URI is the standings. The hash is the
 * keccak of the result file. ETH stakes are not transferred.
 *
 * Refuses when the on-chain-write breaker is open or unreadable, and when the
 * signing key is not the engine's allowed writer. Never prints the key.
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { ethers } = require('ethers');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FINAL = path.join(ROOT, 'results', 't12-double-elim.json');
const REGISTRY = '0x8004B663056A597Dffe9eCcC1965A193B7388713';
const ABI = [
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external',
];

function signingKey() {
  const names = ['REPUTATION_WRITER_KEY', 'MINTER_PRIVATE_KEY', 'OPERATOR_KEY'].map((suffix) => `ERC8004_${suffix}`);
  for (const name of names) {
    const value = (process.env[name] ?? '').trim();
    if (value) return { name, value };
  }
  return null;
}

function allowed(address) {
  const list = (process.env.ERC8004_FEEDBACK_WRITERS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^0x[0-9a-f]{40}$/.test(s));
  if (list.length === 0) return true;
  return list.includes(address.toLowerCase());
}

async function breakerOpen() {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('circuit breaker unreadable: no supabase env');
  const endpoint = `${url}/rest/v1/repid_config?key=eq.cb_disable_onchain_writes&select=value`;
  const res = await fetch(endpoint, { headers: { apikey: key, authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`circuit breaker unreadable: ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('circuit breaker unreadable: no row');
  return String(rows[0].value).toLowerCase() === 'true';
}

async function main() {
  const result = JSON.parse(await readFile(FINAL, 'utf8'));
  const champion = result.standings?.[0];
  if (!champion?.tokenId || champion.mint !== 'MINTED') {
    throw new Error(`champion ${champion?.name ?? '?'} has no minted token to log against`);
  }
  const key = signingKey();
  if (!key) throw new Error('no ERC-8004 signing key in the environment');
  if (await breakerOpen()) throw new Error('circuit breaker cb_disable_onchain_writes is open');

  const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org');
  const wallet = new ethers.Wallet(key.value, provider);
  if (!allowed(wallet.address)) throw new Error(`signer ${wallet.address} is not an allowed writer`);
  const balance = await provider.getBalance(wallet.address);
  if (balance === 0n) throw new Error(`signer ${wallet.address} has no Base Sepolia ETH`);

  const compact = {
    event: result.event,
    playedAt: result.playedAt,
    champion: champion.name,
    cep: champion.cep,
    standings: result.standings.map((row) => ({
      name: row.name,
      cep: row.cep,
      losses: row.losses,
      purseEth: row.purseEth,
    })),
    models: result.modelsSummary,
  };
  const body = JSON.stringify(compact);
  const hash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(result)));
  const cep = Math.round(champion.cep);
  if (cep < 10 || cep > 10000) throw new Error(`cep ${cep} outside the registry value band`);

  const contract = new ethers.Contract(REGISTRY, ABI, wallet);
  const tx = await contract.giveFeedback(
    BigInt(champion.tokenId),
    BigInt(cep),
    0,
    'chess',
    'double-elim',
    `https://repid-engine-production.up.railway.app/api/v1/passport/${champion.name}`,
    body.slice(0, 1800),
    hash,
  );
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) throw new Error(`tx failed ${tx.hash}`);
  const logged = {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    signer: wallet.address,
    keyName: key.name,
    tokenId: champion.tokenId,
    champion: champion.name,
    tag1: 'chess',
    tag2: 'double-elim',
    value: cep,
    basescan: `https://sepolia.basescan.org/tx/${receipt.hash}`,
  };
  console.log(JSON.stringify(logged, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : 'log failed');
  process.exit(1);
});
