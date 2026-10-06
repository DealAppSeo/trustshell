/**
 * THE THREE QUESTIONS under the stamp on the home page (Sean and Grok, 2026-10-06).
 *
 * NOT A CAROUSEL, ON PURPOSE. Sean asked for three rotating hero lines so the page could ask, and
 * so the lines could be changed as they land. Rotation is what the measurements argue against:
 * on nd.edu about 1% of visitors clicked a carousel at all, and 84% of those clicks were on the
 * first slide (Erik Runyon, 2013); Orbit Media's static image drew about three times the clicks of
 * its slider. One fixed headline keeps a line people can repeat, and these three still cards keep
 * the questions, each one link to its piece.
 *
 * TO SWAP A CARD, change its `question` here: the card and the article's heading both read it.
 * Change the cards from the replies. The headline in components/hero.tsx stays unless a card
 * beats it on the same page, held still, for a week.
 */
export interface WhyQuestion {
  /** The article's path is /why/<slug>. */
  slug: 'cost' | 'blame' | 'harness';
  question: string;
}

export const WHY_QUESTIONS: readonly WhyQuestion[] = [
  { slug: 'cost', question: 'When a lie costs you, who pays?' },
  { slug: 'blame', question: 'Who is supposed to catch it, the lab or you?' },
  { slug: 'harness', question: 'A cage on the agent, or a check you can take with you?' },
];

export function whyQuestion(slug: WhyQuestion['slug']): WhyQuestion {
  return WHY_QUESTIONS.find((q) => q.slug === slug)!;
}
