/**
 * Local memory tools. They write and list sqlite notes.
 * They do not call an LLM or any network helper.
 *
 * IMMUNE SYSTEM v0. A note written through MCP did not come from the operator's keyboard: an agent
 * passed it, and it may carry a web page, a tool result or another agent's words. So it is stored
 * UNTRUSTED and QUARANTINED, and `recall` leaves it out until a check releases it
 * (`quarantine_release`, which grounds it against its source text, locally).
 */
import { refusedValue } from '../cli/remember';
import { formatRecall, memoryDbPath } from '../memory/local-store';
import { releaseByGround, rememberUntrusted, type QuarantineRecord } from '../memory/quarantine';

export function rememberLocal(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
  source = 'mcp:remember',
): { kind: 'note'; remembered: true; id: number; provenance: 'untrusted'; quarantined: true; reason: string | null } {
  if (refusedValue(text)) throw new Error('remember refused');
  const rec: QuarantineRecord = rememberUntrusted(text, { source }, env);
  return { kind: 'note', remembered: true, id: rec.id, provenance: 'untrusted', quarantined: true, reason: rec.reason };
}

export function recallLocal(
  env: NodeJS.ProcessEnv = process.env,
  opts: { includeQuarantined?: boolean } = {},
): { notes: string } {
  return { notes: formatRecall(memoryDbPath(env), env, opts) };
}

/** Ground release over MCP: the source is passed as text. Local, no network. */
export function releaseLocal(
  id: number,
  sourceText: string,
  page: number | null = null,
  env: NodeJS.ProcessEnv = process.env,
): ReturnType<typeof releaseByGround> {
  return releaseByGround(id, sourceText, { page, sourceLabel: 'source_text (mcp)' }, env);
}
