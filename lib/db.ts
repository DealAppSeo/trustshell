import { get, set } from 'idb-keyval';

export type Agent = {
  id: string;
  name: string;
  description?: string;
  constitution?: string;
  createdAt: number;
  totalPrompts: number;
  lastUsedAt: number;
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
  }
};
