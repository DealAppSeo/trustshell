export type MyJob = {
    status: 'OK';
    agent_id: string;
    role: string | null;
    tools: string[];
    other_permissions: string[];
    until: string | null;
    card: string;
} | {
    status: 'NOT_CHECKED';
    reason: string;
};
type Env = Record<string, string | undefined>;
type FetchLike = (url: string) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}>;
export declare function resolveAgentId(env?: Env, read?: (p: string) => string): string | null;
export declare function myJob(opts?: {
    env?: Env;
    read?: (p: string) => string;
    fetchImpl?: FetchLike;
}): Promise<MyJob>;
export {};
