import { NextResponse } from 'next/server';
import { sbSelect } from '@/lib/supabase';

export async function GET() {
  try {
    // R4: live from backend, NO hardcoded numbers/offsets. Uses real developer_nodes + repid_agents counts.
    // Dashboard/verify wire to ga4 /health/status + /health/demo/* + /api/verify-proof (or trustshell apis).
    const devNodes = await sbSelect<any>('developer_nodes') || [];
    const installCount = (devNodes || []).length;  // pure live (no +1337 offset)

    const recentAgents = await sbSelect<any>('repid_agents', {
      select: 'agent_name,display_name,current_repid,tier',
      orderBy: 'current_repid.desc',
      limit: 12
    }) || [];

    return NextResponse.json({
      success: true,
      install_count: installCount,
      live_repid_sample: recentAgents,
      source: 'live repid_agents + developer_nodes (fetched via ga4-wired trustshell api; see /health/demo/agents in engine)'
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch landing data'
    }, { status: 500 });
  }
}
