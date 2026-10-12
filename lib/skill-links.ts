/**
 * "Suggest a skill": the box stores a LINK. It does not install, download, fetch, run or follow it.
 *
 * Why this is a link and nothing more (Sean, 2026-10-12). A skill is code or instructions somebody
 * else wrote, and the moment a page installs one on a stranger's behalf the page is the supply
 * chain. So the box only writes the address down, in this browser, for a person to read later. This
 * module has no `fetch`, no `import()` of the link and no `eval`: the link is a string that is
 * checked and kept, never opened. tests/skill-links.test.ts fails if this file ever gains a
 * network call.
 *
 * WHAT IS REFUSED, and why each one is refused rather than cleaned up:
 *   - not an https address     http, javascript:, data:, file:, ftp: and a bare word are all not a
 *                              link a person can safely open from a list.
 *   - credentials in the link  https://user:pass@host stores a secret in a place that gets copied.
 *   - a host with no dot       localhost and bare intranet names point at the person's own machine
 *                              or network, which a stored link has no business naming.
 *   - an IP address            a raw address is how a link hides where it goes.
 *   - control characters       the line would not mean what it shows.
 * Everything else is kept as the person typed it (minus surrounding space), so what they see later
 * is what they saved.
 */

export const SKILL_LINK_MAX = 300;
export const SKILL_NOTE_MAX = 140;
export const SKILL_LINKS_MAX = 20;

export type SkillLink = {
  /** The link, exactly as saved. */
  url: string;
  /** Optional note from the person. Plain text only, never rendered as markup. */
  note: string;
  /** When it was saved, by this browser's clock. */
  savedAt: number;
};

export type SkillParse = { ok: true; url: string; note: string } | { ok: false; reason: string };

const CONTROL = /[\u0000-\u001f\u007f-\u009f\s]/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Check one link and its note. PURE: it never touches the network. */
export function parseSkillLink(rawUrl: unknown, rawNote: unknown = ''): SkillParse {
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  const note = typeof rawNote === 'string' ? rawNote.trim().replace(/\s+/g, ' ') : '';
  if (!url) return { ok: false, reason: 'Paste a link first.' };
  if (url.length > SKILL_LINK_MAX) return { ok: false, reason: `That link is longer than ${SKILL_LINK_MAX} characters.` };
  if (CONTROL.test(url)) return { ok: false, reason: 'A link cannot contain spaces or hidden characters.' };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, reason: 'That is not a web link. It should start with https://' };
  }
  if (u.protocol !== 'https:') return { ok: false, reason: 'Only https:// links are kept.' };
  if (u.username || u.password) return { ok: false, reason: 'A link with a username or password in it is not kept.' };
  const host = u.hostname;
  if (!host.includes('.') || host.startsWith('[') || IPV4.test(host)) {
    return { ok: false, reason: 'Use a link with a real website name, not an address or a local name.' };
  }
  if (note.length > SKILL_NOTE_MAX) return { ok: false, reason: `The note is longer than ${SKILL_NOTE_MAX} characters.` };
  return { ok: true, url, note };
}

/** Same link, ignoring case in the host and a trailing slash, so one link is not saved twice. */
export function skillLinkKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.search}${u.hash}`;
  } catch {
    return url;
  }
}

/** Add a parsed link to the saved list. Newest first. A repeat moves nothing and adds nothing. */
export function withSkillLink(
  list: readonly SkillLink[],
  parsed: { url: string; note: string },
  now: number,
): { list: SkillLink[]; added: boolean; reason?: string } {
  const key = skillLinkKey(parsed.url);
  if (list.some((x) => skillLinkKey(x.url) === key)) return { list: [...list], added: false, reason: 'That link is already saved.' };
  if (list.length >= SKILL_LINKS_MAX) return { list: [...list], added: false, reason: `Up to ${SKILL_LINKS_MAX} links are kept. Remove one first.` };
  return { list: [{ url: parsed.url, note: parsed.note, savedAt: now }, ...list], added: true };
}

export function withoutSkillLink(list: readonly SkillLink[], url: string): SkillLink[] {
  return list.filter((x) => x.url !== url);
}

/** Read a saved list back defensively: anything that does not look like a saved link is dropped. */
export function readSkillLinks(raw: unknown): SkillLink[] {
  if (!Array.isArray(raw)) return [];
  const out: SkillLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const p = parseSkillLink(r.url, r.note);
    if (p.ok) out.push({ url: p.url, note: p.note, savedAt: typeof r.savedAt === 'number' ? r.savedAt : 0 });
  }
  return out.slice(0, SKILL_LINKS_MAX);
}
