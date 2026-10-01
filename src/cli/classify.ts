/**
 * Laya lane for a claim. Local text only. No network and no paid API.
 * cheap skips HAL. escalate is the existing quorum. ask stops for a person.
 */
export type LayaLane = 'cheap' | 'escalate' | 'ask';

const CHEAP = new Set([
  'ok',
  'okay',
  'yes',
  'no',
  'thanks',
  'thank you',
  'k',
  'lol',
  'yep',
  'nope',
  'sure',
]);

export function classify(text: string): LayaLane {
  const trimmed = text.trim();
  if (!trimmed || trimmed.endsWith('?')) return 'ask';
  const key = trimmed.toLowerCase().replace(/[.!]+$/g, '');
  if (CHEAP.has(key)) return 'cheap';
  return 'escalate';
}
