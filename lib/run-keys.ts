import type { ProviderKeys } from './vault';

/**
 * WHICH VAULT KEYS /run SENDS TO THE ENGINE WITH A PROMPT. SHADOW: the flag is off by default.
 *
 * What ships today. On Auto (the default) and on Paid only, /run sends EVERY unlocked vault key in
 * `user_paid_keys` with each prompt (app/run/[agentId]/page.tsx). The vault holds seven providers.
 * The page's older sentence, "keys never sent to a server", was false; #615 narrowed the copy to what
 * the code does. This is the code-first half: send less.
 *
 * What the engine can use. `/api/v1/llm/complete` reads `user_paid_keys` for TIER-1 providers only,
 * and the tier-1 chain is Anthropic and OpenAI and nothing else (repid-engine src/providers/router.ts,
 * `tier1Adapters`, and `RouteRequest.user_paid_keys?: { openai?, anthropic? }`, at fb1e350b). A groq,
 * gemini, cerebras, deepseek or cohere key in the request is never read. Sending it exposes it to
 * our servers and our logs for no function at all.
 *
 * Least-keys mode (NEXT_PUBLIC_RUN_LEAST_KEYS=1, read at build time) sends only the keys the engine
 * can use. Same answers, fewer secrets in transit. OFF means today's behaviour exactly.
 *
 * NOT done here, and said so: this does not make it "the one key needed". The engine, not the
 * browser, picks between OpenAI and Anthropic, so up to two keys still go. Sending exactly one needs
 * the person to choose a provider for the run (a control that changes what Auto does), which is a
 * product decision for Sean. And it does not make "keys never leave the browser" true: that would
 * need the browser to call each provider directly, which most providers' CORS rules do not allow.
 *
 * Keys are MAJOR (r31), so this lands behind the flag and waits for Sean to flip it.
 */
export const ENGINE_READS_KEYS_FOR = ['openai', 'anthropic'] as const;

export const LEAST_KEYS = process.env.NEXT_PUBLIC_RUN_LEAST_KEYS === '1';

/** The `user_paid_keys` body for a run. `leastKeys` false returns the vault's keys untouched. */
export function keysToSend(keys: ProviderKeys | null, leastKeys: boolean = LEAST_KEYS): ProviderKeys {
  if (!keys) return {};
  if (!leastKeys) return keys;
  const out: ProviderKeys = {};
  for (const provider of ENGINE_READS_KEYS_FOR) if (keys[provider]) out[provider] = keys[provider];
  return out;
}
