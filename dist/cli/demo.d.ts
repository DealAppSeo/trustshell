type IO = {
    out: (s: string) => void;
    err: (s: string) => void;
};
export declare function runDemo(io: IO, env?: NodeJS.ProcessEnv): number;
export {};
