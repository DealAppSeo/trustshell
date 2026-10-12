/**
 * "Suggest a skill" stores a LINK. It does not install, download, fetch, run or open it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SKILL_LINKS_MAX,
  SKILL_LINK_MAX,
  SKILL_NOTE_MAX,
  parseSkillLink,
  readSkillLinks,
  skillLinkKey,
  withSkillLink,
  withoutSkillLink,
  type SkillLink,
} from '../lib/skill-links';

const ROOT = join(__dirname, '..');
const lib = readFileSync(join(ROOT, 'lib/skill-links.ts'), 'utf8');
const box = readFileSync(join(ROOT, 'components/suggest-skill.tsx'), 'utf8');
const code = (s: string) => s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('parseSkillLink', () => {
  it('keeps an https link and a note, trimmed', () => {
    expect(parseSkillLink('  https://github.com/owner/tool  ', '  reads the ledger ')).toEqual({
      ok: true,
      url: 'https://github.com/owner/tool',
      note: 'reads the ledger',
    });
  });

  it.each([
    ['http://example.com/x', 'Only https'],
    ['javascript:alert(1)', 'Only https'],
    ['data:text/html,<b>x</b>', 'Only https'],
    ['file:///etc/passwd', 'Only https'],
    ['ftp://example.com/x', 'Only https'],
    ['example.com/tool', 'not a web link'],
    ['https://user:pass@example.com/x', 'username or password'],
    ['https://localhost/x', 'real website name'],
    ['https://intranet/x', 'real website name'],
    ['https://127.0.0.1/x', 'real website name'],
    ['https://[::1]/x', 'real website name'],
    ['https://exa mple.com/x', 'spaces'],
    ['https://example.com/\u0007x', 'hidden characters'],
    ['', 'Paste a link'],
  ])('refuses %j', (raw, why) => {
    const r = parseSkillLink(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(why);
  });

  it('refuses a link or a note that is too long', () => {
    expect(parseSkillLink(`https://example.com/${'a'.repeat(SKILL_LINK_MAX)}`).ok).toBe(false);
    const n = parseSkillLink('https://example.com/x', 'n'.repeat(SKILL_NOTE_MAX + 1));
    expect(n.ok).toBe(false);
  });

  it('treats non-strings as nothing, not as a link', () => {
    expect(parseSkillLink(undefined).ok).toBe(false);
    expect(parseSkillLink({ toString: () => 'https://example.com' }).ok).toBe(false);
  });
});

describe('the saved list', () => {
  const now = 1_700_000_000_000;
  const a = { url: 'https://github.com/owner/tool', note: '' };

  it('adds newest first, and a repeat adds nothing', () => {
    const one = withSkillLink([], a, now);
    expect(one.added).toBe(true);
    const two = withSkillLink(one.list, { url: 'https://github.com/other/thing', note: 'x' }, now + 1);
    expect(two.list.map((l) => l.url)).toEqual(['https://github.com/other/thing', 'https://github.com/owner/tool']);
    const dup = withSkillLink(two.list, { url: 'https://GitHub.com/owner/tool/', note: '' }, now + 2);
    expect(dup.added).toBe(false);
    expect(dup.list).toHaveLength(2);
    expect(skillLinkKey('https://GitHub.com/owner/tool/')).toBe(skillLinkKey('https://github.com/owner/tool'));
  });

  it('stops at the cap rather than growing without bound', () => {
    let list: SkillLink[] = [];
    for (let i = 0; i < SKILL_LINKS_MAX; i++) list = withSkillLink(list, { url: `https://example.com/${i}`, note: '' }, now + i).list;
    expect(list).toHaveLength(SKILL_LINKS_MAX);
    const over = withSkillLink(list, { url: 'https://example.com/over', note: '' }, now);
    expect(over.added).toBe(false);
  });

  it('removes one link by its address', () => {
    const list = withSkillLink([], a, now).list;
    expect(withoutSkillLink(list, a.url)).toEqual([]);
  });

  it('reads a damaged saved list defensively: bad rows are dropped, never trusted', () => {
    const back = readSkillLinks([
      { url: 'https://github.com/ok/tool', note: 'fine', savedAt: 5 },
      { url: 'javascript:alert(1)', note: 'bad' },
      { url: 'http://example.com' },
      null,
      'string',
      { url: 42 },
    ]);
    expect(back).toEqual([{ url: 'https://github.com/ok/tool', note: 'fine', savedAt: 5 }]);
    expect(readSkillLinks('nope')).toEqual([]);
    expect(readSkillLinks(undefined)).toEqual([]);
  });
});

describe('it stores a link and does NOT install', () => {
  it('lib/skill-links.ts has no network call, no dynamic import, no eval, no process spawn', () => {
    const c = code(lib);
    for (const bad of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'import(', 'eval(', 'new Function', 'child_process', 'require(']) {
      expect(c.includes(bad)).toBe(false);
    }
  });

  it('the box has no network call and prints a saved link as text, not as an anchor', () => {
    const c = code(box);
    for (const bad of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'import(', 'eval(', 'window.open', 'location.href', '<a ', 'href=']) {
      expect(c.includes(bad)).toBe(false);
    }
  });

  it('says out loud that nothing is installed, downloaded, run or opened', () => {
    expect(box).toMatch(/Nothing is\s+installed, downloaded or run/);
    expect(box).toContain('Nothing was opened, downloaded or installed.');
    expect(box).toContain('Plain text on purpose');
  });
});
