/**
 * Laya lane for a claim. Local text only. No network and no paid API.
 * cheap skips HAL. escalate is the existing quorum. ask stops for a person.
 */
export type LayaLane = 'cheap' | 'escalate' | 'ask';
export declare function classify(text: string): LayaLane;
