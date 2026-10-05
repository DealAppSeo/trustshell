'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { linksForLanding } from '@/lib/landing-nav';

/**
 * The stranger nav. Four links, on every page including home.
 * Leaderboard, market and the other routes stay in the app and off this list
 * until they show real data. tests/nav-fit.test.ts trips if the count changes:
 * four links fit at md, and the row stays hidden below that.
 */
const NAV_LINKS: { href: string; label: string }[] = [
  { href: '/#claim', label: 'Check' },
  { href: '/#add-agent', label: 'Add to your agent' },
  { href: '/docs', label: 'Docs' },
  { href: '/#where', label: 'Why' },
];

/** Claiming an agent is one decision. The same menu stays one tap away. */
const FOCUSED_ROUTES = ['/bind'];

export function TopNav() {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);

  const focused = FOCUSED_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  const isActive = (href: string) => !href.includes('#') && (pathname === href || pathname.startsWith(`${href}/`));
  const links = linksForLanding(pathname, NAV_LINKS);

  return (
    <header className="sticky top-0 z-40 border-b border-[#1e293b] bg-[#0a0f1a]/90 backdrop-blur supports-[backdrop-filter]:bg-[#0a0f1a]/70">
      <nav className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
        <a href="/" className="flex items-center gap-2 font-bold text-white shrink-0">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
          TrustShell
        </a>

        <div className={focused ? 'hidden' : 'hidden md:flex items-center gap-1'}>
          {links.map((l) => (
            <NavLink key={l.href} href={l.href} label={l.label} active={isActive(l.href)} />
          ))}
        </div>

        <button
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`${focused ? 'inline-flex' : 'md:hidden inline-flex'} items-center justify-center w-9 h-9 rounded border border-[#1e293b] text-[#94a3b8] hover:text-white`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /> : <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />}
          </svg>
        </button>
      </nav>

      {open && (
        <div className={`${focused ? '' : 'md:hidden '}border-t border-[#1e293b] bg-[#0a0f1a]`}>
          <div className="max-w-6xl mx-auto px-4 py-2 space-y-1">
            {links.map((l) => (
              <NavLink
                key={l.href}
                href={l.href}
                label={l.label}
                active={isActive(l.href)}
                block
                onClick={() => setOpen(false)}
              />
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

function NavLink({
  href,
  label,
  active,
  block,
  onClick,
}: {
  href: string;
  label: string;
  active: boolean;
  block?: boolean;
  onClick?: () => void;
}) {
  const className = `${block ? 'block px-3 py-2' : 'px-3 py-1.5'} rounded text-sm font-medium transition-colors ${
    active ? 'bg-amber-600/15 text-amber-400' : 'text-[#94a3b8] hover:text-white hover:bg-[#1e293b]'
  }`;
  return (
    <a href={href} onClick={onClick} className={className}>
      {label}
    </a>
  );
}
