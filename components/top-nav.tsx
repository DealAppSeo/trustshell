'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { linksForLanding } from '@/lib/landing-nav';

/**
 * The stranger nav, by job (UX copy, 2026-10-16): Check, Add to your AI, Your agent, Docs. Four links,
 * on every page including home. tests/nav-fit.test.ts trips if the count changes: four links fit at md,
 * and the row stays hidden below that.
 *
 * YOUR AGENT [2026-10-16]: until now a first-time visitor could not reach /pai or /bind from the nav,
 * the home page, /start, /docs or /check. "Your agent" leads to /pai, and is marked current on every
 * page of the agent path (the six steps in components/journey-steps.tsx). /start, /bind, /faucet,
 * /stake, /spend and /leaderboard stay at their URLs; leaderboard, market and stake stay off this list.
 */
// Install-first (Sean, 2026-10-24): every link serves the one job, running and installing TrustShell.
// The sentence check, the agent path and the vision stay at their URLs, off the nav.
const NAV_LINKS: { href: string; label: string }[] = [
  { href: '/#how', label: 'How it works' },
  { href: '/#install', label: 'Install' },
  { href: '/docs', label: 'Docs' },
  { href: 'https://github.com/DealAppSeo/trustshell', label: 'GitHub' },
];

/** The pages of the agent path: "Your agent" is current on each of them. */
const AGENT_PATH = ['/pai', '/agents', '/bind', '/wallet', '/faucet', '/stake', '/spend', '/leaderboard'];

/** Claiming an agent is one decision. The same menu stays one tap away. */
const FOCUSED_ROUTES = ['/bind'];

export function TopNav() {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);

  const focused = FOCUSED_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  const under = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const isActive = (href: string) => !href.includes('#') && (under(href) || (href === '/pai' && AGENT_PATH.some(under)));
  const links = linksForLanding(pathname, NAV_LINKS);

  return (
    <header className="sticky top-0 z-40 border-b border-[#1e293b] bg-[#0a0f1a]/90 backdrop-blur supports-[backdrop-filter]:bg-[#0a0f1a]/70">
      <nav className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
        <a href="/" className="flex min-h-11 items-center gap-2 font-bold text-white shrink-0">
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
          className={`${focused ? 'inline-flex' : 'md:hidden inline-flex'} items-center justify-center w-11 h-11 rounded border border-[#1e293b] text-[#94a3b8] hover:text-white`}
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
  const className = `${block ? 'flex min-h-11 items-center px-3' : 'inline-flex min-h-11 items-center px-3'} rounded text-sm font-medium transition-colors ${
    active ? 'bg-amber-600/15 text-amber-400' : 'text-[#94a3b8] hover:text-white hover:bg-[#1e293b]'
  }`;
  return (
    <a href={href} onClick={onClick} className={className} aria-current={active ? 'page' : undefined}>
      {label}
    </a>
  );
}
