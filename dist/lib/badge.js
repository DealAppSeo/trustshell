"use strict";
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
 *  2. The badge NEVER renders the agent's RepID score — and note the SCOPE of that
 *     claim, because this comment previously got it wrong. It is a fact about THIS
 *     RENDERER, not about the proof. The statement beside every proof carries
 *     `repid_score` as a bound PUBLIC INPUT to the circuit (public values
 *     [16]=threshold, [17]=repid_score), so the score is not withheld by the proof;
 *     it is simply not printed here. This used to read "the range proof attests
 *     `RepID ≥ threshold` WITHOUT revealing the score", which was false in the one
 *     sentence a reader takes as the privacy guarantee. Making the score genuinely
 *     private is a new circuit and a new verifier major, not a wording change.
 *
 * Pure and dependency-free: no network, no external asset references. The SVG is
 * inline and portable — it renders offline and cannot phone home.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.proofBadgeStatus = proofBadgeStatus;
exports.renderProofBadge = renderProofBadge;
exports.renderProofBadgeMarkdown = renderProofBadgeMarkdown;
const proof_class_1 = require("./proof-class");
const action_evidence_1 = require("./action-evidence");
const evidence_card_1 = require("./evidence-card");
/** The badge's caption: what a verified proof shows, from the one place that says it. */
const caption = (p) => `${(p.proofClass ?? (0, proof_class_1.proofClassOf)(p)).summary}.`;
const COLORS = {
    verified: '#3fb950', // green — locally verified true
    failed: '#d1242f', // red — verification ran and returned false / errored
    unverified: '#9f9f9f', // grey — proof present but not verified (caller passed {verify:false})
    'no-proof': '#8b7355', // muted — no real proof bytes (legacy stub / missing)
};
/**
 * Derive the honest badge status from a presentation. Shared by the SVG and
 * Markdown renderers and asserted directly in tests.
 */
function proofBadgeStatus(presentation) {
    const { statement, proofBytes, verification, scheme } = presentation;
    const label = statement ? `RepID ≥ ${statement.threshold}` : 'RepID proof';
    // No real proof to stand behind.
    if (!proofBytes || !statement) {
        return {
            state: 'no-proof',
            label,
            value: 'no proof',
            color: COLORS['no-proof'],
            detail: 'no proof bytes present (legacy stub or missing proof)',
        };
    }
    // Proof present, but the caller did not ask to verify it. We refuse to imply
    // trust we have not checked.
    if (!verification) {
        return {
            state: 'unverified',
            label,
            value: 'unverified',
            color: COLORS.unverified,
            detail: 'proof present but not verified — call presentProof({ verify: true })',
        };
    }
    if (verification.verified) {
        return {
            state: 'verified',
            label,
            // Was '✓ ZK-verified'. Today's proof hides nothing, so "ZK" overstated it; see proof-class.ts.
            value: '✓ verified',
            color: COLORS.verified,
            detail: `verified locally by ${verification.verifierVersion}` +
                (scheme ? ` (${scheme})` : ''),
        };
    }
    // The proof could not be tied to the agent that was asked about, so nothing was checked: grey, not red.
    // (A proof that IS about another agent has reason 'statement_for_other_agent' and falls through to red.)
    if (verification.reason === 'binding_unavailable') {
        return {
            state: 'unverified',
            label,
            value: 'unverified',
            color: COLORS.unverified,
            detail: verification.error ?? 'could not confirm which agent the proof is about',
        };
    }
    // Verification ran and did NOT pass — including "verifier unavailable", which
    // the SDK reports as verified:false. That is a fail-closed red, not a pass.
    return {
        state: 'failed',
        label,
        value: '✗ not verified',
        color: COLORS.failed,
        detail: verification.error ?? 'verification returned false',
    };
}
function escapeXml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
// Approximate advance width per character at 11px in the badge font. Slightly
// generous so text never clips; exactness is not required for a flexbox-free SVG.
const CHAR_W = 6.7;
const PAD = 10;
function segWidth(text) {
    return Math.ceil(text.length * CHAR_W) + PAD * 2;
}
/**
 * Render a self-contained, shields-style SVG badge for a proof presentation.
 * The output is a complete `<svg>...</svg>` string with no external references.
 */
function renderProofBadge(presentation, opts = {}) {
    const status = proofBadgeStatus(presentation);
    const leftW = segWidth(status.label);
    const rightW = segWidth(status.value);
    const totalW = leftW + rightW;
    const H = 20;
    // HONEST CAPTION. This read "The proof attests the threshold, not the score." — which was
    // false about the proof, in the one sentence a reader takes as the privacy guarantee.
    // MEASURED 2026-08-30 by driving @hyperdag/proof-verifier directly: `repid_score` is a PUBLIC
    // INPUT to the plonky3 circuit (public values [16]=threshold, [17]=repid_score), and the AIR's
    // boundary constraint is `reconstructed == repid - threshold - 1`. So the exact score travels
    // in the statement beside every proof, and every consumer that echoes the statement republishes
    // it. This then said the circuit binds THREE things, agent_id among them, and the caption read
    // "Attests agent, threshold and score". MEASURED 2026-11-17: agent_id is NOT bound. About 1 in 256
    // foreign agent ids verify (an 8-bit proof-of-work is the only check), and `tier` is not checked.
    // The caption is now the proof class (proof-class.ts), so it says what the proof shows and changes
    // when the class does. What remains true, and is pinned by tests, is that the BADGE never renders
    // the score.
    //
    // Making the score genuinely private needs the score to become a witness bound by a commitment,
    // i.e. a new circuit and a new verifier major, not a wording change.
    const title = escapeXml(`${status.label} — ${status.value}. ${status.detail}. ${caption(presentation)}`);
    const leftText = escapeXml(status.label);
    const rightText = escapeXml(status.value);
    const leftMid = leftW / 2;
    const rightMid = leftW + rightW / 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${H}" role="img" aria-label="${title}">
  <title>${title}</title>
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${totalW}" height="${H}" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftW}" height="${H}" fill="#2b2b2b"/>
    <rect x="${leftW}" width="${rightW}" height="${H}" fill="${status.color}"/>
    <rect width="${totalW}" height="${H}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${leftMid}" y="15" fill="#010101" fill-opacity=".3">${leftText}</text>
    <text x="${leftMid}" y="14">${leftText}</text>
    <text x="${rightMid}" y="15" fill="#010101" fill-opacity=".3">${rightText}</text>
    <text x="${rightMid}" y="14">${rightText}</text>
  </g>
</svg>`;
    if (opts.href) {
        // href is caller-supplied; escape it as an attribute value.
        return `<a xmlns="http://www.w3.org/2000/svg" href="${escapeXml(opts.href)}" target="_blank" rel="noopener">${svg}</a>`;
    }
    return svg;
}
/**
 * Render a Markdown snippet embedding the badge as an inline data-URI image plus a
 * one-line honest caption. Copy-pasteable into a README or PR. Self-contained:
 * the image is the SVG itself, base64-encoded, so it renders without any host.
 */
function renderProofBadgeMarkdown(presentation, opts = {}) {
    const status = proofBadgeStatus(presentation);
    const svg = renderProofBadge(presentation); // caption carries the link separately
    const b64 = Buffer.from(svg, 'utf8').toString('base64');
    // The threshold and the scheme come from the engine, and this snippet is pasted into a README (Strix, #728).
    // Same rule as evidence-card.ts: control code points stripped, brackets escaped in the alt text, and the
    // caption inside one code span, where no link, image or autolinked URL is live.
    const alt = (0, evidence_card_1.mdText)((0, action_evidence_1.cleanCodePoints)(`${status.label} ${status.value}`));
    const img = `![${alt}](data:image/svg+xml;base64,${b64})`;
    const linked = opts.href ? `[${img}](${opts.href})` : img;
    // Same honest caption as the SVG title — see renderProofBadge.
    return `${linked}\n\n> ${(0, evidence_card_1.mdCode)((0, action_evidence_1.cleanCodePoints)(`${status.label} — ${status.value}. ${status.detail}. ${caption(presentation)}`))}`;
}
