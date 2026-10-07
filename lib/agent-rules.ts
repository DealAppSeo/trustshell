/**
 * AN AGENT'S RULES, AND THE CORRECTIONS ITS OWNER TEACHES IT.
 *
 * Until 2026-10-07 the rules a person wrote when creating an agent went nowhere that acted on them.
 * /agents stored them and registered them with the engine, nothing in the engine read them back,
 * and /run sent only the question to the model. The form said "HAL flags violations, and they
 * affect the agent's RepID", which was not true.
 *
 * Now /run sends them with every question, the owner can edit them, and "Teach it" under any answer
 * appends a correction the agent follows from the next question on. The owner trains the agent;
 * nothing is assigned for them.
 *
 * What this does NOT do: check an answer against the rules. HAL checks claims, not rule-keeping.
 * The page says the rules are sent, never that they are enforced.
 */

/** Same ceiling the engine applies to constitution_text at registration. */
export const MAX_RULES_CHARS = 5000;
export const MAX_CORRECTION_CHARS = 300;
export const CORRECTIONS_HEADING = '## Corrections';

/**
 * The prompt /run and /pai send. The job card (lib/job-card.ts: role, belt, limits) comes first,
 * then the owner's rules, then the question. With neither it is the question unchanged, so an
 * agent with no rules and no grants behaves exactly as before.
 */
export function composeRunPrompt(rules: string | undefined | null, question: string, job?: string | null): string {
  const r = (rules ?? '').trim();
  const j = (job ?? '').trim();
  if (!r && !j) return question;
  const parts: string[] = [];
  if (j) parts.push(j);
  if (r) parts.push(`Your owner gave you these rules. Follow them in this answer.\n\n${r}`);
  return `${parts.join('\n\n')}\n\n---\n\n${question}`;
}

export type RulesEdit = { ok: true; rules: string } | { ok: false; reason: string };

/** Validate an edited rules text before it is saved. */
export function checkRules(text: string): RulesEdit {
  const rules = text.replace(/\r\n/g, '\n').trim();
  if (rules.length > MAX_RULES_CHARS) {
    return { ok: false, reason: `Rules can be at most ${MAX_RULES_CHARS} characters; these are ${rules.length}.` };
  }
  return { ok: true, rules };
}

/**
 * Append one correction under "## Corrections", dated, as one line. The section is created at the
 * end the first time. Refuses rather than truncates when the result would be too long: dropping
 * an earlier rule silently is worse than asking the owner to tidy up.
 */
export function appendCorrection(rules: string | undefined | null, correction: string, now: Date = new Date()): RulesEdit {
  const line = correction.replace(/\s+/g, ' ').trim();
  if (line.length < 3) return { ok: false, reason: 'Write what it should do differently next time.' };
  if (line.length > MAX_CORRECTION_CHARS) {
    return { ok: false, reason: `Keep a correction under ${MAX_CORRECTION_CHARS} characters; this one is ${line.length}.` };
  }
  const base = (rules ?? '').replace(/\r\n/g, '\n').trimEnd();
  const entry = `- ${now.toISOString().slice(0, 10)}: ${line}`;
  const next = base.includes(CORRECTIONS_HEADING)
    ? `${base}\n${entry}`
    : `${base}${base ? '\n\n' : ''}${CORRECTIONS_HEADING}\n${entry}`;
  if (next.length > MAX_RULES_CHARS) {
    return { ok: false, reason: `The rules would be over ${MAX_RULES_CHARS} characters. Edit them shorter first.` };
  }
  return { ok: true, rules: next };
}

/** Non-empty lines that read as rules, for a one-line summary. Headings are not counted. */
export function countRuleLines(rules: string | undefined | null): number {
  return (rules ?? '').split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length;
}
