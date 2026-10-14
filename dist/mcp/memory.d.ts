export declare function rememberLocal(text: string, env?: NodeJS.ProcessEnv, source?: string, sourceText?: string | null): {
    kind: 'note';
    remembered: true;
    id: number;
    provenance: 'untrusted';
    quarantined: true;
    reason: string | null;
    source_recorded: boolean;
};
export declare function recallLocal(env?: NodeJS.ProcessEnv, opts?: {
    includeQuarantined?: boolean;
}): {
    notes: string;
};
