import { NextResponse } from 'next/server';
import { sbSelect } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [agents, heartbeats, proofs, events, tasks, stakes, sponsorships] = await Promise.all([
      sbSelect<any>('repid_agents', { orderBy: 'current_repid.desc' }),
      sbSelect<any>('agent_heartbeat'),
      sbSelect<any>('repid_zkp_proofs', { orderBy: 'created_at.desc', limit: 20 }),
      sbSelect<any>('repid_events', { orderBy: 'created_at.desc', limit: 20 }),
      sbSelect<any>('trinity_tasks', { orderBy: 'created_at.desc', limit: 20 }),
      sbSelect<any>('agent_stakes', { filter: 'status=eq.active' }),
      sbSelect<any>('sponsorship_records', { filter: 'status=eq.active' }),
    ]);

    return NextResponse.json({
      success: true,
      agents: agents || [],
      heartbeats: heartbeats || [],
      proofs: proofs || [],
      events: events || [],
      tasks: tasks || [],
      stakes: stakes || [],
      sponsorships: sponsorships || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch dashboard data',
    }, { status: 500 });
  }
}
