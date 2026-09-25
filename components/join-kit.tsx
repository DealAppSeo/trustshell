const JOIN = `npm i -g @hyperdag/trustshell@1.4.0
trustshell verify "<claim>"
trustshell status
trustshell repid <id>
trustshell proof <id> --verify`;

export function JoinKit() {
  return (
    <section className="px-6 pb-12 bg-slate-950 text-white">
      <div className="max-w-xl mx-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 text-left">
        <h2 className="text-sm font-semibold text-white">Join kit</h2>
        <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-indigo-200 md:text-sm">
          <code>{JOIN}</code>
        </pre>
      </div>
    </section>
  );
}
