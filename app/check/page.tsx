import CheckForm from './CheckForm';

export const metadata = {
  title: 'Check a claim — TrustShell',
  description:
    'Paste one sentence and get one of three answers: pass, veto, or not-checked. The same check the TrustShell extension and CLI use.',
};

export default function CheckPage() {
  return (
    <div className="max-w-xl mx-auto space-y-8 py-10 px-4">
      <header className="space-y-3">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">Check a claim</h1>
        <p className="text-[#94a3b8]">
          Paste one sentence. You get one of three answers: <strong className="text-white">pass</strong>,{' '}
          <strong className="text-white">veto</strong> or <strong className="text-white">not-checked</strong>. A
          miss is never a pass.
        </p>
      </header>

      <CheckForm />

      <section className="space-y-2 text-sm text-[#94a3b8]">
        <p id="check-privacy">
          What you type is sent to our checkers, Groq and Cerebras. It is not stored. Do not paste anything private.
        </p>
        <p>
          This is the same check the TrustShell Chrome extension and <code>trustshell check</code> use.
        </p>
      </section>
    </div>
  );
}
