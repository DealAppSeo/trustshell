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
