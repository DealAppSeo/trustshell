/**
 * value-events — append PAI value events as JSON lines, on device.
 *
 * The three moments worth counting for a Personal AI: a successful onboarding, a lie the engine
 * caught, and a spend it refused. One JSON object per line ({ ts, event, ...data }) so a person (or a
 * later dashboard) can `grep`/`jq` their own history without a service.
 *
 * PRIVACY: writes to `.trustshell/value-events.jsonl` on the DEVICE (same place keys + interview live);
 * nothing is uploaded. Override the dir with TRUSTSHELL_HOME. Pass `{ stream }` to redirect (tests).
 *
 * Run `node scripts/value-events.mjs` (or `--selfcheck`) to exercise the self-check.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The only events this logs. An unknown event throws — a typo must not become a silent no-count. */
export const VALUE_EVENTS = Object.freeze(['register_ok', 'VETO', 'cap_refuse']);

export function trustshellDir() {
  if (process.env.TRUSTSHELL_HOME) return process.env.TRUSTSHELL_HOME;
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return join(home, '.trustshell');
}

/**
 * Append one value event. Returns the JSON line written.
 * @param {'register_ok'|'VETO'|'cap_refuse'} event
 * @param {Record<string, unknown>} [data]  event-specific fields (agentId, claim, amount/cap, …)
 * @param {{ dir?: string, stream?: { write(s: string): unknown }, now?: string }} [opts]
 */
export function logValueEvent(event, data = {}, opts = {}) {
  if (!VALUE_EVENTS.includes(event)) {
    throw new Error(`value-events: unknown event '${event}' — expected one of ${VALUE_EVENTS.join(' | ')}`);
  }
  // ...data FIRST so the canonical ts/event always win over any same-named field in data.
  const line = JSON.stringify({ ...data, ts: opts.now ?? new Date().toISOString(), event }) + '\n';
  if (opts.stream) {
    opts.stream.write(line);
    return line;
  }
  const dir = opts.dir ?? trustshellDir();
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'value-events.jsonl'), line);
  return line;
}

// ── self-check ────────────────────────────────────────────────────────────────
// Runs when invoked directly. Writes to an in-memory sink (no disk, no upload) and asserts every
// event yields one parseable JSON line carrying { ts, event }, and that an unknown event refuses.
function selfCheck() {
  const captured = [];
  const stream = { write: (s) => captured.push(s) };
  for (const ev of VALUE_EVENTS) {
    const line = logValueEvent(ev, { sample: true }, { stream, now: '1970-01-01T00:00:00.000Z' });
    const obj = JSON.parse(line);
    if (obj.event !== ev || !obj.ts) throw new Error(`self-check FAIL: bad line for ${ev}: ${line.trim()}`);
  }
  let refused = false;
  try { logValueEvent('nonsense', {}, { stream }); } catch { refused = true; }
  if (!refused) throw new Error('self-check FAIL: an unknown event was NOT refused');
  if (captured.length !== VALUE_EVENTS.length) throw new Error(`self-check FAIL: expected ${VALUE_EVENTS.length} lines, got ${captured.length}`);
  console.log(`value-events self-check: PASS — ${VALUE_EVENTS.length} events logged as JSON lines, unknown refused`);
}

// ESM "run if invoked directly": this module's URL equals the file node was told to run.
// Only then self-check — so importing this module (e.g. from value-events-summary.mjs) never fires it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  selfCheck();
}
