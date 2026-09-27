const HEADLINE = 'A portable trust harness. Autonomy is earned.';

const STEPS = [
  'npm i -g @hyperdag/trustshell@1.4.0',
  'trustshell verify "The capital of France is Paris."',
  'trustshell verify "The Eiffel Tower is located in Rome, Italy."',
  'trustshell verify "The Earth orbits the Sun."',
  'trustshell status',
  'trustshell proof trinity-shofet --verify',
];

/**
 * /start is the install, verify, status, and proof walk.
 * The tailor questions stay off this page.
 */
export default function StartPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-white">
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">{HEADLINE}</h1>
        <p className="text-slate-300">Check a claim. See the receipt. Keep your keys.</p>
        <ol className="list-decimal space-y-3 pl-5 font-mono text-sm text-indigo-200">
          {STEPS.map((step) => (
            <li key={step}>
              <code>{step}</code>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
