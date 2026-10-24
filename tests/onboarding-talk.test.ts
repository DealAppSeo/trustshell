/**
 * The post-check conversation (onboarding v0, SHADOW): its pace, its honesty, and the one visual change it
 * makes. What these hold: a fun question never stacks, comes late and cannot be the last thing asked; every
 * word the script says back was said by the person; a tint cannot drop any text below the contrast it had;
 * a quote can only come from a short, source-checked list and a film or an unknown book gets none; nothing in
 * the files can send anything; and the flag is OFF by default so the home page is what it was.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import {
  ABOUT, DISCLOSURE, EMPTY, EXPIRY_DAYS, NOT_ON_MENU, PACE, QUOTES, TINT_ALPHA, WORKS, ask, bookFrom, hueOf, lesson, parseStored,
  pickNext, quoteFor, reflect, roleFromAnswer, tintCss, toExport, type Profile, type Question, type QuestionId,
} from '../lib/onboarding-talk';
import { AUDIENCES } from '../lib/audiences';
import { seeded as seededRng } from '../lib/spot-the-lie';

const ROOT = join(__dirname, '..');
const text = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r/g, '');
const QUOTE_RECORD = text('docs/measurements/onboarding-quotes-2026-10-24.md');

/** Play a whole visit: answer (or skip) every question until the script stops, and return what was asked. */
function play(seed: number, more: boolean, skipEvery = 0) {
  const rng = seededRng(seed);
  let p: Profile = { ...EMPTY };
  const asked: QuestionId[] = [];
  const kinds: ('core' | 'delight')[] = [];
  let last: 'core' | 'delight' | null = null;
  let q: Question | null;
  let n = 0;
  while ((q = pickNext({ asked, lastKind: last }, p, rng, more)) && n++ < 20) {
    asked.push(q.id);
    kinds.push(q.kind);
    last = q.kind;
    if (skipEvery && n % skipEvery === 0) continue;
    if (q.id === 'job') p = { ...p, job: 'Coding' };
    if (q.id === 'role') p = { ...p, role: 'vibe-coder' };
    if (q.id === 'tools') p = { ...p, tools: 'Figma, Notion' };
  }
  return { asked, kinds };
}

/** The pace rules as one yes/no, so the same check judges the real pacer and a bad one (the control). */
const paceOk = (kinds: ('core' | 'delight')[], more = false) => {
  const fun = kinds.filter((k) => k === 'delight').length;
  const core = kinds.length - fun;
  if (core > (more ? 5 : PACE.firstPassCore) || fun > (more ? PACE.delightMax : PACE.firstPassDelight)) return false;
  return kinds.every((k, i) => k !== 'delight' || (i >= PACE.delightNotBefore && i < kinds.length - 1 && kinds[i - 1] === 'core'));
};

describe('pace: the questions never stack and the first pass is short', () => {
  it('first pass over 2000 seeds: three core at most, one fun at most, not before turn 3, not last, never adjacent', () => {
    const sawFun = { yes: 0, no: 0 };
    for (let seed = 0; seed < 2000; seed++) {
      const { asked, kinds } = play(seed, false);
      expect(kinds.filter((k) => k === 'core')).toHaveLength(PACE.firstPassCore);
      expect(asked.length).toBeLessThanOrEqual(PACE.firstPassCore + PACE.firstPassDelight);
      expect(paceOk(kinds)).toBe(true); // a fun question: not before turn 3, never adjacent to another, never the last
      kinds.includes('delight') ? sawFun.yes++ : sawFun.no++;
    }
    // Variable on purpose: some visits get a fun question and some do not.
    expect(sawFun.yes).toBeGreaterThan(300);
    expect(sawFun.no).toBeGreaterThan(300);
  });

  it('asking for more: five core at most, two fun at most, never adjacent, and it ends', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const { kinds } = play(seed, true);
      expect(paceOk(kinds, true)).toBe(true);
      expect(kinds[kinds.length - 1]).toBe('core');
    }
  });

  it('a skipped question counts as a turn, and the visit still ends', () => {
    for (let seed = 0; seed < 300; seed++) expect(play(seed, false, 2).asked.length).toBeLessThanOrEqual(4);
  });

  it('control: the same check fails a pacer that stacks, starts with, ends on, or overdoes the fun ones', () => {
    expect(paceOk(['core', 'core', 'delight', 'core'])).toBe(true);
    expect(paceOk(['core', 'delight', 'core', 'core'])).toBe(false); // too early
    expect(paceOk(['core', 'core', 'delight', 'delight', 'core'])).toBe(false); // back to back
    expect(paceOk(['core', 'core', 'core', 'delight'])).toBe(false); // ends on fun
    expect(paceOk(['core', 'core', 'delight', 'core', 'delight', 'core'])).toBe(false); // two in the first pass
  });
});

describe('responsive: the questions are worded from the answers', () => {
  it('the role question quotes the job back and puts the fitting option first, with the same five options', () => {
    const coding = ask('role', { v: 1, job: 'Coding' });
    const writing = ask('role', { v: 1, job: 'Writing and content' });
    expect(coding.text).toContain('"Coding"');
    expect(coding.options![0]).toBe('Vibe-coder');
    expect(writing.options![0]).toBe('Marketer');
    expect([...coding.options!].sort()).toEqual([...writing.options!].sort());
    expect(ask('role', EMPTY).options).toHaveLength(5);
  });
  it('the tools and wish questions use the role and the tools just given', () => {
    expect(ask('tools', { v: 1, role: 'engineer' }).text).toContain('As an engineer');
    expect(ask('tools', { v: 1, role: 'designer' }).text).toContain('As a designer');
    expect(ask('wish', { v: 1, tools: 'Figma, Notion' }).text).toContain('Figma, Notion');
  });
  it('every question says why it is asked, in its own words', () => {
    for (const id of ['job', 'role', 'tools', 'wish', 'experience', 'color', 'book'] as const) {
      const q = ask(id, { v: 1, job: 'Coding', role: 'engineer', tools: 'Figma' });
      expect({ id, why: q.why.length > 20 }).toEqual({ id, why: true });
    }
    expect(ask('color', EMPTY).why).toMatch(/Nothing else uses it/);
    expect(ask('book', EMPTY).why).toMatch(/Nothing else uses it/);
  });
  it('a long free-text answer is shortened in the next question, not echoed whole', () => {
    expect(ask('role', { v: 1, job: 'x'.repeat(200) }).text.length).toBeLessThan(140);
  });
  it('role words map to roles, and anything else is other', () => {
    expect(roleFromAnswer('Vibe-coder')).toBe('vibe-coder');
    expect(roleFromAnswer(' Engineer ')).toBe('engineer');
    expect(roleFromAnswer('Something else')).toBe('other');
  });
});

describe('teach-back: it says only what it heard, and the next step is a page that exists', () => {
  it('names each answer given and nothing that was not given', () => {
    const r = reflect({ v: 1, job: 'Research' });
    expect(r).toContain('"Research"');
    expect(r).not.toMatch(/you use|yourself|every day|just starting/);
    const full = reflect({ v: 1, job: 'Coding', role: 'vibe-coder', tools: 'Figma', wish: 'my invoices', experience: 'daily' });
    for (const bit of ['"Coding"', 'a vibe-coder', '"Figma"', '"my invoices"', 'every day']) expect(full).toContain(bit);
  });
  it('if everything was skipped it says it kept nothing', () => {
    expect(reflect(EMPTY)).toMatch(/kept nothing/);
  });
  it('every next step points to a page in this site', () => {
    const profiles: Profile[] = [
      { v: 1, role: 'vibe-coder' }, { v: 1, role: 'engineer' }, { v: 1, role: 'marketer' }, { v: 1, role: 'designer' },
      { v: 1, role: 'other' }, EMPTY, { v: 1, tools: 'OpenClaw, Slack' },
    ];
    const seen = new Set<string>();
    for (const p of profiles) {
      const s = lesson(p);
      seen.add(s.href);
      expect(s.text.length).toBeGreaterThan(30);
      const path = s.href.split('#')[0];
      const exists = path.startsWith('/for/')
        ? AUDIENCES.some((a) => `/for/${a.slug}` === path)
        : existsSync(join(ROOT, 'app', path, 'page.tsx'));
      expect({ href: s.href, exists }).toEqual({ href: s.href, exists: true });
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(lesson({ v: 1, tools: 'openclaw' }).href).toBe('/for/openclaw');
  });
});

describe('color: the tint cannot lower any text contrast below the bar', () => {
  const lum = ([r, g, b]: number[]) => {
    const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const hslToRgb = (h: number, s: number, l: number) => {
    s /= 100; l /= 100;
    const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
  };
  const over = (top: number[], bottom: number[], a: number) => top.map((c, i) => c * a + bottom[i] * (1 - a));
  const PAGE = [2, 6, 23]; // slate-950
  const TEXT: Record<string, number[]> = { white: [255, 255, 255], 'slate-200': [226, 232, 240], 'slate-300': [203, 213, 225], 'slate-400': [148, 163, 184] };

  const worst = (alpha: number) => {
    let min = Infinity;
    for (let hue = 0; hue < 360; hue++) {
      const tint = hslToRgb(hue, 70, 50);
      const bg = over(tint, PAGE, alpha);
      for (const t of Object.values(TEXT)) min = Math.min(min, ratio(over(tint, t, alpha), bg));
    }
    return min;
  };

  it('over every hue the tint is applied to, the lowest text contrast stays above 4.5:1 (the page started at 4.5 or better)', () => {
    expect(TINT_ALPHA).toBeLessThanOrEqual(0.1);
    expect(worst(TINT_ALPHA)).toBeGreaterThan(4.5);
    expect(ratio(TEXT['slate-400'], PAGE)).toBeGreaterThan(4.5);
  });
  it('control: a heavy tint DOES break it, so the check can fail', () => {
    expect(worst(0.6)).toBeLessThan(4.5);
  });
  it('reads names and hex, ignores grays and unknown words, and the css names the hue', () => {
    expect(hueOf('Blue')).toBe(215);
    expect(hueOf('dark green')).toBe(130);
    expect(hueOf('#ff0000')).toBe(0);
    expect(hueOf('#0f0')).toBe(120);
    expect(hueOf('#808080')).toBeNull();
    expect(hueOf('chartreuse-ish')).toBeNull();
    expect(tintCss(215)).toBe(`hsl(215 70% 50% / ${TINT_ALPHA})`);
  });
});

describe('quotes: a line only from the short, checked list; otherwise none, and it says so', () => {
  it.each(Object.entries(QUOTES))('%s: short, sourced, and in the record that checked it', (_k, q) => {
    expect(q.line.split(/\s+/).length).toBeLessThanOrEqual(25);
    expect(q.source).toMatch(/^https:\/\/www\.gutenberg\.org\/ebooks\/\d+$/);
    const id = q.source.split('/').pop()!;
    const row = QUOTE_RECORD.split(String.fromCharCode(10)).find((l) => l.startsWith(`| ${id} |`) && l.includes(q.line));
    expect({ id, row: row ?? null }).not.toEqual({ id, row: null });
    expect(row).toMatch(/\| found \|/);
  });
  it('the menu is the six works, each once, and every one has a line', () => {
    expect(WORKS).toHaveLength(6);
    expect(new Set(WORKS).size).toBe(6);
    for (const w of WORKS) expect(quoteFor(w)).not.toBeNull();
    expect(ask('book', EMPTY).options).toEqual(WORKS);
  });
  it('reads a menu work under common spellings, and anything else is null and not kept', () => {
    expect(bookFrom('Pride and Prejudice')).toBe('Pride and Prejudice');
    expect(bookFrom('the  FRANKENSTEIN ')).toBe('Frankenstein');
    expect(bookFrom('Alice in Wonderland')).toBe("Alice's Adventures in Wonderland");
    expect(bookFrom('sherlock holmes')).toBe('The Adventures of Sherlock Holmes');
    expect(bookFrom('Moby Dick')).toBe('Moby-Dick');
    expect(bookFrom('Dune')).toBeNull();
    expect(bookFrom('film: Alien')).toBeNull(); // a film is never offered or kept
    expect(quoteFor(undefined)).toBeNull();
    expect(NOT_ON_MENU).toMatch(/will not guess/);
    expect(quoteFor('Frankenstein')!.line).toBe('It was on a dreary night of November that I beheld the accomplishment of my toils.');
  });
  it('control: the comma my first draft had would have failed the record check', () => {
    const draft = 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.';
    expect(QUOTE_RECORD.includes(draft)).toBe(false);
    expect(QUOTE_RECORD.includes(quoteFor('Pride and Prejudice')!.line)).toBe(true);
  });
});

describe('the card the person owns', () => {
  it('exports only what was answered, versioned, with what made it, and reads it back', () => {
    const p: Profile = { v: 1, job: 'Coding', role: 'vibe-coder' };
    const out = JSON.parse(toExport(p));
    expect(Object.keys(out).sort()).toEqual(['about', 'job', 'role', 'v']);
    expect(out.about).toBe(ABOUT);
    expect(ABOUT).toMatch(/No AI model was used/);
    expect(parseStored(toExport(p))).toEqual(p);
  });
  it('a bad or oversize stored blob is an empty profile, and unknown keys and unknown books are dropped', () => {
    expect(parseStored('not json')).toEqual(EMPTY);
    expect(parseStored(null)).toEqual(EMPTY);
    expect(parseStored(JSON.stringify({ v: 2, job: 'x' }))).toEqual(EMPTY);
    expect(parseStored(JSON.stringify({ v: 1, job: 'a'.repeat(500), role: 'wizard', evil: '<script>' }))).toEqual(EMPTY);
    expect(parseStored(JSON.stringify({ v: 1, evil: 'x', role: 'designer', book: 'Dune' }))).toEqual({ v: 1, role: 'designer' });
    expect(parseStored(JSON.stringify({ v: 1, book: 'Moby-Dick' }))).toEqual({ v: 1, book: 'Moby-Dick' });
  });
  it(`a card kept more than ${EXPIRY_DAYS} days ago is gone, one kept yesterday is not, and a bad date is gone`, () => {
    const now = Date.parse('2026-12-01T00:00:00Z');
    const kept = (iso: string) => JSON.stringify({ v: 1, role: 'engineer', savedAt: iso });
    expect(parseStored(kept('2026-11-30T00:00:00Z'), now)).toEqual({ v: 1, role: 'engineer', savedAt: '2026-11-30T00:00:00Z' });
    expect(parseStored(kept('2026-08-01T00:00:00Z'), now)).toEqual(EMPTY);
    expect(parseStored(kept('not a date'), now)).toEqual(EMPTY);
  });
});

describe('nothing is sent, and the flag is off', () => {
  const SEND = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|navigator\.share|WebSocket|new Image\(/;
  it.each(['lib/onboarding-talk.ts', 'components/onboarding-talk.tsx', 'app/lab/talk/page.tsx'])('%s has no way to send anything', (rel) => {
    expect(text(rel)).not.toMatch(SEND);
  });
  it('control: the same scan catches a file that does send', () => {
    expect("await fetch('/x', { method: 'POST' })").toMatch(SEND);
    expect('navigator.sendBeacon(u)').toMatch(SEND);
  });
  it('is OFF unless the build sets NEXT_PUBLIC_ONBOARDING_TALK=1', () => {
    expect(process.env.NEXT_PUBLIC_ONBOARDING_TALK).toBeUndefined();
    let flag: boolean | undefined;
    jest.isolateModules(() => { flag = (require('../lib/onboarding-flag') as { ONBOARDING_TALK: boolean }).ONBOARDING_TALK; });
    expect(flag).toBe(false);
  });
  it('the home page does not mount the guide (install-first since 2026-10-24)', () => {
    expect(readFileSync(join(__dirname, '../app/page.tsx'), 'utf8')).not.toContain('OnboardingTalk');
  });
  it('the invite says what it is and that nothing is sent, before it asks anything', () => {
    let html = '';
    jest.isolateModules(() => {
      const { createElement } = require('react') as typeof import('react');
      const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
      const { OnboardingTalk } = require('../components/onboarding-talk') as { OnboardingTalk: () => ReactElement };
      html = renderToStaticMarkup(createElement(OnboardingTalk));
    });
    expect(html).toContain('data-phase="invite"');
    expect(html).toContain(DISCLOSURE);
    expect(DISCLOSURE).toMatch(/scripted guide/);
    expect(DISCLOSURE).toMatch(/does not use an AI model/);
    expect(DISCLOSURE).toMatch(/stay in this browser/);
    expect(html).toContain('does not depend on them');
    expect(html).toContain('No thanks');
    expect(html).not.toContain('data-testid="talk-input"');
  });
  it('the preview route is a 404 on production and is not in the sitemap', () => {
    expect(text('app/lab/talk/page.tsx')).toMatch(/VERCEL_ENV === 'production'\) notFound\(\)/);
    expect(text('lib/site.ts')).not.toContain('/lab/talk');
  });
});
