import { WhyArticle, whyMetadata } from '@/components/why-article';

export const metadata = whyMetadata(
  'harness',
  'A cage limits what an agent can touch. A check you can take with you reads what it says, with any model, wherever you work.',
);

/**
 * Sean's own lines live here, not in the headline (Grok, 2026-10-06): why a portable harness, and
 * "people, helping agents, to help people, help people". The glass box is said precisely: you see
 * who checked the sentence; it does not mean the sentence stayed on your machine.
 */
export default function HarnessPage() {
  return (
    <WhyArticle slug="harness">
      <p className="text-xl text-white">Both, but they are not the same thing.</p>
      <p>
        A sandbox cages what an agent can touch: files, the network, money. That matters. NVIDIA OpenShell cages
        what an agent can touch. TrustShell checks what it says.
      </p>
      <p>
        A cage stays where it was built. A check should go where you go. TrustShell is a portable trust harness:
        the same check on this page, in ChatGPT, Claude, Gemini, Grok and DeepSeek through the browser extension,
        in your terminal, and in any agent that speaks MCP. It works whatever model wrote the answer, so you are
        not locked to one vendor.
      </p>
      <p>
        You set it. Choose which chat sites it checks, and whether it checks every reply or only when you click.
        Your record of stamps stays in your browser.
      </p>
      <p>
        It bends instead of breaking. If a checker is busy or down, a backup from the list in our privacy policy
        takes its turn, and the two answers that decide a stamp always come from two different model families.
        If no pair can answer, the stamp says Not checked. It never passes by default.
      </p>
      <p>
        Glass box means you see who checked the sentence and what they said. It does not mean the sentence stayed
        on your machine: to be checked, it is sent to the checkers named in{' '}
        <a href="/privacy.html" className="text-indigo-300 underline">
          our privacy policy
        </a>
        , and it is not stored.
      </p>
      <p>
        We built it because the alternatives are waiting: for a few big labs to grade their own work, or for
        regulators to catch up. A check you carry is yours today.
      </p>
      <p className="text-white">People, helping agents, to help people, help people.</p>
    </WhyArticle>
  );
}
