import { NPM_LATEST } from '@/lib/npm-latest';

/** L3 — honest STATUS on the site. npm 1.3.0 until F-PUBLISH. */
export function StatusStrip() {
  return (
    <p className="text-center text-xs text-muted/70 px-4 py-3">
      npm latest v{NPM_LATEST} until publish. HAL 2 answering / 8 configured. Base Sepolia, not
      mainnet. Grounding shadow.
    </p>
  );
}
