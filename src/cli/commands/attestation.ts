import { Command } from 'commander';
import { getAttestation } from '../../reputation';
import { loadConfig } from '../config';
import { ethers } from 'ethers';

export function registerAttestation(program: Command) {
  program
    .command('attestation <txHash>')
    .description('Look up specific attestation by transaction hash')
    .option('--rpc <url>', 'Base Sepolia RPC URL')
    .option('--registry <address>', 'ReputationRegistry contract address')
    .action(async (txHash, opts) => {
      const cliConfig = loadConfig();
      const rpcUrl = opts.rpc || cliConfig.network === 'base-sepolia' ? 'https://sepolia.base.org' : 'https://sepolia.base.org';
      const registryAddress = opts.registry || cliConfig.contracts?.reputationRegistry || '0x8004B663056A597Dffe9eCcC1965A193B7388713';

      console.log(`📜 Attestation Details`);
      console.log(`  Tx Hash: ${txHash}`);
      console.log();

      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const att = await getAttestation(txHash, {
          provider,
          reputationRegistryAddress: registryAddress
        });

        console.log(`  Block: ${att.blockNumber}`);
        console.log(`  From client: ${att.clientAddress}`);
        console.log(`  To agent ID: ${att.agentId}`);
        console.log(`  Score: ${att.value.toString()}`);
        
        const tags = [att.tag1, att.tag2].filter(t => t && t.trim().length > 0);
        if (tags.length > 0) {
          console.log(`  Tags: ${tags.join(', ')}`);
        }
        if (att.feedbackURI) {
          console.log(`  Feedback URI: ${att.feedbackURI}`);
        }
        if (att.feedbackHash) {
          console.log(`  Feedback Hash: ${att.feedbackHash}`);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
