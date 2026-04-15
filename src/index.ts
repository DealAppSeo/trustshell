// @hyperdag/trustshell
// The trust gate for the agentic economy.
// Zero formula constants. Calls repid-engine API only.
// Patent pending P-023 + P-024 — do not reverse engineer.

const DEFAULT_ENGINE = 'https://repid-engine-production.up.railway.app';

export interface GateResult {
  allowed: boolean;
  repId: number;
  tier: string;
  reason?: string;
  easAttestation?: unknown;
}

export interface AgentProfile {
  agentId: string;
  agentName: string;
  currentRepId: number;
  tier: 'CUSTODIED_DBT' | 'EARNING_AUTONOMY' | 'AUTONOMOUS';
  activity30d: number;
  lastUpdated: string;
}

export interface ScoreResult {
  agentId: string;
  agentName: string;
  repIdBefore: number;
  repIdAfter: number;
  delta: number;
  tier: string;
  ecosystemNeedWeight: number;
  constitutionalAudit: {
    passed: boolean;
    complianceScore: number;
    halMode: number;
    easAttestationId: string;
    easSchema: string;
  };
}

function endpoint(options?: { endpoint?: string }): string {
  if (options?.endpoint) return options.endpoint;
  const g: any = globalThis;
  const envUrl =
    g?.process?.env?.REPID_ENGINE_URL ||
    g?.Deno?.env?.get?.('REPID_ENGINE_URL');
  return envUrl || DEFAULT_ENGINE;
}

export async function gate(
  agentId: string,
  amount: number,
  options?: { endpoint?: string }
): Promise<GateResult> {
  const base = endpoint(options);
  try {
    const res = await fetch(`${base}/agents/${agentId}/x402-gate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    if (!res.ok) {
      return { allowed: false, repId: 0, tier: 'UNKNOWN', reason: 'engine_unreachable' };
    }
    return (await res.json()) as GateResult;
  } catch {
    return { allowed: false, repId: 0, tier: 'UNKNOWN', reason: 'network_error' };
  }
}

export async function score(
  input: Record<string, unknown>,
  options?: { endpoint?: string }
): Promise<ScoreResult> {
  const base = endpoint(options);
  const res = await fetch(`${base}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`repid-engine error: ${res.status}`);
  return (await res.json()) as ScoreResult;
}

export async function getAgent(
  agentId: string,
  options?: { endpoint?: string }
): Promise<AgentProfile> {
  const base = endpoint(options);
  const res = await fetch(`${base}/agents/${agentId}`);
  if (!res.ok) throw new Error(`Agent not found: ${agentId}`);
  const data = (await res.json()) as Record<string, unknown>;
  return {
    agentId: data.id as string,
    agentName: data.agent_name as string,
    currentRepId: data.current_repid as number,
    tier: data.tier as AgentProfile['tier'],
    activity30d: data.activity_30d as number,
    lastUpdated: data.last_updated as string,
  };
}

export async function registerHuman(
  options?: { endpoint?: string }
): Promise<{ privateId: string; agentId: string; repId: number; tier: string; zkpCommitment: string; warning: string }> {
  const base = endpoint(options);
  const res = await fetch(`${base}/agents/human`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error('Human registration failed');
  return res.json();
}
