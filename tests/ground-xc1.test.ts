/**
 * XC1's re-attack on `groundQuote` at 5e327e6 (PR #548). One test per finding; each one went red on
 * that head. The property: VERIFIED only when the quote really is on the cited page, is not just the
 * document's template, and the value is unambiguously the one written in the quote.
 *
 * S1 = a false VERIFIED. S2 = a false VETO / NOT_CHECKED, or a wrong line printed.
 * Fixtures are generic invoices, leases and manifests.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { groundQuote, normalizeForMatch, type GroundPage } from '../src/lib/ground';
import { parseArgs, run, EXIT, matchedLine, type CliIO } from '../src/cli/index';
import { createServer } from '../src/mcp/index';
import type { TrustShell } from '../src/lib/trustshell';

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const page = (n: number, text: string): GroundPage => ({ n, text });
const one = (text: string) => [page(1, text)];

describe('S1: a quote may not cut a number token at its comma, dot or sign', () => {
  it('"Total 1,250" inside "Total 1,250.50 USD" is not found', () => {
    expect(groundQuote({ quote: 'Total 1,250', page: 1, kind: 'number', value: 1250 }, one('Total 1,250.50 USD'))).toMatchObject({
      status: 'VETO',
      reason: 'quote_not_found',
    });
  });

  it('"250.00 USD" inside "Invoice total: 1,250.00 USD" is not found', () => {
    expect(groundQuote({ quote: '250.00 USD', page: 1, kind: 'number', value: 250 }, one('Invoice total: 1,250.00 USD'))).toMatchObject({
      status: 'VETO',
      reason: 'quote_not_found',
    });
  });

  it('a quote that starts or ends on the separator itself is not found either', () => {
    const pages = one('Invoice total: 1,250.50 USD');
    expect(groundQuote({ quote: '.50 USD', page: 1 }, pages).reason).toBe('quote_not_found');
    expect(groundQuote({ quote: 'Invoice total: 1,250.', page: 1 }, pages).reason).toBe('quote_not_found');
  });

  it('"250 USD" inside "Balance -250 USD" is not found: the sign belongs to the number', () => {
    expect(groundQuote({ quote: '250 USD', page: 1, kind: 'number', value: 250 }, one('Balance -250 USD due.'))).toMatchObject({
      status: 'VETO',
      reason: 'quote_not_found',
    });
  });

  it('the whole token still matches, a sentence-final dot is not a decimal, and a range dash is not a sign', () => {
    expect(groundQuote({ quote: 'Total 1,250.50 USD', page: 1, kind: 'number', value: 1250.5 }, one('Total 1,250.50 USD')).status).toBe('VERIFIED');
    expect(groundQuote({ quote: 'Total 1,250', page: 1, kind: 'number', value: 1250 }, one('Total 1,250. Thank you.')).status).toBe('VERIFIED');
    expect(groundQuote({ quote: '20 crates', page: 1, kind: 'number', value: 20 }, one('Boxes 10-20 crates.')).status).toBe('VERIFIED');
  });
});

describe('S1: a two-digit year is never VERIFIED', () => {
  it('29/02/00 is NOT_CHECKED even though only the year-2000 reading is a real date', () => {
    expect(groundQuote({ quote: 'Lease signed 29/02/00', page: 1, kind: 'date', value: '2000-02-29' }, one('Lease signed 29/02/00'))).toMatchObject({
      status: 'NOT_CHECKED',
      reason: 'ambiguous_value',
    });
  });
});

describe('S1: letters glued to a number that are not the unit make it unreadable', () => {
  it('"1.5k" is not the value 1.5', () => {
    expect(groundQuote({ quote: 'ordered 1.5k units', page: 1, kind: 'number', value: 1.5 }, one('ordered 1.5k units'))).toMatchObject({
      status: 'NOT_CHECKED',
      reason: 'ambiguous_value',
    });
  });

  it('"150ft" with no unit is NOT_CHECKED; with unit ft it still binds', () => {
    const pages = one('Cable length 150ft on reel 4.');
    expect(groundQuote({ quote: 'Cable length 150ft', page: 1, kind: 'number', value: 150 }, pages).reason).toBe('ambiguous_value');
    expect(groundQuote({ quote: 'Cable length 150ft', page: 1, kind: 'number', value: 150, unit: 'ft' }, pages).status).toBe('VERIFIED');
    expect(groundQuote({ quote: 'Cable length 150ft', page: 1, kind: 'number', value: 150, unit: 'f' }, pages).reason).toBe('ambiguous_value');
  });
});

describe('S1: integers past 2^53 are compared as written, not as floats', () => {
  const pages = one('Ref 9007199254740993 on the bill of lading.');

  it('a different digit string is VETO, even though the two are the same double', () => {
    expect(groundQuote({ quote: 'Ref 9007199254740993', page: 1, kind: 'number', value: '9007199254740992' }, pages)).toMatchObject({
      status: 'VETO',
      reason: 'value_not_in_quote',
    });
  });

  it('the same digit string is VERIFIED', () => {
    expect(groundQuote({ quote: 'Ref 9007199254740993', page: 1, kind: 'number', value: '9007199254740993' }, pages).status).toBe('VERIFIED');
  });

  it('an unsafe integer passed as a JS number has already lost its digits: NOT_CHECKED', () => {
    expect(groundQuote({ quote: 'Ref 9007199254740993', page: 1, kind: 'number', value: 9007199254740992 }, pages)).toMatchObject({
      status: 'NOT_CHECKED',
      reason: 'ambiguous_value',
    });
  });

  it('ordinary numbers still compare by value: 150.50 is 150.5, 1,250.00 is 1250', () => {
    expect(groundQuote({ quote: 'Total 150.50 USD', page: 1, kind: 'number', value: 150.5 }, one('Total 150.50 USD')).status).toBe('VERIFIED');
    expect(groundQuote({ quote: 'Total 1,250.00 USD', page: 1, kind: 'number', value: '1250' }, one('Total 1,250.00 USD')).status).toBe('VERIFIED');
    expect(groundQuote({ quote: 'Total 007 USD', page: 1, kind: 'number', value: 7 }, one('Total 007 USD')).status).toBe('VERIFIED');
  });
});

describe('S1: a value with no kind is never silently VERIFIED', () => {
  const tool = () =>
    (createServer({} as TrustShell) as unknown as {
      _registeredTools: Record<string, { handler: (a: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>; inputSchema: { safeParse: (x: unknown) => { success: boolean } } }>;
    })._registeredTools['ground_quote']!;

  it('MCP ground_quote refuses value without kind number or date, as the CLI does', async () => {
    const res = await tool().handler({ source_text: 'Total 50 ft', quote: 'Total 50 ft', value: 999 });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/value goes with kind number or kind date/);
  });

  it('MCP ground_quote refuses a unit without kind number', async () => {
    const res = await tool().handler({ source_text: 'Total 50 ft', quote: 'Total 50 ft', unit: 'ft' });
    expect(res.isError).toBe(true);
  });

  it('the library: a value with no kind is NOT_CHECKED, an explicit kind text still checks the quote only', () => {
    expect(groundQuote({ quote: 'Total 50 ft', page: 1, value: 999 }, one('Total 50 ft'))).toMatchObject({ status: 'NOT_CHECKED', reason: 'ambiguous_value' });
    expect(groundQuote({ quote: 'Total 50 ft', page: 1, value: 'Harbor', kind: 'text' }, one('Total 50 ft')).status).toBe('VERIFIED');
  });
});

describe('S2: the whole-word check reads whole code points', () => {
  it('a letter outside the BMP right before the match cuts the word', () => {
    const pages = one(`${cp(0x2000b)}ray approved for dock 3`);
    expect(groundQuote({ quote: 'ray approved', page: 1 }, pages).reason).toBe('quote_not_found');
  });
});

describe('S2: bidi and format characters are invisible to matching and to the floors', () => {
  const LRM = cp(0x200e);
  it('they are stripped like zero-width characters', () => {
    for (const c of [0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) {
      expect(normalizeForMatch(`ab${cp(c)}cd`)).toBe('abcd');
    }
  });

  it('they cannot pad a template past the echo margin', () => {
    const echo = 'Payment due within 30 days of invoice date';
    const padded = echo + LRM.repeat(8);
    const r = groundQuote({ quote: padded, page: 1 }, one(`${padded}.`), { echoes: [echo] });
    expect(r).toMatchObject({ status: 'NOT_CHECKED', reason: 'template_echo' });
  });
});

describe('S2: duplicate page numbers', () => {
  it('the result names the page by its index too, and matchedLine prints that page', () => {
    const pages = [page(1, 'Alpha line, nothing here.'), page(1, 'Bravo shipped 5 crates')];
    const r = groundQuote({ quote: 'Bravo shipped 5 crates', page: 1 }, pages);
    expect(r).toMatchObject({ status: 'VERIFIED', found_on_page: 1, page_index: 1 });
    expect(matchedLine(pages, r)).toBe('Bravo shipped 5 crates');
  });
});

describe('S2: the CLI takes echoes', () => {
  function capture(): { io: CliIO; out: string[] } {
    const out: string[] = [];
    return { io: { out: (s) => out.push(s), err: (s) => out.push(s) }, out };
  }

  it('parses a repeatable --echo', () => {
    expect(parseArgs(['ground', '--source', 'f', '--quote', 'q text', '--echo', 'Terms:', '--echo', 'Status:']).echoes).toEqual(['Terms:', 'Status:']);
    expect(parseArgs(['ground', '--source', 'f', '--quote', 'q text', '--echo']).error).toMatch(/--echo requires a value/);
  });

  it('a template line from a local file is NOT_CHECKED template_echo, exit 2', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-ground-echo-'));
    try {
      const f = join(dir, 'invoice.txt');
      writeFileSync(f, 'Terms: Payment due within 30 days of invoice date.\nPayment received 12 days after invoice date.\n');
      const argv = ['ground', '--source', f, '--quote', 'Payment due within 30 days of invoice date', '--kind', 'number', '--value', '30'];
      const echoed = capture();
      expect(await run(parseArgs([...argv, '--echo', 'Terms: Payment due within 30 days of invoice date.']), {} as TrustShell, echoed.io)).toBe(EXIT.NOT_CHECKED);
      expect(echoed.out.join('\n')).toContain('NOT_CHECKED  template_echo');
      const plain = capture();
      expect(await run(parseArgs(argv), {} as TrustShell, plain.io)).toBe(EXIT.OK);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('S2: case folding beyond toLowerCase', () => {
  it('dotted capital I, sharp s and final sigma fold the way a reader expects', () => {
    expect(groundQuote({ quote: 'istanbul depot', page: 1 }, one(`${cp(0x130)}STANBUL depot`)).status).toBe('VERIFIED');
    expect(groundQuote({ quote: 'STRASSE 12', page: 1 }, one('Haupt Straße 12')).status).toBe('VERIFIED');
    expect(groundQuote({ quote: `${cp(0x39f, 0x394, 0x39f, 0x3a3)} 4`, page: 1 }, one(`${cp(0x3bf, 0x3b4, 0x3bf, 0x3c2)} 4`)).status).toBe('VERIFIED');
  });
});

describe('S2: MCP input is size-capped', () => {
  it('rejects an oversized source_text, quote or echo list before doing any work', () => {
    const schema = (createServer({} as TrustShell) as unknown as { _registeredTools: Record<string, { inputSchema: { safeParse: (x: unknown) => { success: boolean } } }> })
      ._registeredTools['ground_quote']!.inputSchema;
    expect(schema.safeParse({ source_text: 'ok text', quote: 'ok text' }).success).toBe(true);
    expect(schema.safeParse({ source_text: 'x'.repeat(2_000_001), quote: 'ok text' }).success).toBe(false);
    expect(schema.safeParse({ source_text: 'ok text', quote: 'x'.repeat(10_001) }).success).toBe(false);
    expect(schema.safeParse({ source_text: 'ok text', quote: 'ok text', echoes: Array(201).fill('e') }).success).toBe(false);
  });
});

// ---- XC1 round 3, on #549 at bde588d ------------------------------------------------------------

describe('S1: a number followed by a dot or comma and more digits is not a finished number', () => {
  it('"1.2.3" is not the value 1.2, and "10.0.0.1" is not 10', () => {
    expect(groundQuote({ quote: 'Build 1.2.3 is live', page: 1, kind: 'number', value: 1.2 }, one('Build 1.2.3 is live.'))).toMatchObject({
      status: 'NOT_CHECKED',
      reason: 'ambiguous_value',
    });
    expect(groundQuote({ quote: 'Host 10.0.0.1 up', page: 1, kind: 'number', value: 10 }, one('Host 10.0.0.1 up'))).toMatchObject({
      status: 'NOT_CHECKED',
      reason: 'ambiguous_value',
    });
  });

  it('"1,2345" is not 1234', () => {
    expect(groundQuote({ quote: 'Lot 1,2345 shipped', page: 1, kind: 'number', value: 1234 }, one('Lot 1,2345 shipped')).reason).toBe('ambiguous_value');
  });

  it('a grouped decimal and a sentence-final dot still verify', () => {
    expect(groundQuote({ quote: 'Total 1,250.50 USD', page: 1, kind: 'number', value: 1250.5 }, one('Total 1,250.50 USD')).status).toBe('VERIFIED');
    expect(groundQuote({ quote: 'Rent is 1,800.', page: 1, kind: 'number', value: 1800 }, one('Rent is 1,800. Due monthly.')).status).toBe('VERIFIED');
  });
});

describe('S1: every Unicode format character is invisible, not only a listed few', () => {
  it('U+2061..U+2064, U+206A..U+206F, U+180E and tag characters are stripped', () => {
    for (const c of [0x180e, 0x2061, 0x2062, 0x2063, 0x2064, 0x206a, 0x206f, 0xfff9, 0xe0041]) {
      expect(normalizeForMatch(`ab${cp(c)}cd`)).toBe('abcd');
    }
  });

  it('eight U+2061 cannot pad a template past the echo margin', () => {
    const echo = 'Payment due within 30 days of invoice date';
    const padded = echo + cp(0x2061).repeat(8);
    expect(groundQuote({ quote: padded, page: 1 }, one(`${padded}.`), { echoes: [echo] })).toMatchObject({
      status: 'NOT_CHECKED',
      reason: 'template_echo',
    });
  });

  it('the span still maps back to the original text across stripped format characters', () => {
    const original = `Net${cp(0x2061)} 30 days${cp(0xe0041)} from delivery`;
    const r = groundQuote({ quote: 'Net 30 days from delivery', page: 1 }, one(original));
    expect(r.status).toBe('VERIFIED');
    expect(normalizeForMatch(original.slice(...r.char_span!))).toBe('net 30 days from delivery');
  });
});

describe('S2: a two-digit-year string that is no date does not block a real date', () => {
  it('"99/99/00" next to an ISO date leaves the ISO date verifiable', () => {
    expect(groundQuote({ quote: 'Ref 99/99/00 shipped 2026-03-04', page: 1, kind: 'date', value: '2026-03-04' }, one('Ref 99/99/00 shipped 2026-03-04')).status).toBe('VERIFIED');
    // A real two-digit-year date still blocks it.
    expect(groundQuote({ quote: 'Ref 29/02/00 shipped 2026-03-04', page: 1, kind: 'date', value: '2026-03-04' }, one('Ref 29/02/00 shipped 2026-03-04')).reason).toBe('ambiguous_value');
  });
});

describe('pinned decisions (behaviour, not bugs)', () => {
  it('a leading + is part of how the number is written, not its value: "+250" verifies 250', () => {
    expect(groundQuote({ quote: 'Adjustment +250 USD', page: 1, kind: 'number', value: 250 }, one('Adjustment +250 USD')).status).toBe('VERIFIED');
    // The value itself must be plain: "+250" as a value is not read.
    expect(groundQuote({ quote: 'Adjustment +250 USD', page: 1, kind: 'number', value: '+250' }, one('Adjustment +250 USD')).reason).toBe('ambiguous_value');
  });

  it('leading zeros do not change a number: "09007199254740993" is 9007199254740993, and "007" is 7', () => {
    const pages = one('Ref 09007199254740993 on the bill');
    expect(groundQuote({ quote: 'Ref 09007199254740993', page: 1, kind: 'number', value: '9007199254740993' }, pages).status).toBe('VERIFIED');
    expect(groundQuote({ quote: 'Ref 09007199254740993', page: 1, kind: 'number', value: '9007199254740992' }, pages).reason).toBe('value_not_in_quote');
  });
});
