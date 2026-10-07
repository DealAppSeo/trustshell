/**
 * THE TOOL BELTS — one list, read by the unlisted belt pages (lib/belt-pages.ts) and, next, by the
 * role picker on /agents. A belt is the set of tools one agent may use for one role.
 *
 * TWO COLUMNS, AND THE LINE BETWEEN THEM IS THE POINT.
 *
 *   starter  reads only. Each entry says HOW it is kept to reads (a flag, a scope, a read-only key,
 *            or an allowlist of its read tools). A tool that can write with no such setting does
 *            not belong here.
 *   gated    spends money, acts in public, or changes something that cannot be undone. Listed so a
 *            reader can see what was held back and why, never pre-approved by being on the page.
 *
 * Researched 2026-10-06: every repo was confirmed to exist, and each licence was read from the
 * repo's LICENSE file at HEAD. Stars and release dates are left out because they go stale fastest.
 * Licences and flags can change too, so the page prints the date.
 *
 * LEFT OUT ON PURPOSE (licence, not quality): Akaunting (Business Source License 1.1 forbids running
 * it as an accounting service), Invoice Ninja (Elastic License 2.0 forbids offering it as a managed
 * service), and Anthropic's xlsx/pdf/docx/pptx skills ("All rights reserved"; they cannot be
 * redistributed in a product).
 */

export const BELT_ROLES = ['cmo', 'cto', 'cfo'] as const;
export type BeltRole = (typeof BELT_ROLES)[number];

export type Cost = 'free' | 'paid' | 'free tier, paid plans';

export interface StarterTool {
  /** Stable, lowercase. It will name the tool in a grant, so it never changes once shipped. */
  id: string;
  name: string;
  /** Where it lives: `github.com/owner/repo` or a domain. */
  where: string;
  kind: 'MCP' | 'skill' | 'CLI' | 'app with MCP';
  /** What the agent uses it for, in one line. */
  use: string;
  /** How it is kept to reads. Required: "it only reads" is a claim, this is the setting behind it. */
  readOnly: string;
  licence: string;
  cost: Cost;
}

export interface GatedTool {
  name: string;
  where: string;
  /** Which kind of risk keeps it out of the starter belt. */
  risk: 'spends money' | 'acts in public' | 'cannot be undone';
  /** What it would do, in one line. */
  does: string;
  licence: string;
}

export interface Belt {
  role: BeltRole;
  title: string;
  /** What this role is for, in one line. */
  purpose: string;
  starter: readonly StarterTool[];
  gated: readonly GatedTool[];
}

export const BELTS_RESEARCHED = '2026-10-06';

const TRUSTSHELL = { where: 'github.com/DealAppSeo/trustshell', licence: 'Apache-2.0', cost: 'free' as const };

export const BELTS: Readonly<Record<BeltRole, Belt>> = {
  cmo: {
    role: 'cmo',
    title: 'CMO',
    purpose: 'Reads traffic, search and the web, and checks a claim before anything is posted.',
    starter: [
      { id: 'trustshell', name: 'TrustShell', ...TRUSTSHELL, kind: 'MCP', use: 'Checks a claim before it goes into a post.', readOnly: 'It reads text and returns a verdict. It cannot post.' },
      { id: 'google-analytics', name: 'Google Analytics MCP', where: 'github.com/googleanalytics/google-analytics-mcp', kind: 'MCP', use: 'Traffic and conversion reports.', readOnly: 'Google sign-in with the analytics.readonly scope.', licence: 'Apache-2.0', cost: 'free' },
      { id: 'search-console', name: 'mcp-gsc', where: 'github.com/AminForou/mcp-gsc', kind: 'MCP', use: 'Search queries and rankings from Google Search Console.', readOnly: 'Allow every tool except manage_sitemaps, which can submit or delete sitemaps.', licence: 'MIT', cost: 'free' },
      { id: 'umami', name: 'Umami', where: 'github.com/umami-software/umami', kind: 'app with MCP', use: 'Privacy-friendly site analytics you host yourself.', readOnly: 'Its built-in MCP (MCP_ENABLED=1) only reads.', licence: 'MIT', cost: 'free' },
      { id: 'crawl4ai', name: 'Crawl4AI', where: 'github.com/unclecode/crawl4ai', kind: 'MCP', use: 'Reads web pages for research.', readOnly: 'It fetches pages. Run it yourself; the paid cloud tier is in the second table.', licence: 'Apache-2.0', cost: 'free' },
      { id: 'marketingskills', name: 'marketingskills', where: 'github.com/coreyhaines31/marketingskills', kind: 'skill', use: 'Marketing know-how written as instructions.', readOnly: 'Instructions only. It runs nothing.', licence: 'MIT', cost: 'free' },
    ],
    gated: [
      { name: 'Postiz', where: 'github.com/gitroomhq/postiz-app', risk: 'acts in public', does: 'Schedules and publishes social posts.', licence: 'AGPL-3.0' },
      { name: 'Listmonk', where: 'github.com/knadh/listmonk', risk: 'acts in public', does: 'Sends email to a list.', licence: 'AGPL-3.0' },
      { name: 'PostHog MCP', where: 'github.com/PostHog/posthog', risk: 'acts in public', does: 'Changes feature flags and experiments real users see.', licence: 'MIT; the ee/ folder is proprietary' },
      { name: 'growthbook-mcp', where: 'github.com/growthbook/growthbook-mcp', risk: 'acts in public', does: 'Creates flags and starts A/B tests.', licence: 'MIT' },
      { name: 'Playwright MCP', where: 'github.com/microsoft/playwright-mcp', risk: 'acts in public', does: 'Clicks and submits forms in a real browser.', licence: 'Apache-2.0' },
      { name: 'Firecrawl MCP', where: 'github.com/firecrawl/firecrawl-mcp-server', risk: 'spends money', does: 'Reads the web on paid API credits.', licence: 'MIT; the Firecrawl engine is AGPL-3.0' },
      { name: 'mcp-gsc manage_sitemaps', where: 'github.com/AminForou/mcp-gsc', risk: 'acts in public', does: 'Submits or deletes sitemaps on Google.', licence: 'MIT' },
    ],
  },
  cto: {
    role: 'cto',
    title: 'CTO',
    purpose: 'Reads code, databases, dashboards and security scans. Changes nothing.',
    starter: [
      { id: 'trustshell', name: 'TrustShell', ...TRUSTSHELL, kind: 'CLI', use: 'trustshell verify checks the last answer; proof --verify checks a proof.', readOnly: 'Both only read. A miss reads as not checked, never as a pass.' },
      { id: 'github', name: 'GitHub MCP', where: 'github.com/github/github-mcp-server', kind: 'MCP', use: 'Repos, pull requests, issues and CI runs.', readOnly: 'Start it with --read-only, which overrides any write tool you ask for.', licence: 'MIT', cost: 'free' },
      { id: 'git-filesystem', name: 'Git and Filesystem servers', where: 'github.com/modelcontextprotocol/servers', kind: 'MCP', use: 'Reads the local repo and files.', readOnly: 'These can write. Allow only their read tools, and only the folders you name.', licence: 'MIT, moving to Apache-2.0', cost: 'free' },
      { id: 'postgres', name: 'Postgres MCP Pro', where: 'github.com/crystaldba/postgres-mcp', kind: 'MCP', use: 'Queries and index advice for any Postgres.', readOnly: 'Start it with --access-mode=restricted (read-only transactions).', licence: 'MIT', cost: 'free' },
      { id: 'supabase', name: 'Supabase MCP', where: 'github.com/supabase/mcp', kind: 'MCP', use: 'Reads one Supabase project.', readOnly: 'Set read_only=true and project_ref to one project.', licence: 'Apache-2.0', cost: 'free' },
      { id: 'grafana', name: 'Grafana MCP', where: 'github.com/grafana/mcp-grafana', kind: 'MCP', use: 'Dashboards, metrics and logs.', readOnly: 'Start it with --disable-write.', licence: 'Apache-2.0', cost: 'free' },
      { id: 'semgrep', name: 'Semgrep', where: 'github.com/semgrep/semgrep', kind: 'MCP', use: 'Finds risky code patterns.', readOnly: 'It scans and reports. Its rule registry may carry its own licence (not checked).', licence: 'LGPL-2.1', cost: 'free' },
      { id: 'gitleaks', name: 'gitleaks', where: 'github.com/gitleaks/gitleaks', kind: 'CLI', use: 'Finds committed secrets.', readOnly: 'It scans and reports.', licence: 'MIT', cost: 'free' },
      { id: 'osv-scanner', name: 'OSV-Scanner', where: 'github.com/google/osv-scanner', kind: 'CLI', use: 'Finds known-vulnerable dependencies.', readOnly: 'It scans and reports.', licence: 'Apache-2.0', cost: 'free' },
    ],
    gated: [
      { name: 'GitHub MCP without --read-only', where: 'github.com/github/github-mcp-server', risk: 'acts in public', does: 'Comments, opens pull requests and merges. Public on a public repo.', licence: 'MIT' },
      { name: 'Supabase MCP without read_only', where: 'github.com/supabase/mcp', risk: 'cannot be undone', does: 'Writes and deletes rows and tables.', licence: 'Apache-2.0' },
      { name: 'Postgres MCP Pro without restricted mode', where: 'github.com/crystaldba/postgres-mcp', risk: 'cannot be undone', does: 'Writes and deletes rows and tables.', licence: 'MIT' },
      { name: 'kubernetes-mcp-server outside its read-only mode', where: 'github.com/containers/kubernetes-mcp-server', risk: 'cannot be undone', does: 'Changes running clusters.', licence: 'Apache-2.0' },
      { name: 'Grafana MCP without --disable-write', where: 'github.com/grafana/mcp-grafana', risk: 'cannot be undone', does: 'Writes to your Grafana.', licence: 'Apache-2.0' },
      { name: 'Playwright MCP', where: 'github.com/microsoft/playwright-mcp', risk: 'acts in public', does: 'Clicks and submits forms in a real browser.', licence: 'Apache-2.0' },
    ],
  },
  cfo: {
    role: 'cfo',
    title: 'CFO',
    purpose: 'Reads the books, budgets and market data. Spending is off.',
    starter: [
      { id: 'trustshell', name: 'TrustShell', ...TRUSTSHELL, kind: 'MCP', use: 'Reads a receipt and checks a proof before an invoice is approved.', readOnly: 'It reads. It cannot pay.' },
      { id: 'beanquery', name: 'beanquery-mcp', where: 'github.com/vanto/beanquery-mcp', kind: 'MCP', use: 'Asks questions of a plain-text Beancount ledger.', readOnly: 'It runs queries only. It calls itself experimental. Beancount itself is GPL-2.0.', licence: 'MIT', cost: 'free' },
      { id: 'actual', name: 'actual-mcp', where: 'github.com/s-stefanov/actual-mcp', kind: 'MCP', use: 'Reads an Actual Budget file.', readOnly: 'Read-only unless started with --enable-write. Never pass that flag.', licence: 'MIT', cost: 'free' },
      { id: 'openbb', name: 'OpenBB', where: 'github.com/OpenBB-finance/OpenBB', kind: 'MCP', use: 'Market and economic data.', readOnly: 'It reads. Use free data providers only; paid ones are in the second table.', licence: 'Apache-2.0', cost: 'free' },
      { id: 'stripe-readonly', name: 'Stripe MCP', where: 'github.com/stripe/ai', kind: 'MCP', use: 'Reads payments and invoices.', readOnly: 'Give it a Restricted API Key with read permissions only, in test mode.', licence: 'MIT', cost: 'free' },
      { id: 'financial-services', name: 'financial-services skills', where: 'github.com/anthropics/financial-services', kind: 'skill', use: 'Models and checklists: DCF, comparables, reconciliation, month-end close.', readOnly: 'Instructions only. They run nothing.', licence: 'Apache-2.0', cost: 'free' },
    ],
    gated: [
      { name: 'Stripe MCP with a write key', where: 'github.com/stripe/ai', risk: 'spends money', does: 'Refunds, payment links and invoices.', licence: 'MIT' },
      { name: 'Coinbase AgentKit', where: 'github.com/coinbase/agentkit', risk: 'spends money', does: 'Transfers, swaps and gas from a wallet.', licence: 'Apache-2.0' },
      { name: 'x402', where: 'github.com/x402-foundation/x402', risk: 'spends money', does: 'Pays for each request.', licence: 'Apache-2.0' },
      { name: 'viem or ethers with a signing key', where: 'github.com/wevm/viem', risk: 'spends money', does: 'Signs and sends transactions.', licence: 'MIT' },
      { name: 'Lago', where: 'github.com/getlago/lago', risk: 'acts in public', does: 'Bills customers and sends invoices.', licence: 'AGPL-3.0' },
      { name: 'Firefly III MCP', where: 'github.com/etnperlong/firefly-iii-mcp', risk: 'cannot be undone', does: 'Writes bookkeeping transactions.', licence: 'MIT; Firefly III itself is AGPL-3.0' },
      { name: 'actual-mcp with --enable-write', where: 'github.com/s-stefanov/actual-mcp', risk: 'cannot be undone', does: 'Writes budget transactions.', licence: 'MIT' },
      { name: 'OpenBB paid data providers', where: 'github.com/OpenBB-finance/OpenBB', risk: 'spends money', does: 'Bills a data provider per use.', licence: 'Apache-2.0' },
    ],
  },
};
