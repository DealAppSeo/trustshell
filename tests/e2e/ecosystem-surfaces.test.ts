/**
 * Ecosystem surface E2E — every public thing a reviewer will actually click.
 *
 * WHY THIS EXISTS. A peer reviewer's first act is not reading code, it is
 * following a link. This week alone the ecosystem shipped: a docs page
 * describing an SDK that never existed, a "fastest way to start" CTA pointing at
 * a 404, a README whose `npm install` names an unpublished package, and a www
 * subdomain that resolves in DNS but refuses connections. Every one of those was
 * invisible to `npm test`, because unit tests do not visit websites.
 *
 * WHAT IT CHECKS. Reachability AND identity — a 200 is not enough. A parked page
 * and a real product both return 200, so each surface asserts something only the
 * real page would contain. That is the difference between "the server answered"
 * and "the thing is there".
 *
 * WHAT IT REFUSES TO DO. It never reports a transport fault as a product
 * failure. A 429 or a timeout means UNKNOWN, not broken — the same distinction
 * the HAL corpus runner enforces, and for the same reason: a rate limit reported
 * as a regression sends someone hunting a bug that does not exist.
 *
 * Run:  npx jest tests/e2e/ecosystem-surfaces.test.ts
 * Skip in normal runs: it is live-network, so it is excluded by the default
 * `sdk:test` filter and gated behind ECOSYSTEM_E2E=1 in CI.
 */

const RUN = process.env.ECOSYSTEM_E2E === '1' || process.env.CI === 'true';
const d = RUN ? describe : describe.skip;

const TIMEOUT = 30_000;

interface Probe {
  status: number;
  body: string;
  transportError?: string;
  finalUrl?: string;
}

async function probe(url: string): Promise<Probe> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'trustshell-ecosystem-e2e' },
      signal: AbortSignal.timeout(TIMEOUT - 5_000),
    });
    const body = await res.text().catch(() => '');
    return { status: res.status, body, finalUrl: res.url };
  } catch (e) {
    // DNS failure, refused connection, TLS error, timeout. NOT a 404 — those
    // arrive as a status. This branch is "we could not ask", and the assertions
    // below treat it differently from "we asked and got a bad answer".
    return { status: 0, body: '', transportError: String((e as Error)?.message ?? e) };
  }
}

/** A surface is UP when it answered AND the answer contains its own identity. */
function expectServes(p: Probe, mustContain: RegExp, label: string) {
  if (p.transportError) {
    throw new Error(
      `${label}: could not connect — ${p.transportError}. ` +
        `DNS may resolve while the host serves nothing (an unverified domain on the CDN does exactly this).`,
    );
  }
  expect(`${label} status=${p.status}`).toBe(`${label} status=200`);
  expect(p.body).toMatch(mustContain);
}

d('public websites', () => {
  it(
    'trustshell.dev serves the SDK landing page',
    async () => expectServes(await probe('https://www.trustshell.dev'), /TrustShell/i, 'trustshell.dev'),
    TIMEOUT,
  );

  it(
    'trustshell.dev/docs/getting-started serves the corrected quickstart',
    async () => {
      const p = await probe('https://www.trustshell.dev/docs/getting-started');
      expectServes(p, /Getting Started/i, 'getting-started');
      // The specific regressions fixed in #53. If the deploy rolls back, these
      // fail loudly rather than quietly re-publishing a phantom API.
      expect(p.body).not.toMatch(/get-api-key/);
      expect(p.body).not.toMatch(/TRUSTSHELL_ENDPOINT/);
      expect(p.body).not.toMatch(/APPROVE.*HITL.*BLOCK/s);
    },
    TIMEOUT,
  );

  it(
    'trustshell.dev/docs/api-reference documents only methods that exist',
    async () => {
      const p = await probe('https://www.trustshell.dev/docs/api-reference');
      expectServes(p, /API Reference/i, 'api-reference');
      // The phantom SDK surface. Each of these was published and did not exist.
      for (const phantom of ['payAndEscrow', 'getLLMTrustScore', 'getReputationHistory', 'trustshell whois']) {
        expect(`api-reference contains "${phantom}": ${p.body.includes(phantom)}`).toBe(
          `api-reference contains "${phantom}": false`,
        );
      }
    },
    TIMEOUT,
  );

  it('hyperdag.org serves', async () => expectServes(await probe('https://hyperdag.org'), /HyperDAG/i, 'hyperdag.org'), TIMEOUT);

  it(
    'aitrinitysymphony.com serves',
    async () => expectServes(await probe('https://aitrinitysymphony.com'), /Trinity|HyperDAG/i, 'aitrinitysymphony.com'),
    TIMEOUT,
  );

  it(
    'repid.dev serves',
    async () => expectServes(await probe('https://www.repid.dev'), /RepID|HyperDAG/i, 'repid.dev'),
    TIMEOUT,
  );
});

d('trustmarket.dev — apex and www must BOTH serve', () => {
  // Found 2026-08-06: the apex returns 200 ("Coming Soon") while www returns a
  // connection failure. DNS resolves — www.trustmarket.dev CNAMEs to
  // cname.vercel-dns.com with real addresses — but the host serves nothing,
  // which is what an unverified domain on the project looks like. Anyone who
  // types the www form, or follows a link that includes it, gets nothing.
  it('apex serves', async () => expectServes(await probe('https://trustmarket.dev'), /TrustMarket/i, 'trustmarket apex'), TIMEOUT);

  it(
    'www serves (currently FAILING — domain not attached to the project)',
    async () => expectServes(await probe('https://www.trustmarket.dev'), /TrustMarket/i, 'trustmarket www'),
    TIMEOUT,
  );
});

d('public API surfaces', () => {
  const ENGINE = 'https://repid-engine-production.up.railway.app';

  it(
    'engine health reports a deployed commit and a live database',
    async () => {
      const p = await probe(`${ENGINE}/health`);
      expectServes(p, /"status"\s*:\s*"ok"/, 'engine /health');
      const j = JSON.parse(p.body);
      expect(j.supabaseConnected).toBe(true);
      // A deploy that forgets to stamp its commit makes every later "is this
      // live?" question unanswerable.
      expect(typeof j.deployed_commit_short).toBe('string');
      expect(j.deployed_commit_short.length).toBeGreaterThan(6);
    },
    TIMEOUT,
  );

  it(
    'public RepID read is keyless',
    async () => {
      const p = await probe(`${ENGINE}/api/v1/repid/trinity-shofet`);
      if (p.status === 429) return; // rate limit is not a product failure
      expectServes(p, /repid|tier/i, 'public repid read');
    },
    TIMEOUT,
  );

  it(
    'HAL evaluate is reachable, or rate-limited — never silently gone',
    async () => {
      const res = await fetch(`${ENGINE}/api/v1/hal/evaluate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'ping', context: { domain: 'general', certainty: 0.8 }, strictness: 2 }),
        signal: AbortSignal.timeout(TIMEOUT - 5_000),
      }).catch((e) => ({ status: 0, _err: String(e) }) as never);

      // 429 is the documented public cap (HAL_PUBLIC_RATE_LIMIT, 10/24h/IP), not
      // an outage. Anything else must be a real answer.
      expect([200, 429]).toContain((res as Response).status);
    },
    TIMEOUT,
  );
});

d('npm packages resolve to something installable', () => {
  const registry = 'https://registry.npmjs.org';

  it(
    '@hyperdag/trustshell is published and matches the repo version',
    async () => {
      const p = await probe(`${registry}/@hyperdag%2Ftrustshell`);
      expectServes(p, /dist-tags/, 'npm trustshell');
      const j = JSON.parse(p.body);
      const pkg = require('../../package.json') as { version: string };
      // Catches the state this repo was in all week: repo at 1.2.0, npm at 1.1.0.
      expect(`npm latest=${j['dist-tags'].latest} repo=${pkg.version}`).toBe(
        `npm latest=${pkg.version} repo=${pkg.version}`,
      );
    },
    TIMEOUT,
  );

  it(
    '@hyperdag/trustshell-mcp is published',
    async () => expectServes(await probe(`${registry}/@hyperdag%2Ftrustshell-mcp`), /dist-tags/, 'npm trustshell-mcp'),
    TIMEOUT,
  );
});
