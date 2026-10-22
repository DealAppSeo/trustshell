import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, IBM_Plex_Serif } from 'next/font/google';
import './globals.css';
import { TopNav } from '@/components/top-nav';
import { SITE_URL } from '@/lib/site';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

// Display face for headings. Inter is superb for dense operator UI and stays as the body
// face, but a page set entirely in it reads as a template rather than as a product. Plex
// Serif was drawn for IBM's technical products, so it carries engineering heritage rather
// than editorial gloss — warmth without softness, and unmistakably not the body face.
const plexSerif = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-plex-serif',
});

export const metadata: Metadata = {
  /**
   * REQUIRED for the generated OG card to resolve. Without a metadataBase, Next emits a
   * RELATIVE og:image URL, and every scraper that reads it — every messaging app, every
   * social preview — resolves it against nothing and shows no image. The absent base is why
   * adding an image alone would not have been enough.
   *
   * Reads the deployment's own origin so a preview build advertises its own card rather than
   * production's, which would make a preview link silently misrepresent what it is showing.
   */
  metadataBase: new URL(SITE_URL),
  title: 'TrustShell: your AI says the job is done. Check the evidence.',
  description: 'Your AI says the job is done. TrustShell checks the evidence: a free CLI checks what an AI agent says about a GitHub Actions run against the run itself, plus an MCP server and SDK. Open source, Apache 2.0.',
  keywords: ['AI agents', 'agent claims', 'evidence', 'GitHub Actions', 'CI', 'MCP', 'MCP server', 'LangGraph', 'smolagents', 'ERC-8004', 'x402', 'open source'],
  authors: [{ name: 'HyperDAG' }],
  openGraph: {
    title: 'TrustShell: your AI says the job is done. Check the evidence.',
    description: 'Your AI says the job is done. TrustShell checks the evidence: a free CLI checks what an AI agent says about a GitHub Actions run against the run itself, plus an MCP server and SDK. Open source, Apache 2.0.',
    type: 'website',
    url: 'https://trustshell.dev',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TrustShell: your AI says the job is done. Check the evidence.',
    description: 'Your AI says the job is done. TrustShell checks the evidence: a free CLI checks what an AI agent says about a GitHub Actions run against the run itself, plus an MCP server and SDK. Open source, Apache 2.0.',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${plexSerif.variable} bg-background`}
    >
      <body className="min-h-screen font-sans antialiased">
        {/* WCAG 2.4.1: the first Tab lands here, and Enter skips the nav. Visible only when focused. */}
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-amber-600 focus:px-4 focus:py-3 focus:font-bold focus:text-black"
        >
          Skip to content
        </a>
        <TopNav />
        <div id="content" tabIndex={-1} className="outline-none">
          {children}
        </div>
        {/* The site footer: the privacy policy, the source and the package, on every page. Not
            components/footer.tsx, the long link grid #246 kept off the landing. pb-24 below sm keeps
            the last line clear of the home page's fixed mobile Check bar. */}
        <footer className="border-t border-[#1e293b] px-4 pt-6 pb-24 sm:pb-6 text-sm text-[#94a3b8]">
          <nav aria-label="Site" className="max-w-6xl mx-auto flex flex-wrap gap-x-6">
            <a href="/build" className="inline-flex min-h-11 min-w-11 items-center underline-offset-4 hover:text-white hover:underline">Build with us</a>
            <a href="/privacy.html" className="inline-flex min-h-11 min-w-11 items-center underline-offset-4 hover:text-white hover:underline">Privacy: extension and sentence check</a>
            <a href="https://github.com/DealAppSeo/trustshell" className="inline-flex min-h-11 min-w-11 items-center underline-offset-4 hover:text-white hover:underline">Source on GitHub</a>
            <a href="https://www.npmjs.com/package/@hyperdag/trustshell" className="inline-flex min-h-11 min-w-11 items-center underline-offset-4 hover:text-white hover:underline">npm</a>
            <a href="https://github.com/DealAppSeo/trustshell/blob/main/LICENSE" className="inline-flex min-h-11 min-w-11 items-center underline-offset-4 hover:text-white hover:underline">Apache 2.0</a>
          </nav>
        </footer>
      </body>
    </html>
  );
}
