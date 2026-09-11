/**
 * value-events-summary — read the on-device value-events log and show the tally.
 *
 * The writer (value-events.mjs) logs register_ok / VETO / cap_refuse as JSON lines; this reads them
 * back so a person can SEE their value: how many false claims the harness caught (VETO), how many
 * over-cap spends it refused (cap_refuse), and that onboarding succeeded (register_ok). Read-only,
 * on device (same `.trustshell/`); nothing is uploaded. Run `node scripts/value-events-summary.mjs`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { trustshellDir, VALUE_EVENTS } from './value-events.mjs';

/**
 * Tally value events from JSONL text. Returns { total, counts, malformed } — malformed lines are
 * counted, never silently dropped (a corrupt log should be visible, not rounded to zero).
 */
export function summarize(jsonl) {
  const counts = Object.fromEntries(VALUE_EVENTS.map((e) => [e, 0]));
  let total = 0;
  let malformed = 0;
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { malformed++; continue; }
    if (obj && VALUE_EVENTS.includes(obj.event)) { counts[obj.event]++; total++; }
    else malformed++;
  }
  return { total, counts, malformed };
}

function render({ total, counts, malformed }) {
  const lines = [
    `value events: ${total} logged`,
    `  register_ok: ${counts.register_ok}   (onboarded)`,
    `  VETO:        ${counts.VETO}   (false claims the harness caught before you acted)`,
    `  cap_refuse:  ${counts.cap_refuse}   (over-cap spends refused)`,
  ];
  if (malformed) lines.push(`  ⚠ ${malformed} unparseable line(s) — log may be corrupt`);
  return lines.join('\n');
}

// ── self-check ──────────────────────────────────────────────────────────────
function selfCheck() {
  const sample = [
    JSON.stringify({ ts: 't', event: 'register_ok' }),
    JSON.stringify({ ts: 't', event: 'VETO', claim: 'x' }),
    JSON.stringify({ ts: 't', event: 'VETO', claim: 'y' }),
    JSON.stringify({ ts: 't', event: 'cap_refuse', amount: 9, cap: 5 }),
    JSON.stringify({ ts: 't', event: 'not_a_real_event' }), // must NOT be tallied
    'garbage{',                                              // malformed
    '',                                                      // blank ignored
  ].join('\n');
  const s = summarize(sample);
  if (s.total !== 4) throw new Error(`self-check FAIL: total ${s.total} != 4`);
  if (s.counts.VETO !== 2 || s.counts.register_ok !== 1 || s.counts.cap_refuse !== 1) throw new Error(`self-check FAIL: counts ${JSON.stringify(s.counts)}`);
  if (s.malformed !== 2) throw new Error(`self-check FAIL: malformed ${s.malformed} != 2 (unknown event + garbage)`);
  console.log(`value-events-summary self-check: PASS — 4 tallied, unknown+garbage counted as 2 malformed, not dropped`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly && process.argv.includes('--selfcheck')) {
  selfCheck();
} else if (invokedDirectly) {
  // Default run: read the real on-device log and print the tally (empty if none yet).
  const path = join(trustshellDir(), 'value-events.jsonl');
  let text = '';
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    // ENOENT = no log written yet → an honest tally of 0. Any other error (permissions, I/O) is a
    // real read failure: report it and exit 1 rather than silently showing 0 (NOT CHECKED ≠ zero).
    if (err.code !== 'ENOENT') {
      console.error(`value-events-summary: cannot read ${path}: ${err.message}`);
      process.exit(1);
    }
  }
  console.log(render(summarize(text)));
}
