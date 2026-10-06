import { WhyArticle, whyMetadata } from '@/components/why-article';

export const metadata = whyMetadata(
  'cost',
  'You do, first. A sure answer that is wrong reads exactly like one that is right, and the cost lands on whoever acts on it.',
);

/**
 * Both cases are public court and tribunal records: Mata v. Avianca (S.D.N.Y., June 2023) and
 * Moffatt v. Air Canada (2024 BCCRT 149). No figure here is ours; none is a measurement we made.
 */
export default function CostPage() {
  return (
    <WhyArticle slug="cost">
      <p className="text-xl text-white">You do, first.</p>
      <p>
        In 2023 two New York lawyers filed a brief that cited court cases ChatGPT had made up. The judge fined
        them and their firm $5,000 (Mata v. Avianca).
      </p>
      <p>
        In 2024 Air Canada&apos;s website chatbot told a grieving passenger he could claim a bereavement fare
        after he flew. He could not. The airline argued that the chatbot was responsible for what it said. The
        tribunal disagreed and ordered the airline to pay him (Moffatt v. Air Canada).
      </p>
      <p>
        A sure answer that is wrong reads exactly like a sure answer that is right. The cost lands on whoever
        acts on it: the money, the time, and the trust of the people who relied on you.
      </p>
      <p>
        TrustShell puts a check between the answer and the act. Two checkers from two different model families
        read the sentence. Checks out means both said true. Caught means both said false. Anything else is Not
        checked, and Not checked is never a pass.
      </p>
      <p>
        It does not make an answer right. It tells you, before you act, whether two other models agree with it,
        and which two.
      </p>
    </WhyArticle>
  );
}
