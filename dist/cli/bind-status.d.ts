/** A true stake is shadow even when SAYS_STAKE_LIVE is set. This command does not send. */
export declare function stakeShadow(value: unknown): string;
export declare function bindStatusText(opts: {
    env: NodeJS.ProcessEnv;
    fetchImpl: typeof fetch;
}): Promise<string>;
