/**
 * `groundQuote` / `groundClaims` — the local quote check. No network, no model, no keys.
 *
 * Every reason code is reached at least once, and each normalization step has a case that goes
 * red without it. Fixtures are generic invoices, leases and shipping manifests.
 *
 * Special characters are built with String.fromCodePoint so that what each test exercises is
 * visible in the source rather than hidden in an invisible character.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  groundQuote,
  groundClaims,
  normalizeForMatch,
  splitPages,
  isEcho,
  LIMITATIONS,
  DEFAULT_MIN_QUOTE_CHARS,
  ECHO_MIN_ADDED_CHARS,
  type GroundPage,
} from '../src/lib/ground';
import * as pkg from '../src/lib';

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const FI = cp(0xfb01); // the "fi" ligature
const LSQUO = cp(0x2018);
const RSQUO = cp(0x2019);
const LDQUO = cp(0x201c);
const RDQUO = cp(0x201d);
const EN_DASH = cp(0x2013);
const ZWSP = cp(0x200b);
const SHY = cp(0x00ad);

const page = (n: number, text: string): GroundPage => ({ n, text });

const MANIFEST: GroundPage[] = [
  page(1, 'Shipping manifest 4471\nConsignee: Harbor Supply Co.\nLoaded 50 ft of cable, ordered 150 ft.'),
  page(2, 'Pallet count: 12 pallets on dock 3.\nSeal number checked at the gate.'),
];

/** The round-trip the sprint asks for: the span, cut from the ORIGINAL page and normalized, is the quote. */
function expectSpanRoundTrip(pages: GroundPage[], quote: string, cited?: number) {
  const r = groundQuote({ quote, page: cited }, pages);
  expect(r.status).toBe('VERIFIED');
  const original = pages.find((p) => p.n === r.found_on_page)!.text;
  const [s, e] = r.char_span!;
  expect(normalizeForMatch(original.slice(s, e))).toBe(normalizeForMatch(quote));
  return { r, original, s, e };
}

describe('reason codes', () => {
  it('exact_match: a quote on the cited page is VERIFIED, with its page and span', () => {
    const r = groundQuote({ quote: 'Loaded 50 ft of cable', page: 1 }, MANIFEST);
    expect(r).toEqual({ status: 'VERIFIED', reason: 'exact_match', found_on_page: 1, char_span: expect.any(Array), page_index: 0 });
  });

  it('quote_not_found: a quote on no page is VETO', () => {
    const r = groundQuote({ quote: 'Loaded 75 ft of cable', page: 1 }, MANIFEST);
    expect(r).toEqual({ status: 'VETO', reason: 'quote_not_found', found_on_page: null, char_span: null, page_index: null });
  });

  it('page_mismatch: a quote only on another page is VETO and says where it is', () => {
    const r = groundQuote({ quote: 'Pallet count: 12 pallets', page: 1 }, MANIFEST);
    expect(r.status).toBe('VETO');
    expect(r.reason).toBe('page_mismatch');
    expect(r.found_on_page).toBe(2);
    expect(r.char_span).not.toBeNull();
  });

  it('quote_too_short: under the floor is VETO', () => {
    expect(groundQuote({ quote: 'x4', page: 1 }, [page(1, 'Part x4 shipped')])).toMatchObject({ status: 'VETO', reason: 'quote_too_short' });
  });

  it('no_evidence: noEvidence, an empty quote, a blank quote, or a quote of only invisible characters', () => {
    for (const claim of [
      { noEvidence: true, quote: 'Loaded 50 ft of cable' },
      { quote: '' },
      { quote: '   \n ' },
      { quote: ZWSP + SHY + ZWSP },
      { quote: null },
      {},
    ]) {
      expect(groundQuote(claim, MANIFEST)).toEqual({ status: 'NOT_CHECKED', reason: 'no_evidence', found_on_page: null, char_span: null, page_index: null });
    }
  });

  it('value_not_in_quote and ambiguous_value are reached (see the number and date blocks)', () => {
    expect(groundQuote({ quote: 'Loaded 50 ft of cable', page: 1, kind: 'number', value: 75 }, MANIFEST).reason).toBe('value_not_in_quote');
    expect(groundQuote({ quote: 'Loaded 50 ft of cable, ordered 150 ft', page: 1, kind: 'number', value: 150 }, MANIFEST).reason).toBe('ambiguous_value');
  });
});

describe('the length floor', () => {
  it('defaults to 4 non-space characters', () => {
    expect(DEFAULT_MIN_QUOTE_CHARS).toBe(4);
    const pages = [page(1, 'Status: PAID on receipt. Length 100 ft. Part x4.')];
    expect(groundQuote({ quote: 'PAID', page: 1 }, pages).status).toBe('VERIFIED');
    expect(groundQuote({ quote: '100 ft', page: 1 }, pages).status).toBe('VERIFIED');
    expect(groundQuote({ quote: 'PAI', page: 1 }, pages).reason).toBe('quote_too_short');
    // Spaces do not count toward the floor.
    expect(groundQuote({ quote: 'x  4', page: 1 }, [page(1, 'x 4')]).reason).toBe('quote_too_short');
  });

  it('is configurable', () => {
    const pages = [page(1, 'Status: PAID on receipt.')];
    expect(groundQuote({ quote: 'PAID', page: 1 }, pages, { minQuoteChars: 12 }).reason).toBe('quote_too_short');
    expect(groundQuote({ quote: 'Status: PAID on receipt', page: 1 }, pages, { minQuoteChars: 12 }).status).toBe('VERIFIED');
  });
});

describe('normalization: both sides go through the same pipeline', () => {
  it('NFKC: a ligature on the page matches plain letters in the quote, and the reverse', () => {
    expect(groundQuote({ quote: 'final invoice', page: 1 }, [page(1, `This is the ${FI}nal invoice.`)]).status).toBe('VERIFIED');
    expect(groundQuote({ quote: `${FI}nal invoice`, page: 1 }, [page(1, 'This is the final invoice.')]).status).toBe('VERIFIED');
  });

  it('curly quotes match straight quotes', () => {
    const pages = [page(1, `Marked ${LDQUO}fragile${RDQUO} by the carrier${RSQUO}s agent.`)];
    expect(groundQuote({ quote: `Marked "fragile" by the carrier's agent`, page: 1 }, pages).status).toBe('VERIFIED');
    expect(groundQuote({ quote: `${LSQUO}fragile${RSQUO}`, page: 1 }, [page(1, "the 'fragile' label")]).status).toBe('VERIFIED');
  });

  it('an en dash matches a hyphen', () => {
    expect(groundQuote({ quote: 'Lease term 2024-2026', page: 1 }, [page(1, `Lease term 2024${EN_DASH}2026, renewable.`)]).status).toBe('VERIFIED');
  });

  it('a zero-width space inside a word is ignored', () => {
    expect(groundQuote({ quote: 'consignment received', page: 1 }, [page(1, `consign${ZWSP}ment received`)]).status).toBe('VERIFIED');
  });

  it('a soft hyphen is ignored', () => {
    expect(groundQuote({ quote: 'consignment received', page: 1 }, [page(1, `consign${SHY}ment received`)]).status).toBe('VERIFIED');
  });

  it('double spaces, tabs and newlines collapse to one space', () => {
    expect(groundQuote({ quote: 'Rent due on the first', page: 1 }, [page(1, 'Rent  due\ton\nthe   first of each month')]).status).toBe('VERIFIED');
  });

  it('case is ignored for matching', () => {
    expect(groundQuote({ quote: 'RENT DUE ON THE FIRST', page: 1 }, [page(1, 'Rent due on the first')]).status).toBe('VERIFIED');
  });
});

describe('hyphen join: only a hyphen that ends a line', () => {
  const broken = [page(1, 'Any non-\ncompliance fee is billed monthly.')];
  const midLine = [page(1, 'Any non-compliance fee is billed monthly.')];

  it('joins a word hyphenated across a line break', () => {
    expect(normalizeForMatch('non-\ncompliance')).toBe('noncompliance');
    expect(normalizeForMatch('non-  \r\n   compliance')).toBe('noncompliance');
    expect(groundQuote({ quote: 'noncompliance fee', page: 1 }, broken).status).toBe('VERIFIED');
  });

  it('a quote copied WITH the line-break hyphen and one copied WITHOUT it both match', () => {
    expect(groundQuote({ quote: 'non-\ncompliance fee', page: 1 }, broken).status).toBe('VERIFIED');
    expect(groundQuote({ quote: 'noncompliance fee', page: 1 }, broken).status).toBe('VERIFIED');
  });

  it('never joins a mid-line hyphen', () => {
    expect(normalizeForMatch('non-compliance')).toBe('non-compliance');
    expect(groundQuote({ quote: 'non-compliance fee', page: 1 }, midLine).status).toBe('VERIFIED');
    expect(groundQuote({ quote: 'noncompliance fee', page: 1 }, midLine).reason).toBe('quote_not_found');
  });

  it('does not join when the next line does not start with a letter', () => {
    expect(normalizeForMatch('item-\n42')).toBe('item- 42');
  });
});

describe('char_span indexes the ORIGINAL page text', () => {
  it('round-trips through a ligature and a hyphen break, so the offset map is exercised', () => {
    const original = `Header line\nThe ${FI}nal consign-\nment  was received on dock 3.`;
    const { s, e } = expectSpanRoundTrip([page(1, original)], 'final consignment was received', 1);
    // The span starts at the ligature itself and runs through the line break in the original.
    expect(original.slice(s, e)).toBe(`${FI}nal consign-\nment  was received`);
  });

  it('round-trips through curly quotes, zero-width and soft-hyphen characters', () => {
    const original = `x ${LDQUO}Net${ZWSP} 30${RDQUO} terms, consign${SHY}ment billed`;
    expectSpanRoundTrip([page(1, original)], '"Net 30" terms, consignment billed', 1);
  });

  it('round-trips on a later page too', () => {
    expectSpanRoundTrip(MANIFEST, 'Seal number checked', 2);
  });
});

describe('pages', () => {
  it('a quote on the cited page AND another page is VERIFIED on the cited page', () => {
    const pages = [page(1, 'Late fee: 5% of the monthly rent.'), page(2, 'Reminder. Late fee: 5% of the monthly rent.')];
    const r = groundQuote({ quote: 'Late fee: 5% of the monthly rent', page: 2 }, pages);
    expect(r.status).toBe('VERIFIED');
    expect(r.found_on_page).toBe(2);
    expect(pages[1]!.text.slice(...r.char_span!)).toBe('Late fee: 5% of the monthly rent');
  });

  it('no page cited: VERIFIED on the first page that has it', () => {
    expect(groundQuote({ quote: 'Seal number checked' }, MANIFEST)).toMatchObject({ status: 'VERIFIED', found_on_page: 2 });
  });

  it('an empty pages array is never VERIFIED (NOT_CHECKED: there is nothing to look in)', () => {
    expect(groundQuote({ quote: 'Loaded 50 ft of cable', page: 1 }, [])).toMatchObject({ status: 'NOT_CHECKED', reason: 'no_evidence' });
  });

  it('a source whose pages are all blank (a scan with no text layer) is NOT_CHECKED, not a VETO', () => {
    expect(groundQuote({ quote: 'Loaded 50 ft of cable', page: 1 }, [page(1, ''), page(2, ' \n ')])).toMatchObject({
      status: 'NOT_CHECKED',
      reason: 'no_evidence',
    });
  });

  it.each([99, 0, -1, 1.5, Number.NaN])('a cited page %p that does not exist is never VERIFIED', (n) => {
    const r = groundQuote({ quote: 'Loaded 50 ft of cable', page: n }, MANIFEST);
    expect(r.status).not.toBe('VERIFIED');
    expect(r).toMatchObject({ status: 'VETO', reason: 'page_mismatch', found_on_page: 1 });
  });

  it('pages with a bad page number are ignored, never matched', () => {
    const r = groundQuote({ quote: 'Loaded 50 ft of cable' }, [page(-1, 'Loaded 50 ft of cable'), page(1.5, 'Loaded 50 ft of cable')]);
    expect(r.status).not.toBe('VERIFIED');
  });

  it('a non-array pages argument is never VERIFIED', () => {
    expect(groundQuote({ quote: 'Loaded 50 ft of cable' }, null as unknown as GroundPage[]).status).toBe('NOT_CHECKED');
  });

  it('a quote that cuts a word in half is not found', () => {
    const pages = [page(1, 'Payment within 130 days of delivery.')];
    expect(groundQuote({ quote: '30 days of delivery', page: 1 }, pages).reason).toBe('quote_not_found');
    expect(groundQuote({ quote: 'ment within 130', page: 1 }, pages).reason).toBe('quote_not_found');
    expect(groundQuote({ quote: '130 days of delivery', page: 1 }, pages).status).toBe('VERIFIED');
  });
});

describe('numbers', () => {
  const one = [page(1, 'Invoice total: 1,250.00 USD, due on receipt.')];

  it('a single number in the quote equal to the value is VERIFIED (thousands separators read)', () => {
    expect(groundQuote({ quote: 'Invoice total: 1,250.00 USD', page: 1, kind: 'number', value: 1250 }, one).status).toBe('VERIFIED');
    expect(groundQuote({ quote: 'Invoice total: 1,250.00 USD', page: 1, kind: 'number', value: '1,250' }, one).status).toBe('VERIFIED');
  });

  it('a value not in the quote is VETO value_not_in_quote', () => {
    expect(groundQuote({ quote: 'Invoice total: 1,250.00 USD', page: 1, kind: 'number', value: 125 }, one)).toMatchObject({
      status: 'VETO',
      reason: 'value_not_in_quote',
      found_on_page: 1,
    });
  });

  it('an unreadable or missing value is NOT_CHECKED, never VERIFIED', () => {
    for (const value of ['150 ft', 'about 150', null, undefined, Number.NaN]) {
      expect(groundQuote({ quote: 'Invoice total: 1,250.00 USD', page: 1, kind: 'number', value }, one)).toMatchObject({
        status: 'NOT_CHECKED',
        reason: 'ambiguous_value',
      });
    }
  });

  // THE MULTI-NUMBER RULE, pinned.
  // Without a unit the quote must hold exactly one distinct number. With a unit, only numbers
  // written immediately before that unit count, and there must be exactly one distinct such
  // number, equal to the value. "Loaded 50 ft of cable, ordered 150 ft" has two different
  // quantities in ft, so even value 150 with unit ft is NOT VERIFIED: the quote alone cannot say
  // whether the claim is about what was loaded or what was ordered.
  const two = [page(1, 'Loaded 50 ft of cable, ordered 150 ft. Packed in 3 crates.')];
  it('two distinct numbers and no unit: NOT_CHECKED ambiguous_value', () => {
    expect(groundQuote({ quote: 'Loaded 50 ft of cable, ordered 150 ft', page: 1, kind: 'number', value: 150 }, two)).toMatchObject({
      status: 'NOT_CHECKED',
      reason: 'ambiguous_value',
    });
  });

  it('two different numbers before the same unit: still NOT_CHECKED, even for the one right before it', () => {
    expect(groundQuote({ quote: 'Loaded 50 ft of cable, ordered 150 ft', page: 1, kind: 'number', value: 150, unit: 'ft' }, two)).toMatchObject({
      status: 'NOT_CHECKED',
      reason: 'ambiguous_value',
    });
  });

  it('with a unit, the one number written right before it is VERIFIED; other numbers elsewhere do not matter', () => {
    const q = { quote: 'ordered 150 ft. Packed in 3 crates', page: 1, kind: 'number' as const, unit: 'ft' };
    expect(groundQuote({ ...q, value: 150 }, two).status).toBe('VERIFIED');
    expect(groundQuote({ ...q, value: '150', unit: 'FT' }, two).status).toBe('VERIFIED');
  });

  it('with a unit, a value present in the quote but not before that unit is NOT_CHECKED, not VERIFIED', () => {
    const q = { quote: 'ordered 150 ft. Packed in 3 crates', page: 1, kind: 'number' as const, unit: 'ft' };
    expect(groundQuote({ ...q, value: 3 }, two)).toMatchObject({ status: 'NOT_CHECKED', reason: 'ambiguous_value' });
    // A unit that is not in the quote at all binds nothing.
    expect(groundQuote({ ...q, value: 150, unit: 'kg' }, two)).toMatchObject({ status: 'NOT_CHECKED', reason: 'ambiguous_value' });
  });

  it('a unit must be a whole word: "ft" does not bind "150 fte"', () => {
    const pages = [page(1, 'Staffing 150 fte on site.')];
    expect(groundQuote({ quote: 'Staffing 150 fte on site', page: 1, kind: 'number', value: 150, unit: 'ft' }, pages).reason).toBe('ambiguous_value');
  });

  it('a unit glued to the number binds ("150ft")', () => {
    const pages = [page(1, 'Cable length 150ft, gauge 12.')];
    expect(groundQuote({ quote: 'Cable length 150ft, gauge 12', page: 1, kind: 'number', value: 150, unit: 'ft' }, pages).status).toBe('VERIFIED');
  });

  it('an id like INV-2041 reads as 2041, and a range 10-20 as two numbers', () => {
    const pages = [page(1, 'Ref INV-2041 covers boxes 10-20.')];
    expect(groundQuote({ quote: 'Ref INV-2041', page: 1, kind: 'number', value: 2041 }, pages).status).toBe('VERIFIED');
    expect(groundQuote({ quote: 'Ref INV-2041', page: 1, kind: 'number', value: -2041 }, pages).reason).toBe('value_not_in_quote');
    expect(groundQuote({ quote: 'boxes 10-20', page: 1, kind: 'number', value: 20 }, pages).reason).toBe('ambiguous_value');
  });

  it('a negative balance reads as negative', () => {
    const pages = [page(1, 'Closing balance -250.00 USD.')];
    expect(groundQuote({ quote: 'Closing balance -250.00 USD', page: 1, kind: 'number', value: -250 }, pages).status).toBe('VERIFIED');
    expect(groundQuote({ quote: 'Closing balance -250.00 USD', page: 1, kind: 'number', value: 250 }, pages).reason).toBe('value_not_in_quote');
  });
});

describe('dates', () => {
  const d = (text: string, value: string) => groundQuote({ quote: text, page: 1, kind: 'date', value }, [page(1, text)]);

  it('03/04/1970 has two readings: NOT_CHECKED ambiguous_value', () => {
    expect(d('Lease signed 03/04/1970', '1970-03-04')).toMatchObject({ status: 'NOT_CHECKED', reason: 'ambiguous_value' });
    expect(d('Lease signed 03/04/1970', '1970-04-03')).toMatchObject({ status: 'NOT_CHECKED', reason: 'ambiguous_value' });
  });

  it('25/04/1970 has one reading: VERIFIED', () => {
    expect(d('Lease signed 25/04/1970', '1970-04-25')).toMatchObject({ status: 'VERIFIED', reason: 'exact_match' });
  });

  it('04/04/1970 reads the same both ways: VERIFIED', () => {
    expect(d('Lease signed 04/04/1970', '1970-04-04').status).toBe('VERIFIED');
  });

  it('reads ISO, month-name forms and dotted / dashed numeric forms', () => {
    expect(d('Shipped 2026-03-04 from dock 3', '2026-03-04').status).toBe('VERIFIED');
    expect(d('Invoice dated March 4, 2026', '2026-03-04').status).toBe('VERIFIED');
    expect(d('Invoice dated Mar. 4 2026', '2026-03-04').status).toBe('VERIFIED');
    expect(d('Invoice dated 04 Mar 2026', '2026-03-04').status).toBe('VERIFIED');
    expect(d('Invoice dated 4th of March, 2026', '2026-03-04').status).toBe('VERIFIED');
    expect(d('Invoice dated 25.12.2026', '2026-12-25').status).toBe('VERIFIED');
    expect(d('Invoice dated 12-25-2026', '2026-12-25').status).toBe('VERIFIED');
  });

  it('a date not in the quote is VETO value_not_in_quote', () => {
    expect(d('Invoice dated March 4, 2026', '2026-03-05')).toMatchObject({ status: 'VETO', reason: 'value_not_in_quote' });
  });

  it('a date written in a form it does not read is VETO value_not_in_quote, never VERIFIED', () => {
    expect(d('Invoice dated the fourth of March 2026', '2026-03-04')).toMatchObject({ status: 'VETO', reason: 'value_not_in_quote' });
  });

  it('two different dates in one quote are ambiguous', () => {
    expect(d('Term from 2026-01-01 to 2026-12-31', '2026-12-31')).toMatchObject({ status: 'NOT_CHECKED', reason: 'ambiguous_value' });
  });

  it('a two-digit year is never VERIFIED', () => {
    expect(d('Lease signed 25/04/70', '1970-04-25')).toMatchObject({ status: 'NOT_CHECKED', reason: 'ambiguous_value' });
  });

  it('an impossible calendar date is not read', () => {
    expect(d('Due 31/02/2026 at noon', '2026-02-31')).toMatchObject({ status: 'NOT_CHECKED', reason: 'ambiguous_value' });
    expect(d('Due 31/02/2026 at noon', '2026-03-03').reason).toBe('value_not_in_quote');
  });

  it('a value that is not an ISO date is NOT_CHECKED', () => {
    for (const value of ['March 4, 2026', '2026-3-4', '2026-02-30', '']) {
      expect(d('Invoice dated March 4, 2026', value)).toMatchObject({ status: 'NOT_CHECKED', reason: 'ambiguous_value' });
    }
  });

  it('an unknown kind is NOT_CHECKED, never VERIFIED', () => {
    const r = groundQuote({ quote: 'Invoice dated March 4, 2026', page: 1, kind: 'currency' as never, value: 1 }, [page(1, 'Invoice dated March 4, 2026')]);
    expect(r).toMatchObject({ status: 'NOT_CHECKED', reason: 'ambiguous_value' });
  });
});

describe('template echo', () => {
  // An invoice that prints its own terms template, then a filled line.
  const invoice = [
    page(
      1,
      'INVOICE TEMPLATE\nTerms: Payment due within 30 days of invoice date.\n\nINV-2041 status\nPayment received 12 days after invoice date.',
    ),
  ];
  const echoes = ['Terms: Payment due within 30 days of invoice date.', 'Payment received'];

  it('quoting the template line, with value 30, does not VERIFY', () => {
    const r = groundQuote({ quote: 'Payment due within 30 days of invoice date', page: 1, kind: 'number', value: 30 }, invoice, { echoes });
    expect(r).toMatchObject({ status: 'NOT_CHECKED', reason: 'template_echo', found_on_page: 1 });
  });

  it('the filled line, with value 12, is VERIFIED', () => {
    const r = groundQuote({ quote: 'Payment received 12 days after invoice date', page: 1, kind: 'number', value: 12 }, invoice, { echoes });
    expect(r).toMatchObject({ status: 'VERIFIED', reason: 'exact_match' });
  });

  it('without echoes the template line WOULD verify — the rule only knows the template it is given', () => {
    const r = groundQuote({ quote: 'Payment due within 30 days of invoice date', page: 1, kind: 'number', value: 30 }, invoice);
    expect(r.status).toBe('VERIFIED');
  });

  it('a quote that is a label plus fewer than 8 characters of its own is an echo', () => {
    expect(ECHO_MIN_ADDED_CHARS).toBe(8);
    const pages = [page(1, 'Payment received 12 days. Payment received late, after 45 days of notice.')];
    // "payment received 12 days" adds "12days" (6) beyond the label.
    expect(groundQuote({ quote: 'Payment received 12 days', page: 1 }, pages, { echoes }).reason).toBe('template_echo');
    // "...late, after 45 days" adds 8 or more: not an echo.
    expect(groundQuote({ quote: 'Payment received late, after 45 days', page: 1 }, pages, { echoes }).status).toBe('VERIFIED');
  });

  it('a quote inside a longer template string is an echo', () => {
    expect(isEcho(normalizeForMatch('within 30 days'), [normalizeForMatch(echoes[0]!)])).toBe(true);
  });

  it('several labels in one quote are all removed before counting', () => {
    const labels = ['Shipper:', 'Consignee:'].map(normalizeForMatch);
    expect(isEcho(normalizeForMatch('Shipper: n/a Consignee: n/a'), labels)).toBe(true);
    expect(isEcho(normalizeForMatch('Shipper: Harbor Supply Co. Consignee: n/a'), labels)).toBe(false);
  });

  it('echoes are normalized the same way as the quote, and an empty echo is ignored', () => {
    expect(isEcho(normalizeForMatch('payment DUE within 30 days'), [normalizeForMatch(`PAYMENT due${ZWSP} within 30 days of invoice date`)])).toBe(true);
    expect(isEcho(normalizeForMatch('Harbor Supply Co.'), [normalizeForMatch(''), normalizeForMatch('   ')])).toBe(false);
  });

  it('a quote that is not on the page is still a VETO, echo or not', () => {
    expect(groundQuote({ quote: 'Payment due within 60 days', page: 1 }, invoice, { echoes }).reason).toBe('quote_not_found');
  });
});

describe('splitPages', () => {
  it('splits on form feed, 1-indexed; no form feed is page 1', () => {
    expect(splitPages('one\ftwo\fthree').map((p) => p.n)).toEqual([1, 2, 3]);
    expect(splitPages('one\ftwo')[1]).toEqual({ n: 2, text: 'two' });
    expect(splitPages('only page')).toEqual([{ n: 1, text: 'only page' }]);
  });
});

describe('groundClaims receipts', () => {
  const VERSION = (JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string }).version;
  const claims = [
    { quote: 'Loaded 50 ft of cable', page: 1, kind: 'number' as const, value: 50, unit: 'ft' },
    { quote: 'Loaded 99 ft of cable', page: 1 },
    { noEvidence: true },
  ];

  it('one receipt per claim, each carrying the check, LIMITATIONS and anchor_status none', () => {
    const rs = groundClaims(claims, MANIFEST);
    expect(rs).toHaveLength(3);
    expect(rs.map((r) => r.check.status)).toEqual(['VERIFIED', 'VETO', 'NOT_CHECKED']);
    for (const r of rs) {
      expect(r.limitations).toBe(LIMITATIONS);
      expect(r.anchor_status).toBe('none');
      expect(r.enforced_by).toBe(`trustshell/ground@${VERSION}`);
      expect(Number.isNaN(Date.parse(r.created_at))).toBe(false);
    }
    expect(rs[0]!.predicted).toEqual({ value: 50, source: 'model' });
    expect(rs[0]!.evidence).toEqual({ quote: 'Loaded 50 ft of cable', page: 1, no_evidence: false });
    expect(rs[2]!.evidence).toEqual({ quote: null, page: null, no_evidence: true });
  });

  it('never sets observed — not on VERIFIED, VETO or NOT_CHECKED', () => {
    for (const r of groundClaims(claims, MANIFEST, { predictedBy: 'caller' })) {
      expect(r.observed).toBeNull();
      expect(r.predicted.source).toBe('caller');
    }
  });

  it('an empty source does not mark the claim itself as having no evidence', () => {
    const [r] = groundClaims([{ quote: 'Loaded 50 ft of cable' }], []);
    expect(r!.check.reason).toBe('no_evidence');
    expect(r!.evidence.no_evidence).toBe(false);
  });

  it('LIMITATIONS says what VERIFIED does not establish, including the template echo', () => {
    const all = LIMITATIONS.join('\n');
    expect(all).toMatch(/does not mean the quote supports the claim/);
    expect(all).toContain("A quote can be real, on the page, and still only repeat the document's own template; pass the template text as echoes.");
    expect(all).toMatch(/observed is null/);
    expect(Object.isFrozen(LIMITATIONS)).toBe(true);
  });
});

describe('no side effects, no network', () => {
  it('importing the module and running a check makes no network call', () => {
    const prev = (globalThis as { fetch?: unknown }).fetch;
    const calls: unknown[] = [];
    (globalThis as { fetch?: unknown }).fetch = (...a: unknown[]) => {
      calls.push(a);
      throw new Error('network is not allowed here');
    };
    try {
      jest.isolateModules(() => {
        const g = jest.requireActual<typeof import('../src/lib/ground')>('../src/lib/ground');
        g.groundClaims([{ quote: 'Loaded 50 ft of cable', page: 1 }], MANIFEST);
      });
      expect(calls).toEqual([]);
    } finally {
      (globalThis as { fetch?: unknown }).fetch = prev;
    }
  });

  it('is exported from the package entry point', () => {
    const lib = pkg as Record<string, unknown>;
    expect(typeof lib.groundQuote).toBe('function');
    expect(typeof lib.groundClaims).toBe('function');
    expect(lib.LIMITATIONS).toBe(LIMITATIONS);
  });
});
