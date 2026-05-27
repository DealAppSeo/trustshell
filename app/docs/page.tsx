import Link from "next/link";

export const metadata = {
  title: "Documentation — TrustShell",
  description:
    "Developer documentation for @hyperdag/trustshell — getting started + full SDK and REST API reference.",
};

export default function DocsIndex() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-amber-500 font-semibold">
          TrustShell · Apache 2.0
        </p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
          Documentation
        </h1>
        <p className="text-muted leading-relaxed">
          Two short reads to get from zero to a verified on-chain claim. Both pages are mirrors of the
          markdown files in{" "}
          <a
            href="https://github.com/DealAppSeo/trustshell/tree/main/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            github.com/DealAppSeo/trustshell/docs
          </a>{" "}
          — anything you read here is reproducible from the repo.
        </p>
      </header>

      <ul className="space-y-4">
        <li>
          <Link
            href="/docs/getting-started"
            className="block rounded-lg border border-border bg-card hover:border-amber-500/40 transition-colors px-5 py-4"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Getting started</span>
              <span className="text-accent">→</span>
            </div>
            <p className="text-sm text-muted mt-1">
              60-second path from <code className="text-amber-500">npm install</code> to a verified on-chain
              attestation. Prerequisites, configuration reference, error handling, where to get help.
            </p>
          </Link>
        </li>

        <li>
          <Link
            href="/docs/api-reference"
            className="block rounded-lg border border-border bg-card hover:border-amber-500/40 transition-colors px-5 py-4"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">API reference</span>
              <span className="text-accent">→</span>
            </div>
            <p className="text-sm text-muted mt-1">
              Every SDK method, every CLI command, and the 8 public REST endpoints with verified-live curl
              examples. Includes <code className="text-amber-500">/api/v1/status</code>,{" "}
              <code className="text-amber-500">/hal/stats</code>, <code className="text-amber-500">/llm-trust</code>,{" "}
              <code className="text-amber-500">/repid/:id</code>, and more.
            </p>
          </Link>
        </li>
      </ul>

      <footer className="pt-6 border-t border-border">
        <p className="text-xs text-muted/60">
          See also:{" "}
          <Link href="/repid" className="text-accent hover:underline">
            /repid governance
          </Link>{" "}
          ·{" "}
          <a
            href="https://github.com/DealAppSeo/trustshell"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            Source
          </a>{" "}
          ·{" "}
          <a
            href="https://www.npmjs.com/package/@hyperdag/trustshell"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            npm
          </a>
        </p>
      </footer>
    </div>
  );
}
