// @hyperdag/trustshell v0.1.0
// The trust gate for the agentic economy.
// Zero formula constants. Calls repid-engine API only.
// Patent pending P-023 + P-024 — do not reverse engineer.
// Apache-2.0 — wrapper is open, engine is proprietary.

const DEFAULT_ENGINE = 'https://repid-engine-production.up.railway.app';

function getEngine(options?: { endpoint?: string }): string {
  if (options?.endpoint) return options.endpoint;
  const g: any = globalThis;
  const envUrl =
    g?.process?.env?.REPID_ENGINE_URL ||
    g?.Deno?.env?.get?.('REPID_ENGINE_URL');
  return envUrl || DEFAULT_ENGINE;
}

export interface GateResult {
  allowed: boolean;
  repId: number;
  tier: 'CUSTODIED_DBT' | 'EARNING_AUTONOMY' | 'AUTONOMOUS' | 'UNKNOWN';
  reason?: string;
  easAttestationId?: string;
}

export interface AgentProfile {
  agentId: string;
  agentName: string;
  currentRepId: number;
  tier: 'CUSTODIED_DBT' | 'EARNING_AUTONOMY' | 'AUTONOMOUS';
  activity30d: number;
  lastUpdated: string;
  isHuman?: boolean;
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

export interface HumanRegistration {
  privateId: string;
  agentId: string;
  repId: number;
  tier: string;
  badges: string[];
  warning: string;
}

export interface MCPCallResult {
  allowed: boolean;
  toolName: string;
  complianceScore: number;
  easAttestationId: string;
  repidBonusEligible: number;
  requiresConservatorApproval: boolean;
  blockedReason?: string;
}

export interface BadgeRecord {
  badgeName: string;
  rarity: string;
  earnedAt: string;
}

// Gate an x402 payment by RepID tier
// CUSTODIED_DBT: $0 | EARNING_AUTONOMY: $1000 | AUTONOMOUS: unlimited
export async function gate(
  agentId: string,
  amount: number,
  options?: { endpoint?: string }
): Promise<GateResult> {
  try {
    const res = await fetch(`${getEngine(options)}/agents/${agentId}/x402-gate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    if (!res.ok) {
      return { allowed: false, repId: 0, tier: 'UNKNOWN', reason: 'engine_error' };
    }
    return (await res.json()) as GateResult;
  } catch {
    return { allowed: false, repId: 0, tier: 'UNKNOWN', reason: 'network_error' };
  }
}

// Score a RepID event (challenge win/loss, prediction, teaching, etc.)
export async function score(
  input: {
    agentId: string;
    eventType: string;
    certaintyAtClaim?: number;
    pStated?: number;
    pCorrect?: number;
    predictionDaysAgo?: number;
    isPeacemaker?: boolean;
    selfMonitoring?: boolean;
  },
  options?: { endpoint?: string }
): Promise<ScoreResult> {
  const res = await fetch(`${getEngine(options)}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`repid-engine error: ${res.status}`);
  return (await res.json()) as ScoreResult;
}

// Get an agent profile by UUID
export async function getAgent(
  agentId: string,
  options?: { endpoint?: string }
): Promise<AgentProfile> {
  const res = await fetch(`${getEngine(options)}/agents/${agentId}`);
  if (!res.ok) throw new Error(`Agent not found: ${agentId}`);
  const d = (await res.json()) as any;
  return {
    agentId: d.id,
    agentName: d.agent_name,
    currentRepId: d.current_repid,
    tier: d.tier,
    activity30d: d.activity_30d,
    lastUpdated: d.last_updated,
    isHuman: d.constitution?.type === 'HUMAN' || d.agent_name === 'HUMAN',
  };
}

// Register an anonymous human DBT.
// Returns privateId (must be saved — not recoverable) + agentId
export async function registerHuman(
  options?: { endpoint?: string }
): Promise<HumanRegistration> {
  const res = await fetch(`${getEngine(options)}/agents/human`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error('Human registration failed');
  return (await res.json()) as HumanRegistration;
}

// Call an MCP tool with constitutional guardrails
export async function callMCP(
  agentId: string,
  toolName: string,
  params: Record<string, unknown> = {},
  options?: { endpoint?: string }
): Promise<MCPCallResult> {
  const res = await fetch(`${getEngine(options)}/mcp-call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, toolName, params }),
  });
  if (!res.ok) throw new Error(`MCP call failed: ${res.status}`);
  return (await res.json()) as MCPCallResult;
}

// Get earned badges for an agent
export async function getBadges(
  agentId: string,
  options?: { endpoint?: string }
): Promise<BadgeRecord[]> {
  const res = await fetch(`${getEngine(options)}/agents/${agentId}/badges`);
  if (!res.ok) return [];
  return (await res.json()) as BadgeRecord[];
}

// Get shareable ZKP score card URL (SVG)
export function getCardUrl(
  agentId: string,
  options?: { endpoint?: string }
): string {
  return `${getEngine(options)}/agents/${agentId}/card`;
}
