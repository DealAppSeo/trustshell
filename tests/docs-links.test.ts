/**
 * /docs/getting-started and /docs/api-reference render docs/*.md on the site. Their relative links
 * were written for GitHub, so on trustshell.dev they resolved to /docs/<file>.md and 404'd, and the
 * api-reference table of contents pointed at heading ids that were never rendered (2026-10-21).
 * This renders both real docs and fails on any link the site cannot serve.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { renderMarkdown, resolveDocHref, headingSlug } from '../lib/markdown';

const DOCS = ['getting-started.md', 'api-reference.md', 'challenge.md'];
const SITE_PAGES = new Set(['/docs/getting-started', '/docs/api-reference']);
const GITHUB = 'https://github.com/DealAppSeo/trustshell/blob/main/';

const hrefs = (html: string) => [...html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&'));
const ids = (html: string) => new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]!));

describe('docs rendered on the site have no dead links', () => {
  const rendered = Object.fromEntries(
    DOCS.map((f) => [f, renderMarkdown(readFileSync(join(process.cwd(), 'docs', f), 'utf8'))]),
  );

  it.each(DOCS)('%s: every in-page anchor names a rendered heading', (f) => {
    const own = ids(rendered[f]!);
    const missing = hrefs(rendered[f]!).filter((h) => h.startsWith('#') && !own.has(h.slice(1)));
    expect(missing).toEqual([]);
  });

  it.each(DOCS)('%s: no link resolves to a .md path on the site, and every repo link names a real file', (f) => {
    const bad: string[] = [];
    for (const h of hrefs(rendered[f]!)) {
      if (h.startsWith('/')) {
        const [path, hash] = h.split('#');
        if (!SITE_PAGES.has(path!)) bad.push(`${h}: not a page this site renders from docs/`);
        const target = DOCS.find((d) => `/docs/${d.replace(/\.md$/, '')}` === path);
        if (hash && target && !ids(rendered[target]!).has(hash)) bad.push(`${h}: no such heading`);
      } else if (h.startsWith(GITHUB)) {
        const rel = decodeURIComponent(h.slice(GITHUB.length).split('#')[0]!);
        if (!existsSync(join(process.cwd(), rel))) bad.push(`${h}: no such file in the repo`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('resolveDocHref', () => {
  it('keeps the two site-rendered docs on the site, with their anchor', () => {
    expect(resolveDocHref('./getting-started.md#6-configuration-reference')).toEqual({
      href: '/docs/getting-started#6-configuration-reference', external: false,
    });
  });

  it('sends other repo files to GitHub, relative to docs/', () => {
    expect(resolveDocHref('./glossary.md')?.href).toBe(`${GITHUB}docs/glossary.md`);
    expect(resolveDocHref('../examples/a2a-purchase/')?.href).toBe(`${GITHUB}examples/a2a-purchase/`);
  });

  it('refuses script and protocol-relative URLs rather than linking them', () => {
    for (const u of ['javascript:alert(1)', 'JaVaScRiPt:x', 'data:text/html,x', 'vbscript:x', '//evil.example']) {
      expect(resolveDocHref(u)).toBeNull();
    }
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('href');
  });

  it('opens only off-site links in a new tab', () => {
    const html = renderMarkdown('[a](#sdk) [b](./api-reference.md) [c](https://example.com)');
    expect(html).toContain('<a href="#sdk" class=');
    expect(html).toContain('<a href="/docs/api-reference" class=');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer"');
  });
});

describe('headingSlug matches GitHub anchors', () => {
  it.each([
    ['SDK', 'sdk'],
    ['<code>TrustShell.init(config)</code> → <code>Promise&lt;{ client, health }&gt;</code>', 'trustshellinitconfig--promise-client-health-'],
    ['<code>GET /api/v1/status</code>', 'get-apiv1status'],
  ])('%s -> %s', (html, slug) => {
    expect(headingSlug(html)).toBe(slug);
  });

  it('de-duplicates repeated headings the way GitHub does', () => {
    expect(renderMarkdown('## Errors\n\n## Errors')).toMatch(/id="errors"[\s\S]*id="errors-1"/);
  });
});
