'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

// Persistent app navigation. Before this existed users had to guess URLs;
// this links the core E2E surfaces. Order mirrors the natural onboarding flow:
// create agents → connect keys → run → market → repid → history → settings.
const NAV_LINKS: { href: string; label: string }[] = [
  { href: '/pai', label: 'PAI' },
  { href: '/mission', label: 'Mission' },
  { href: '/agents', label: 'Agents' },
  { href: '/connect', label: 'Connect' },
  { href: '/run', label: 'Run' },
  { href: '/market', label: 'Market' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/stake', label: 'Stake' },
  { href: '/bind', label: 'Claim' },
  { href: '/preview', label: 'Preview' },
  { href: '/repid', label: 'RepID' },
  { href: '/history', label: 'History' },
  { href: '/settings', label: 'Settings' },
];

/**
 * Routes where the full link row is collapsed behind the toggle at every width.
 *
 * Claiming an agent is the one screen in this product where somebody is committing to
 * something rather than moving between things, and thirteen equally-weighted exits compete
 * with the single decision the page exists for. Nothing is removed — the same menu is one
 * click away from the same control the narrow layout already uses — so this quiets the
 * navigation without stranding anyone in it.
 */
const FOCUSED_ROUTES = ['/bind'];

export function TopNav() {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);

  const focused = FOCUSED_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-[#1e293b] bg-[#0a0f1a]/90 backdrop-blur supports-[backdrop-filter]:bg-[#0a0f1a]/70">
      <nav className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
        <Link href="/" className="flex items-center gap-2 font-bold text-white shrink-0">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
          TrustShell
        </Link>

        {/* Desktop links — hidden entirely on a focused route */}
        {/* WHY xl AND NOT md. This row appeared at `md` (768px), a breakpoint chosen when it
            held far fewer links. It now holds thirteen. MEASURED 2026-09-01 on a production
            build, two ways: bisecting the viewport, the document stopped overflowing at
            1110px; measuring the row and logo directly against the bar's content box gives
            1126px. So from 768px up to at least 1109px it ran off the side of every page in
            the app and sideways-scrolled the whole document — 342px of overflow at 768px, on
            six pages.

            `lg` (1024px) is short on either measurement, so it is not the answer. Tightening
            the links to px-2/gap-0.5 does bring the requirement to 998px and would fit `lg`,
            but with 26px of slack — less than half a link — so one renamed label would
            silently put it back. `xl` clears both figures with 154px to spare. The thirteen
            links are the real problem; until that is settled the breakpoint should be the one
            that cannot rot.

            tests/nav-fit.test.ts trips if the link count changes without a re-measurement. */}
        <div className={focused ? 'hidden' : 'hidden xl:flex items-center gap-1'}>
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                isActive(l.href)
                  ? 'bg-amber-600/15 text-amber-400'
                  : 'text-[#94a3b8] hover:text-white hover:bg-[#1e293b]'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`${focused ? 'inline-flex' : 'xl:hidden inline-flex'} items-center justify-center w-9 h-9 rounded border border-[#1e293b] text-[#94a3b8] hover:text-white`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? (
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            ) : (
              <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div
          className={`${focused ? '' : 'xl:hidden '}border-t border-[#1e293b] bg-[#0a0f1a]`}
        >
          {/* The rule and the background span the window; the LINKS take the same max-w-6xl
              container as the bar above them. Without this the menu kept full-bleed padding
              while the bar was already centred, so between 1153px and 1279px — a band this
              menu never used to appear in — the items sat up to 64px left of the wordmark
              they hang under. Measured before and after. */}
          <div className="max-w-6xl mx-auto px-4 py-2 space-y-1">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`block px-3 py-2 rounded text-sm font-medium ${
                isActive(l.href)
                  ? 'bg-amber-600/15 text-amber-400'
                  : 'text-[#94a3b8] hover:text-white hover:bg-[#1e293b]'
              }`}
            >
              {l.label}
            </Link>
          ))}
          </div>
        </div>
      )}
    </header>
  );
}
