export type NavLink = { href: string; label: string };

/** The landing does not link to stake. Other routes keep the same list. */
export function linksForLanding(pathname: string, links: readonly NavLink[]): NavLink[] {
  if (pathname !== '/') return links.slice();
  return links.filter((link) => link.href !== '/stake' && !/stake now/i.test(link.label));
}
