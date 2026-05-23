import * as fs from 'fs';
import * as path from 'path';

export interface TrustShellCliConfig {
  version: string;
  network: string;
  chainId: number;
  contracts: {
    identityRegistry: string;
    reputationRegistry: string;
  };
  api: {
    endpoint: string;
    apiKey?: string;
  };
}

export function loadConfig(): Partial<TrustShellCliConfig> {
  try {
    const configPath = path.join(process.cwd(), '.trustshell.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    // ignore
  }
  return {};
}
