/**
 * The six-stage journey strip on /bind, /faucet, /stake and /spend says WHERE you are, never that a
 * stage is finished. It used to print "· done" on every stage before the current one, by position,
 * so a stranger opening /spend in a fresh browser read "Create · done, Claim · done, Fund · done,
 * Stake · done" above a page telling them to create an agent first [seen live 2026-10-14].
 * Rendered, not grepped: the claim a stranger reads is the markup.
 */
import type { ReactElement } from 'react';

function render(current?: string): string {
  const { createElement } = require('react') as typeof import('react');
  const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server');
  const { JourneySteps } = require('../components/journey-steps') as {
    JourneySteps: (p: { current?: string }) => ReactElement;
  };
  return renderToStaticMarkup(createElement(JourneySteps, { current }));
}

describe('JourneySteps', () => {
  it.each(['claim', 'fund', 'stake', 'trade', 'earn'])('never claims an earlier stage is done (current=%s)', (current) => {
    const html = render(current);
    expect(html).not.toMatch(/done/i);
    expect(html).toContain('you are here');
  });

  it('marks exactly one stage as the current one', () => {
    expect(render('trade').match(/you are here/g)).toHaveLength(1);
    expect(render('trade')).toContain('aria-current="step"');
  });

  it('with no current stage (the /demo map) marks nothing', () => {
    const html = render();
    expect(html).not.toContain('you are here');
    expect(html).not.toMatch(/done/i);
  });
});
