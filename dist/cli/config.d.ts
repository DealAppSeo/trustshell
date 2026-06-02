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
export declare function loadConfig(): Partial<TrustShellCliConfig>;
//# sourceMappingURL=config.d.ts.map