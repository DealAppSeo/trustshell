import { NextResponse } from 'next/server';
import { fetchLeaderboard } from '@/lib/onchain-repid';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { entries: agents, rosterSource } = await fetchLeaderboard();
    const onChainCount = agents.filter((a) => a.source === 'on-chain').length;

    return NextResponse.json({
      agents,
      as_of: new Date().toISOString(),
      // `source` distinguishes a fully-dynamic roster (engine-minted) from the
      // hard-coded fallback squad, so the UI copy stays honest.
      source:
        rosterSource === 'engine-minted'
          ? 'base-sepolia-rpc · engine-minted roster'
          : 'base-sepolia-rpc · fallback squad',
      roster_source: rosterSource,
      registry: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
      on_chain_with_writes: onChainCount,
      total_minted: agents.length,
    }, {
      // One RPC read of the whole roster per minute at the CDN, not one per visitor: the public Base Sepolia RPC
      // allows 25 requests a second, and an uncached route spent that on a single request's own fan-out.
      // `as_of` above is when the read happened, so a cached answer says how old it is.
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'On-chain read failed';
    return NextResponse.json(
      { error: 'leaderboard_unavailable', reason, providersUsed: null },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }, // never cache a failure: the next request may succeed
    );
  }
}