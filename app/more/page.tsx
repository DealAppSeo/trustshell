const LINES = [
  'Use any chat you already have.',
  'Keep notes on your machine.',
  'Name the assistant later.',
  'Teach it a job when you are ready.',
];

export const metadata = {
  title: 'More — TrustShell',
  description: 'Use any chat you already have.',
};

export default function MorePage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-white">
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-3xl font-extrabold tracking-tight">More</h1>
        {LINES.map((line) => (
          <p key={line} className="text-slate-300">
            {line}
          </p>
        ))}
      </div>
    </main>
  );
}
