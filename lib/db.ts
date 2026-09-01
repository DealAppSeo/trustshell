import { get, set } from 'idb-keyval';

export type Agent = {
  id: string;
  name: string;
  description?: string;
  constitution?: string;
  createdAt: number;
  totalPrompts: number;
  lastUsedAt: number;
  /**
   * The agent's scoped API key from register() — returned ONCE by the backend
   * and required as Bearer auth on /score-event. Agents created before
   * 2026-07-30 don't have it stored (the key is unrecoverable; the run page
   * shows an honest "recreate to enable scoring" notice instead of failing
   * silently). Browser-local like everything else here — testnet demo scope.
   */
  apiKey?: string;
};

export type HistoryRow = {
  id: string;
  agentId: string;
  prompt: string;
  answer: string;
  provider: string;
  tier: number;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  cost: number;
  timestamp: number;
  repidDelta: number;
  /** HAL verdict for this run ('clean' | 'flagged' | 'vetoed'), when scoring ran. */
  halDecision?: string | null;
  /** True when the earn-gate zeroed the reward (a conversational answer is not a deliverable). */
  purposeSuppressed?: boolean;
  /** Human note explaining the earning outcome ("0 earned — conversational, not a deliverable"). */
  earnNote?: string | null;
  /** Honest failure note when the score event could not be recorded (never a fake Δ 0.00). */
  scoreError?: string | null;
};

const AGENTS_KEY = 'trustshell_agents_v1';
const HISTORY_KEY = 'trustshell_history_v1';

export const localDb = {
  async getAgents(): Promise<Agent[]> {
    const data = await get(AGENTS_KEY);
    return data || [];
  },
  async saveAgent(agent: Agent): Promise<void> {
    const agents = await this.getAgents();
    agents.push(agent);
    await set(AGENTS_KEY, agents);
  },
  async updateAgent(id: string, updates: Partial<Agent>): Promise<void> {
    const agents = await this.getAgents();
    const idx = agents.findIndex(a => a.id === id);
    if (idx !== -1) {
      agents[idx] = { ...agents[idx], ...updates };
      await set(AGENTS_KEY, agents);
    }
  },
  async getHistory(): Promise<HistoryRow[]> {
    const data = await get(HISTORY_KEY);
    return data || [];
  },
  async saveHistory(row: HistoryRow): Promise<void> {
    const history = await this.getHistory();
    history.unshift(row);
    await set(HISTORY_KEY, history);
  },
  /**
   * Whole-array writes, for import (lib/portable.ts) and nothing else.
   *
   * Every other method above is incremental precisely so that two tabs cannot clobber each
   * other. These two CAN, so they take an already-merged array: the caller reads, merges with
   * mergeAgents/mergeHistory, and writes back. Handing this a bare list from a file would
   * delete every agent that exists only in this browser.
   */
  async putAgents(agents: Agent[]): Promise<void> {
    await set(AGENTS_KEY, agents);
  },
  async putHistory(history: HistoryRow[]): Promise<void> {
    await set(HISTORY_KEY, history);
  }
};
