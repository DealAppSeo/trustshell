import type { NextConfig } from "next";

// trustshell.dev/receipt/:id is the receipt URL people post. The engine already renders every settled
// deal's receipt, keyless and read-only, at /api/v1/receipt/:id (also /latest and :id.json), so the
// site redirects there rather than keep a second renderer that could drift from it. Temporary (307):
// the receipt lives on the engine, and that host may move. Checked daily by the e2e-honesty leg
// `site.receipt_url`.
const ENGINE = (process.env.NEXT_PUBLIC_REPID_ENGINE_URL || 'https://repid-engine-production.up.railway.app').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    return [{ source: '/receipt/:id', destination: `${ENGINE}/api/v1/receipt/:id`, permanent: false }];
  },
};

export default nextConfig;
