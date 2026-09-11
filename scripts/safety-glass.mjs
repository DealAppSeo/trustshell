#!/usr/bin/env node
/** HAL + RepID + tx + proof + cap — one JSON. Exit 0. */
import { TrustShell } from '../dist/lib/index.js';

const { client, health } = await TrustShell.init({ timeout: 60_000 });
if (!health.ok) process.exit(1);
const hal = await client.verifyOutput('The capital of France is Paris.');
const rep = await client.getRepID('trinity-shofet');
const proof = await client.presentProof('trinity-shofet', { verify: true, tier: 'envelope' });
const glass = {
  agent: 'trinity-shofet',
  hal: { verdict: hal.verdict, trustScore: hal.trustScore, evidence: hal.evidence },
  repid: { score: rep.repid, tier: rep.tier, lastAnchorTx: rep.lastAnchorTx },
  onchain: {
    registry: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
    tx: rep.lastAnchorTx === 'NOT_ANCHORED' ? null : rep.lastAnchorTx,
    note: rep.lastAnchorTx,
  },
  proof: {
    scheme: proof.scheme,
    verified: proof.verification?.verified === true,
    tier: proof.tier,
    statement: proof.statement,
  },
  cap: process.env.TRUSTSHELL_PAY_CAP ?? 'NOT_SET',
};
console.log(JSON.stringify(glass, null, 2));
if (hal.verdict !== 'PASS' || typeof rep.repid !== 'number' || proof.verification?.verified !== true) {
  process.exit(1);
}
process.exit(0);
