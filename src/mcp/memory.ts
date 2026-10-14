/**
 * Local memory tools. They write and list sqlite notes.
 * They do not call an LLM or any network helper.
 *
 * IMMUNE SYSTEM v0. A note written through MCP did not come from the operator's keyboard: an agent
 * passed it, and it may carry a web page, a tool result or another agent's words. So it is stored
 * UNTRUSTED and QUARANTINED, and `recall` leaves it out until the OPERATOR releases it at the CLI.
 * There is deliberately no release over MCP: the writer must not be able to release its own note.
 */
import { refusedValue } from '../cli/remember';
import { formatRecall, memoryDbPath } from '../memory/local-store';
import { rememberUntrusted, type QuarantineRecord } from '../memory/quarantine';

export function rememberLocal(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
  source = 'mcp:remember',
  sourceText: string | null = null,
): {
  kind: 'note';
  remembered: true;
  id: number;
  provenance: 'untrusted';
  quarantined: true;
  reason: string | null;
  source_recorded: boolean;
} {
  if (refusedValue(text)) throw new Error('remember refused');
  const rec: QuarantineRecord = rememberUntrusted(text, { source, sourceText }, env);
  return {
    kind: 'note',
    remembered: true,
    id: rec.id,
    provenance: 'untrusted',
    quarantined: true,
    reason: rec.reason,
    source_recorded: rec.source_recorded,
  };
}

export function recallLocal(
  env: NodeJS.ProcessEnv = process.env,
  opts: { includeQuarantined?: boolean } = {},
): { notes: string } {
  return { notes: formatRecall(memoryDbPath(env), env, opts) };
}
