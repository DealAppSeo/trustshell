import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({ 
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'TrustShell - AI Agents That Earn Your Trust',
  description: 'The open-source trust layer for ERC-8004 agents. Hallucination defense, earned reputation, and x402 payment gating. Transparent decisioning, on-chain proof.',
  keywords: ['AI agents', 'ERC-8004', 'trust layer', 'blockchain', 'reputation', 'x402', 'hallucination defense'],
  authors: [{ name: 'HyperDAG' }],
  openGraph: {
    title: 'TrustShell - AI Agents That Earn Your Trust',
    description: 'The open-source trust layer for ERC-8004 agents. Hallucination defense, earned reputation, and x402 payment gating.',
    type: 'website',
    url: 'https://trustshell.dev',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TrustShell - AI Agents That Earn Your Trust',
    description: 'The open-source trust layer for ERC-8004 agents.',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} bg-background`}>
      <body className="min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
