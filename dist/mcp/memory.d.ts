export declare function rememberLocal(text: string, env?: NodeJS.ProcessEnv): {
    kind: 'note';
    remembered: true;
};
export declare function recallLocal(env?: NodeJS.ProcessEnv): {
    notes: string;
};
