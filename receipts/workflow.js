'use strict';
/**
 * Receipts — reading the `run:` commands of ONE job out of a workflow file.
 *
 * WHY THIS EXISTS AND WHY IT HAS NO YAML LIBRARY. A check run's name is its job's name,
 * and a job name says how CI is organised, not what it does. A step name is better — it
 * sits next to the command and carries its own result — but it is still a label chosen by
 * the same hand. The `run:` line is the first thing in the chain that is evidence: it is
 * the command the runner executed, read from the workflow file at the commit under test.
 * This action is zero-dependency by design (see index.js), so there is no js-yaml here.
 *
 * THE DESIGN RULE IS REFUSAL. Hand-written YAML parsing fails silently, and a silent
 * failure in this direction would mint false VERIFIEDs — the one error this tool must not
 * make. So every ambiguity returns `null` ("I could not read this"), never a guess, and
 * the caller falls back to the weaker evidence it already has. `null` and `[]` are
 * different answers: `[]` means the job genuinely runs no commands.
 *
 * It parses the narrow shape it needs and refuses everything else. It is not a YAML
 * implementation and must not grow into one.
 */

const MAX_YAML = 512 * 1024;

/** Indent width of a line, or null for a blank line or a whole-line comment. */
function indentOf(line) {
  if (/^\s*$/.test(line) || /^\s*#/.test(line)) return null;
  return line.length - line.replace(/^\s*/, '').length;
}

/** `"a"` / `'a'` / `a` -> `a`. Returns null for anything that needs evaluating. */
function scalar(raw) {
  const v = String(raw).trim();
  if (!v || v.includes('${{')) return null; // an expression resolves at run time, not here
  const m = v.match(/^"([^"]*)"$/) || v.match(/^'([^']*)'$/);
  return m ? m[1] : v.replace(/\s+#.*$/, '').trim();
}

/**
 * Split `jobs:` into one entry per job: its key, its resolved display name, and its lines.
 * A job whose `name:` is an expression gets `display: null` — unresolvable, not absent.
 */
function jobBlocks(lines) {
  const top = lines.findIndex((l) => /^jobs:\s*(#.*)?$/.test(l));
  if (top < 0) return null;
  let bodyIndent = null;
  const blocks = [];
  let current = null;
  for (let i = top + 1; i < lines.length; i += 1) {
    const ind = indentOf(lines[i]);
    if (ind === null) {
      if (current) current.lines.push(lines[i]);
      continue;
    }
    if (ind === 0) break; // back out to a sibling of `jobs:`
    if (bodyIndent === null) bodyIndent = ind;
    if (ind === bodyIndent) {
      const key = lines[i].match(/^\s*([A-Za-z0-9_.-]+):\s*(#.*)?$/);
      if (!key) return null; // a job key this reader does not understand
      current = { key: key[1], indent: ind, lines: [] };
      blocks.push(current);
      continue;
    }
    if (ind < bodyIndent) return null; // inconsistent indentation; do not guess
    if (current) current.lines.push(lines[i]);
  }
  for (const b of blocks) {
    // Only a DIRECT child `name:` of the job names the check run. A `name:` nested deeper
    // belongs to a step or an upload, and reading one of those as the job name would point
    // the whole lookup at the wrong block.
    const childIndent = b.lines.map(indentOf).filter((n) => n !== null).sort((a, c) => a - c)[0];
    const own = b.lines.find((l) => indentOf(l) === childIndent && /^\s*name:\s*\S/.test(l));
    b.display = own ? scalar(own.replace(/^\s*name:\s*/, '')) : b.key;
  }
  return blocks;
}

/** Every `run:` command in a job's lines, inline and block-scalar alike. */
function runCommands(block) {
  const out = [];
  const lines = block.lines;
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/^(\s*)-?\s*run:\s*(.*)$/);
    if (!m) continue;
    const keyIndent = m[1].length;
    const rest = m[2].trim();
    if (/^[|>][-+]?\d*\s*(#.*)?$/.test(rest)) {
      // Block scalar: the body is every following line indented past the `run:` key.
      const body = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        const ind = indentOf(lines[j]);
        if (ind === null) { body.push(''); continue; }
        if (ind <= keyIndent) break;
        body.push(lines[j].trim());
        i = j;
      }
      out.push(body.join('\n').trim());
    } else if (rest) {
      out.push(rest);
    }
  }
  return out;
}

/**
 * The `run:` commands of the job that produced a check run named `checkName`.
 * @returns {string[]|null} commands, `[]` if the job runs none, or `null` if unreadable.
 */
function jobCommands(yamlText, checkName) {
  const text = String(yamlText || '');
  if (!text || text.length > MAX_YAML || !checkName) return null;
  const blocks = jobBlocks(text.split(/\r?\n/));
  if (!blocks || blocks.length === 0) return null;
  const hit = blocks.filter((b) => b.display === checkName);
  if (hit.length !== 1) return null; // none, or two jobs that could both be this check
  // A job whose name is an expression could ALSO resolve to this check's name, so a single
  // apparent match is not unique while any name is unresolved.
  if (blocks.some((b) => b.display === null)) return null;
  return runCommands(hit[0]);
}

module.exports = { jobCommands, jobBlocks, runCommands, scalar, indentOf };
