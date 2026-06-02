"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWhois = registerWhois;
const reputation_1 = require("../../reputation");
const config_1 = require("../config");
const ethers_1 = require("ethers");
function registerWhois(program) {
    program
        .command('whois <agentAddressOrId>')
        .description('Query agent reputation from ERC-8004')
        .option('--rpc <url>', 'Base Sepolia RPC URL')
        .option('--registry <address>', 'ReputationRegistry contract address')
        .option('--engine <url>', 'repid-engine URL')
        .action(async (agentAddressOrId, opts) => {
        const cliConfig = (0, config_1.loadConfig)();
        const rpcUrl = opts.rpc || cliConfig.network === 'base-sepolia' ? 'https://sepolia.base.org' : 'https://sepolia.base.org';
        const registryAddress = opts.registry || cliConfig.contracts?.reputationRegistry || '0x8004B663056A597Dffe9eCcC1965A193B7388713';
        const engineUrl = opts.engine || cliConfig.api?.endpoint || 'https://repid-engine-production.up.railway.app';
        console.log(`🪪 Agent Reputation (ERC-8004 Base Sepolia)`);
        console.log(`  Identifier: ${agentAddressOrId}`);
        console.log();
        try {
            const provider = new ethers_1.ethers.JsonRpcProvider(rpcUrl);
            const resolvedId = await (0, reputation_1.resolveAgentId)(agentAddressOrId, provider, { engineUrl });
            const repId = await (0, reputation_1.getRepID)(resolvedId, {
                provider,
                reputationRegistryAddress: registryAddress,
                engineUrl
            });
            const rawScore = Number(repId.value);
            const decimals = repId.decimals || 0;
            const divisor = decimals > 0 ? Math.pow(10, decimals) : 100;
            const percentageScore = Math.round(rawScore / divisor);
            let tier = 'PROBATIONARY';
            if (rawScore >= 8000)
                tier = 'VETERAN';
            else if (rawScore >= 5000)
                tier = 'AUTONOMOUS';
            else if (rawScore >= 1000)
                tier = 'ESTABLISHED';
            else if (rawScore >= 500)
                tier = 'EARNING';
            console.log(`  Token ID: ${resolvedId.toString()}`);
            console.log(`  Recent attestations: ${repId.count}`);
            console.log(`  Average score: ${percentageScore} / 100`);
            console.log(`  Tier: ${tier}`);
        }
        catch (err) {
            console.error(`Error: ${err.message}`);
            process.exit(1);
        }
    });
}
//# sourceMappingURL=whois.js.map