import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { renderMarkdown } from "@/lib/markdown";

export const metadata = {
  title: "Getting started — TrustShell",
  description:
    "60-second path from npm install to a verified on-chain claim. Prerequisites, configuration, error handling.",
};

// Read on every request so the docs always reflect main without rebuild.
// The markdown file ships in the repo, so the read is filesystem-local.
export const dynamic = "force-dynamic";

async function loadDoc(): Promise<string> {
  const filePath = path.join(process.cwd(), "docs", "getting-started.md");
  return await fs.readFile(filePath, "utf8");
}

export default async function GettingStartedPage() {
  let html = "";
  let error = false;
  try {
    const md = await loadDoc();
    html = renderMarkdown(md);
  } catch {
    error = true;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <nav className="text-xs text-muted/60 mb-6">
        <Link href="/docs" className="hover:text-accent transition-colors">
          ← All docs
        </Link>
      </nav>

      {error ? (
        <div className="rounded-lg border border-border bg-card px-5 py-4">
          <p className="text-foreground font-semibold">Doc temporarily unavailable</p>
          <p className="text-sm text-muted mt-1">
            Read the canonical source at{" "}
            <a
              href="https://github.com/DealAppSeo/trustshell/blob/main/docs/getting-started.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              github.com/DealAppSeo/trustshell/docs/getting-started.md
            </a>
            .
          </p>
        </div>
      ) : (
        <article
          className="max-w-none"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}

      <footer className="mt-12 pt-6 border-t border-border text-xs text-muted/60">
        Source:{" "}
        <a
          href="https://github.com/DealAppSeo/trustshell/blob/main/docs/getting-started.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          docs/getting-started.md
        </a>{" "}
        · Apache 2.0
      </footer>
    </div>
  );
}
