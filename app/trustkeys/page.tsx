import Link from 'next/link';
import { TrustKeysSignerPanel } from '@/components/trustkeys/signer-panel';

export const metadata = {
  title: 'TrustKeys signer — TrustShell',
  description:
    'Sign a spending policy and a job on your own box. Your key never leaves your wallet; TrustShell verifies the signatures and records only a receipt. Nothing custodial.',
};

/**
 * The TrustKeys reference tier, owner side — "no key on our disk".
 *
 * WHAT THIS PAGE IS. The owner signs a policy once (a ceiling and an allowed payee) and a job per
 * action, both with their own wallet, on their own machine. Only the signed objects and their
 * signatures are sent to the verifier (repid-engine POST /api/v1/jobs/verify), which recovers the
 * signatures, checks the job is inside the policy and within the owner's RepID ceiling, and records
 * only receipt fields. No private key, no raw payee address, and no decryptable secret is ever sent
 * or stored — this is not a broker and not custodial.
 *
 * WHY A WHOLE PAGE FOR IT. The signing is the authorization. Seeing exactly what is signed, and the
 * verifier's honest verdict afterward (verified / refused / could-not-check), is the product — so it
 * gets a surface, not a buried modal. The signer library (lib/trustkeys-signer.ts) is the core
 * deliverable; this page is the minimal touchpoint that drives it with a real wallet.
 */
export default function TrustKeysPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-12 px-4 py-14">
      <header className="space-y-5">
        <h1 className="text-4xl font-bold text-[#fafafa]">Sign a job, keep your key</h1>
        <p className="max-w-[64ch] text-lg leading-relaxed text-[#a1a1aa]">
          Your key stays in your wallet, on this box. You sign a spending policy once and a job for
          each action; we verify the signatures and that the job stays inside the policy, then record
          a receipt. We never receive, store, or handle your private key — nothing here is custodial.
        </p>
        <p className="max-w-[64ch] rounded-lg border border-[#1f1f23] bg-[#0f172a] px-4 py-3 text-sm leading-relaxed text-[#a1a1aa]">
          A policy names a ceiling and the payees you allow. A job is one action under it. The
          verifier can only tighten what you signed — your{' '}
          <Link href="/repid" className="text-accent underline underline-offset-2">
            RepID
          </Link>{' '}
          sets a ceiling it will never exceed, and a payee you did not name is refused.
        </p>
      </header>

      <TrustKeysSignerPanel />

      <footer className="space-y-3 border-t border-[#1f1f23] pt-8 text-sm leading-relaxed text-[#a1a1aa]">
        <p className="max-w-[64ch]">
          Everything here runs on Base Sepolia testnet (chain 84532). The policy and job are signed
          with EIP-191 personal_sign — the same signature your wallet makes to{' '}
          <Link href="/bind" className="text-accent underline underline-offset-2">
            claim an agent
          </Link>
          . Only the signed objects and their signatures are sent; your key never is.
        </p>
      </footer>
    </div>
  );
}
