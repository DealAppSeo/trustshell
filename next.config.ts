import type { NextConfig } from "next";

// trustshell.dev/receipt/:id is the receipt URL people post. The engine already renders every settled
// deal's receipt, keyless and read-only, at /api/v1/receipt/:id (also /latest and :id.json), so the
// site redirects there rather than keep a second renderer that could drift from it. Temporary (307):
// the receipt lives on the engine, and that host may move. Checked daily by the e2e-honesty leg
// `site.receipt_url`.
//
// PINNED, NOT CONFIGURABLE (XC1 review of #555). The host is the literal engine origin, not an env
// var: a redirect target that a deploy setting can change is a redirect an attacker who reaches that
// setting can point anywhere. Moving the engine is a code change, reviewed like this one.
export const RECEIPT_ENGINE_ORIGIN = 'https://repid-engine-production.up.railway.app';
// The ids the engine's /api/v1/receipt/:id actually resolves: a contract uuid, or `latest`. Anything
// else (`..`, encoded traversal, `//host`, a second path segment) does not match, and so 404s HERE
// instead of becoming a request to some other engine path.
const RECEIPT_ID = '(latest|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})';

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    return [
      { source: `/receipt/:id${RECEIPT_ID}`, destination: `${RECEIPT_ENGINE_ORIGIN}/api/v1/receipt/:id`, permanent: false },
      { source: `/receipt/:id${RECEIPT_ID}.json`, destination: `${RECEIPT_ENGINE_ORIGIN}/api/v1/receipt/:id.json`, permanent: false },
    ];
  },
};

export default nextConfig;
