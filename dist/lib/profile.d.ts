/**
 * `.trustshell/profile.md` — read, write and validate.
 * ----------------------------------------------------
 * The generator ships; what it generates does not. `.trustshell/` is gitignored,
 * this module is committed, so a fresh clone can always regenerate a profile and
 * never inherits one.
 *
 * EGRESS: none. This module opens no socket and never will. `init` is the one
 * command a sceptic runs before deciding whether to trust the rest.
 *
 * THE DEFAULT IS SILENCE. Every share flag is false and every section is empty.
 * `init` does not read your git config, hostname, username or email — not
 * because it cannot, but because a file that may be summarised into a shareable
 * artefact must contain nothing you did not deliberately write. Auto-detecting a
 * name is a convenience that silently converts a local file into a disclosure
 * the first time anyone runs `report`.
 */
/** Bump only on a breaking change to the file's shape. */
export declare const PROFILE_VERSION = 1;
/** The vocabulary `tool_call_log` already uses. Most conservative first. */
export type Autonomy = 'ask_first' | 'do_then_tell' | 'just_do_it';
export declare const AUTONOMY_VALUES: readonly Autonomy[];
export interface TrustSettings {
    autonomy: Autonomy;
    confidence_gate: number;
    hitl_gate: number;
}
export interface Profile {
    version: number;
    share_identity: boolean;
    share_context: boolean;
    identity: string;
    context: string;
    trust: TrustSettings;
}
/**
 * The project's canonical gates, not numbers invented here: CONFIDENCE_GATE =
 * 0.8 and REPID_HITL_GATE = 70. `ask_first` is the most conservative autonomy.
 */
export declare const DEFAULT_TRUST: TrustSettings;
export declare function defaultProfile(): Profile;
/**
 * The file `init` writes. The comments are load-bearing: they are where a reader
 * learns that the blanks are deliberate, so nobody "helpfully" auto-fills them.
 */
export declare function renderProfile(p?: Profile): string;
/** A problem with a profile. Never thrown for a missing file — that is not an error. */
export interface ProfileProblem {
    field: string;
    detail: string;
}
export interface ParsedProfile {
    profile: Profile;
    problems: ProfileProblem[];
}
/**
 * PURE. Parse profile text into a Profile plus the list of things wrong with it.
 * Unparseable values always resolve to the private/conservative default and are
 * reported, rather than throwing — a malformed profile must not stop `report`
 * from running, it must stop `report` from sharing.
 */
export declare function parseProfile(text: string): ParsedProfile;
