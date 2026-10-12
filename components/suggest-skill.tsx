'use client';

import { useEffect, useState } from 'react';
import { get, set } from 'idb-keyval';
import {
  SKILL_LINK_MAX,
  SKILL_NOTE_MAX,
  parseSkillLink,
  readSkillLinks,
  withSkillLink,
  withoutSkillLink,
  type SkillLink,
} from '@/lib/skill-links';

const KEY = 'trustshell_skill_links_v1';

/**
 * SUGGEST A SKILL. The box stores a link and nothing else.
 *
 * It does not install, download, fetch, run or open the link. The saved address is printed as plain
 * text, not as an anchor, so there is no click from this page that goes anywhere with it. It sits in
 * this browser, like the agent list does, for a person to read later. lib/skill-links.ts holds the
 * checks; this file only keeps the list.
 */
export function SuggestSkill() {
  const [links, setLinks] = useState<SkillLink[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    let live = true;
    get(KEY)
      .then((raw) => {
        if (live) setLinks(readSkillLinks(raw));
      })
      .catch(() => {})
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);

  async function persist(next: SkillLink[]) {
    setLinks(next);
    try {
      await set(KEY, next);
    } catch {
      setError('This browser would not keep the list. The link is shown here but will be gone when you leave.');
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaved('');
    const parsed = parseSkillLink(url, note);
    if (!parsed.ok) return setError(parsed.reason);
    const next = withSkillLink(links, parsed, Date.now());
    if (!next.added) return setError(next.reason ?? 'Not saved.');
    await persist(next.list);
    setUrl('');
    setNote('');
    setSaved('Saved in this browser. Nothing was opened, downloaded or installed.');
  }

  return (
    <section aria-labelledby="suggest-skill-h" data-testid="suggest-skill" className="space-y-3 rounded-xl border border-[#1e293b] bg-[#0f172a] p-5">
      <div>
        <h2 id="suggest-skill-h" className="text-lg font-bold text-white">
          Suggest a skill
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-[#94a3b8]">
          Know a tool this belt is missing? Paste its link. We store the link, in this browser, and that is all. Nothing is
          installed, downloaded or run, and the link is not opened.
        </p>
      </div>

      <form onSubmit={onSave} className="space-y-2">
        <label className="block text-sm">
          <span className="font-medium text-white">Link</span>
          <input
            data-testid="skill-url"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            maxLength={SKILL_LINK_MAX}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/tool"
            className="mt-1 w-full rounded border border-[#334155] bg-[#0a0f1a] p-2 font-mono text-sm text-white"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-white">
            Note <span className="font-normal text-[#64748b]">(optional)</span>
          </span>
          <input
            data-testid="skill-note"
            type="text"
            maxLength={SKILL_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What it would do for this belt"
            className="mt-1 w-full rounded border border-[#334155] bg-[#0a0f1a] p-2 text-sm text-white"
          />
        </label>
        <button
          type="submit"
          data-testid="skill-save"
          className="rounded bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500"
        >
          Save the link
        </button>
        {error && (
          <p role="alert" data-testid="skill-error" className="text-sm text-[#ff6b6b]">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" data-testid="skill-saved" className="text-sm text-green-400">
            {saved}
          </p>
        )}
      </form>

      <div>
        <h3 className="text-sm font-bold text-white">Saved links</h3>
        {!loaded ? null : links.length === 0 ? (
          <p className="mt-1 text-xs text-[#94a3b8]">None yet.</p>
        ) : (
          <ul className="mt-2 space-y-2" data-testid="skill-list">
            {links.map((l) => (
              <li key={l.url} className="flex items-start justify-between gap-3 border-t border-[#1e293b] pt-2 text-sm">
                <span className="min-w-0">
                  {/* Plain text on purpose: not an anchor, so nothing here opens it. */}
                  <span className="block break-all font-mono text-xs text-white">{l.url}</span>
                  {l.note && <span className="block text-xs text-[#94a3b8]">{l.note}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => void persist(withoutSkillLink(links, l.url))}
                  className="shrink-0 text-xs text-red-400 underline hover:text-red-300"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
