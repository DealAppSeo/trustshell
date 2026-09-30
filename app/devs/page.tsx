const REPOS = ['DealAppSeo/trustshell', 'DealAppSeo/repid-engine'];

export const metadata = {
  title: 'Devs — TrustShell',
  description: 'DealAppSeo/trustshell and DealAppSeo/repid-engine.',
};

export default function DevsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-white">
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Devs</h1>
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
