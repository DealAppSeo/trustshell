/**
 * "Can you spot the AI's lie?" (hero v2, 2026-10-24): the pool and the rules of a round.
 *
 * What these hold: an item is in the pool only if the SAME label came back on every recorded run, and the
 * record is a file a person can open; a round is five different items with a mix and at most one the
 * checkers will not call; the player is scored and the checkers never are; the page renders only the intro,
 * so no sentence is drawn before a click. The click itself, and "nothing is sent", are driven in a real
 * browser by tests/e2e/spot-the-lie-walk.mjs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { POOL, SHARE_PATH, judge, pickRound, poolIsPlayable, resultLine, score, seeded, shareText, type Guess, type PoolItem } from '../lib/spot-the-lie';

const ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r/g, '');
const NEW_DOC = read('docs/measurements/spot-the-lie-2026-10-24.md');
const OLD_DOC = read('docs/measurements/home-cards-2026-10-06.md');

describe('the pool', () => {
  it('is playable, with unique ids and unique sentences', () => {
    expect(poolIsPlayable(POOL)).toBe(true);
    expect(new Set(POOL.map((p) => p.id)).size).toBe(POOL.length);
    expect(new Set(POOL.map((p) => p.text)).size).toBe(POOL.length);
    expect(POOL.length).toBeGreaterThanOrEqual(8);
  });

  it.each(POOL.map((p) => [p.id, p] as const))('%s: the same label on every recorded run, a reason, and a source if it names one', (_id, p) => {
    expect(p.checkers.times).toBe(p.checkers.of);
    expect(p.checkers.of).toBeGreaterThanOrEqual(5);
    expect(['true', 'lie']).toContain(p.truth);
    expect(p.why.trim().length).toBeGreaterThan(30);
    if (p.source) expect(p.source.url).toMatch(/^https:\/\//);
    expect(p.checkers.record).toMatch(/^https:\/\/github\.com\/DealAppSeo\/trustshell\/blob\/main\/docs\/measurements\//);
    // No score for the checkers, no accuracy figure. (A percentage inside the arithmetic of the price card,
    // "Up 50% makes it $150", is the puzzle itself and is fine; a percentage OF ANSWERS is not.)
    expect(`${p.label} ${p.why}`).not.toMatch(/accura|\d\s?%\s*(of (the )?(time|answers|cases|runs)|correct|right|caught)/i);
  });

  it('every recorded label is in the file that records it, with the same count', () => {
    for (const p of POOL) {
      if (p.checkers.on === '2026-10-24') {
        const row = NEW_DOC.split('\n').find((l) => l.startsWith(`| ${p.id} |`));
        expect({ id: p.id, row: row ?? null }).not.toEqual({ id: p.id, row: null });
        expect(row).toContain(p.text);
        expect(row).toContain(`${p.checkers.label} x${p.checkers.times}`);
      } else {
        // The 2026-10-06 cards: the sentence is in that record (the three cards by their text, the two quotes by theirs).
        const probe = p.text.slice(0, 40);
        expect({ id: p.id, found: OLD_DOC.includes(probe) || OLD_DOC.includes(p.text.slice(0, 25)) }).toEqual({ id: p.id, found: true });
      }
    }
  });

  it('leaves off what did not qualify, and the record says why', () => {
    for (const id of ['npm-malware', 'sha256']) {
      expect(POOL.some((p) => p.id === id)).toBe(false);
      const row = NEW_DOC.split('\n').find((l) => l.startsWith(`| ${id} |`));
      expect(row).toContain('| no');
    }
  });

  it('the record carries every call as it came back (35 calls: 7 sentences, 5 each)', () => {
    const calls = NEW_DOC.split('\n').filter((l) => l.startsWith('{"at":'));
    expect(calls).toHaveLength(35);
    for (const l of calls) expect(JSON.parse(l).status).toBe(200);
  });
});

describe('the accuracy guard can fail (control)', () => {
  it('catches a percentage of answers and the word accuracy, and lets arithmetic through', () => {
    const guard = /accura|\d\s?%\s*(of (the )?(time|answers|cases|runs)|correct|right|caught)/i;
    expect('The checkers are 94% correct').toMatch(guard);
    expect('Caught 9 of 10, 90% of the time').toMatch(guard);
    expect('Up 50% makes it $150.').not.toMatch(guard);
  });
});

describe('a round', () => {
  it('is five different items, with a true one and a lie, and at most one the checkers will not call (500 seeds)', () => {
    for (let seed = 0; seed < 500; seed++) {
      const round = pickRound(POOL, 5, seeded(seed));
      expect(round).toHaveLength(5);
      expect(new Set(round.map((r) => r.id)).size).toBe(5);
      expect(round.some((r) => r.truth === 'true')).toBe(true);
      expect(round.some((r) => r.truth === 'lie')).toBe(true);
      expect(round.filter((r) => r.checkers.label === 'not-checked').length).toBeLessThanOrEqual(1);
    }
  });

  it('is the same for the same seed, and varies across seeds (the reward is not one fixed list)', () => {
    const ids = (s: number) => pickRound(POOL, 5, seeded(s)).map((r) => r.id).join(',');
    expect(ids(7)).toBe(ids(7));
    const sets = new Set(Array.from({ length: 60 }, (_, s) => ids(s)));
    expect(sets.size).toBeGreaterThan(30);
    const firsts = new Set(Array.from({ length: 60 }, (_, s) => pickRound(POOL, 5, seeded(s))[0].id));
    expect(firsts.size).toBeGreaterThanOrEqual(5);
  });

  it('control: a pool that cannot make a mixed round is reported as not playable', () => {
    const allTrue: PoolItem[] = POOL.filter((p) => p.truth === 'true');
    expect(poolIsPlayable(allTrue)).toBe(false);
    expect(poolIsPlayable(POOL.slice(0, 3))).toBe(false);
  });
});

describe('scoring', () => {
  const lie = POOL.find((p) => p.truth === 'lie' && p.checkers.label !== 'not-checked')!;
  const truth = POOL.find((p) => p.truth === 'true')!;
  const quote = POOL.find((p) => p.checkers.label === 'not-checked')!;

  it('right when the guess is the truth, wrong when it is not, and "can\'t tell" is wrong on an item the checkers would call', () => {
    expect(judge(lie, 'lie')).toBe('right');
    expect(judge(lie, 'true')).toBe('wrong');
    expect(judge(truth, 'true')).toBe('right');
    expect(judge(truth, 'lie')).toBe('wrong');
    expect(judge(lie, 'unsure')).toBe('wrong');
  });

  it('"can\'t tell" on an item the checkers will not call is the same answer as theirs, not a miss, and not a point', () => {
    expect(judge(quote, 'unsure')).toBe('honest');
    expect(score([quote], ['unsure'])).toBe(0);
    expect(judge(quote, 'lie')).toBe('right');
  });

  it('counts only right answers', () => {
    const items = [lie, truth, quote];
    const g: Guess[] = ['lie', 'lie', 'unsure'];
    expect(score(items, g)).toBe(1);
  });

  it('says a different thing each time within a band, and a band for every score', () => {
    for (const [points, n] of [[5, 5], [4, 5], [2, 5], [0, 5], [3, 5], [1, 5]] as const) {
      const lines = new Set(Array.from({ length: 40 }, (_, s) => resultLine(points, n, seeded(s))));
      expect(lines.size).toBeGreaterThanOrEqual(2);
      for (const l of lines) expect(l.length).toBeGreaterThan(10);
    }
  });
});

describe('the challenge link', () => {
  it('carries the score, a tagged path to the game page, and no claim about the checkers', () => {
    const t = shareText(4, 5, 'https://trustshell.dev');
    expect(t).toContain('4 of 5');
    expect(t).toContain(`https://trustshell.dev${SHARE_PATH}`);
    expect(SHARE_PATH).toBe('/for/vibe-coders?utm_source=share&utm_medium=spot-the-lie');
    expect(t).not.toMatch(/accura|\d\s?%|caught every/i);
  });
});

describe('the server render', () => {
  it('is the intro and a Play button: no sentence is drawn before a click, so there is nothing to mismatch', () => {
    let html = '';
    jest.isolateModules(() => {
      const { createElement } = require('react') as typeof import('react');
      const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
      const { SpotTheLie } = require('../components/spot-the-lie') as { SpotTheLie: () => ReactElement };
      html = renderToStaticMarkup(createElement(SpotTheLie));
    });
    expect(html).toContain('data-phase="intro"');
    expect(html).toContain('data-testid="stl-play"');
    expect(html).toContain('nothing is sent');
    for (const p of POOL) expect(html).not.toContain(p.text.slice(0, 30));
  });
});
