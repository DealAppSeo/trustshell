#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { registerVerify } from './commands/verify';
import { registerWhois } from './commands/whois';
import { registerAttestation } from './commands/attestation';
import { registerInit } from './commands/init';
import { registerPay } from './commands/pay';

const program = new Command();

let version = '0.6.0';
try {
  const pkgPath = path.join(__dirname, '../../package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    version = pkg.version;
  }
} catch (e) {
  // fallback
}

program
  .name('trustshell')
  .description('Trust infrastructure for AI agents — HAL fact-check, ERC-8004 reputation, x402 payments')
  .version(version);

// Register commands
registerVerify(program);
registerWhois(program);
registerAttestation(program);
registerInit(program);
registerPay(program);

program.parse(process.argv);
