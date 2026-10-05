import { type LayaLane } from './classify';
/** Lane for this verify. Unset, local, or engine. */
export declare function resolveLayaLane(claim: string, env: NodeJS.ProcessEnv, fetchImpl: typeof fetch): Promise<LayaLane>;
