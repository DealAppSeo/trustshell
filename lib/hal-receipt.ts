/** Count HAL family outcomes. FALSE is only the verdict FALSE. */

export type ReceiptVerdict = 'TRUE' | 'FALSE' | 'UNCERTAIN' | 'NOT_CHECKED';

export type ReceiptRow = {
  family: string;
  host: string;
  verdict: string;
  latency_ms: number | null;
};

export type FamilyCounts = {
  family: string;
  hosts: string[];
  TRUE: number;
  FALSE: number;
  UNCERTAIN: number;
  NOT_CHECKED: number;
  median_latency_ms: number | null;
};

/**
 * TRUE, FALSE, and UNCERTAIN stay themselves.
 * ERROR, NOT_CHECKED, and anything else did not return a vote, so they are NOT_CHECKED.
 */
export function classifyVerdict(verdict: string): ReceiptVerdict {
  if (verdict === 'TRUE' || verdict === 'FALSE' || verdict === 'UNCERTAIN') return verdict;
  return 'NOT_CHECKED';
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return sorted[mid];
}

export function countByFamily(rows: ReceiptRow[]): FamilyCounts[] {
  const groups = new Map<string, FamilyCounts & { latencies: number[] }>();
  for (const row of rows) {
    let group = groups.get(row.family);
    if (!group) {
      group = {
        family: row.family,
        hosts: [],
        TRUE: 0,
        FALSE: 0,
        UNCERTAIN: 0,
        NOT_CHECKED: 0,
        median_latency_ms: null,
        latencies: [],
      };
      groups.set(row.family, group);
    }
    if (row.host && !group.hosts.includes(row.host)) group.hosts.push(row.host);
    group[classifyVerdict(row.verdict)] += 1;
    if (typeof row.latency_ms === 'number' && Number.isFinite(row.latency_ms)) {
      group.latencies.push(row.latency_ms);
    }
  }
  return [...groups.values()]
    .map(({ latencies, ...counts }) => ({
      ...counts,
      hosts: [...counts.hosts].sort(),
      median_latency_ms: median(latencies),
    }))
    .sort((a, b) => a.family.localeCompare(b.family));
}
