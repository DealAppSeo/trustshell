import { CATCH_RECORD } from './recordings/catch-1.9.3';

/**
 * Reads the recorded 1.9.3 run (lib/recordings/catch-1.9.3.ts) so the page can show its verdicts
 * without anyone typing them: every line "Watch an agent get caught" prints is taken from the record.
 * A record this cannot read throws at build time rather than rendering an empty or invented catch.
 */

export type RecordedClaim = { status: string; label: string; said: string; template: string; why: string };

function field(block: string[], name: string): string {
  const line = block.find((l) => l.startsWith(`  - **${name}** `));
  if (!line) throw new Error(`recorded claim has no ${name} line`);
  return line.slice(`  - **${name}** `.length).replace(/^`(.*)`$/, '$1');
}

export function parseRecord(text: string) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith('### Claims: '));
  if (start < 0) throw new Error('record has no Claims heading');
  const end = lines.findIndex((l, i) => i > start && l.startsWith('### '));
  const claims: RecordedClaim[] = [];
  let block: string[] = [];
  const flush = () => {
    if (!block.length) return;
    const m = /^- \*\*([A-Z_ ]+)\*\* `(.+)`$/.exec(block[0]);
    if (!m) throw new Error(`unreadable claim line: ${block[0]}`);
    claims.push({ status: m[1], label: m[2], said: field(block, 'In'), template: field(block, 'Template'), why: field(block, 'Why') });
    block = [];
  };
  for (const l of lines.slice(start + 1, end < 0 ? undefined : end)) {
    if (l.startsWith('- **')) flush();
    if (l.startsWith('- **') || (block.length && l.startsWith('  - '))) block.push(l);
  }
  flush();
  const observed = lines.find((l) => l.startsWith('- **Observed** '));
  const filled = lines.filter((l) => l.trim());
  const exit = filled[filled.length - 1] ?? '';
  const run = lines.map((l) => /^- \*\*Run\*\* `([\w.-]+\/[\w.-]+)` · run (\d+) /.exec(l)).find(Boolean);
  if (!observed || !run || !/^exit \d+$/.test(exit)) throw new Error('record has no Run, Observed or exit line');
  return {
    headline: lines[start].slice(4),
    claims,
    observed: observed.slice('- **Observed** '.length),
    exit,
    runId: run[2],
    runUrl: `https://github.com/${run[1]}/actions/runs/${run[2]}`,
  };
}

export const CATCH = (() => {
  const r = parseRecord(CATCH_RECORD);
  const caught = r.claims.find((c) => c.status === 'CONTRADICTED');
  const fair = r.claims.find((c) => c.status === 'SUPPORTED' && c.template === 'gha.run_succeeded');
  if (!caught || !fair) throw new Error('the record no longer holds a contradicted claim and a supported run outcome');
  return { ...r, caught, fair };
})();
