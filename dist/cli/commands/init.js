"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerInit = registerInit;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function registerInit(program) {
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
        }
        catch (err) {
            console.error(`Error: ${err.message}`);
            process.exit(1);
        }
    });
}
//# sourceMappingURL=init.js.map