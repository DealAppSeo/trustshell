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
 *
 * The personal sections (values, people helped, style, constraints, model priorities) follow the
 * same rule: empty, never inferred, written only by the person, shared only under share_personal.
 * They are not rendered at all until one holds something, so a default profile stays
 * byte-identical to the one written before they existed.
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
/**
 * Model priorities (F4): a full ranking of the three, or one preset. Stored here only. Nothing
 * sends it to an engine yet; that needs the router change (F1).
 */
export declare const PRIORITY_NAMES: readonly ["cost", "speed", "quality"];
export type PriorityName = (typeof PRIORITY_NAMES)[number];
export declare const PRESETS: readonly ["balanced", "cost-first", "speed-first", "quality-first"];
export type Preset = (typeof PRESETS)[number];
export type ModelPriorities = {
    preset: Preset;
} | {
    order: PriorityName[];
};
/** Character and style (Blueprint §2): tone, detail level, risk appetite, working hours. */
export declare const STYLE_KEYS: readonly ["tone", "detail", "risk", "hours"];
export type StyleKey = (typeof STYLE_KEYS)[number];
export interface PersonHelped {
    who: string;
    why: string;
}
/**
 * The personal sections and their headings, in file order. Jobs to be done are NOT here: they
 * live in the learn module's own job list.
 */
export declare const PERSONAL_SECTIONS: {
    readonly values: "Values";
    readonly people: "People I help";
    readonly style: "Style";
    readonly constraints: "Constraints";
    readonly priorities: "Model priorities";
};
export type PersonalSection = keyof typeof PERSONAL_SECTIONS;
export interface Profile {
    version: number;
    share_identity: boolean;
    share_context: boolean;
    /** Covers every personal section. false unless the person sets it. */
    share_personal: boolean;
    identity: string;
    context: string;
    trust: TrustSettings;
    /** Ranked, most important first, in the person's own words. */
    values: string[];
    people: PersonHelped[];
    style: Partial<Record<StyleKey, string>>;
    constraints: string[];
    priorities: ModelPriorities | null;
}
/**
 * The project's canonical gates, not numbers invented here: CONFIDENCE_GATE =
 * 0.8 and REPID_HITL_GATE = 70. `ask_first` is the most conservative autonomy.
 */
export declare const DEFAULT_TRUST: TrustSettings;
export declare function defaultProfile(): Profile;
/** The personal sections that hold something, in file order. */
export declare function personalSectionsSet(p: Profile): PersonalSection[];
/** One personal section, heading to note, newline-terminated. An empty body is a blank line, like Identity. */
export declare function renderPersonalSection(p: Profile, s: PersonalSection): string;
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
/**
 * `who — why: reason`: split at the FIRST `why:` (any case) that has whitespace, one or more of — – -, and
 * optional whitespace before it, exactly as `^(.*?)\s+[—–-]+\s*why:\s*(.*)$/i` did. A linear scan: that regex
 * was quadratic (CodeQL js/polynomial-redos). Each backward walk stops at the previous `why:`, so the walks
 * never overlap. No separator: the whole item is who.
 */
export declare function splitPerson(item: string): PersonHelped;
/** `cost,quality speed` → ['cost','quality','speed'], lower-cased. */
export declare function splitOrder(raw: string): string[];
/** null when `names` ranks all three priorities exactly once; otherwise why not. */
export declare function checkOrder(names: readonly string[]): string | null;
/** null when `raw` is a known preset; otherwise why not. */
export declare function checkPreset(raw: string): string | null;
/**
 * null when `raw` can be stored as one entry and read back unchanged; otherwise why not. One line,
 * so it cannot open a new section; no comment markers, because the parser strips comments.
 */
export declare function checkText(raw: string, what: string): string | null;
/**
 * PURE. Rewrite ONE personal section of an existing profile file to match `p`, leaving every other
 * byte alone: hand edits, comments and unknown sections elsewhere survive. A file with no personal
 * section yet gets the whole block appended, in file order, exactly as `renderProfile` would write
 * it, and the `share_personal` flag is added to the frontmatter as written in `p` (false unless the
 * person set it).
 */
export declare function writePersonalSection(text: string, p: Profile, s: PersonalSection): string;
