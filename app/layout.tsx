import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { TopNav } from '@/components/top-nav';

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
        <TopNav />
        {children}
      </body>
    </html>
  );
}
