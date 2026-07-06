'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

// Persistent app navigation. Before this existed users had to guess URLs;
// this links the core E2E surfaces. Order mirrors the natural onboarding flow:
// create agents → connect keys → run → market → repid → history → settings.
const NAV_LINKS: { href: string; label: string }[] = [
  { href: '/agents', label: 'Agents' },
  { href: '/connect', label: 'Connect' },
  { href: '/run', label: 'Run' },
  { href: '/market', label: 'Market' },
  { href: '/stake', label: 'Stake' },
  { href: '/repid', label: 'RepID' },
  { href: '/history', label: 'History' },
  { href: '/settings', label: 'Settings' },
];

export function TopNav() {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-[#1e293b] bg-[#0a0f1a]/90 backdrop-blur supports-[backdrop-filter]:bg-[#0a0f1a]/70">
      <nav className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
        <Link href="/" className="flex items-center gap-2 font-bold text-white shrink-0">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
          TrustShell
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
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
          className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded border border-[#1e293b] text-[#94a3b8] hover:text-white"
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
        <div className="md:hidden border-t border-[#1e293b] bg-[#0a0f1a] px-4 py-2 space-y-1">
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
      )}
    </header>
  );
}
