const CARDS = [
  { role: 'CMO', line: 'Tell the true story in a short clip.' },
  { role: 'CFO', line: 'Leave the money alone until someone says to spend it.' },
  { role: 'CTO', line: 'Read the check the tool prints, and keep secrets off the screen.' },
];

export const metadata = {
  title: 'Belts — TrustShell',
  description: 'CMO, CFO, and CTO. One sentence each.',
};

export default function BeltsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-white">
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Belts</h1>
        {CARDS.map((card) => (
          <section key={card.role} className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold">{card.role}</h2>
            <p className="mt-2 text-slate-300">{card.line}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
