export type NavLink = { href: string; label: string };

const OFF_LANDING = /TrustRepID|TrustChat|HyperDAG Protocol|ERC-8004|stake now|^stake$/i;

/** The landing nav drops product links and stake. Other routes keep the same list. */
export function linksForLanding(pathname: string, links: readonly NavLink[]): NavLink[] {
  if (pathname !== '/') return links.slice();
  return links.filter((link) => link.href !== '/stake' && !OFF_LANDING.test(link.label));
}
