/**
 * The three belt pages now live in lib/belt-pages.ts and are served only at an unlisted address
 * (see tests/belt-share.test.ts). The checks below are unchanged; they read the same HTML.
 *
 * None of the three belt pages contain stake now.
 * A plain 'stake' substring missed 'staking' and 'REAL_STAKING' (neither contains 'stake'),
 * so a page saying "Staking is live" passed. Match the stem.
 */
export {};

import { BELT_HTML, BELT_ROLES, type BeltRole } from '../lib/belt-pages';

const PAGES = BELT_ROLES;
const html = (name: BeltRole) => BELT_HTML[name];
const STAKE = /(^|[^a-z])stak(e|ed|es|ing)\b/i;

describe('public belts', () => {
  it('none of the three pages contain stake now', () => {
    for (const name of PAGES) {
      expect(html(name)).not.toMatch(STAKE);
    }
  });

  it('the guard catches staking and REAL_STAKING, not only stake', () => {
    for (const text of ['Staking is live.', 'REAL_STAKING=1', 'a stake now', 'staked funds']) {
      expect(text).toMatch(STAKE);
    }
    expect('mistakes happen').not.toMatch(STAKE);
  });
});

describe('belt rows', () => {
  const ALLOWED = new Set(['free', 'paid', 'free tier, paid plans']);
  const ours = /^(trustshell|cap|receipt|invoice check|grants|redact|present_proof|secret-shape check|proof --verify|trustshell verify|trustshell status)$/;

  function rows(name: BeltRole): string[][] {
    return [...html(name).matchAll(/<tr>(.*?)<\/tr>/g)]
      .map((m) => [...m[1]!.matchAll(/<td>(.*?)<\/td>/g)].map((c) => c[1]!.trim()))
      .filter((cells) => cells.length === 4);
  }

  it('every row says free, paid, or free tier, paid plans', () => {
    for (const name of PAGES) {
      for (const cells of rows(name)) expect(ALLOWED).toContain(cells[3]);
    }
  });

  it('a third-party tool, skill or repo names where it lives', () => {
    for (const name of PAGES) {
      for (const [label, kind] of rows(name)) {
        if (kind === 'method' || ours.test(label!)) continue;
        expect(label).toMatch(/\((github\.com\/[\w.-]+\/[\w.-]+|[\w-]+\.[a-z]{2,})\)$/);
      }
    }
  });
});
