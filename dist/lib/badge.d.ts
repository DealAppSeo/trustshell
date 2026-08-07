/**
 * Portable proof badge — turns a {@link ProofPresentation} into a self-contained,
 * embeddable SVG (and a Markdown snippet) that a reviewer can drop into a README,
 * a profile, or a PR and re-verify independently.
 *
 * Two honesty invariants, enforced by tests:
 *
 *  1. The badge shows the "verified" (green) state ONLY when local verification
 *     actually returned `verified: true`. An absent, failed, or unavailable
 *     verification renders grey/red with the reason — never a fake green. This
 *     mirrors the SDK's own rule: an unavailable safety check is not a passing one.
 *  2. The badge NEVER renders the agent's RepID score. The whole point of the
 *     range proof is that it attests `RepID ≥ threshold` WITHOUT revealing the
 *     score — so the badge shows the threshold and tier, and the score never
 *     appears in the output.
 *
 * Pure and dependency-free: no network, no external asset references. The SVG is
 * inline and portable — it renders offline and cannot phone home.
 */
import type { ProofPresentation } from './trustshell';
export type ProofBadgeState = 'verified' | 'failed' | 'unverified' | 'no-proof';
export interface ProofBadgeStatus {
    state: ProofBadgeState;
    /** Left segment text — the claim, e.g. "RepID ≥ 999". Never contains the score. */
    label: string;
    /** Right segment text — the verification verdict. */
    value: string;
    /** Hex fill for the right segment, chosen by state. */
    color: string;
    /** Human-readable detail (verifier version, error reason). Safe for a <title>/tooltip. */
    detail: string;
}
/**
 * Derive the honest badge status from a presentation. Shared by the SVG and
 * Markdown renderers and asserted directly in tests.
 */
export declare function proofBadgeStatus(presentation: ProofPresentation): ProofBadgeStatus;
export interface RenderBadgeOptions {
    /**
     * If set, wrap the badge in an <a> so a click opens the verify/passport URL.
     * The caller supplies the URL; the badge never invents an endpoint.
     */
    href?: string;
}
/**
 * Render a self-contained, shields-style SVG badge for a proof presentation.
 * The output is a complete `<svg>...</svg>` string with no external references.
 */
export declare function renderProofBadge(presentation: ProofPresentation, opts?: RenderBadgeOptions): string;
/**
 * Render a Markdown snippet embedding the badge as an inline data-URI image plus a
 * one-line honest caption. Copy-pasteable into a README or PR. Self-contained:
 * the image is the SVG itself, base64-encoded, so it renders without any host.
 */
export declare function renderProofBadgeMarkdown(presentation: ProofPresentation, opts?: RenderBadgeOptions): string;
