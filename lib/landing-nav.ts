export type NavLink = { href: string; label: string };

const OFF_LANDING_NAV = /TrustRepID|TrustChat|HyperDAG Protocol|stake now/i;

/** The landing nav drops other surfaces and stake. Other routes keep the same list. */
export function linksForLanding(pathname: string, links: readonly NavLink[]): NavLink[] {
  if (pathname !== '/') return links.slice();
  return links.filter(
    (link) => link.href !== '/stake' && !OFF_LANDING_NAV.test(link.label),
  );
}
