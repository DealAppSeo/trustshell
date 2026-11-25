import { promises as fs } from "fs";
import path from "path";
import { renderMarkdown } from "@/lib/markdown";

export const metadata = {
  title: "Try Inspect — TrustShell",
  description:
    "Five minutes, no account, no key: check two example claims we wrote about a pinned GitHub Actions run, one true and one false, and follow the card to the evidence.",
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

      {/* Two ways on from here. A developer who finishes the challenge gets an invitation to the open
          discussion; someone who arrived without a terminal gets the plain-language page. Each link
          goes to the page that shows the thing named. */}
      <section className="mt-12 pt-6 border-t border-border">
        <h2 className="text-lg font-semibold text-foreground">Help work this out</h2>
        <p className="text-sm text-muted mt-2">
          We are working, in the open, on how an AI agent should earn trust: by evidence someone else can
          check. We have not got it all right yet, and we would rather hear where this is wrong than be told it
          is right when it is not. If you build with agents, use them or doubt them, join the conversation in{" "}
          <a
            href="https://github.com/DealAppSeo/trust-commons"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:no-underline"
          >
            Trust Commons
          </a>
          .
        </p>
        {/* Each sentence here names something that runs, and the links go to the record of it. If a
            loop is retired or the rule changes, change the sentence: this paragraph is a claim. */}
        <p className="text-sm text-muted mt-2">
          We hold our own work to the same standard. Scheduled red-team, pen-test and adversarial-exchange
          runs go at our own checker. Agents answer questions whose answers were written down first. For
          consequential changes, a review does not count when it comes from the same model family that did
          the work. Every failure becomes a test. You can read the{" "}
          <a
            href="https://github.com/DealAppSeo/trustshell/blob/main/docs/red-team.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:no-underline"
          >
            red-team results
          </a>
          , with their dates and what was not checked, see{" "}
          <a href="/three-cases" className="text-accent underline underline-offset-2 hover:no-underline">
            three worked cases
          </a>{" "}
          with nothing to install, and see{" "}
          <a href="/build" className="text-accent underline underline-offset-2 hover:no-underline">
            what runs today and what is not built yet
          </a>
          .
        </p>
        <p className="text-sm text-muted mt-2">
          This is a developer preview and a series of experiments. Use it now only if it is useful to you
          now. As we apply what we learn, what we hope grows out of it is a shared source of basic truth
          that anyone can check, and a safe, ethical, democratized and benevolent AGI, governed by the
          people it is for: everyone who uses it. That is a hope we are working toward, not a claim about
          today.
        </p>
        <p className="text-sm text-muted mt-2">
          Not a developer? The same habit, without a terminal, is at{" "}
          <a
            href="https://aideaguy.dev/#more"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:no-underline"
          >
            AIdeaGuy.dev
          </a>
          .
        </p>
      </section>

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
