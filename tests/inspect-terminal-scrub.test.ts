/**
 * `trustshell inspect` must not replay terminal controls from the log it reads (Lane D, 2026-10-21:
 * inspect/terminal-escape-in-tool-name and inspect/bidi-override-in-tool-name). A properly CHAINED log
 * (verdict INTACT) whose tool name held ESC[2J ESC[31m "ALL CLEAR" cleared the screen after the verdict,
 * and U+202E reversed what followed. Every control below is built from its code point, so this file
 * holds none of them literally.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, type CliIO } from '../src/cli';
import { formatInspectCard, nextEntry, verifyChain } from '../src/lib/inspect';

const c = (...cps: number[]) => String.fromCodePoint(...cps);
const ESC = c(0x1b);
const CSI_C1 = c(0x9b); // the one-byte C1 form of ESC[
const RLO = c(0x202e); // right-to-left override
const ZWSP = c(0x200b);
const CLEAR_RED = `${ESC}[2J${ESC}[31mALL CLEAR`;
const SHA = 'a'.repeat(64);

/** Anything a terminal would act on or reorder: C0 except newline, DEL and C1, bidi controls, zero-width. */
const CONTROL = new RegExp(`[${c(0x00)}-${c(0x09)}${c(0x0b)}-${c(0x1f)}${c(0x7f)}-${c(0x9f)}${c(0x200b)}-${c(0x200f)}${c(0x202a)}-${c(0x202e)}${c(0x2066)}-${c(0x2069)}]`, 'u');

function chainedLog(tools: string[]): string {
  let text = '';
  tools.forEach((tool, i) => {
    const e = nextEntry(text, { ts: `2026-10-21T10:0${i}:00Z`, tool, input_sha256: SHA, output_sha256: SHA });
    text += JSON.stringify(e) + '\n';
  });
  return text;
}

describe('inspect prints no terminal controls from the log', () => {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ts-inspect-scrub-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  async function inspect(text: string, ...flags: string[]): Promise<{ code: number; out: string }> {
    const path = join(dir, 'session.jsonl');
    writeFileSync(path, text);
    const out: string[] = [];
    const io: CliIO = { out: (s) => out.push(s), err: (s) => out.push(s) };
    const code = await run(parseArgs(['inspect', path, ...flags]), {} as never, io);
    return { code, out: out.join('\n') };
  }

  it.each([
    ['terminal-escape-in-tool-name', CLEAR_RED],
    ['C1 CSI in tool name', `${CSI_C1}2J${CSI_C1}31mALL CLEAR`],
    ['bidi-override-in-tool-name', `${RLO}evil.exe${ZWSP}`],
  ])('%s: the log still verifies INTACT, and stdout carries no control', async (_name, tool) => {
    const text = chainedLog(['read_file', tool]);
    expect(verifyChain(text, 'x').verdict).toBe('INTACT'); // the attack is a well-formed log, not a broken one
    const card = await inspect(text);
    expect(card.code).toBe(0);
    expect(card.out).toContain('INTACT');
    expect(card.out).not.toMatch(CONTROL);
    const json = await inspect(text, '--json');
    expect(json.out).not.toMatch(CONTROL);
    // --json keeps the exact value, written as escapes: parsing it back gives the log's own tool name.
    expect((JSON.parse(json.out) as { tools: { tool: string }[] }).tools.map((t) => t.tool)).toContain(tool);
  });

  it('the visible letters survive: the card still names the tool', async () => {
    const card = await inspect(chainedLog([CLEAR_RED]));
    expect(card.out).toContain('ALL CLEAR');
  });

  it('a genuine log prints byte for byte as before (plain ASCII is untouched)', () => {
    const r = verifyChain(chainedLog(['read_file', 'bash', 'edit_file']), '.trustshell/session.jsonl');
    expect(formatInspectCard(r)).toBe(
      [
        'trustshell inspect  —  INTACT',
        '',
        '  log      .trustshell/session.jsonl',
        '  format   trustshell',
        '  entries  3',
        '  window   2026-10-21T10:00:00Z → 2026-10-21T10:02:00Z',
        '',
        '  tools',
        '        1  read_file',
        '        1  bash',
        '        1  edit_file',
        '',
        '  What this does NOT prove:',
        ...r.does_not_prove.map((d) => `    - ${d}`),
      ].join('\n'),
    );
  });
});
