import { NextResponse } from 'next/server';
import { sbSelect } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // R4 GA: fetch live from REAL backend endpoints (ga4 /health/status + /health/demo/* + repid/hal/proofs routes)
    // + direct for full (trustshell app/ surface). NO hardcoded numbers anywhere. 12 agents/tiers/RepID/trust-loop live.
    // Engine endpoints added in health.ts: /status, /demo/agents, /demo/proofs, /demo/loop, /demo/staking/* (recordDeposit/recordSponsorship).
    // Verify page wires repid_zkp_proofs + eas uid (null-safe, explorer when >0 from XC).
    const ENGINE_BASE = process.env.REPID_ENGINE_BASE || 'http://localhost:8787'; // wire to ga4 deployed; fallback direct live
    let engineStatus: any = null;
    let engineAgents: any = null;
    let engineProofs: any = null;
    let engineLoop: any = null;
    try {
      const [s, a, p, l] = await Promise.all([
        fetch(`${ENGINE_BASE}/status`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${ENGINE_BASE}/demo/agents`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${ENGINE_BASE}/demo/proofs`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${ENGINE_BASE}/demo/loop`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      engineStatus = s; engineAgents = a; engineProofs = p; engineLoop = l;
    } catch {}

    const [agents, heartbeats, proofs, events, tasks, stakes, sponsorships, providerCaps, hallucinationLogs] = await Promise.all([
      sbSelect<any>('repid_agents', { orderBy: 'current_repid.desc' }),
      sbSelect<any>('agent_heartbeat'),
      sbSelect<any>('repid_zkp_proofs', { orderBy: 'created_at.desc', limit: 20 }),
      sbSelect<any>('repid_events', { orderBy: 'created_at.desc', limit: 20 }),
      sbSelect<any>('trinity_tasks', { orderBy: 'created_at.desc', limit: 20 }),
      sbSelect<any>('agent_stakes', { filter: 'status=eq.active' }),
      sbSelect<any>('sponsorship_records', { filter: 'status=eq.active' }),
      sbSelect<any>('llm_provider_caps'),
      sbSelect<any>('trinity_hallucination_logs', { orderBy: 'timestamp.desc', limit: 10 }),
    ]);

    return NextResponse.json({
      success: true,
      // live from ga4 backend endpoints (preferred for demo surface)
      engine_status: engineStatus,
      engine_agents: engineAgents,
      engine_proofs: engineProofs,
      engine_trust_loop: engineLoop,
      // full live from DB (visible on single page dashboard)
      agents: agents || [],
      heartbeats: heartbeats || [],
      proofs: proofs || [],
      events: events || [],
      tasks: tasks || [],
      stakes: stakes || [],
      sponsorships: sponsorships || [],
      providerCaps: providerCaps || [],
      hallucinationLogs: hallucinationLogs || [],
      timestamp: new Date().toISOString(),
      note: 'Data live-fetched. Agents/tiers/RepID from /health/demo/agents + /status (ga4 real endpoints). Proofs from /demo/proofs (eas null-safe + explorer). Economy from record* calls. No hardcodes. See trustshell-ga4/app/dashboard + ga4 health.ts edits.',
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch dashboard data',
    }, { status: 500 });
  }
}
