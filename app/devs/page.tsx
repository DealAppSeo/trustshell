import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Devs — TrustShell',
  description: 'The TrustShell repository.',
};

export default function DevsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-white">
      <div className="mx-auto max-w-xl">
        <a
          href="https://github.com/DealAppSeo/trustshell"
          className="inline-block rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950"
        >
          See the code
        </a>
      </div>
    </main>
  );
}
