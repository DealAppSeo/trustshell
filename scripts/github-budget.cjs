// Decides whether release-e2e waits for GitHub's anonymous rate limit to reset before the steps that call
// api.github.com. PURE, so the decision is tested without a network (tests/github-budget.test.ts).
//   core      resources.core from GET /rate_limit ({ remaining, reset }), or null if it could not be read
//   need      requests the next steps make
//   maxWaitS  the longest this run may still wait (0: never)
//   nowS      the time now, in epoch seconds
// Returns { waitS, note }. waitS 0 means run the steps now. It never means they passed: a step GitHub still
// refuses is NOT_CHECKED.
function planWait(core, need, maxWaitS, nowS) {
  if (!core || typeof core.remaining !== 'number' || typeof core.reset !== 'number') {
    return { waitS: 0, note: 'budget unreadable; running the steps now' };
  }
  const have = `${core.remaining} of ${core.limit ?? '?'} left, ${need} needed`;
  if (core.remaining >= need) return { waitS: 0, note: have };
  // +5 s: the runner's clock and GitHub's need not agree to the second.
  const waitS = Math.max(0, Math.ceil(core.reset - nowS)) + 5;
  if (waitS > maxWaitS) return { waitS: 0, note: `${have}; resets in ${waitS} s, more than the ${maxWaitS} s this run may wait` };
  return { waitS, note: `${have}; waiting ${waitS} s for the reset` };
}

module.exports = { planWait };
