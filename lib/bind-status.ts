/**
 * Bind status. Stake stays shadow. This does not enable staking and does not send.
 */
export const BIND_STAKE = 'shadow — not live';

export function bindStatus(canBind: boolean): { can_bind: 'true' | 'false'; stake: typeof BIND_STAKE } {
  return { can_bind: canBind ? 'true' : 'false', stake: BIND_STAKE };
}
