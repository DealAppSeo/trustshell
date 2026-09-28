/** Laya hook. cheap recalls locally. Does not call HAL. */
export type LayaClass = 'cheap' | 'escalate' | 'ask';

export type LayaRow = {
  classify: LayaClass;
};

const rows: LayaRow[] = [];
const allowed = new Set<LayaClass>(['cheap', 'escalate', 'ask']);

export function layaHook(classify: LayaClass): LayaRow | { action: 'recall'; source: 'local' } {
  if (!allowed.has(classify)) throw new Error('classify must be cheap, escalate, or ask');
  rows.push({ classify });
  if (classify === 'cheap') return { action: 'recall', source: 'local' };
  return { classify };
}

export function layaRecords(): readonly LayaRow[] {
  return rows.slice();
}
