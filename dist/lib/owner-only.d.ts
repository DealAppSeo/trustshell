export type Run = (file: string, args: string[], opts: {
    encoding?: 'utf8';
    stdio?: 'pipe';
    windowsHide: boolean;
}) => string | Buffer;
/** Narrow `p` to this user. Throws when it cannot; the callers decide whether that is fatal. */
export declare function ownerOnly(p: string, kind: 'file' | 'dir', platform?: NodeJS.Platform, run?: Run): void;
/**
 * ownerOnly, at most once per path per process (a folder is not re-narrowed on every call), and never
 * fatal: an unrestricted file is what every earlier version had, so failing the command would not make
 * it safer. A failure is reported as a process warning with `code`, never swallowed.
 */
export declare function tryOwnerOnly(p: string, kind: 'file' | 'dir', code: string, narrow?: (p: string, kind: 'file' | 'dir') => void): void;
/** Test seam: forget which paths were narrowed in this process. */
export declare function __resetOwnerOnlyCache(): void;
