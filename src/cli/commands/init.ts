import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

export function registerInit(program: Command) {
  program
    .command('init')
    .description('Initialize TrustShell config in current directory')
    .action(async () => {
      const configPath = path.join(process.cwd(), '.trustshell.json');

      if (fs.existsSync(configPath)) {
        console.log('✓ TrustShell already initialized in this directory');
        return;
      }

      const config = {
        version: '0.6.0',
        network: 'base-sepolia',
        chainId: 84532,
        contracts: {
          identityRegistry: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
          reputationRegistry: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
        },
        api: {
          endpoint: 'https://repid-engine-production.up.railway.app',
        },
      };

      try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        console.log('✓ Initialized TrustShell in current directory');
        console.log('  Created: .trustshell.json');
        console.log('  Network: Base Sepolia');
        console.log('  Run `trustshell --help` for available commands');
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
