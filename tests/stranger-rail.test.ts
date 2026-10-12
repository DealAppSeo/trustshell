/**
 * The four screens are ONE flow with the tutorial ON them (Sean, 2026-10-12): name the agent, pick a
 * belt or skip, run one check and read the receipt, then the offer. These pin that the steps are the
 * real pages, in order, that each real page prints its own step, and that nothing the offer promises
 * is a page that does not exist. Source-level, like the other page tests here; the click-through is
 * tests/e2e/stranger-path-walk.mjs.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OFFER_ROWS, STRANGER_STEPS, nextStrangerStep, strangerStep } from '../lib/stranger-path';

const ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r/g, '');
const pageFor = (href: string) => join(ROOT, 'app', href.replace(/^\//, ''), 'page.tsx');

describe('the four screens', () => {
  it('are exactly four, in the order Sean named', () => {
    expect(STRANGER_STEPS.map((s) => s.id)).toEqual(['name', 'belt', 'check', 'offer']);
    expect(STRANGER_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4]);
    expect(STRANGER_STEPS.map((s) => s.href)).toEqual(['/agents', '/belts', '/check', '/after-create']);
  });

  it('are real pages, not a separate tour', () => {
    for (const s of STRANGER_STEPS) expect(existsSync(pageFor(s.href))).toBe(true);
    expect(existsSync(join(ROOT, 'app/tour'))).toBe(false);
    expect(existsSync(join(ROOT, 'app/tutorial'))).toBe(false);
  });

  it('each real page prints its own step of the rail', () => {
    const want: Record<string, string> = {
      '/agents': 'step="name"',
      '/belts': 'step="belt"',
      '/check': 'step="check"',
      '/after-create': 'step="offer"',
    };
    for (const s of STRANGER_STEPS) {
      const src = read(pageFor(s.href).replace(ROOT + '/', ''));
      expect(src).toContain('<StrangerRail');
      expect(src).toContain(want[s.href]!);
    }
  });

  it('every step says what to do and what you will see, in plain words', () => {
    for (const s of STRANGER_STEPS) {
      expect(s.doThis.length).toBeGreaterThan(20);
      expect(s.youSee.length).toBeGreaterThan(20);
      expect(`${s.doThis} ${s.youSee}`).not.toMatch(/stake now|REAL_STAKING|guaranteed|instant/i);
    }
  });

  it('the check screen says a vote alone is PROVISIONAL and that Not checked never means checks out', () => {
    const s = strangerStep('check');
    expect(s.youSee).toContain('PROVISIONAL');
    expect(s.youSee).toContain('Not checked never means checks out');
  });

  it('chains next steps and stops at the last', () => {
    expect(nextStrangerStep('name')?.id).toBe('belt');
    expect(nextStrangerStep('belt')?.id).toBe('check');
    expect(nextStrangerStep('check')?.id).toBe('offer');
    expect(nextStrangerStep('offer')).toBeNull();
  });

  it('screen 2 can be skipped and screen 4 is optional', () => {
    expect(read('app/belts/page.tsx')).toContain('skipHref="/check"');
    expect(strangerStep('offer').doThis).toMatch(/optional/i);
  });
});

describe('the offer on screen 4', () => {
  it('is register, bind, faucet, practice stake, then the limit', () => {
    expect(OFFER_ROWS.map((r) => r.id)).toEqual(['register', 'bind', 'faucet', 'stake', 'limit']);
  });

  it('only links to pages that exist', () => {
    for (const r of OFFER_ROWS) if (r.href) expect(existsSync(pageFor(r.href))).toBe(true);
  });

  it('does not offer the on-chain mint to a stranger: that row is honest about it', () => {
    const reg = OFFER_ROWS.find((r) => r.id === 'register')!;
    expect(reg.href).toBeNull();
    expect(reg.body).toMatch(/not offered here yet/);
    expect(reg.body).toMatch(/off-chain only/);
  });

  it('labels the stake as practice and says it does not raise what the agent may spend', () => {
    const stake = OFFER_ROWS.find((r) => r.id === 'stake')!;
    expect(stake.body).toMatch(/Practice only/);
    expect(stake.body).toMatch(/does not raise what the agent may spend/);
  });

  it('says the faucet is not ours and nothing is handed out', () => {
    const faucet = OFFER_ROWS.find((r) => r.id === 'faucet')!;
    expect(faucet.body).toMatch(/We do not hand out tokens/);
  });

  it('ends on the limit: pull it to zero and the next payment is refused', () => {
    const limit = OFFER_ROWS[OFFER_ROWS.length - 1]!;
    expect(limit.id).toBe('limit');
    expect(limit.body).toMatch(/cap to 0/);
    expect(limit.body).toMatch(/refused/);
  });

  it('keeps the journey strip and the offer on the same pages', () => {
    const journey = read('components/journey-steps.tsx');
    for (const r of OFFER_ROWS) if (r.href) expect(journey).toContain(`'${r.href}'`);
  });

  it('prints each offer row from the page, with the engine cell only for bind and stake', () => {
    const page = read('app/after-create/page.tsx');
    expect(page).toContain('OFFER_ROWS');
    expect(page).toContain('shownStakeCell(table.can_stake)');
    expect(page).not.toMatch(/stake now|REAL_STAKING/i);
  });
});
