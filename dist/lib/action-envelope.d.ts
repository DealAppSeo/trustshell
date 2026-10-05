/**
 * S5 stub — one action class cannot run without a typed envelope.
 * Unit-test only. Not exported from the package entry.
 */
export declare const ACTION_ORIGINS: readonly ["Cli", "Site", "Mcp", "Market"];
export type ActionOrigin = (typeof ACTION_ORIGINS)[number];
export interface ActionEnvelope {
    origin: ActionOrigin;
    actionClass: string;
    policyId: string;
}
export declare class EnvelopeRequiredError extends Error {
    readonly code = "envelope_required";
    constructor();
}
export declare function isActionEnvelope(value: unknown): value is ActionEnvelope;
export declare function runEnvelopedAction<T>(envelope: unknown, act: () => Promise<T> | T): Promise<T>;
