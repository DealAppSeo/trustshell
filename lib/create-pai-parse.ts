/** Pure parsers for /create — live HAL uses `decision: vetoed|clean`, not `verdict`. */

export type HalVerdict = 'PASS' | 'FLAG' | 'VETO' | null;

export function rejectEmptyName(name: string): string | null {
  if (!String(name ?? '').trim()) return 'Give your PAI a name first.';
  return null;
}

export function parseHalVerdict(data: { verdict?: unknown; hal_decision?: unknown; decision?: unknown } | null): HalVerdict {
  const raw = String(
    (data && (data.verdict ?? data.hal_decision ?? data.decision)) || '',
  ).toUpperCase();
  if (raw.includes('VETO')) return 'VETO';
  if (raw.includes('FLAG')) return 'FLAG';
  if (raw.includes('PASS') || raw === 'CLEAN' || raw === 'TRUE') return 'PASS';
  return null;
}

export function parseRegister(
  status: number,
  data: Record<string, unknown> | null,
): { ok: true; agentId: string; apiKey: string | null } | { ok: false; message: string } {
  const err = String((data && (data.error || data.message)) || '');
  if (status === 429 || status === 409 || /\b429\b/.test(err)) {
    return { ok: false, message: 'That name is taken — pick another.' };
  }
  const agentId = data && (data.agent_id || data.agentId);
  if (status < 200 || status >= 300 || typeof agentId !== 'string' || !agentId) {
    if (status === 400 || status === 422) {
      return { ok: false, message: 'Give your PAI a name first.' };
    }
    return { ok: false, message: err || `Register failed (${status}).` };
  }
  const apiKey =
    typeof data.api_key === 'string'
      ? data.api_key
      : typeof data.apiKey === 'string'
        ? data.apiKey
        : null;
  return { ok: true, agentId, apiKey };
}

export interface HalVote { provider: string; model: string; verdict: string; note: string; latencyMs: number | null }
export interface HalEvidence { verdict: HalVerdict; votes: HalVote[]; families: string[]; quorum: string | null; latencyMs: number | null }

/** Evidence behind a verdict: only votes that COUNTED (late/NOT_CHECKED providers are left out, never shown as agreement). */
export function parseHalEvidence(data: Record<string, unknown> | null): HalEvidence {
  const d = (data ?? {}) as Record<string, any>;
  const rows: any[] = Array.isArray(d.provider_responses) ? d.provider_responses : [];
  const votes: HalVote[] = rows
    .filter((r) => r && r.counted !== false && r.late !== true && !String(r.note ?? '').startsWith('NOT_CHECKED'))
    .map((r) => ({
      provider: String(r.provider ?? '?'),
      model: String(r.model ?? ''),
      verdict: String(r.verdict ?? ''),
      note: String(r.note ?? ''),
      latencyMs: typeof r.latency_ms === 'number' ? r.latency_ms : null,
    }));
  const fam = d.signals?.families;
  return {
    verdict: parseHalVerdict(d),
    votes,
    families: Array.isArray(fam) ? fam.map(String) : [],
    quorum: typeof d.signals?.quorum === 'string' ? d.signals.quorum : null,
    latencyMs: typeof d.latency_ms === 'number' ? d.latency_ms : null,
  };
}

/** The live /repid/:id route returns `score` (not repid_score); reading only the old names showed "Not read yet". */
export function parseRepidScore(d: Record<string, unknown> | null): number | null {
  const v = d && (d.score ?? d.repid_score ?? d.repid ?? d.current_repid);
  return typeof v === 'number' ? v : null;
}
