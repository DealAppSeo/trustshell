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
  title: 'TrustShell - AI Agents That Earn Your Trust',
  description: 'Open-source trust layer for AI agents — framework-agnostic, model-agnostic, ERC-8004 RepID + x402 payment gating. Apache 2.0.',
  keywords: ['AI agents', 'ERC-8004', 'trust layer', 'blockchain', 'reputation', 'x402', 'hallucination defense', 'LangChain', 'LlamaIndex', 'HuggingFace', 'agent framework'],
  authors: [{ name: 'HyperDAG' }],
  openGraph: {
    title: 'TrustShell - AI Agents That Earn Your Trust',
    description: 'Open-source trust layer for AI agents — framework-agnostic, model-agnostic, ERC-8004 RepID + x402 payment gating. Apache 2.0.',
    type: 'website',
    url: 'https://trustshell.dev',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TrustShell - AI Agents That Earn Your Trust',
    description: 'Open-source trust layer for AI agents — framework-agnostic, model-agnostic, ERC-8004 RepID + x402 payment gating. Apache 2.0.',
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
        <TopNav />
        {children}
      </body>
    </html>
  );
}
