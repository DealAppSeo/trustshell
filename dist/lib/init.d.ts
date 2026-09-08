/**
 * `trustshell init` — create `.trustshell/` and a blank profile.
 * --------------------------------------------------------------
 * EGRESS: none. No account, no key, no telemetry, no socket. This is the first
 * command a sceptic runs, and it has to be the easiest one to audit: it writes
 * one file, in one directory, containing nothing it did not ask you for.
 *
 * It NEVER overwrites without `--force`, because the file it would clobber is
 * the one holding your trust settings.
 */
import { type Profile } from './profile';
export declare const TRUSTSHELL_DIR = ".trustshell";
export declare const PROFILE_FILE = "profile.md";
export type InitOutcome = 'CREATED' | 'EXISTS' | 'OVERWRITTEN';
export interface InitResult {
    outcome: InitOutcome;
    dir: string;
    path: string;
    /** What init could not do for you, stated rather than silently skipped. */
    still_manual: string[];
    /** Present only when a file was written. */
    bytes?: number;
}
/**
 * The seam that is NOT designed, named out loud rather than faked.
 *
 * `init` should be able to register the recorder with the OpenClaw shell, but
 * that plugin is not in this repository and its interface is unknown. Inventing
 * one here would produce a command that claims to have wired something up and
 * has not — the exact failure this product exists to catch. So it says so.
 */
export declare function stillManual(): string[];
/** The filesystem calls this needs. Injectable so the logic is testable without touching a disk. */
export interface InitFs {
    exists(p: string): boolean;
    mkdirp(p: string): void;
    writeFile(p: string, data: string): void;
}
export interface InitOptions {
    cwd?: string;
    force?: boolean;
    profile?: Profile;
}
/**
 * Create the directory and profile. Returns what it did — it does not print, and
 * it does not exit. The caller decides how to render and what code to exit with.
 */
export declare function runInit(fs: InitFs, opts?: InitOptions): InitResult;
/** Exit code. EXISTS is 0 — "already done" is not a failure. */
export declare function initExitCode(outcome: InitOutcome): number;
export declare function formatInitCard(r: InitResult): string;
