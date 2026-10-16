export declare const MODES: readonly ["delegate", "cowork", "learn"];
export type Mode = (typeof MODES)[number];
export type Outcome = 'pass' | 'fail';
export type LessonStatus = 'candidate' | 'accepted' | 'declined' | 'retired' | 'quarantined';
export declare const MAX_LESSONS = 5;
export declare const MAX_LOOP_TOKENS = 400;
export declare const LESSON_DAYS = 30;
/** Spaced review ladder, in days. A recall moves one step up; a miss goes back to the first step. */
export declare const LADDER_DAYS: readonly [1, 3, 7, 14, 30];
/** A refused or malformed request. Nothing was written. The CLI exits 2. */
export declare class LearnError extends Error {
}
export declare const SCAFFOLD: Record<Mode, string>;
/**
 * Tokens, estimated as characters / 4.
 * ponytail: a fixed ratio, not a tokenizer; good enough for a 400-token cap. Use the model's own
 * tokenizer if a cap ever has to be exact.
 */
export declare function estimateTokens(text: string): number;
export declare function sha256(text: string): string;
export declare function addJob(slug: string, mode: string, jtbd: string, env?: NodeJS.ProcessEnv, now?: Date): void;
export type JobListItem = {
    slug: string;
    mode: Mode;
    jtbd: string;
    checks: {
        id: string;
        cmd: string;
    }[];
};
export declare function listJobs(env?: NodeJS.ProcessEnv): JobListItem[];
export declare function addCheck(job: string, id: string, cmd: string, env?: NodeJS.ProcessEnv, now?: Date): void;
/** Runs a registered command. Exit code only: null when it was killed or could not start. */
export type Exec = (cmd: string) => number | null;
export declare const execCheck: Exec;
export type CheckRun = {
    check: string;
    episode: number | null;
    exit: number | null;
    outcome: Outcome | null;
    retired: string[];
};
/**
 * Run a registered check and write its outcome on an episode whose check id was frozen at its start:
 * --episode, --turn, else the newest open episode on that job that froze this check, else a new
 * episode that froze it now. A command that did not exit (killed, timed out, could not start) writes
 * nothing: NOT_CHECKED. A fail retires every accepted lesson injected into that episode (§2.5).
 */
export declare function runCheck(id: string, opts?: {
    episode?: number;
    turn?: string;
}, env?: NodeJS.ProcessEnv, now?: Date, exec?: Exec): CheckRun;
export type RecordInput = {
    job?: string;
    episode?: number;
    turn?: string;
    model?: string;
    family?: string;
    tokens?: number;
    check?: string;
    confidence?: number;
    /** The agent's own outcome. Stored as agent_outcome; no ruler reads it. */
    outcome?: Outcome;
    askSha256?: string;
};
/** `learn record` / MCP learn_record. Writes episode metadata and agent_outcome, never check_outcome. */
export declare function recordEpisode(input: RecordInput, env?: NodeJS.ProcessEnv, now?: Date): {
    episode: number;
    created: boolean;
};
/** `learn rate`: the person's accept / edit / reject. Reported; never read by rulers 1–2. */
export declare function rateEpisode(episode: number, rating: string, env?: NodeJS.ProcessEnv, now?: Date): void;
export type Correction = {
    eval: number;
    lesson: number;
    status: LessonStatus;
    reason: string;
    note: number | null;
};
/**
 * The person's correction, verbatim. FAILURE FIRST (§2.2): the eval case is written before the lesson,
 * in one transaction. The lesson body is kind `lesson`, UNTRUSTED and QUARANTINED until `learn accept`
 * (§8.3). Text that came from somewhere else (`source`: a page, another agent, a model) is held for good
 * and never accepted; so is injection-looking text. A model's paraphrase (`note`) is kept as an ordinary
 * quarantined note, never injected. A secret-shaped correction or note writes nothing.
 */
export declare function correct(input: {
    job: string;
    text: string;
    check?: string;
    episode?: number;
    source?: string;
    note?: string;
}, env?: NodeJS.ProcessEnv, now?: Date): Correction;
/**
 * The person accepts a lesson: its row is released as trusted with LESSON_ACCEPTED, and it may be
 * injected for 30 days. Accepting an accepted lesson renews the 30 days. Held, declined or retired
 * lessons are refused; write a new correction instead.
 */
export declare function acceptLesson(id: number, env?: NodeJS.ProcessEnv, now?: Date): {
    expires_at: string;
};
/** Decline a candidate, or revert an accepted lesson. It is never injected again. */
export declare function declineLesson(id: number, env?: NodeJS.ProcessEnv, now?: Date): void;
export type LessonListItem = {
    id: number;
    job: string;
    check: string | null;
    status: LessonStatus;
    reason: string | null;
    expires_at: string | null;
    text: string;
};
export declare function listLessons(job: string | undefined, env?: NodeJS.ProcessEnv): LessonListItem[];
/** The person's own attempt. The next `inject` on this job binds it to that turn's episode. */
export declare function addAttempt(input: {
    job: string;
    text: string;
    episode?: number;
}, env?: NodeJS.ProcessEnv, now?: Date): number;
/**
 * A recall item cut by code from the person's own words: the longest word (4+ letters) is blanked,
 * with up to six words either side. Never model text. Null when no word is long enough.
 */
export declare function cloze(text: string): string | null;
export type Injection = {
    text: string;
    episode: number;
    lessons: number[];
    loop_tokens: number;
};
/**
 * What goes into the model's context for one turn of a job, and the episode that records it.
 *   - Only this job's lessons that the person accepted, unexpired, verbatim, through `injectable`.
 *   - At most 5 lessons and 400 tokens in all; a lesson that does not fit whole is left out, never cut.
 *   - learn mode: with no attempt by the person on this episode, the scaffold only, no lesson bodies
 *     (§8.2). After `learn attempt`, the lessons and one cloze from that attempt.
 *   - cowork mode: the prediction-first line, then the lessons.
 * Missing memory file or unknown job: null, nothing written. The tokens printed are added to the
 * episode's loop_tokens, so the loop's own cost is never left out of a ruler.
 */
export declare function inject(opts: {
    job: string;
    turn?: string;
    check?: string;
    askSha256?: string;
}, env?: NodeJS.ProcessEnv, now?: Date): Injection | null;
/** The person writes the criterion BEFORE the attempt. Learn jobs only; scored by a registered check. */
export declare function addProbe(input: {
    job: string;
    check: string;
    criterion: string;
}, env?: NodeJS.ProcessEnv, now?: Date): number;
/** Score one unaided attempt on a probe: 1 when its check exits 0, 0 otherwise. Prints no lesson. */
export declare function runProbe(id: number, env?: NodeJS.ProcessEnv, now?: Date, exec?: Exec): {
    probe: number;
    check: string;
    exit: number | null;
    score: number | null;
};
export type DueReview = {
    id: number;
    lesson: number;
    job: string;
    days: number;
    cue: string;
};
/** Reviews due now, for lessons still accepted. The cue is a cloze of the lesson, never its full text. */
export declare function dueReviews(env?: NodeJS.ProcessEnv, now?: Date): DueReview[];
/** Record a review. A recall moves one rung up the ladder; a miss resets to the 1-day rung (§8.2). */
export declare function answerReview(id: number, recalled: 'yes' | 'no', env?: NodeJS.ProcessEnv, now?: Date): {
    next_due: string;
    days: number;
};
export type Snapshot = {
    jobs: {
        slug: string;
        mode: Mode;
    }[];
    checks: {
        id: string;
        job: string;
        created_at: string;
    }[];
    episodes: {
        id: number;
        job: string;
        family: string | null;
        tokens: number | null;
        loop_tokens: number;
        check_id: string | null;
        confidence: number | null;
        confidence_at: string | null;
        agent_outcome: Outcome | null;
        check_outcome: Outcome | null;
        check_at: string | null;
        rating: string | null;
        injected: number[];
        created_at: string;
    }[];
    evals: {
        id: number;
        job: string;
        check_id: string | null;
        body_id: number;
    }[];
    lessons: {
        id: number;
        job: string;
        check_id: string | null;
        status: LessonStatus;
        accepted_at: string | null;
    }[];
    probes: {
        id: number;
        job: string;
        check_id: string;
        scores: {
            score: number;
            created_at: string;
        }[];
    }[];
    reviews: {
        result: 'yes' | 'no';
        answered_at: string;
    }[];
};
/** Every learn row the rulers need, metadata only. Null when there is no memory file. */
export declare function snapshot(env?: NodeJS.ProcessEnv): Snapshot | null;
