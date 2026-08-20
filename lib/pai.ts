/**
 * PAI — the conversational front door to the trust kernel.
 *
 * WHAT THIS IS NOT: a second product. Passport, Authority (stake), Grants and Activity all
 * already exist as pages against the live backend. The PAI does not reimplement any of them
 * and does not own any state they own. It does two things: it walks a new user through
 * writing a constitution in conversation instead of in a form, and it surfaces the kernel
 * read that is relevant to what the user just said, rather than making them find it in a nav
 * bar of ten links.
 *
 * KEYLESS, STRUCTURALLY. `/run/[agentId]` passes `user_paid_keys` from the vault when the
 * user picks a paid tier. The PAI never does: it sends `tier_preference: 'tier0_first'` with
 * no key material at all. So the invariant "agents never receive user keys without an
 * explicit grant" holds here by construction, not by remembering — there is no code path in
 * this module that reads the vault. Do not add one; a paid-tier PAI needs a grant first, and
 * grants are the thing being built, not assumed.
 */

/** One question in the constitution interview. Kept small — a long form is why forms fail. */
export interface ConstitutionQuestion {
  id: 'mission' | 'rules' | 'risk';
  /** What the PAI says. Written as speech, not as a field label. */
  ask: string;
  /** Shown under the input — what a good answer looks like, without prescribing one. */
  hint: string;
  /** Heading this answer gets in the composed constitution text. */
  heading: string;
}

export const CONSTITUTION_QUESTIONS: readonly ConstitutionQuestion[] = [
  {
    id: 'mission',
    ask: "What do you want me to actually do for you? One or two sentences is plenty.",
    hint: 'e.g. "Research suppliers and summarise what you find, with sources."',
    heading: 'Mission',
  },
  {
    id: 'rules',
    ask: 'What should I never do, even if it looks like the fastest way to finish?',
    hint: 'e.g. "Never spend money. Never claim something is verified unless you checked it."',
    heading: 'Hard rules',
  },
  {
    id: 'risk',
    ask: "When you're not around and I'm unsure — should I stop and wait, or take my best shot?",
    hint: 'There is no right answer; it changes what I do at the edge, and you can change it later.',
    heading: 'Risk posture',
  },
] as const;

export type ConstitutionAnswers = Partial<Record<ConstitutionQuestion['id'], string>>;

/**
 * Compose the answers into the `constitution_text` the backend already accepts at
 * `POST /api/v1/agents/register` — the same field `/agents` submits from its form. The
 * conversation is a different way of filling one existing field, not a new backend concept.
 */
export function composeConstitution(answers: ConstitutionAnswers): string {
  return CONSTITUTION_QUESTIONS.filter((q) => answers[q.id]?.trim())
    .map((q) => `## ${q.heading}\n${answers[q.id]!.trim()}`)
    .join('\n\n');
}

/**
 * A kernel surface the PAI can point at, with the evidence question it answers.
 */
export interface KernelRead {
  href: string;
  label: string;
  /** The question this page actually answers — shown so the link is a reason, not a nav item. */
  answers: string;
}

const KERNEL_READS: Record<'passport' | 'authority' | 'grants' | 'activity', KernelRead> = {
  passport: {
    href: '/passport',
    label: 'Passport',
    answers: 'who this agent is, and what its RepID and tier are right now',
  },
  authority: {
    href: '/stake',
    label: 'Authority',
    answers: 'what it can actually back — real collateral, not a simulated balance',
  },
  grants: {
    href: '/grants',
    label: 'Grants',
    answers: 'who let it act on your behalf, with what scope and budget — and how to revoke',
  },
  activity: {
    href: '/history',
    label: 'Activity',
    answers: 'what it has done on this device, and how each run was scored',
  },
};

/**
 * Which kernel read (if any) is worth surfacing for what the user just said.
 *
 * Deliberately keyword-matched and deliberately allowed to return null. The alternative —
 * always showing all four — is the four-dashboard product this is meant to replace, and
 * asking a model to decide would make an unmeasured LLM call the arbiter of what the user
 * sees. A miss here costs the user one nav click; a false positive costs their attention on
 * every single message.
 */
export function relevantKernelRead(text: string): KernelRead | null {
  const t = text.toLowerCase();

  if (/\b(grant|delegate|delegation|revoke|permission|on my behalf|scope)\b/.test(t)) {
    return KERNEL_READS.grants;
  }
  if (/\b(authority|stake|collateral|budget|spend|afford|back(ing)?)\b/.test(t)) {
    return KERNEL_READS.authority;
  }
  if (/\b(passport|repid|reputation|tier|score|identity|who are you)\b/.test(t)) {
    return KERNEL_READS.passport;
  }
  if (/\b(history|activity|what have you done|past runs?|log|audit)\b/.test(t)) {
    return KERNEL_READS.activity;
  }
  return null;
}
