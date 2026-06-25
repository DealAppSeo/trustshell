import { NextResponse } from 'next/server';
import { fetchSquadLeaderboard } from '@/lib/onchain-repid';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const agents = await fetchSquadLeaderboard();
    const onChainCount = agents.filter((a) => a.source === 'on-chain').length;

    return NextResponse.json({
      agents,
      as_of: new Date().toISOString(),
      source: 'base-sepolia-rpc',
      registry: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
      on_chain_with_writes: onChainCount,
      total_minted: agents.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'On-chain read failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}