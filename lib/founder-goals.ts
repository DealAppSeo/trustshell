/**
 * Founder goals — the north-star outcomes the PAI is supposed to optimise for, versioned.
 *
 * WHY VERSIONED AND NOT JUST EDITABLE. A goal that can be silently rewritten is not a goal,
 * it is a mood. The value of writing goals down is being able to ask later "what did I
 * actually say I wanted, and when did that change?" — which is only answerable if the
 * previous text survives the edit. Every save appends; nothing is overwritten, and nothing
 * is deleted. That is the same discipline the constitution has (`lib/pai.ts` composes it
 * once at registration) applied to the thing that changes more often.
 *
 * Storage is browser-local — same idb-keyval pattern and the same honest limitation as
 * `founder-mode.ts`. See that file's header: no schema is being frozen into production
 * before the event contract is agreed.
 *
 * SCOPE, DELIBERATELY. This records what the founder wants. It does NOT inject anything into
 * a running agent loop — that is the "steer" surface, and it is not built here. Storing an
 * instruction and calling it steering would be theatre: nothing reads these goals at runtime
 * yet, and the UI says so rather than implying the PAI is already following them.
 */

import { get, set } from 'idb-keyval';

const GOALS_KEY = 'trustshell_founder_goals_v1';

export interface GoalVersion {
  /** 1-based; the number the founder can refer to. */
  version: number;
  text: string;
  createdAt: number;
}

export const founderGoals = {
  /** Every version, newest first. Empty when nothing has ever been written. */
  async history(): Promise<GoalVersion[]> {
    return (await get(GOALS_KEY)) ?? [];
  },

  async current(): Promise<GoalVersion | null> {
    const all = await this.history();
    return all[0] ?? null;
  },

  /**
   * Append a new version. Returns null when the text is unchanged from the current version —
   * a no-op save should not manufacture a version that says nothing happened.
   */
  async save(text: string): Promise<GoalVersion | null> {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const all = await this.history();
    if (all[0]?.text === trimmed) return null;

    const next: GoalVersion = {
      version: (all[0]?.version ?? 0) + 1,
      text: trimmed,
      createdAt: Date.now(),
    };
    await set(GOALS_KEY, [next, ...all]);
    return next;
  },
};
