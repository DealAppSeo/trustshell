import { NextResponse } from 'next/server';
import { sbSelect } from '@/lib/supabase';

export async function GET() {
  try {
    // 1. Fetch developer nodes to compute install count
    const devNodes = await sbSelect<any>('developer_nodes') || [];
    const offset = 1337;
    const installCount = devNodes.length + offset;

    // 2. Fetch recent RepID samples from repid_agents
    const recentAgents = await sbSelect<any>('repid_agents', {
      select: 'agent_name,display_name,current_repid,tier',
      orderBy: 'created_at.desc',
      limit: 5
    }) || [];

    return NextResponse.json({
      success: true,
      install_count: installCount,
      live_repid_sample: recentAgents
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch landing data'
    }, { status: 500 });
  }
}
