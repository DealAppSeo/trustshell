/**
 * `trustshell profile` — show and edit the personal sections of `.trustshell/profile.md`.
 * --------------------------------------------------------------------------------------
 * EGRESS: none. Reads and writes one local file. Nothing here is auto-detected: every entry is
 * text the person typed. An edit rewrites only the section it touches (writePersonalSection), so
 * hand edits elsewhere in the file survive.
 *
 * Jobs to be done are not stored here; they live in the learn module's job list.
 */
import { type PersonalSection, type Preset, type PriorityName, type Profile, type StyleKey } from '../lib/profile';
export declare const PROFILE_PATH = ".trustshell/profile.md";
export type ProfileOp = {
    op: 'show';
} | {
    op: 'add';
    section: 'values' | 'constraints';
    text: string;
} | {
    op: 'add';
    section: 'people';
    text: string;
    why: string;
} | {
    op: 'set-style';
    key: StyleKey;
    value: string;
} | {
    op: 'set-priorities';
    preset?: Preset;
    order?: PriorityName[];
} | {
    op: 'remove';
    section: PersonalSection;
    index?: number;
    key?: StyleKey;
} | {
    op: 'interview';
    answers?: string[];
};
/** The first-run interview (Blueprint §5): three questions, each skippable, each says why it is asked. */
export declare const INTERVIEW: readonly [{
    readonly question: "Who do you most want to help?";
    readonly why: "So the agent knows whose good its work is for.";
}, {
    readonly question: "What is one thing you need done this week?";
    readonly why: "So the first job the agent learns is one you actually need.";
}, {
    readonly question: "What must never happen?";
    readonly why: "So the agent has a red line to hold, whatever else it is asked.";
}];
/** Jobs live in the learn module, not the profile. */
export declare function learnJobHint(job: string): string;
/**
 * PURE. Turn the words after `profile` into one operation, or a usage error. Every flag must
 * belong to the subcommand it came with: a stray `--why` is refused rather than ignored.
 */
export declare function parseProfileOp(rest: string[], opts?: {
    why?: string;
    preset?: string;
    answers?: string;
}): ProfileOp | {
    error: string;
};
/**
 * PURE. Apply an edit. Returns the new profile and the section it touched, or why it cannot.
 * `interview` is handled by runProfile, which may touch two sections.
 */
export declare function applyOp(p: Profile, op: Exclude<ProfileOp, {
    op: 'show' | 'interview';
}>): {
    profile: Profile;
    section: PersonalSection;
    said: string;
} | {
    error: string;
};
/** The filesystem calls this needs. Injectable, like init's. */
export interface ProfileFs {
    exists(p: string): boolean;
    read(p: string): string;
    mkdirp(p: string): void;
    writeFile(p: string, data: string): void;
}
export interface ProfileIo {
    out: (s: string) => void;
    err: (s: string) => void;
    /** Ask one question on a terminal. Absent when there is no terminal. */
    ask?: (prompt: string) => Promise<string>;
}
/** Run one profile operation. Exit 0 done, 1 refused (the file has problems), 2 usage. */
export declare function runProfile(op: ProfileOp, io: ProfileIo, fs: ProfileFs, json?: boolean): Promise<number>;
/** The real filesystem. Local file only; opens no socket. */
export declare function nodeProfileFs(): ProfileFs;
/** Ask on a terminal only. Piped stdin gets no prompt: use --answers. */
export declare function terminalAsk(): ProfileIo['ask'];
