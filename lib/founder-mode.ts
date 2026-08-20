/**
 * Founder Mode — a deliberate second channel for the person building the system.
 *
 * WHY THIS IS A MODE AND NOT JUST "ADMIN". The founder uses the product the same way a user
 * does, which means their clicks, runs and complaints land in the same funnel as everyone
 * else's. That is fine right up until someone measures adoption: at user #1, the founder IS
 * most of the sample, and every product decision made against that number is made against a
 * reading of the founder's own testing. The fix is not to exclude the founder — it is to make
 * the two signals structurally distinct at write time.
 *
 * THE DISCRIMINANT IS EXPLICIT, NEVER INFERRED. `actor` is stamped when the event is
 * created, from the toggle's state at that moment. It is deliberately NOT derived later from
 * "was this user an admin" — a founder browsing as a normal user is producing genuine
 * end-user signal, and re-deriving actor at read time would silently relabel it. GA is
 * specing the durable contract for this (trinity-ecosystem docs/handoffs/INBOX_GA.md,
 * 2026-08-20); these types are the first slice that contract will be measured against.
 *
 * STORAGE IS BROWSER-LOCAL, ON PURPOSE. Same idb-keyval pattern as run history (`lib/db.ts`).
 * No table, no migration, no DDL against a 196-table production database before the event
 * contract is agreed. That is a real limitation, and the UI says so rather than implying
 * these notes reach a backend. Nothing here is a claim that founder events are durable
 * off-device.
 *
 * NO SECRETS. `trustshell` is a public repository and `lib/vault.ts` deliberately keeps
 * provider keys in the browser, AES-GCM encrypted, never transmitted. A founder event carries
 * a surface, an intent and a note — never a key, never a wallet secret, never a raw prompt
 * body copied wholesale.
 */

import { get, set } from 'idb-keyval';

const TOGGLE_KEY = 'trustshell_founder_mode_v1';
const EVENTS_KEY = 'trustshell_founder_events_v1';

/**
 * Who the signal is FROM — the field that keeps founder testing out of adoption metrics.
 * Stamped at write time from the toggle. Never recomputed on read.
 */
export type EventActor = 'founder' | 'user';

/**
 * What the founder was doing. `product_bug` and `ux_note` are judgements about the product;
 * `sim_run` marks a run done to exercise the system rather than to get an answer;
 * `mark_for_gaterun` flags something that should become a real MEASURED/NOT_CHECKED/FAILED
 * predicate rather than staying an opinion.
 */
export type FounderEventKind = 'product_bug' | 'ux_note' | 'sim_run' | 'mark_for_gaterun';

export interface FounderEvent {
  id: string;
  /** Always 'founder' for these. The field is spelled out rather than implied by the type. */
  actor: EventActor;
  kind: FounderEventKind;
  /** Which surface this came from, e.g. '/pai' — so a note is actionable without guesswork. */
  surface: string;
  /** The founder's own words. Free text; not parsed, not sent anywhere. */
  note: string;
  /** Optional: the agent under test when the note was filed. Never its API key. */
  agentId?: string;
  createdAt: number;
}

export const FOUNDER_EVENT_LABEL: Record<FounderEventKind, string> = {
  product_bug: 'Product bug',
  ux_note: 'UX note',
  sim_run: 'Simulation run',
  mark_for_gaterun: 'Mark for GateRun',
};

export const founderMode = {
  async isOn(): Promise<boolean> {
    return (await get(TOGGLE_KEY)) === true;
  },

  async set(on: boolean): Promise<void> {
    await set(TOGGLE_KEY, on);
  },

  /**
   * Record a founder event. Takes `actor` from the toggle at THIS moment rather than
   * accepting it from the caller — a caller that could pass 'user' here would be able to
   * launder founder signal into the end-user funnel, which is the one thing this module
   * exists to prevent.
   */
  async record(input: {
    kind: FounderEventKind;
    surface: string;
    note: string;
    agentId?: string;
  }): Promise<FounderEvent | null> {
    if (!(await this.isOn())) return null;

    const event: FounderEvent = {
      id: crypto.randomUUID(),
      actor: 'founder',
      kind: input.kind,
      surface: input.surface,
      note: input.note,
      agentId: input.agentId,
      createdAt: Date.now(),
    };

    const existing = await this.list();
    await set(EVENTS_KEY, [event, ...existing]);
    return event;
  },

  async list(): Promise<FounderEvent[]> {
    return (await get(EVENTS_KEY)) ?? [];
  },

  /**
   * Everything filed so far, as a JSON blob the founder can hand to whoever builds the
   * durable store. Browser-local storage is only honest if getting the data back out is
   * possible — otherwise "we recorded it" is a claim with no recipient.
   */
  async export(): Promise<Blob> {
    const events = await this.list();
    return new Blob([JSON.stringify({ events }, null, 2)], { type: 'application/json' });
  },
};
