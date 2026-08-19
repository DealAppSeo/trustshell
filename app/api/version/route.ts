import { NextResponse } from 'next/server';

// Which commit is this surface actually running?
//
// A 200 from trustshell.dev proves the site is UP, not that it is running the
// commit you just merged: a platform keeps the last SUCCESSFUL build serving
// when a new deploy fails, so a green pipeline and a healthy page are both
// compatible with week-old code. hyperdag.org demonstrated the cost of not
// having this — it served content for months that exists in no commit, and
// nothing external could tell.
//
// Public and unauthenticated on purpose. A commit SHA for a private repo is not
// a secret, and requiring a credential would defeat the point: the case you most
// need it for is checking a deploy from outside. A fixed set of named fields is
// returned and the environment is never enumerated, so a new platform variable
// cannot leak through here by accident.
//
// Mirrors trinity-ecosystem's app/api/version/route.ts. Keep the field names
// identical — a probe should not need to know which surface it is talking to.

// Never prerendered, never cached. A version endpoint served from an edge cache
// reports the PREVIOUS deployment's SHA, which is worse than having no endpoint:
// it answers confidently and wrongly.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Resolve the deployed commit. Read as literals rather than by looping over
 * `process.env`, so the exposed set stays auditable.
 */
function resolveDeployment(): { commit: string; platform: string } {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (vercelSha) return { commit: vercelSha, platform: 'vercel' };

  const railwaySha = process.env.RAILWAY_GIT_COMMIT_SHA;
  if (railwaySha) return { commit: railwaySha, platform: 'railway' };

  const genericSha = process.env.GIT_COMMIT_SHA;
  if (genericSha) return { commit: genericSha, platform: 'unknown' };

  // 'unknown' rather than a fake value or a silent omission: a caller comparing
  // this against origin/main must be able to tell "not wired up here" apart from
  // "running an old commit". Those need different fixes.
  return { commit: 'unknown', platform: 'unknown' };
}

export async function GET() {
  const { commit, platform } = resolveDeployment();

  return NextResponse.json(
    {
      commit,
      commit_short: commit === 'unknown' ? 'unknown' : commit.slice(0, 7),
      platform,
      // Environment NAME only — never values.
      environment:
        process.env.VERCEL_ENV ?? process.env.RAILWAY_ENVIRONMENT_NAME ?? 'unknown',
      region: process.env.VERCEL_REGION ?? process.env.RAILWAY_REPLICA_REGION ?? null,
      // Answered-at, not built-at. Do not read this as a build timestamp.
      responded_at: new Date().toISOString(),
    },
    {
      status: 200,
      headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' },
    },
  );
}
