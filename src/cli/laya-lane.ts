/**
 * Pick the Laya lane before HAL.
 * Unset TRUSTSHELL_LAYA stays on the quorum.
 * local uses the text classifier and src/laya/hook.ts.
 * engine POSTs /api/v1/laya/classify. A 200ms timeout escalates.
 */
import { redact } from '../memory/redact';
import { layaHook } from '../laya/hook';
import { classify, type LayaLane } from './classify';

const CLASSIFY_TIMEOUT_MS = 200;

function engineOrigin(env: NodeJS.ProcessEnv): string | null {
  const trimmed = (env.TRUSTSHELL_API_URL ?? '').trim().replace(/\/$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

function asLane(value: unknown): LayaLane | null {
  if (typeof value !== 'string') return null;
  const lane = value.trim().toLowerCase();
  if (lane === 'cheap' || lane === 'escalate' || lane === 'ask') return lane;
  return null;
}

function laneFromBody(body: unknown): LayaLane | null {
  const direct = asLane(body);
  if (direct) return direct;
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  return asLane(record.classify) ?? asLane(record.lane);
}

async function engineLane(
  claim: string,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch,
): Promise<LayaLane> {
  if (env.OFFLINE === '1') return 'escalate';
  const origin = engineOrigin(env);
  if (!origin) return 'escalate';
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = fetchImpl(`${origin}/api/v1/laya/classify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ text: redact(claim) }),
    signal: ac.signal,
  });
  pending.catch(() => undefined);
  try {
    const res = await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ac.abort();
          reject(new Error('timeout'));
        }, CLASSIFY_TIMEOUT_MS);
      }),
    ]);
    if (!res.ok) return 'escalate';
    const body = await res.json().catch(() => null);
    return laneFromBody(body) ?? 'escalate';
  } catch {
    return 'escalate';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Lane for this verify. Unset, local, or engine. */
export async function resolveLayaLane(
  claim: string,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch,
): Promise<LayaLane> {
  const mode = (env.TRUSTSHELL_LAYA ?? '').trim();
  if (mode === 'local') {
    const lane = classify(claim);
    layaHook(lane);
    return lane;
  }
  if (mode === 'engine') return engineLane(claim, env, fetchImpl);
  return 'escalate';
}
