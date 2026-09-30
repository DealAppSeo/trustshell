const LINES = [
  'It lies. Check the last answer. Get a receipt.',
  'They train on you. Notes stay on your machine.',
  'One company owns the chat. You can switch models.',
  'Agents act without you. Autonomy is earned.',
];

export const metadata = {
  title: 'Why — TrustShell',
  description: 'It lies. Check the last answer. Get a receipt.',
};

export default function WhyPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-white">
      <div className="mx-auto max-w-xl space-y-4">
        {LINES.map((line) => (
          <p key={line} className="text-slate-300">
            {line}
          </p>
        ))}
      </div>
    </main>
  );
}
