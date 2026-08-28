import { ImageResponse } from 'next/og';

/**
 * Every link to this site was rendering without an image.
 *
 * MEASURED on the live site 2026-08-28: `og:image` was absent on every page checked, while
 * `twitter:card` was set to `summary_large_image`. That pairing is the worst of both — the
 * card asks for a large image and supplies none, so a shared link collapses to a bare text
 * stub rather than the compact card it would have got from no directive at all. For a project
 * whose next phase is people posting links to it, that is a tax on every share.
 *
 * A GENERATED CARD RATHER THAN A STATIC FILE, because this one cannot go stale against a
 * rebrand or a copy change: it renders from the same words the site uses. It is also the only
 * option that does not require design assets nobody has made yet.
 *
 * Deliberately typographic. There is no logo lockup to reproduce, and inventing one here would
 * put a mark into every link preview that no human approved.
 */
export const runtime = 'edge';
export const alt = 'TrustShell — a trust harness for AI agents';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0a0f1a',
          padding: '72px 80px',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 26,
              letterSpacing: 6,
              textTransform: 'uppercase',
              color: '#f59e0b',
              fontWeight: 600,
            }}
          >
            TrustShell
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 34,
              fontSize: 76,
              lineHeight: 1.08,
              color: '#f8fafc',
              fontWeight: 700,
              maxWidth: 1000,
            }}
          >
            A trust harness for AI agents
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 28,
              fontSize: 32,
              lineHeight: 1.35,
              color: '#94a3b8',
              maxWidth: 940,
            }}
          >
            Who is this agent, what may it do on your behalf, what can it back that with — and
            was its output checked before it shipped.
          </div>
        </div>

        {/* The line that actually differentiates this product, so it survives into the preview
            card rather than living only on a page nobody clicked through to. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              display: 'flex',
              padding: '10px 20px',
              border: '2px solid rgba(45,212,191,0.45)',
              borderRadius: 10,
              color: '#5eead4',
              fontSize: 26,
              fontWeight: 600,
            }}
          >
            Measured · Not checked · Failed
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: '#64748b' }}>
            three outcomes, never two
          </div>
        </div>
      </div>
    ),
    size,
  );
}
