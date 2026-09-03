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
            value: '✓ ZK-verified',
            color: COLORS.verified,
            detail: `verified locally by ${verification.verifierVersion}` +
                (scheme ? ` (${scheme})` : ''),
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
    // it. The circuit binds THREE things — agent_id, threshold and repid_score — so the caption now
    // names all three rather than describing only what leaks. What remains true, and is pinned by
    // this file's tests, is that the BADGE itself never renders the score.
    //
    // Do not shorten this back. Making the score genuinely private needs the score to become a
    // witness bound by a commitment, i.e. a new circuit and a new verifier major (board tasks 82/86),
    // not a wording change. When that ships, the original sentence becomes true and can return.
    const title = escapeXml(`${status.label} — ${status.value}. ${status.detail}. ` +
        `Attests agent, threshold and score; the score is a bound public input.`);
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
    const alt = `${status.label} ${status.value}`;
    const img = `![${alt}](data:image/svg+xml;base64,${b64})`;
    const linked = opts.href ? `[${img}](${opts.href})` : img;
    // Same honest caption as the SVG title — see renderProofBadge.
    return `${linked}\n\n> ${status.label} — ${status.value}. ${status.detail}. ` +
        `Attests agent, threshold and score; the score is a bound public input.`;
}
