/**
 * Escalate outbound pack. The caller gets task and claims only.
 * Each string is redacted. Memory rows are not copied. No network.
 */
import { redact } from './redact';

export type OutboundPack = {
  task: string;
  claims: string[];
};

export function packEscalate(task: string, claims: readonly string[]): OutboundPack {
  return {
    task: redact(task),
    claims: claims.map((claim) => redact(claim)),
  };
}

export type LayaRoute = 'cheap' | 'escalate' | 'ask';

/** cheap and ask send nothing. escalate sends the redacted pack. */
export function outboundFor(
  classify: LayaRoute,
  task = '',
  claims: readonly string[] = [],
): OutboundPack | null {
  if (classify === 'escalate') return packEscalate(task, claims);
  return null;
}
