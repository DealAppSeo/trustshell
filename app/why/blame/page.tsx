import { WhyArticle, whyMetadata } from '@/components/why-article';

export const metadata = whyMetadata(
  'blame',
  'The labs ask you to check. The tribunal held the company to what its chatbot said. The check has to be where the answer lands.',
);

/** Moffatt v. Air Canada is 2024 BCCRT 149. The chat apps' lines are paraphrased, not quoted. */
export default function BlamePage() {
  return (
    <WhyArticle slug="blame">
      <p className="text-xl text-white">Read the line under the chat box.</p>
      <p>
        ChatGPT, Claude and Gemini each print one: it can get things wrong, so check what matters. The labs hand
        the check to you.
      </p>
      <p>
        And when a company put a chatbot in front of its customers and then blamed the chatbot, the tribunal put
        it back on the company (Moffatt v. Air Canada, 2024). Whoever acts on the answer answers for it.
      </p>
      <p>
        That leaves two things to wait for: the labs grading their own work, or regulators catching up. Neither
        one is in your chat when the answer arrives.
      </p>
      <p>
        TrustShell puts the check where the answer lands: on this page, in your chat, in your terminal, in your
        agent. Two checkers that did not write the answer read it, and you see who they were and what they said.
      </p>
      <p>
        You still decide. The stamp is a second opinion from two other models, not a ruling from an authority.
      </p>
    </WhyArticle>
  );
}
