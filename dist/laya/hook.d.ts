/** Laya hook. cheap recalls locally. Does not call HAL. */
export type LayaClass = 'cheap' | 'escalate' | 'ask';
export type LayaRow = {
    classify: LayaClass;
};
export declare function layaHook(classify: LayaClass): LayaRow | {
    action: 'recall';
    source: 'local';
};
export declare function layaRecords(): readonly LayaRow[];
