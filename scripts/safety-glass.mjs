#!/usr/bin/env node
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'glass-'));
writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
execSync('npm install @hyperdag/trustshell@1.3.0 --no-fund --no-audit --silent', { cwd: dir, stdio: 'inherit' });
const req = createRequire(pathToFileURL(join(dir, 'package.json')).href);
const { TrustShell } = req('@hyperdag/trustshell');

const { client, health } = await TrustShell.init({ timeout: 60_000 });
if (!health.ok) process.exit(1);
const hal = await client.verifyOutput('The capital of France is Paris.');
const rep = await client.getRepID('trinity-shofet');
const proof = await client.presentProof('trinity-shofet', { verify: true });
const glass = {
  agent: 'trinity-shofet',
  hal: { verdict: hal.verdict, trustScore: hal.trustScore, evidence: hal.evidence },
  repid: { score: rep.repid, tier: rep.tier },
  onchain: {
    registry: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
    tx: '0xa9a17329b6cc4c7eb6bfbba547f076687c64512f084422258041d603ffda5c95',
    block: 46652364,
    method: 'Append Response',
  },
  proof: {
    scheme: proof.scheme,
    verified: proof.verification?.verified === true,
    revealed: 'range bound + tier in statement',
    hidden: 'live exact score may differ from statement snapshot',
    statement: proof.statement,
  },
};
console.log(JSON.stringify(glass, null, 2));
if (hal.verdict !== 'PASS' || typeof rep.repid !== 'number' || proof.verification?.verified !== true) process.exit(1);
process.exit(0);
