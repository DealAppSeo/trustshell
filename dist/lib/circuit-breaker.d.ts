/**
 * Halt after N identical failures in a row. A VETO, a cap refusal, or a no-progress beat that keeps
 * repeating is a stuck loop, not work — the "screensaver loop" this exists to kill. `record(key)`
 * returns a one-line halt reason once the SAME key repeats `threshold` (default 3) times in a row; a
 * different key resets the streak. The caller STOPS on a non-null return — the breaker names the root
 * cause and halts rather than retrying forever.
 *
 * Wrap any retry/beat loop (init-pai turns, A2A retry): feed each outcome's key to `record`, and
 * break out the moment it returns a reason.
 */
export type BreakerOutcome = 'VETO' | 'cap_refuse' | 'no_progress';
export declare class CircuitBreaker {
    private readonly threshold;
    private lastKey;
    private streak;
    constructor(threshold?: number);
    /**
     * Record one outcome. Identical consecutive keys accumulate; a different key resets to 1.
     * Returns a one-line halt reason at the threshold, else null. Once tripped it stays tripped for
     * that key until `reset()` — every further identical record keeps returning the halt reason.
     */
    record(key: string): string | null;
    /** A successful or different beat clears the breaker so a later genuine retry is allowed. */
    reset(): void;
    /** The key the breaker tripped on, or undefined if it has not tripped. */
    get trippedKey(): string | undefined;
}
