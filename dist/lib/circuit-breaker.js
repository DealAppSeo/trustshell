"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreaker = void 0;
class CircuitBreaker {
    constructor(threshold = 3) {
        this.threshold = threshold;
        this.streak = 0;
        if (!Number.isInteger(threshold) || threshold < 1) {
            throw new Error(`CircuitBreaker threshold must be an integer >= 1, got ${threshold}`);
        }
    }
    /**
     * Record one outcome. Identical consecutive keys accumulate; a different key resets to 1.
     * Returns a one-line halt reason at the threshold, else null. Once tripped it stays tripped for
     * that key until `reset()` — every further identical record keeps returning the halt reason.
     */
    record(key) {
        if (key === this.lastKey)
            this.streak++;
        else {
            this.lastKey = key;
            this.streak = 1;
        }
        if (this.streak >= this.threshold) {
            return `circuit_halt: ${this.streak}× identical '${key}' in a row — halting, no retry (root cause: repeated ${key})`;
        }
        return null;
    }
    /** A successful or different beat clears the breaker so a later genuine retry is allowed. */
    reset() {
        this.lastKey = undefined;
        this.streak = 0;
    }
    /** The key the breaker tripped on, or undefined if it has not tripped. */
    get trippedKey() {
        return this.streak >= this.threshold ? this.lastKey : undefined;
    }
}
exports.CircuitBreaker = CircuitBreaker;
