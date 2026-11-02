import { type Candidate } from './airlock';
import { type Exec, type Runtime } from './mission';
type IO = {
    out: (s: string) => void;
    err: (s: string) => void;
};
export declare const missionDir: (home: string, id: string) => string;
export interface SandboxedRun {
    mission_id: string;
    exit_code: number | null;
    timed_out: boolean;
    candidates: Candidate[];
    passport_path: string;
}
/** Run `command` in a mission container with `cwd` as its read-only input. Throws MissionRefused if nothing started. */
export declare function runSandboxed(o: {
    home: string;
    cwd: string;
    runtime: Runtime;
    command: string[];
}, exec?: Exec): SandboxedRun;
export interface Promotion {
    receipt_path: string;
    keys_path: string;
    store: string;
    promoted: {
        name: string;
        sha256: string;
        path: string;
    }[];
    refused: {
        name: string;
        reasons: string[];
    }[];
    verify: {
        ok: boolean;
        errors: string[];
    };
}
/** The owner's step: promote what the airlock quarantined, revoke the token, sign the receipt. Once per mission. */
export declare function promoteMission(home: string, id: string): Promotion;
export declare const SANDBOX_USAGE = "trustshell sandbox promote <mission> [--json]   (the owner step after trustshell run --sandbox)";
/** `trustshell sandbox promote <mission>`. */
export declare function sandboxCli(argv: string[], io: IO, env?: NodeJS.ProcessEnv): number;
export {};
