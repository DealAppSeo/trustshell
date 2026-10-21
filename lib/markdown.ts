// Minimal server-side markdown → HTML renderer.
//
// We intentionally ship without `react-markdown` / `remark-gfm` to keep
// the Vercel build path zero-net-new-deps for the /docs sprint. The two
// markdown files this serves (`docs/getting-started.md`,
// `docs/api-reference.md`) use a well-defined subset:
//
//   - ATX headers (#, ##, ### …)
//   - bullet + numbered lists (one level of nesting)
//   - GitHub-flavored pipe tables
//   - fenced ``` code blocks (with optional language)
//   - inline code, bold, italic, links
//   - blockquotes (> )
//   - horizontal rules (---)
//
// HTML is escaped at the source-text level before any markdown
// expansion runs, so user-controlled content can't inject tags.
// Output is consumed via `dangerouslySetInnerHTML` in a Server
// Component — no client-side rehydration concerns.

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

// Relative links in docs/*.md are written for GitHub, relative to docs/. On this site they
// resolved to /docs/<file>.md and 404'd (8 links, found 2026-10-21). Docs this site renders
// stay on the site; anything else goes to the file on GitHub. Only http(s), mailto, site
// paths and in-page anchors become links, so a javascript: URL in a doc renders as plain text.
const SITE_DOCS: Record<string, string> = {
  "getting-started.md": "/docs/getting-started",
  "api-reference.md": "/docs/api-reference",
};
const GITHUB_DOCS = "https://github.com/DealAppSeo/trustshell/blob/main/docs/";

export function resolveDocHref(raw: string): { href: string; external: boolean } | null {
  const url = raw.replace(/&amp;/g, "&");
  if (url.startsWith("#")) return { href: url, external: false };
  if (/^(https?:|mailto:)/i.test(url)) return { href: url, external: true };
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return null;
  if (url.startsWith("/")) return { href: url, external: false };
  const [file, hash] = url.replace(/^\.\//, "").split("#", 2);
  const site = SITE_DOCS[file ?? ""];
  if (site) return { href: site + (hash ? "#" + hash : ""), external: false };
  return { href: new URL(url, GITHUB_DOCS).href, external: true };
}

/** GitHub's heading anchor: lowercase, drop punctuation, each space becomes a hyphen. */
export function headingSlug(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z0-9#]+;/gi, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function renderInline(text: string): string {
  let s = text;
  // Pull out inline code spans first so other patterns don't fire inside them.
  const codeStash: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_m, code) => {
    codeStash.push(escapeHtml(code));
    return `\u0000CODE${codeStash.length - 1}\u0000`;
  });
  s = escapeHtml(s);
  // Links: [text](url)
  s = s.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_m, label, url, title) => {
      const link = resolveDocHref(url);
      if (!link) return label;
      const newTab = link.external ? ` target="_blank" rel="noopener noreferrer"` : "";
      return `<a href="${escapeHtml(link.href)}"${title ? ` title="${title}"` : ""}${newTab} class="text-accent underline underline-offset-2 hover:no-underline">${label}</a>`;
    }
  );
  // Bold, italic.
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  // Restore inline code.
  s = s.replace(
    /\u0000CODE(\d+)\u0000/g,
    (_m, i) =>
      `<code class="px-1 py-0.5 rounded bg-[#1e293b] text-amber-500 font-mono text-[0.875em]">${codeStash[Number(i)]}</code>`
  );
  return s;
}

function renderTable(rows: string[]): string {
  // First row = header, second row = separator (--- ---), rest = body.
  const cells = (row: string) =>
    row
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());

  if (rows.length < 2) return "";
  const header = cells(rows[0]!);
  const body = rows.slice(2).map(cells);

  const headerHtml = header
    .map((h) => `<th class="px-3 py-2 text-left text-sm font-semibold text-foreground border-b border-border">${renderInline(h)}</th>`)
    .join("");
  const bodyHtml = body
    .map(
      (row) =>
        `<tr>${row
          .map(
            (c) =>
              `<td class="px-3 py-2 text-sm text-muted border-b border-border/40 align-top">${renderInline(c)}</td>`
          )
          .join("")}</tr>`
    )
    .join("");
  return `<div tabindex="0" class="my-6 overflow-x-auto"><table class="w-full border-collapse"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
}

export function renderMarkdown(src: string): string {
  // Normalize Windows line endings.
  const text = src.replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const out: string[] = [];

  let i = 0;
  let inList: "ul" | "ol" | null = null;
  const slugCount = new Map<string, number>();

  const closeList = () => {
    if (inList) {
      out.push(`</${inList}>`);
      inList = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i]!;

    // Fenced code block: collect until matching ```
    const fence = line.match(/^```\s*([A-Za-z0-9_+\-]*)\s*$/);
    if (fence) {
      closeList();
      const lang = fence[1] || "";
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? "")) {
        buf.push(lines[i]!);
        i++;
      }
      // Skip closing fence (or EOF).
      i++;
      const escaped = buf.map(escapeHtml).join("\n");
      out.push(
        `<pre tabindex="0" class="my-5 px-4 py-3 rounded-md bg-[#0f172a] border border-border overflow-x-auto"><code class="block font-mono text-sm text-[#94a3b8] whitespace-pre"${lang ? ` data-lang="${lang}"` : ""}>${escaped}</code></pre>`
      );
      continue;
    }

    // Horizontal rule
    if (/^\s*-{3,}\s*$/.test(line) && (i === 0 || /^\s*$/.test(lines[i - 1] ?? ""))) {
      closeList();
      out.push(`<hr class="my-8 border-border" />`);
      i++;
      continue;
    }

    // Headers
    const hMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (hMatch) {
      closeList();
      const level = hMatch[1]!.length;
      const sizeClass =
        level === 1
          ? "text-3xl md:text-4xl font-bold mt-10 mb-5 text-foreground"
          : level === 2
          ? "text-2xl font-bold mt-8 mb-4 text-foreground"
          : level === 3
          ? "text-xl font-semibold mt-6 mb-3 text-foreground"
          : "text-base font-semibold mt-4 mb-2 text-foreground";
      const inner = renderInline(hMatch[2]!);
      // Same de-duplication as GitHub (-1, -2, ...), so the docs' own tables of contents resolve.
      const base = headingSlug(inner);
      const seen = slugCount.get(base) ?? 0;
      slugCount.set(base, seen + 1);
      const id = seen ? `${base}-${seen}` : base;
      // scroll-mt: an anchored heading must land below the sticky site header, not under it.
      out.push(`<h${level} id="${id}" class="scroll-mt-20 ${sizeClass}">${inner}</h${level}>`);
      i++;
      continue;
    }

    // Tables (GFM): a line with | and the next line matches ---|---|...
    if (line.includes("|") && /^[\s|:\-]+$/.test(lines[i + 1] ?? "") && (lines[i + 1] ?? "").includes("|")) {
      closeList();
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim().length > 0) {
        tableLines.push(lines[i]!);
        i++;
      }
      out.push(renderTable(tableLines));
      continue;
    }

    // Lists
    const ulMatch = line.match(/^\s*[-*]\s+(.*)$/);
    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ulMatch || olMatch) {
      const wantList = ulMatch ? "ul" : "ol";
      if (inList !== wantList) {
        closeList();
        out.push(
          wantList === "ul"
            ? `<ul class="list-disc list-outside ml-6 my-4 space-y-2 text-muted leading-relaxed">`
            : `<ol class="list-decimal list-outside ml-6 my-4 space-y-2 text-muted leading-relaxed">`
        );
        inList = wantList;
      }
      const content = (ulMatch ? ulMatch[1] : olMatch?.[1]) ?? "";
      out.push(`<li>${renderInline(content)}</li>`);
      i++;
      continue;
    } else if (inList && line.trim() === "") {
      // blank line might end the list (look ahead).
      const next = lines[i + 1] ?? "";
      if (!/^\s*[-*]\s+/.test(next) && !/^\s*\d+\.\s+/.test(next)) {
        closeList();
      }
      i++;
      continue;
    } else if (inList) {
      // any non-list line ends the list.
      closeList();
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      closeList();
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) {
        buf.push(lines[i]!.replace(/^>\s?/, ""));
        i++;
      }
      out.push(
        `<blockquote class="my-5 pl-4 border-l-4 border-amber-500/40 text-muted italic">${renderInline(
          buf.join("\n")
        )
          .split("\n")
          .filter(Boolean)
          .map((p) => `<p>${p}</p>`)
          .join("")}</blockquote>`
      );
      continue;
    }

    // Paragraph: gather contiguous non-blank, non-block lines.
    if (line.trim().length === 0) {
      i++;
      continue;
    }
    const pBuf: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim().length > 0 &&
      !/^#{1,6}\s+/.test(lines[i] ?? "") &&
      !/^```/.test(lines[i] ?? "") &&
      !/^>\s?/.test(lines[i] ?? "") &&
      !/^\s*[-*]\s+/.test(lines[i] ?? "") &&
      !/^\s*\d+\.\s+/.test(lines[i] ?? "") &&
      !/^\s*-{3,}\s*$/.test(lines[i] ?? "")
    ) {
      pBuf.push(lines[i]!);
      i++;
    }
    out.push(`<p class="my-4 text-muted leading-relaxed">${renderInline(pBuf.join(" "))}</p>`);
  }

  closeList();
  return out.join("\n");
}
