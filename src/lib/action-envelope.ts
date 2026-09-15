/**
 * S5 stub — one action class cannot run without a typed envelope.
 * Unit-test only. Not exported from the package entry.
 */

export const ACTION_ORIGINS = ['Cli', 'Site', 'Mcp', 'Market'] as const;
export type ActionOrigin = (typeof ACTION_ORIGINS)[number];

export interface ActionEnvelope {
  origin: ActionOrigin;
  actionClass: string;
  policyId: string;
}

export class EnvelopeRequiredError extends Error {
  readonly code = 'envelope_required';
  constructor() {
    super('action_refused: typed envelope required');
    this.name = 'EnvelopeRequiredError';
  }
}

export function isActionEnvelope(value: unknown): value is ActionEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ActionEnvelope>;
  return (
    typeof v.origin === 'string' &&
    (ACTION_ORIGINS as readonly string[]).includes(v.origin) &&
    typeof v.actionClass === 'string' &&
    v.actionClass.length > 0 &&
    typeof v.policyId === 'string' &&
    v.policyId.length > 0
  );
}

export async function runEnvelopedAction<T>(
  envelope: unknown,
  act: () => Promise<T> | T,
): Promise<T> {
  if (!isActionEnvelope(envelope)) {
    throw new EnvelopeRequiredError();
  }
  return act();
}
