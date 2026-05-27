import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { renderMarkdown } from "@/lib/markdown";

export const metadata = {
  title: "API reference — TrustShell",
  description:
    "Full SDK + CLI + Public REST API reference for @hyperdag/trustshell, with verified-live curl examples for each endpoint.",
};

export const dynamic = "force-dynamic";

async function loadDoc(): Promise<string> {
  const filePath = path.join(process.cwd(), "docs", "api-reference.md");
  return await fs.readFile(filePath, "utf8");
}

export default async function ApiReferencePage() {
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
              href="https://github.com/DealAppSeo/trustshell/blob/main/docs/api-reference.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              github.com/DealAppSeo/trustshell/docs/api-reference.md
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
          href="https://github.com/DealAppSeo/trustshell/blob/main/docs/api-reference.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          docs/api-reference.md
        </a>{" "}
        · Apache 2.0
      </footer>
    </div>
  );
}
