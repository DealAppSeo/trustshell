/**
 * glossary-defs.test.ts — the definitions block (strategy §v0.2.15 / S4) is present and honest:
 * portable harness names its four portable parts, quarantine carries the large-loss asymmetry,
 * and live-vs-direction is defined. Guards against the content silently regressing.
 */
import { TERMS, TERMS_BY_SLUG } from '../lib/glossary';

describe('portable harness names what travels with the agent', () => {
  const harness = TERMS_BY_SLUG['trust-harness'];

  it('exists and stays shipped', () => {
    expect(harness).toBeDefined();
    expect(harness?.status).toBe('shipped');
  });

  it('names the four portable things: memory, context, permissions, and the refuse', () => {
    const note = (harness?.note ?? '').toLowerCase();
    expect(note).toContain('memory');
    expect(note).toContain('context');
    expect(note).toContain('permissions');
    expect(note).toContain('refuse'); // the constitution — the ability to refuse
  });
});

describe('quarantine: picked-up content does not enter the core until promoted', () => {
  const q = TERMS_BY_SLUG['quarantine'];

  it('exists in the verify group as an honest concept', () => {
    expect(q).toBeDefined();
    expect(q?.group).toBe('verify');
    expect(q?.status).toBe('concept');
  });

  it('defines content as held apart until a check promotes it', () => {
    const def = (q?.definition ?? '').toLowerCase();
    expect(def).toContain('core');
    expect(def).toMatch(/promote|held apart/);
  });

  it('states the large-loss asymmetry — a missed injection or falsified fact costs more than several rights', () => {
    const note = (q?.note ?? '').toLowerCase();
    expect(note).toContain('large loss');
    expect(note).toMatch(/injection|falsified/);
    expect(note).toMatch(/more than|outweigh|several/);
  });
});

describe('live vs direction: running NOW is kept separate from where the design is HEADED', () => {
  const lv = TERMS_BY_SLUG['live-vs-direction'];

  it('exists in the verify group as a concept', () => {
    expect(lv).toBeDefined();
    expect(lv?.group).toBe('verify');
    expect(lv?.status).toBe('concept');
  });

  it('distinguishes an observable-today claim from a not-yet-a-feature intention', () => {
    const text = `${lv?.definition ?? ''} ${lv?.note ?? ''}`.toLowerCase();
    expect(text).toMatch(/running now|observe today/);
    expect(text).toMatch(/direction|headed|intention|roadmap/);
  });
});

describe('no unpointable number: the new definitions assert nothing numeric', () => {
  for (const slug of ['quarantine', 'live-vs-direction']) {
    it(`${slug} carries no digit in its definition or note`, () => {
      const t = TERMS_BY_SLUG[slug];
      const text = `${t?.definition ?? ''} ${t?.note ?? ''}`;
      expect(text).not.toMatch(/[0-9]/);
    });
  }
});

describe('glossary integrity: every related slug resolves', () => {
  it('no term points at a slug that does not exist', () => {
    const dangling: string[] = [];
    for (const t of TERMS) {
      for (const r of t.related ?? []) {
        if (!TERMS_BY_SLUG[r]) dangling.push(`${t.slug} → ${r}`);
      }
    }
    expect(dangling).toEqual([]);
  });
});
