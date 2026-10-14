import { releaseByGround } from '../memory/quarantine';
export declare function rememberLocal(text: string, env?: NodeJS.ProcessEnv, source?: string): {
    kind: 'note';
    remembered: true;
    id: number;
    provenance: 'untrusted';
    quarantined: true;
    reason: string | null;
};
export declare function recallLocal(env?: NodeJS.ProcessEnv, opts?: {
    includeQuarantined?: boolean;
}): {
    notes: string;
};
/** Ground release over MCP: the source is passed as text. Local, no network. */
export declare function releaseLocal(id: number, sourceText: string, page?: number | null, env?: NodeJS.ProcessEnv): ReturnType<typeof releaseByGround>;
