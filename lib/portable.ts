/**
 * MOVING AGENTS BETWEEN BROWSERS — the thing "portable agentic trust harness" did not mean.
 *
 * Agents live in one browser's IndexedDB (`trustshell_agents_v1`, see lib/db.ts). Until this
 * module there was no export, no import and no way back: clearing site data, switching laptops,
 * or opening the site in a different browser lost the agent from the UI permanently. The row in
 * the engine survived, but nothing in the product could find it again.
 *
 * WHY THE FILE IS PLAINTEXT JSON AND NOT PASSPHRASE-ENCRYPTED LIKE THE VAULT.
 * An agent's `apiKey` is a real secret — it is the bearer credential for `/score-event`, so
 * whoever holds it can write score events as that agent. That argues for encryption, and
 * lib/vault.ts already has the AES-GCM code. It is deliberately not reused here:
 *
 *   - The vault protects provider keys, which cost money when leaked. This protects a scoped,
 *     testnet-demo credential whose worst case is a polluted score history.
 *   - This file is the ONLY copy of an `apiKey` that exists anywhere. The engine returns it once
 *     at registration and cannot reissue it. A backup nobody made because it demanded a second
 *     passphrase is worse than a plaintext one sitting in a downloads folder.
 *
 * So: plaintext, and the UI says out loud that the file carries keys. `EXPORT_WARNING` travels
 * inside the file for the same reason — somebody will open it in a text editor a year from now.
 *
 * NOTHING HERE TOUCHES THE NETWORK OR IndexedDB. Merge semantics are the part that can silently
 * destroy data, so they are pure functions with tests. Recovery-by-id lives in lib/agent-recovery.ts.
 */
import type { Agent, HistoryRow } from './db';

export const PORTABLE_FORMAT = 'trustshell.agents';
export const PORTABLE_VERSION = 1;

export const EXPORT_WARNING =
  'This file contains your agents\' API keys in plain text. Anyone holding it can post score ' +
  'events as these agents. Treat it like a password.';

export type PortableFile = {
  format: typeof PORTABLE_FORMAT;
  version: number;
  exportedAt: string;
  _warning: string;
  agents: Agent[];
  history: HistoryRow[];
};

export function buildExport(agents: Agent[], history: HistoryRow[]): PortableFile {
  return {
    format: PORTABLE_FORMAT,
    version: PORTABLE_VERSION,
    exportedAt: new Date().toISOString(),
    _warning: EXPORT_WARNING,
    agents,
    history,
  };
}

export type ParseReason = 'not_json' | 'not_ours' | 'too_new' | 'no_agents';

export const PARSE_ERRORS: Record<ParseReason, string> = {
  not_json: "That file isn't JSON. Pick the .json file TrustShell downloaded.",
  not_ours: "That's a JSON file, but not a TrustShell agent export. The vault backup goes in the Vault section below.",
  too_new: 'That file was written by a newer version of TrustShell than this one. Update the page and try again.',
  no_agents: 'That export contains no agents, so there is nothing to import.',
};

export type ParseResult =
  | { ok: true; file: PortableFile }
  | { ok: false; reason: ParseReason };

/**
 * Refuses anything it does not recognise rather than importing half of it. A partially applied
 * import is indistinguishable from a successful one at the UI layer, and this is the feature
 * people reach for when they have already lost something.
 */
export function parseImport(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not_json' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'not_ours' };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.format !== PORTABLE_FORMAT) {
    return { ok: false, reason: 'not_ours' };
  }
  // A version we have never seen may carry fields whose meaning we would guess wrong.
  if (typeof obj.version !== 'number' || obj.version > PORTABLE_VERSION) {
    return { ok: false, reason: 'too_new' };
  }
  const agents = Array.isArray(obj.agents) ? obj.agents.filter(isAgent) : [];
  if (agents.length === 0) {
    return { ok: false, reason: 'no_agents' };
  }
  const history = Array.isArray(obj.history) ? obj.history.filter(isHistoryRow) : [];
  return {
    ok: true,
    file: {
      format: PORTABLE_FORMAT,
      version: obj.version,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
      _warning: EXPORT_WARNING,
      agents,
      history,
    },
  };
}

function isAgent(v: unknown): v is Agent {
  if (!v || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  return typeof a.id === 'string' && a.id.length > 0 && typeof a.name === 'string';
}

function isHistoryRow(v: unknown): v is HistoryRow {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.agentId === 'string';
}

export type MergeReport = {
  agents: Agent[];
  added: number;
  updated: number;
  unchanged: number;
  /** The file had no key for an agent this browser holds one for — the local key was kept. */
  keysKept: number;
  /** This browser had no key and the file did — scoring works again for these. */
  keysRestored: number;
  /** Both sides held a DIFFERENT key. Named so the person can see which agents are affected. */
  keyConflicts: string[];
};

/**
 * IMPORT IS A MERGE, NEVER A REPLACE.
 *
 * Replacing would delete every agent that exists only in this browser — precisely the loss this
 * feature exists to prevent, caused by the feature itself. So each id is resolved on its own:
 *
 *   apiKey       the one that EXISTS always beats the one that does not, in either direction.
 *                It is unreissuable, so dropping one is unrecoverable, while keeping a stale one
 *                costs a 401 the run page already explains. On a genuine conflict the LOCAL key
 *                wins (this browser has been using it) and the id is reported, never swallowed.
 *   createdAt    earliest wins. Creation happened once; a later timestamp is a copy artefact.
 *   totalPrompts max wins. A counter only goes up, and summing would invent runs that never
 *                happened when the file is simply an older copy of this same browser.
 *   everything   from whichever record was used more recently (`lastUsedAt`), which is the only
 *   else         evidence available about which description or constitution is current.
 */
export function mergeAgents(local: Agent[], incoming: Agent[]): MergeReport {
  const byId = new Map(local.map((a) => [a.id, a]));
  const report: MergeReport = {
    agents: [],
    added: 0,
    updated: 0,
    unchanged: 0,
    keysKept: 0,
    keysRestored: 0,
    keyConflicts: [],
  };

  for (const remote of incoming) {
    const mine = byId.get(remote.id);
    if (!mine) {
      byId.set(remote.id, remote);
      report.added += 1;
      continue;
    }

    let apiKey = mine.apiKey ?? remote.apiKey;
    if (mine.apiKey && remote.apiKey && mine.apiKey !== remote.apiKey) {
      report.keyConflicts.push(remote.id);
      apiKey = mine.apiKey;
    } else if (mine.apiKey && !remote.apiKey) {
      report.keysKept += 1;
    } else if (!mine.apiKey && remote.apiKey) {
      report.keysRestored += 1;
    }

    const newer = (remote.lastUsedAt ?? 0) > (mine.lastUsedAt ?? 0) ? remote : mine;
    const merged: Agent = {
      ...mine,
      ...newer,
      id: mine.id,
      createdAt: Math.min(mine.createdAt || Infinity, remote.createdAt || Infinity) || mine.createdAt,
      totalPrompts: Math.max(mine.totalPrompts ?? 0, remote.totalPrompts ?? 0),
      lastUsedAt: Math.max(mine.lastUsedAt ?? 0, remote.lastUsedAt ?? 0),
      apiKey,
    };

    byId.set(remote.id, merged);
    if (sameAgent(mine, merged)) report.unchanged += 1;
    else report.updated += 1;
  }

  report.agents = Array.from(byId.values());
  return report;
}

function sameAgent(a: Agent, b: Agent): boolean {
  return (
    a.name === b.name &&
    a.description === b.description &&
    a.constitution === b.constitution &&
    a.createdAt === b.createdAt &&
    a.totalPrompts === b.totalPrompts &&
    a.lastUsedAt === b.lastUsedAt &&
    a.apiKey === b.apiKey
  );
}

/** Same principle for runs: union by id, newest first. A run that happened cannot un-happen. */
export function mergeHistory(
  local: HistoryRow[],
  incoming: HistoryRow[],
): { history: HistoryRow[]; added: number } {
  const byId = new Map(local.map((r) => [r.id, r]));
  let added = 0;
  for (const row of incoming) {
    if (byId.has(row.id)) continue;
    byId.set(row.id, row);
    added += 1;
  }
  const history = Array.from(byId.values()).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  return { history, added };
}

/**
 * One sentence a person can act on, assembled from what actually happened. Deliberately reports
 * "nothing new" rather than a bare success — an import that changed nothing looks identical to a
 * working one otherwise, and that is how somebody concludes their backup restored when it did not.
 */
export function describeMerge(agents: MergeReport, historyAdded: number): string {
  const parts: string[] = [];
  if (agents.added) parts.push(`${agents.added} agent${agents.added === 1 ? '' : 's'} added`);
  if (agents.updated) parts.push(`${agents.updated} updated`);
  if (agents.keysRestored) {
    parts.push(`${agents.keysRestored} API key${agents.keysRestored === 1 ? '' : 's'} restored`);
  }
  if (historyAdded) parts.push(`${historyAdded} run${historyAdded === 1 ? '' : 's'} added`);
  // The notes below are appended even when nothing changed. A key conflict resolves in favour of
  // the local key and therefore alters nothing, so an early "nothing new" return would swallow
  // the one fact the person most needs — that the file they are about to rely on holds a key
  // this browser rejected.
  const notes: string[] = [];
  if (agents.keysKept) {
    notes.push(
      `${agents.keysKept} API key${agents.keysKept === 1 ? '' : 's'} already here ${
        agents.keysKept === 1 ? 'was' : 'were'
      } missing from the file and ${agents.keysKept === 1 ? 'was' : 'were'} kept.`,
    );
  }
  if (agents.keyConflicts.length) {
    notes.push(
      `${agents.keyConflicts.length} agent${
        agents.keyConflicts.length === 1 ? '' : 's'
      } had a different key in the file; this browser's key was kept.`,
    );
  }

  const head =
    parts.length === 0
      ? 'Nothing new — this browser already had everything in that file.'
      : `Imported: ${parts.join(', ')}.`;
  return [head, ...notes].join(' ');
}

/** Stable, sortable, and it says what is inside without being opened. */
export function exportFilename(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `trustshell-agents-${stamp}.json`;
}
