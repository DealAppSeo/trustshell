const COMMANDS = [
  'npm i -g @hyperdag/trustshell@1.4.0',
  'trustshell verify "paste your own claim"',
  'trustshell repid trinity-shofet',
];

export const metadata = {
  title: 'TrustShell',
  description: 'npm i -g @hyperdag/trustshell@1.4.0',
};

export default function Page() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-white">
      <div className="mx-auto max-w-xl">
        <pre className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-200">
          <code>{COMMANDS.join('\n')}</code>
        </pre>
        <p className="mt-4 text-slate-300">
          After verify, copy the family host verdict line. That is the receipt.
        </p>
      </div>
    </main>
  );
}
