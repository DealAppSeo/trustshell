import { REPID_ENGINE_URL } from './repid-engine';
import { embeddedOnChain, twoFieldsOf, type TwoFields } from './erc8004-display';

/**
 * Read an agent's two RepID fields (score and ERC-8004 ID) from the public passport route, from the
 * browser. Three outcomes, never two: READ with the fields, or NOT_CHECKED with the reason. A missing
 * agent, an unreachable engine and a body that is not a passport are all NOT_CHECKED: none of them is
 * a score of zero and none is "no ID".
 *
 * GET /api/v1/passport/:id is public and keyless and sends no claim text. The engine answers the
 * web origin (CORS) for this route.
 *
 * The ID's MINTED state (and the words "on-chain") need more than the engine's word (E-1): its MINTED is a
 * record of a mint transaction, not a reading of the chain. The live ownerOf read that confirms it is folded
 * into the passport (`passport.onchain`, repid-engine #1330), so this one call usually carries it; an older
 * engine that does not fold it in is confirmed with a second GET /api/v1/agents/:id/onchain (public, keyless,
 * the agent's UUID taken from the passport), made only for a recorded MINTED. MINTED is shown only if that read
 * found an owner for this token and the registry it was bound to is the canonical one (lib/erc8004-display.ts,
 * mintVerdictOf). A read that fails, or a browser that is not allowed to make it, leaves the ID NOT_CHECKED:
 * never confirmed, never denied.
 */
export type TwoFieldsRead =
  | { state: 'READ'; fields: TwoFields }
  | { state: 'NOT_CHECKED'; reason: 'no_engine' | 'unreachable' | 'not_found' | 'bad_response' };

export async function fetchTwoFields(
  agentId: string,
  opts: { base?: string; fetchImpl?: typeof fetch } = {},
): Promise<TwoFieldsRead> {
  const base = (opts.base ?? REPID_ENGINE_URL).replace(/\/+$/, '');
  if (!base) return { state: 'NOT_CHECKED', reason: 'no_engine' };
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${base}/api/v1/passport/${encodeURIComponent(agentId)}`, { cache: 'no-store' });
  } catch {
    return { state: 'NOT_CHECKED', reason: 'unreachable' };
  }
  if (res.status === 404) return { state: 'NOT_CHECKED', reason: 'not_found' };
  if (!res.ok) return { state: 'NOT_CHECKED', reason: 'unreachable' };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { state: 'NOT_CHECKED', reason: 'bad_response' };
  }
  // repid-engine #1330 folds the live ownership read into the passport as `onchain`. When it is there, use
  // it and make NO second call; otherwise (an older engine) a recorded MINTED still needs the second
  // GET /api/v1/agents/:id/onchain to be confirmed.
  const embedded = embeddedOnChain(body);
  let fields = embedded === undefined ? twoFieldsOf(body) : twoFieldsOf(body, embedded);
  if (embedded === undefined && fields.recordedMint) {
    const onChain = await readOnChain(body, base, doFetch);
    fields = twoFieldsOf(body, onChain);
  }
  // A body with neither a score nor a mint state is not a passport; do not render it as "no ID".
  if (fields.score === null && fields.mint === 'NOT_CHECKED') return { state: 'NOT_CHECKED', reason: 'bad_response' };
  return { state: 'READ', fields };
}

/** The agent id a passport names, only when it is a plain id (it goes into a URL path). */
const PLAIN_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

/**
 * The engine's live ownerOf read for the agent a passport describes. NEVER THROWS. Returns the raw body, or `null`
 * when it could not be made or did not answer: the caller reads `null` as "did not confirm", never as an absence.
 */
async function readOnChain(passport: unknown, base: string, doFetch: typeof fetch): Promise<unknown> {
  try {
    const named = (passport as { agent?: { agent_id?: unknown } } | null)?.agent?.agent_id;
    if (typeof named !== 'string' || !PLAIN_ID.test(named)) return null;
    const res = await doFetch(`${base}/api/v1/agents/${encodeURIComponent(named)}/onchain`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
