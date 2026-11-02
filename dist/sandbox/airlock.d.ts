export type CandidateClass = 'artifact' | 'approval' | 'policy' | 'tool-config' | 'memory';
/** Quarantined, but a human decides; never auto-promoted. */
export declare const HELD_CLASSES: readonly CandidateClass[];
/** A worker may not hand itself an approval or a policy. Refused at the airlock and again at the gate. */
export declare const REFUSED_CLASSES: readonly CandidateClass[];
export interface Candidate {
    name: string;
    class: CandidateClass;
    size: number | null;
    sha256: string | null;
    type: 'json' | 'text' | 'binary' | null;
    status: 'quarantined' | 'refused';
    reasons: string[];
}
export interface AirlockOptions {
    maxFileBytes: number;
    maxFiles: number;
    canaries: string[];
}
export declare const DEFAULT_AIRLOCK: Omit<AirlockOptions, 'canaries'>;
export declare const sha256hex: (b: Buffer | string) => string;
/** Why a name may not be imported, or null. Names come from the worker, so they are untrusted. */
export declare function nameProblem(name: string): string | null;
/**
 * What a file claims to be. ponytail: name patterns plus top-level JSON keys; a renamed approval passes
 * as an artifact here. That is defence in depth only: the promoter never takes an approval from the outbox.
 */
export declare function classify(name: string, body: Buffer): CandidateClass;
/** Index of the first registered canary the bytes contain, or -1. Literal match only. */
export declare function canaryHit(body: Buffer, canaries: string[]): number;
/** Inspect every entry of a flat outbox, in name order. Never throws for one bad entry; it is refused instead. */
export declare function inspectOutbox(outbox: string, quarantine: string, o: AirlockOptions): Candidate[];
