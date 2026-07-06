/**
 * Reference integration: a minimal LLM/agent wrapped with @hyperdag/trustshell.
 *
 * Pattern: an agent produces an answer; TrustShell gates it BEFORE it reaches the
 * user. If HAL flags the output as high-risk (halScore high / VETO), the wrapper
 * withholds it and surfaces the evidence instead of shipping a likely hallucination.
 *
 * This is the "trust wrapper any dev can add in a few lines" story, end-to-end,
 * against the LIVE repid-engine. No API key needed (verifyOutput is a public read).
 *
 * Run:  node trust-wrapped-agent.mjs
 */
import { TrustShell } from '@hyperdag/trustshell';

// ---- 1. Your agent. Here it's a stub that just returns a canned answer per prompt.
//         Swap this for a real OpenAI/Anthropic/local call — the wrapper is unchanged.
async function myAgent(prompt) {
  const canned = {
    'capital of France': 'The capital of France is Paris.',
    'eiffel tower location': 'The Eiffel Tower is located in Rome, Italy.', // wrong on purpose
  };
  return canned[prompt] ?? "I don't have a confident answer.";
}

// ---- 2. The trust wrapper. One TrustShell instance, one verifyOutput() gate.
//         Policy: withhold when HAL judges the output high-risk (halScore >= threshold),
//         OR when the backend hard-VETOes. Otherwise release, annotated with the trust score.
class TrustWrappedAgent {
  constructor(client, { riskThreshold = 0.5 } = {}) {
    this.client = client;
    this.riskThreshold = riskThreshold;
  }

  async answer(prompt) {
    const raw = await myAgent(prompt);
    const v = await this.client.verifyOutput(raw);

    const blocked = v.verdict === 'VETO' || v.halScore >= this.riskThreshold;
    return {
      prompt,
      released: !blocked,
      output: blocked ? null : raw,
      withheld: blocked ? raw : null,
      trust: {
        verdict: v.verdict,
        trustScore: v.trustScore,     // 0-100
        halScore: v.halScore,         // 0-1 risk
        evidence: v.evidence,         // per-provider WHY
        reason: v.decisionReason,
      },
    };
  }
}

// ---- 3. Wire it up and run two prompts through the gate.
const { client, health } = await TrustShell.init();
if (!health.ok) throw new Error(`backend unreachable: ${health.error}`);

const agent = new TrustWrappedAgent(client, { riskThreshold: 0.5 });

for (const prompt of ['capital of France', 'eiffel tower location']) {
  const r = await agent.answer(prompt);
  console.log(`\nPROMPT: "${prompt}"`);
  if (r.released) {
    console.log(`  ✓ RELEASED (trustScore=${r.trust.trustScore}): ${r.output}`);
  } else {
    console.log(`  ⛔ WITHHELD (halScore=${r.trust.halScore.toFixed(3)}): "${r.withheld}"`);
    console.log(`     why: ${r.trust.evidence.join(' | ') || r.trust.reason}`);
  }
}

console.log('\nThe wrapper released the truthful answer and withheld the false one — using the');
console.log('live HAL halScore + evidence, without the agent code knowing anything about HAL.');
