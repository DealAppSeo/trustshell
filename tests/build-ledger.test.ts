/**
 * The /build page's charts take every number from lib/build-ledger.json (Lane D's chart ledger,
 * re-checked against its sources by `node claims-charts.mjs --check`) and link a sample receipt
 * it serves from public/. A claim is code: this fails if the ledger, the served receipt and the
 * page stop agreeing, or if a served file stops matching the sha-256 the page prints.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ledger from '../lib/build-ledger.json';

const ROOT = join(__dirname, '..');
const SAMPLE = join(ROOT, 'public', 'samples', 'inspect-39619591025');
// .gitattributes pins these files to LF; a CRLF checkout made before that rule would still hash the same.
const read = (f: string) => readFileSync(join(SAMPLE, f), 'utf8').replace(/\r\n/g, '\n');
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const record = JSON.parse(read('record.json'));
const page = readFileSync(join(ROOT, 'app', 'build', 'page.tsx'), 'utf8');
const charts = readFileSync(join(ROOT, 'components', 'build', 'charts.tsx'), 'utf8');

describe('/build chart ledger and sample receipt', () => {
  test('the served record.json is the one the ledger hashed', () => {
    expect(sha256(read('record.json'))).toBe(ledger.sample_check.record_sha256_of_file);
  });

  test('the ledger verdict counts are the record’s', () => {
    const counts: Record<string, number> = {};
    for (const c of record.record.claims) counts[c.status] = (counts[c.status] ?? 0) + 1;
    expect(counts).toEqual(ledger.sample_check.verdict_counts);
  });

  test('the run, its commit and the contradicted commit agree', () => {
    const obs = record.record.observation;
    expect(obs.run_id).toBe(ledger.sample_check.run_id);
    expect(obs.head_sha).toBe(ledger.sample_check.run_head_sha);
    expect(obs.conclusion).toBe(ledger.sample_check.run_conclusion);
    const c = record.record.claims.find((x: { status: string }) => x.status === 'CONTRADICTED');
    expect(c.claim).toBe(`commit ${ledger.sample_check.claimed_commit}`);
  });

  test('card.md and card.html carry the record’s own digest', () => {
    const digest = record.digest.value;
    expect(read('card.md')).toContain(digest);
    expect(read('card.html')).toContain(digest);
  });

  test('card.html runs no script and loads nothing', () => {
    const html = read('card.html');
    expect(html).not.toMatch(/<script|<link|<img|<iframe|src=/i);
    expect(html).toContain("default-src 'none'");
  });

  test('the ledger is internally consistent', () => {
    const o = ledger.owner_distinct;
    expect(Object.values(o.counts).reduce((a, b) => a + b, 0)).toBe(o.total);
    expect(ledger.study.reviewers_sybil_pct).toHaveLength(ledger.study.chains.length);
    expect(ledger.study.agents_no_valid_feedback_pct).toHaveLength(ledger.study.chains.length);
  });

  test('the page prose matches the ledger it charts', () => {
    expect(page).toContain(`none of the ${ledger.owner_distinct.total} trades`);
    expect(ledger.owner_distinct.counts.distinct_strong).toBe(0);
    // the study's numbers are drawn from the ledger, never typed into the page or the charts
    for (const n of [...ledger.study.reviewers_sybil_pct, ...ledger.study.agents_no_valid_feedback_pct]) {
      expect(page).not.toContain(String(n));
      expect(charts).not.toContain(String(n));
    }
  });

  test('the chain block names the full transaction, and the gap is drawn as missing', () => {
    expect(charts).toContain('ledger.erc8004_feedback');
    expect(ledger.erc8004_feedback.tx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(charts).toContain('>Missing:</span> signed evidence of the work');
    expect(ledger.issue_589.state).toBe('open');
  });
});
