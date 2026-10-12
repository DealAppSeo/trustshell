import { REPID_ENGINE_URL } from './repid-engine';
import { twoFieldsOf, type TwoFields } from './erc8004-display';

/**
 * Read an agent's two RepID fields (score and ERC-8004 ID) from the public passport route, from the
 * browser. Three outcomes, never two: READ with the fields, or NOT_CHECKED with the reason. A missing
 * agent, an unreachable engine and a body that is not a passport are all NOT_CHECKED: none of them is
 * a score of zero and none is "no ID".
 *
 * GET /api/v1/passport/:id is public and keyless and sends no claim text. The engine answers the
 * web origin (CORS) for this route.
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
  const fields = twoFieldsOf(body);
  // A body with neither a score nor a mint state is not a passport; do not render it as "no ID".
  if (fields.score === null && fields.mint === 'NOT_CHECKED') return { state: 'NOT_CHECKED', reason: 'bad_response' };
  return { state: 'READ', fields };
}
