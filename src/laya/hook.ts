/** Laya hook stub. Records classify. Does not call HAL. */
export type LayaClass = 'cheap' | 'escalate' | 'ask';

export type LayaRow = {
  classify: LayaClass;
};

const rows: LayaRow[] = [];
const allowed = new Set<LayaClass>(['cheap', 'escalate', 'ask']);

export function layaHook(classify: LayaClass): LayaRow {
  if (!allowed.has(classify)) throw new Error('classify must be cheap, escalate, or ask');
  const row: LayaRow = { classify };
  rows.push(row);
  return row;
}

export function layaRecords(): readonly LayaRow[] {
  return rows.slice();
}
