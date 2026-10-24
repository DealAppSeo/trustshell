/**
 * The post-check conversation (components/onboarding-talk.tsx) is SHADOW: off unless a build sets
 * NEXT_PUBLIC_ONBOARDING_TALK=1. It is inlined at build time, like NEXT_PUBLIC_RUN_LEAST_KEYS, so turning it
 * on is a Vercel variable plus a rebuild, and turning it off again is the same. Until Sean has seen it on a
 * phone and said go (CLAUDE_RULES r23, r31: new public copy and a new thing the visitor types into), the home
 * page renders exactly what it rendered before. The preview route /lab/talk shows it on preview deployments
 * only and is a 404 on production.
 */
export const ONBOARDING_TALK = process.env.NEXT_PUBLIC_ONBOARDING_TALK === '1';
