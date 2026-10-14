/**
 * `trustshell ground` and the MCP `ground_quote` tool. Both call groundClaims; no network.
 *
 * Exit codes follow the CLI's EXIT contract: VERIFIED 0, VETO 1, NOT_CHECKED 2 (never 0).
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, run, EXIT, groundExitCode, matchedLine, type CliIO } from '../src/cli/index';
import { createServer } from '../src/mcp/index';
import { LIMITATIONS } from '../src/lib/ground';
import type { TrustShell } from '../src/lib/trustshell';

const MANIFEST = join(__dirname, 'fixtures', 'ground', 'manifest.txt');

function capture(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

async function ground(...argv: string[]) {
  const cap = capture();
  const code = await run(parseArgs(['ground', ...argv]), {} as TrustShell, cap.io);
  return { code, out: cap.out.join('\n'), err: cap.err.join('\n') };
}

describe('parseArgs ground', () => {
  it('reads every option', () => {
    expect(parseArgs(['ground', '--source', 'm.txt', '--quote', 'ordered 150 ft', '--page', '2', '--kind', 'number', '--value', '150', '--unit', 'ft'])).toMatchObject({
      command: 'ground',
      source: 'm.txt',
      quote: 'ordered 150 ft',
      page: '2',
      kind: 'number',
      value: '150',
      unit: 'ft',
    });
  });

  it('takes a negative value and a quote that starts with a dash', () => {
    const a = parseArgs(['ground', '--source', 'm.txt', '--quote', '- balance -250.00 USD', '--kind', 'number', '--value', '-250.00']);
    expect(a.error).toBeUndefined();
    expect(a).toMatchObject({ quote: '- balance -250.00 USD', value: '-250.00' });
  });

  it.each([
    [['ground', '--quote', 'ordered 150 ft'], /requires --source/],
    [['ground', '--source', 'm.txt'], /requires --source <file> and --quote/],
    [['ground', '--source', 'm.txt', '--quote', 'ordered', '150', 'ft'], /unexpected argument: 150/],
    [['ground', '--source', 'm.txt', '--quote', 'ordered 150 ft', '--page', '0'], /--page must be a whole number/],
    [['ground', '--source', 'm.txt', '--quote', 'ordered 150 ft', '--page', '1.5'], /--page must be a whole number/],
    [['ground', '--source', 'm.txt', '--quote', 'ordered 150 ft', '--kind', 'money', '--value', '1'], /--kind must be/],
    [['ground', '--source', 'm.txt', '--quote', 'ordered 150 ft', '--value', '150'], /--value goes with --kind number or --kind date/],
    [['ground', '--source', 'm.txt', '--quote', 'ordered 150 ft', '--kind', 'number'], /--value goes with/],
    [['ground', '--source', 'm.txt', '--quote', 'ordered 150 ft', '--unit', 'ft'], /--unit goes with --kind number/],
    [['ground', '--source', 'm.txt', '--quote', '--json'], /--quote requires a value/],
  ])('%p is a usage error', (argv, msg) => {
    const a = parseArgs(argv as string[]);
    expect(a.error).toMatch(msg as RegExp);
  });

  it('a usage error exits 2 and never runs the check', async () => {
    const r = await ground('--source', MANIFEST, '--quote', 'ordered 150 ft', '--value', '150');
    expect(r.code).toBe(EXIT.USAGE);
    expect(r.out).not.toContain('VERIFIED');
  });
});

describe('run ground', () => {
  it('VERIFIED exits 0 and prints the status, reason and matched line', async () => {
    const r = await ground('--source', MANIFEST, '--quote', 'ordered 150 ft', '--page', '1', '--kind', 'number', '--value', '150', '--unit', 'ft');
    expect(r.code).toBe(EXIT.OK);
    expect(r.out).toContain('VERIFIED  exact_match');
    expect(r.out).toContain('page 1: Loaded 50 ft of cable, ordered 150 ft.');
    expect(r.out).toContain('What this does not establish');
    for (const l of LIMITATIONS) expect(r.out).toContain(l);
  });

  it('VETO exits 1: a quote on another page names that page', async () => {
    const r = await ground('--source', MANIFEST, '--quote', 'noncompliance fee is billed', '--page', '1');
    expect(r.code).toBe(EXIT.VETO);
    expect(r.out).toContain('VETO  page_mismatch');
    expect(r.out).toMatch(/found on page 2: .*compliance fee is billed/);
  });

  it('VETO exits 1 when the quote is nowhere', async () => {
    const r = await ground('--source', MANIFEST, '--quote', 'Loaded 75 ft of cable');
    expect(r.code).toBe(EXIT.VETO);
    expect(r.out).toContain('VETO  quote_not_found');
  });

  it('NOT_CHECKED exits 2, never 0, and says it is not a pass', async () => {
    const r = await ground('--source', MANIFEST, '--quote', 'Loaded 50 ft of cable, ordered 150 ft', '--kind', 'number', '--value', '150');
    expect(r.code).toBe(EXIT.NOT_CHECKED);
    expect(r.code).not.toBe(EXIT.OK);
    expect(r.out).toContain('NOT_CHECKED  ambiguous_value');
    expect(r.out).toContain('This is not a pass.');
  });

  it('a date check runs end to end', async () => {
    const r = await ground('--source', MANIFEST, '--quote', 'Packed in 3 crates on 25/04/2026', '--kind', 'date', '--value', '2026-04-25');
    expect(r.code).toBe(EXIT.OK);
  });

  it('--json prints the receipt: caller-predicted, observed null, anchor none', async () => {
    const r = await ground('--source', MANIFEST, '--quote', 'ordered 150 ft', '--json');
    const receipt = JSON.parse(r.out);
    expect(receipt.check).toMatchObject({ status: 'VERIFIED', reason: 'exact_match', found_on_page: 1 });
    expect(receipt.predicted.source).toBe('caller');
    expect(receipt.observed).toBeNull();
    expect(receipt.anchor_status).toBe('none');
    expect(receipt.limitations).toEqual([...LIMITATIONS]);
  });

  it('a file with no form feed is page 1', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-ground-'));
    try {
      const f = join(dir, 'lease.txt');
      writeFileSync(f, 'Monthly rent is 1,800 USD, due on the first.\n');
      const r = await ground('--source', f, '--quote', 'Monthly rent is 1,800 USD', '--page', '1', '--kind', 'number', '--value', '1800');
      expect(r.code).toBe(EXIT.OK);
      const two = await ground('--source', f, '--quote', 'Monthly rent is 1,800 USD', '--page', '2');
      expect(two.code).toBe(EXIT.VETO);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a source file that cannot be read is a usage error, not a verdict', async () => {
    const r = await ground('--source', join(tmpdir(), 'ts-ground-no-such-file.txt'), '--quote', 'ordered 150 ft');
    expect(r.code).toBe(EXIT.USAGE);
    expect(r.err).toContain('cannot read the source file');
    expect(r.out).toBe('');
  });

  it('groundExitCode maps the three statuses onto the EXIT contract', () => {
    expect(groundExitCode('VERIFIED')).toBe(EXIT.OK);
    expect(groundExitCode('VETO')).toBe(EXIT.VETO);
    expect(groundExitCode('NOT_CHECKED')).toBe(EXIT.NOT_CHECKED);
  });

  it('matchedLine is null when nothing was found', () => {
    expect(matchedLine([{ n: 1, text: 'a' }], { page_index: null, char_span: null })).toBeNull();
  });
});

describe('MCP ground_quote', () => {
  const tool = () => (createServer({} as TrustShell) as unknown as { _registeredTools: Record<string, { handler: (a: unknown) => Promise<{ content: { text: string }[] }> }> })._registeredTools['ground_quote']!;
  const FF = String.fromCharCode(12);

  it('grounds a quote in source text, with pages split on form feed', async () => {
    const res = await tool().handler({ source_text: `Cover page${FF}Loaded 50 ft of cable.`, quote: 'Loaded 50 ft of cable', page: 2, kind: 'number', value: 50, unit: 'ft' });
    const receipt = JSON.parse(res.content[0]!.text);
    expect(receipt.check).toMatchObject({ status: 'VERIFIED', found_on_page: 2 });
    expect(receipt.observed).toBeNull();
    expect(receipt.predicted.source).toBe('model');
  });

  it('passes echoes through: the template line is NOT_CHECKED template_echo', async () => {
    const source = 'Terms: Payment due within 30 days of invoice date.\nPayment received 12 days after invoice date.';
    const res = await tool().handler({
      source_text: source,
      quote: 'Payment due within 30 days of invoice date',
      kind: 'number',
      value: 30,
      echoes: ['Terms: Payment due within 30 days of invoice date.'],
    });
    expect(JSON.parse(res.content[0]!.text).check).toMatchObject({ status: 'NOT_CHECKED', reason: 'template_echo' });
  });
});
