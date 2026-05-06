import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Link from 'next/link';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'TrustShell',
  description: 'AI agents that earn your trust.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#0a0f1a] text-[#f8fafc] min-h-screen flex flex-col`}>
        <div className="bg-amber-600 text-white text-center py-1 text-sm font-medium">
          Alpha. Your keys live in your browser. We see prompts and answers, never keys.
        </div>
        <nav className="border-b border-[#1e293b] bg-[#0f172a] px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold text-white tracking-tight">TrustShell</Link>
            <div className="hidden md:flex gap-4 text-sm font-medium text-[#94a3b8]">
              <Link href="/connect" className="hover:text-amber-500 transition-colors">Connect</Link>
              <Link href="/agents" className="hover:text-amber-500 transition-colors">Agents</Link>
              <Link href="/history" className="hover:text-amber-500 transition-colors">History</Link>
              <Link href="/settings" className="hover:text-amber-500 transition-colors">Settings</Link>
            </div>
          </div>
          <div>
            <Link href="/connect" className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-colors text-sm">
              Vault
            </Link>
          </div>
        </nav>
        <main className="flex-1 p-8">{children}</main>
        <footer className="text-center text-xs text-[#475569] py-8 border-t border-[#1e293b] mt-auto">
          Alpha. Your keys live in your browser only. Source: github.com/DealAppSeo/trustshell-app
        </footer>
      </body>
    </html>
  );
}
