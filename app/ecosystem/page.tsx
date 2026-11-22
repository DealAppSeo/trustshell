// Lists public repos tagged "trust-ecosystem" from GitHub (cached 1h), so new projects appear without an edit.
// If GitHub is unreachable or rate-limited, shows a short fallback list and says so.

export const revalidate = 3600;

export const metadata = {
  title: 'Ecosystem — TrustShell',
  description: 'The projects built around TrustShell.',
};

type Repo = { name: string; description: string | null; html_url: string; homepage: string | null; owner: { login: string } };

const OWNERS = ['DealAppSeo', 'AIdeaGuy'];
const FALLBACK: Repo[] = [
  { name: 'trustshell', description: 'Portable Safe and Ethical Trust Layer for Agentic AI', html_url: 'https://github.com/DealAppSeo/trustshell', homepage: 'https://trustshell.dev', owner: { login: 'DealAppSeo' } },
  { name: 'repid-engine', description: "HyperDAG Protocol's Trust Harness - a behavioral reputation scoring engine.", html_url: 'https://github.com/DealAppSeo/repid-engine', homepage: null, owner: { login: 'DealAppSeo' } },
  { name: 'hyperdag-proof-verifier', description: 'Verify HyperDAG Plonky3 STARK RepID proofs client-side (WASM).', html_url: 'https://github.com/DealAppSeo/hyperdag-proof-verifier', homepage: null, owner: { login: 'DealAppSeo' } },
  { name: 'example-agent', description: 'Example AI agent integrating TrustShell: HAL fact-check before responding.', html_url: 'https://github.com/DealAppSeo/example-agent', homepage: null, owner: { login: 'DealAppSeo' } },
  { name: 'aideaguy', description: 'Short, practical ways to use AI to get things done.', html_url: 'https://github.com/AIdeaGuy/aideaguy', homepage: 'https://aideaguy.dev', owner: { login: 'AIdeaGuy' } },
];

async function load(): Promise<{ repos: Repo[]; live: boolean }> {
  try {
    const q = ['topic:trust-ecosystem', ...OWNERS.map((o) => `user:${o}`)].join('+');
    const res = await fetch(`https://api.github.com/search/repositories?q=${q}&sort=updated&per_page=50`, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { items?: Repo[] };
    const items = body.items ?? [];
    if (items.length === 0) return { repos: FALLBACK, live: false };
    return { repos: items, live: true };
  } catch {
    return { repos: FALLBACK, live: false };
  }
}

export default async function EcosystemPage() {
  const { repos, live } = await load();
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-white">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-3xl font-extrabold tracking-tight">The Trust projects</h1>
        <p className="text-slate-300">Open projects built around TrustShell. Each link goes to its source code.</p>
        <ul className="space-y-4">
          {repos.map((r) => (
            <li key={`${r.owner.login}/${r.name}`} className="rounded-lg border border-slate-800 p-4">
              <a href={r.html_url} className="font-semibold underline underline-offset-4">
                {r.owner.login}/{r.name}
              </a>
              {r.description ? <p className="mt-1 text-slate-300">{r.description}</p> : null}
              {r.homepage ? (
                <p className="mt-1 text-sm">
                  <a href={r.homepage} className="text-slate-400 underline underline-offset-4">
                    {r.homepage.replace(/^https?:\/\//, '')}
                  </a>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-500">
          {live
            ? 'Listed automatically: public repositories tagged "trust-ecosystem".'
            : 'Showing a short saved list because the live list could not be loaded just now.'}
        </p>
      </div>
    </main>
  );
}
