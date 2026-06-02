"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPay = registerPay;
const client_1 = require("../../x402/client");
const config_1 = require("../config");
function registerPay(program) {
    program
        .command('pay <contractId>')
        .description('Construct x402 payment for service contract escrow')
        .option('--key <privateKey>', 'Wallet private key (or set TRUSTSHELL_KEY env var)')
        .option('--endpoint <url>', 'repid-engine API endpoint')
        .option('--rpc <url>', 'Base Sepolia RPC URL')
        .action(async (contractId, opts) => {
        const cliConfig = (0, config_1.loadConfig)();
        const key = opts.key || process.env.TRUSTSHELL_KEY;
        const endpoint = opts.endpoint || cliConfig.api?.endpoint || 'https://repid-engine-production.up.railway.app';
        const rpcUrl = opts.rpc || cliConfig.network === 'base-sepolia' ? 'https://sepolia.base.org' : 'https://sepolia.base.org';
        if (!key) {
            console.error('Error: Wallet key required. Set TRUSTSHELL_KEY or pass --key.');
            console.error('  WARNING: Never paste private keys in shared environments.');
            process.exit(1);
        }
        console.log(`💳 x402 Payment Flow`);
        console.log(`  Contract: ${contractId}`);
        console.log();
        try {
            const result = await (0, client_1.escrowWithPaymentFlow)({
                contractId,
                privateKey: key,
                engineUrl: endpoint,
                rpcUrl
            });
            console.log(`  Settlement ID: ${result.x402_payment_id ?? 'N/A'}`);
            console.log(`  Status: ${result.status ?? 'N/A'}`);
        }
        catch (err) {
            console.error(`Error: ${err.message}`);
            process.exit(1);
        }
    });
}
//# sourceMappingURL=pay.js.map