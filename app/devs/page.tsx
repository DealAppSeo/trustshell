const LINES = [
  'Terminal is a text window that runs a command.',
  'GitHub is undo-history for a project you can share.',
];

export const metadata = {
  title: 'Devs — TrustShell',
  description: 'Terminal is a text window that runs a command.',
};

export default function DevsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-white">
      <div className="mx-auto max-w-xl space-y-4">
        {LINES.map((line) => (
          <p key={line} className="text-slate-300">
            {line}
          </p>
        ))}
        <p>
          <a
            href="https://github.com/DealAppSeo/trustshell"
            className="inline-block rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950"
          >
            See the code
          </a>
        </p>
        <p>
          <a href="/builders" className="text-slate-300 underline underline-offset-4">
            Builders
          </a>
        </p>
      </div>
    </main>
  );
}
