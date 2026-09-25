import Link from 'next/link';

const NEXT =
  'You have an agent. Next: verify a claim it made. Then look at the receipt. Wallet and stake stay testnet / shadow.';

export function AfterAgent() {
  return (
    <section className="px-6 py-8 bg-slate-950 text-white border-t border-slate-800">
      <div className="max-w-xl mx-auto space-y-4 text-center">
        <p className="text-base text-slate-200 leading-relaxed">{NEXT}</p>
        <p className="flex flex-wrap items-center justify-center gap-4 text-sm">
          <Link href="/docs/api-reference#cli-verify" className="text-indigo-300 underline underline-offset-2">
            verify
          </Link>
          <Link href="/docs/api-reference#cli-repid" className="text-indigo-300 underline underline-offset-2">
            repid
          </Link>
          <Link href="/docs/api-reference#cli-proof" className="text-indigo-300 underline underline-offset-2">
            proof
          </Link>
        </p>
      </div>
    </section>
  );
}
