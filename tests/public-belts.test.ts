/**
 * The three belt pages live in lib/belt-pages.ts and are served only at an unlisted address
 * (see tests/belt-share.test.ts). Their rows come from lib/belts.ts.
 *
 * None of the three belt pages contain stake now.
 * A plain 'stake' substring missed 'staking' and 'REAL_STAKING' (neither contains 'stake'),
 * so a page saying "Staking is live" passed. Match the stem.
 */
export {};

import { BELT_HTML, BELT_ROLES, type BeltRole } from '../lib/belt-pages';
import { BELTS } from '../lib/belts';

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
  const WHERE = /^(github\.com\/[\w.-]+\/[\w.-]+|[\w-]+(\.[\w-]+)*\.[a-z]{2,})$/;

  it('every starter tool says free, paid, or free tier, paid plans', () => {
    for (const role of PAGES) {
      for (const t of BELTS[role].starter) expect(ALLOWED).toContain(t.cost);
    }
  });

  it('every tool names where it lives', () => {
    for (const role of PAGES) {
      for (const t of [...BELTS[role].starter, ...BELTS[role].gated]) expect(t.where).toMatch(WHERE);
    }
  });

  it('every starter tool says HOW it is kept to reads, not just that it is', () => {
    for (const role of PAGES) {
      for (const t of BELTS[role].starter) expect(t.readOnly.trim().length).toBeGreaterThan(10);
    }
  });

  it('a starter id is unique within its belt and safe to name in a grant', () => {
    for (const role of PAGES) {
      const ids = BELTS[role].starter.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });

  it('every gated tool says which risk holds it back', () => {
    const RISKS = new Set(['spends money', 'acts in public', 'cannot be undone']);
    for (const role of PAGES) {
      expect(BELTS[role].gated.length).toBeGreaterThan(0);
      for (const t of BELTS[role].gated) expect(RISKS).toContain(t.risk);
    }
  });

  it('licences that forbid running as a service, and proprietary skills, are not offered', () => {
    for (const role of PAGES) {
      const page = html(role);
      for (const left of ['Akaunting', 'Invoice Ninja', 'Business Source', 'Elastic License', 'All rights reserved']) {
        expect(page).not.toContain(left);
      }
      for (const t of BELTS[role].starter) expect(t.where).not.toBe('github.com/anthropics/skills');
    }
  });

  it('each page shows both tables and the date the research was read', () => {
    for (const role of PAGES) {
      expect(html(role)).toContain('Starter belt: reads only');
      expect(html(role)).toContain('Needs your OK first');
      expect(html(role)).toMatch(/Read on \d{4}-\d{2}-\d{2}\./);
    }
  });

  it('every row from the list reaches the page, with outbound links that send no referrer', () => {
    for (const role of PAGES) {
      const page = html(role);
      for (const t of [...BELTS[role].starter, ...BELTS[role].gated]) {
        expect(page).toContain(`<a href="https://${t.where}" rel="noreferrer noopener">`);
      }
      const anchors = [...page.matchAll(/<a [^>]*>/g)].map((m) => m[0]);
      for (const a of anchors) expect(a).toContain('rel="noreferrer noopener"');
    }
  });
});
