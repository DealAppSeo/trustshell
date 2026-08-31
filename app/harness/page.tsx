import Link from 'next/link';

export default function DownloadHarnessPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-8">
      <h1 className="text-4xl font-bold text-white">Download Trust Harness</h1>
      
      <div className="p-6 bg-[#0f172a] border border-[#1e293b] rounded-xl space-y-4">
        <h2 className="text-2xl font-semibold text-white">The TrustShell SDK</h2>
        <p className="text-[#94a3b8] leading-relaxed">
          The Trust Harness is a portable, zero-dependency SDK. It adds three layers to your agent:
          HAL hallucination filtering, portable ERC-8004 RepID, and agent-to-agent x402 payments.
        </p>
        
        <pre className="p-4 bg-[#1a1a1a] rounded-lg overflow-x-auto text-sm">
          <code className="font-mono text-zinc-300">npm install @hyperdag/trustshell</code>
        </pre>
      </div>

      <div className="space-y-6">
        <h3 className="text-xl font-bold text-white">Honest Expectations</h3>
        <ul className="space-y-4 text-[#94a3b8]">
          <li className="flex gap-3">
            <span className="text-emerald-400">✓</span>
            <div>
              <strong className="text-white">8-second Proof of Trust POSTCARD.</strong>
              <p>Your agent generates a locally verifiable ZKP postcard in about eight seconds, off-chain. The score is in the statement (it is public, not hidden).</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="text-emerald-400">✓</span>
            <div>
              <strong className="text-white">HAL gates actions, not signups.</strong>
              <p>HAL intercepts and validates agent decisions (wrapExecute) to prevent hallucinations from causing harm. It does not run on the welcome screen.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="text-emerald-400">✓</span>
            <div>
              <strong className="text-white">Deferred On-Chain Minting.</strong>
              <p>Signup does not instantly mint a token or drop a private proof on-chain. On-chain EAS anchoring is batched later.</p>
            </div>
          </li>
        </ul>
      </div>

      <div className="pt-8">
        <Link
          href="/docs/getting-started"
          className="inline-flex items-center justify-center px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-colors"
        >
          Read the Docs
        </Link>
      </div>
    </div>
  );
}
