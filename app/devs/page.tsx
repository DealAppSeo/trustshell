const LINES = [
  'Terminal is a text window that runs a command.',
  'GitHub is undo-history for a project you can share.',
];

const REPOS = ['DealAppSeo/trustshell', 'DealAppSeo/repid-engine'];

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
        <ul className="space-y-3 text-slate-300">
          {REPOS.map((repo) => (
            <li key={repo}>
              <a href={`https://github.com/${repo}`} className="underline underline-offset-4">
                {repo}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
