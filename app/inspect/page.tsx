import { promises as fs } from "fs";
import path from "path";
import { renderMarkdown } from "@/lib/markdown";

export const metadata = {
  title: "Try Inspect — TrustShell",
  description:
    "Five minutes, no account, no key: check one true and one false claim about a pinned GitHub Actions run, and follow the card to the evidence.",
};

// Same pattern as /docs/getting-started: the page renders docs/challenge.md, so the repo file
// and the site never disagree.
export const dynamic = "force-dynamic";

export default async function InspectPage() {
  let html = "";
  let error = false;
  try {
    html = renderMarkdown(await fs.readFile(path.join(process.cwd(), "docs", "challenge.md"), "utf8"));
  } catch {
    error = true;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {error ? (
        <div className="rounded-lg border border-border bg-card px-5 py-4">
          <p className="text-foreground font-semibold">This page is temporarily unavailable</p>
          <p className="text-sm text-muted mt-1">
            Read it on GitHub:{" "}
            <a
              href="https://github.com/DealAppSeo/trustshell/blob/main/docs/challenge.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-2 hover:no-underline"
            >
              docs/challenge.md
            </a>
            .
          </p>
        </div>
      ) : (
        <article className="max-w-none break-words" dangerouslySetInnerHTML={{ __html: html }} />
      )}

      <footer className="mt-12 pt-6 border-t border-border text-xs text-muted">
        Source:{" "}
        <a
          href="https://github.com/DealAppSeo/trustshell/blob/main/docs/challenge.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline underline-offset-2 hover:no-underline"
        >
          docs/challenge.md
        </a>{" "}
        · Apache 2.0
      </footer>
    </div>
  );
}
