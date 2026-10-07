/**
 * The three C-level belt pages, served only at an UNLISTED address: /b/<key>/<role>, where <key> is
 * the BELTS_SHARE_KEY setting on the deployment (app/b/[key]/[role]/route.ts). They used to be
 * public/belts/<role>.html, which anyone could guess. Sean, 2026-10-06: "not navigable, so that I
 * can share them with someone that they would have to actually have the entire URL to see it."
 *
 * UNLISTED, NOT SECRET. This repository is public, so the words below can be read on GitHub by
 * anyone who looks. What the key keeps private is the address on trustshell.dev, and the key is
 * never in this repository: it lives only in the deployment's settings.
 *
 * Each page asks search engines not to index it and the browser not to send the address on when a
 * reader follows a link out (the address carries the key).
 *
 * The rows come from lib/belts.ts, the one list the role picker reads too, so a page and a grant
 * cannot disagree about what is in a belt.
 */
import { BELTS, BELTS_RESEARCHED, BELT_ROLES, type Belt, type BeltRole } from './belts';

export { BELT_ROLES, type BeltRole };

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const link = (where: string) =>
  `<a href="https://${esc(where)}" rel="noreferrer noopener">${esc(where)}</a>`;

function render(belt: Belt): string {
  const starter = belt.starter
    .map(
      (t) =>
        `        <tr><td>${esc(t.name)}<br><small>${link(t.where)}</small></td><td data-label="kind">${esc(t.kind)}</td><td data-label="what for">${esc(t.use)}</td><td data-label="how it stays read-only">${esc(t.readOnly)}</td><td data-label="licence">${esc(t.licence)}</td><td data-label="free or paid">${esc(t.cost)}</td></tr>`,
    )
    .join('\n');
  const gated = belt.gated
    .map(
      (t) =>
        `        <tr><td>${esc(t.name)}<br><small>${link(t.where)}</small></td><td data-label="why held back">${esc(t.risk)}</td><td data-label="what it would do">${esc(t.does)}</td><td data-label="licence">${esc(t.licence)}</td></tr>`,
    )
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <title>${esc(belt.title)} belt</title>
  <style>
    :root { --bg: #ffffff; --fg: #111827; --muted: #4b5563; --line: #e5e7eb; --link: #1d4ed8; }
    @media (prefers-color-scheme: dark) { :root { --bg: #0b1220; --fg: #e5e7eb; --muted: #9ca3af; --line: #1f2937; --link: #93c5fd; } }
    body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; }
    article { max-width: 980px; margin: 0 auto; padding: 24px 16px 48px; }
    h1 { margin: 0 0 4px; font-size: 28px; }
    h2 { margin: 32px 0 4px; font-size: 18px; }
    p { margin: 6px 0; color: var(--muted); }
    .wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 14px; }
    th, td { text-align: left; vertical-align: top; padding: 8px; border-bottom: 1px solid var(--line); }
    th { color: var(--muted); font-weight: 600; }
    a { color: var(--link); }
    small { color: var(--muted); }
    @media (max-width: 640px) {
      table, tbody, tr, td { display: block; width: 100%; box-sizing: border-box; }
      thead { display: none; }
      tr { padding: 10px 0; border-bottom: 1px solid var(--line); }
      td { border: 0; padding: 2px 0; }
      td:first-child { font-weight: 600; padding-bottom: 6px; }
      td[data-label]::before { content: attr(data-label) ": "; color: var(--muted); }
      small { font-weight: 400; overflow-wrap: anywhere; }
    }
  </style>
</head>
<body>
  <article class="belt">
    <h1>${esc(belt.title)}</h1>
    <p>${esc(belt.purpose)}</p>
    <p>A belt is the set of tools one agent may use for one role. You choose which agent wears it.</p>
    <p>Read on ${BELTS_RESEARCHED}. Licences and settings can change. This page installs nothing.</p>

    <h2>Starter belt: reads only</h2>
    <p>Each tool says how it is kept to reads. Use that setting.</p>
    <div class="wrap"><table>
      <thead>
        <tr><th>tool</th><th>kind</th><th>what for</th><th>how it stays read-only</th><th>licence</th><th>free or paid</th></tr>
      </thead>
      <tbody>
${starter}
      </tbody>
    </table></div>

    <h2>Needs your OK first</h2>
    <p>These spend money, act in public, or change something that cannot be undone. None is in the starter belt.</p>
    <div class="wrap"><table>
      <thead>
        <tr><th>tool</th><th>why held back</th><th>what it would do</th><th>licence</th></tr>
      </thead>
      <tbody>
${gated}
      </tbody>
    </table></div>
  </article>
</body>
</html>
`;
}

export const BELT_HTML: Record<BeltRole, string> = {
  cmo: render(BELTS.cmo),
  cto: render(BELTS.cto),
  cfo: render(BELTS.cfo),
};
