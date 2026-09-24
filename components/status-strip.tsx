import { NPM_LATEST } from '@/lib/npm-latest';

/** Registry pin from `npm view`, 2026-09-24. HAL / chain / grounding unchanged. */
export function StatusStrip() {
  return (
    <p className="text-center text-xs text-muted/70 px-4 py-3">
      npm latest v{NPM_LATEST}. HAL 2 answering / 8 configured. Base Sepolia, not mainnet.
      Grounding shadow.
    </p>
  );
}
