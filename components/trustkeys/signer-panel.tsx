'use client';

import { useCallback, useMemo, useState } from 'react';
import { useWallet } from '@/components/bind/use-wallet';
import { shortAddress } from '@/lib/human-bind';
import { REPID_ENGINE_URL, usdcToRaw } from '@/lib/repid-engine';
import {
  buildJob,
  buildPolicy,
  canonicalize,
  randomNonce,
  signJob,
  signPolicy,
  submitJob,
  type Job,
  type MessageSigner,
  type Policy,
  type SubmitResult,
} from '@/lib/trustkeys-signer';

/**
 * TrustKeys reference-tier signer — the owner's box.
 *
 * "NO KEY ON OUR DISK". This panel signs a policy once and a job per action with the connected
 * wallet, then POSTs only the signed objects + signatures to the verifier. It never asks for,
 * stores, logs, or displays a private key — the key lives in the wallet and is used only through
 * the browser's own signing prompt. The wallet it uses is the existing bind-flow wallet hook, so
 * `signMessage` is the same EIP-191 personal_sign the engine's verifier recovers.
 *
 * THREE OUTCOMES. The result below is the verifier's own verdict: `verified` with a receipt,
 * `refused` with the verifier's reason, or `could_not_check` when nobody looked (a network/parse
 * failure, or the verifier's honest 503). "Could not check" is never shown as verified.
 */

// 1 USDC-cent granularity in the UI; the engine stores raw 6-decimal micro-USDC integers.
const DEFAULT_TOKEN = 'USDC';

type Phase = 'idle' | 'signing-policy' | 'signing-job' | 'submitting';

export function TrustKeysSignerPanel() {
  const wallet = useWallet();

  // Policy inputs.
  const [policyCapUsdc, setPolicyCapUsdc] = useState('1000');
  const [token, setToken] = useState(DEFAULT_TOKEN);
  const [payee, setPayee] = useState('');
  const [policyMinutes, setPolicyMinutes] = useState('60');

  // Job inputs.
  const [action, setAction] = useState('spend');
  const [jobCapUsdc, setJobCapUsdc] = useState('1');
  const [jobMinutes, setJobMinutes] = useState('30');

  // Signed artefacts + verdict.
  const [signedPolicy, setSignedPolicy] = useState<{ policy: Policy; policy_signature: string } | null>(null);
  const [signedJob, setSignedJob] = useState<{ job: Job; job_signature: string } | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  // The connected wallet, adapted to the signer's one-method interface. `wallet.sign` IS
  // `(message) => Promise<string>` (a BrowserProvider signMessage under the hood), so no key is
  // ever handled here — only a string handed to the wallet and a signature received back.
  const signer: MessageSigner = useMemo(() => ({ signMessage: wallet.sign }), [wallet.sign]);

  const nowS = () => Math.floor(Date.now() / 1000);
  const minutesToExpiry = (mins: string) => nowS() + Math.max(1, Math.round(Number(mins) || 0)) * 60;

  const isDeclined = (e: unknown) =>
    (e as { code?: number })?.code === 4001 || /reject|denied|declin/i.test((e as { message?: string })?.message ?? '');

  const signThePolicy = useCallback(async () => {
    if (!wallet.address) return;
    setError(null);
    setResult(null);
    setSignedJob(null);
    try {
      const policy = buildPolicy({
        owner: wallet.address,
        cap: usdcToRaw(Number(policyCapUsdc)),
        token,
        payees: [payee.trim()],
        expiry: minutesToExpiry(policyMinutes),
        policyNonce: randomNonce(),
      });
      setPhase('signing-policy');
      const { signature } = await signPolicy(signer, policy);
      setSignedPolicy({ policy, policy_signature: signature });
    } catch (e) {
      setError(isDeclined(e) ? 'Signature declined — nothing was signed.' : (e as Error).message || 'Could not sign the policy.');
    } finally {
      setPhase('idle');
    }
  }, [wallet.address, signer, policyCapUsdc, token, payee, policyMinutes]);

  const signAndSubmitJob = useCallback(async () => {
    if (!wallet.address || !signedPolicy) return;
    setError(null);
    setResult(null);
    try {
      const job = buildJob({
        owner: wallet.address,
        action: action.trim(),
        cap: usdcToRaw(Number(jobCapUsdc)),
        payee: payee.trim(),
        expiry: minutesToExpiry(jobMinutes),
        nonce: randomNonce(),
      });
      setPhase('signing-job');
      const { signature: job_signature } = await signJob(signer, job);
      setSignedJob({ job, job_signature });

      setPhase('submitting');
      const verdict = await submitJob(REPID_ENGINE_URL, {
        policy: signedPolicy.policy,
        policy_signature: signedPolicy.policy_signature,
        job,
        job_signature,
      });
      setResult(verdict);
    } catch (e) {
      setError(isDeclined(e) ? 'Signature declined — nothing was submitted.' : (e as Error).message || 'Could not sign the job.');
    } finally {
      setPhase('idle');
    }
  }, [wallet.address, signer, signedPolicy, action, jobCapUsdc, payee, jobMinutes]);

  const busy = phase !== 'idle';
  const payeeLooksOk = /^0x[0-9a-fA-F]{40}$/.test(payee.trim());

  if (!wallet.ready) return <div className="h-40 animate-pulse rounded-lg bg-[#141416]" aria-hidden />;

  if (!wallet.available) {
    return (
      <Wall title="You need a wallet in this browser">
        <p>
          Signing a policy and a job is what authorizes an agent to spend — and only a wallet can
          sign. Any Ethereum wallet extension works. Nothing is spent here, and no transaction is
          sent: your key never leaves the wallet, and we never see it.
        </p>
      </Wall>
    );
  }

  if (!wallet.address) {
    return (
      <div className="space-y-5">
        <p className="max-w-[62ch] text-[#a1a1aa]">
          Connect a wallet to sign a policy and a job. An address is all that is asked for — no
          email, no name, and <strong className="text-[#ededf0]">never a private key</strong>.
        </p>
        <button type="button" onClick={wallet.connect} disabled={wallet.connecting} className={btn}>
          {wallet.connecting ? 'Waiting for your wallet…' : 'Connect wallet'}
        </button>
        {wallet.error && <p className="text-sm text-[#fda4af]">{wallet.error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="text-[#a1a1aa]">Signing as</span>
        <span className="font-mono text-[#e4e4e7]">{shortAddress(wallet.address)}</span>
        <span className="text-[#6b7280]">· key stays in your wallet, on this box</span>
      </div>

      {/* STEP 1 — the policy, signed once. */}
      <section className="space-y-4">
        <StepHead n={1} title="Sign a spending policy" done={!!signedPolicy}>
          The ceiling and the allowed payee, signed once. Every job is checked against it.
        </StepHead>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Policy cap (USDC)">
            <input className={input} inputMode="decimal" value={policyCapUsdc} onChange={(e) => setPolicyCapUsdc(e.target.value)} disabled={!!signedPolicy || busy} />
          </Field>
          <Field label="Token">
            <input className={input} value={token} onChange={(e) => setToken(e.target.value)} disabled={!!signedPolicy || busy} />
          </Field>
          <Field label="Allowed payee address">
            <input className={input + ' font-mono'} placeholder="0x…" value={payee} onChange={(e) => setPayee(e.target.value)} disabled={!!signedPolicy || busy} />
          </Field>
          <Field label="Policy valid for (minutes)">
            <input className={input} inputMode="numeric" value={policyMinutes} onChange={(e) => setPolicyMinutes(e.target.value)} disabled={!!signedPolicy || busy} />
          </Field>
        </div>
        {!signedPolicy ? (
          <button type="button" onClick={signThePolicy} disabled={busy || !payeeLooksOk} className={btn}>
            {phase === 'signing-policy' ? 'Approve the prompt…' : 'Sign policy'}
          </button>
        ) : (
          <SignedNote>
            Policy signed. Allowed payee <span className="font-mono">{shortAddress(payee.trim())}</span>, up to {policyCapUsdc} {token}.
          </SignedNote>
        )}
        {!payeeLooksOk && payee.trim() !== '' && <p className="text-sm text-[#fcd34d]">That does not look like a 0x address (40 hex characters).</p>}
      </section>

      {/* STEP 2 — the job, signed and submitted. */}
      <section className={`space-y-4 ${signedPolicy ? '' : 'pointer-events-none opacity-45'}`}>
        <StepHead n={2} title="Sign a job and verify it" done={result?.outcome === 'verified'}>
          One action under the policy. It is signed, then sent to the verifier, which never receives a key.
        </StepHead>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Action">
            <input className={input} value={action} onChange={(e) => setAction(e.target.value)} disabled={busy} />
          </Field>
          <Field label="Job cap (USDC)">
            <input className={input} inputMode="decimal" value={jobCapUsdc} onChange={(e) => setJobCapUsdc(e.target.value)} disabled={busy} />
          </Field>
          <Field label="Job valid for (minutes)">
            <input className={input} inputMode="numeric" value={jobMinutes} onChange={(e) => setJobMinutes(e.target.value)} disabled={busy} />
          </Field>
        </div>
        <button type="button" onClick={signAndSubmitJob} disabled={busy || !signedPolicy} className={btn}>
          {phase === 'signing-job' ? 'Approve the prompt…' : phase === 'submitting' ? 'Verifying…' : 'Sign job and verify'}
        </button>
      </section>

      {error && (
        <p role="alert" className="text-sm text-[#fda4af]">
          {error}
        </p>
      )}

      {result && <Verdict result={result} action={signedJob?.job.action} />}
    </div>
  );
}

/** The verifier's verdict, shown honestly — verified / refused / could-not-check, never collapsed. */
function Verdict({ result, action }: { result: SubmitResult; action?: string }) {
  if (result.outcome === 'verified') {
    const r = result.receipt;
    return (
      <div className="space-y-4 rounded-lg border border-[#34d399]/40 bg-[#34d399]/[0.06] px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#34d399]">Verified</p>
        <p className="max-w-[62ch] text-sm leading-relaxed text-[#6ee7b7]">
          The verifier recovered your signature, found the job inside your signed policy, and recorded a receipt. No key, and no raw payee address, ever left your box.
        </p>
        <dl className="divide-y divide-[#1f1f23] overflow-hidden rounded-lg border border-[#27272a] text-sm">
          <Row label="Action" value={r.action} />
          <Row label="Cap" value={`${r.cap} (raw)`} />
          <Row label="Payee hash" value={r.payee_hash} />
          <Row label="Chain" value={String(r.chain_id)} />
          <Row label="Status" value={r.signature_status} />
          <Row label="Recorded" value={r.time} />
        </dl>
      </div>
    );
  }

  const couldNotCheck = result.outcome === 'could_not_check';
  const tone = couldNotCheck ? '#fcd34d' : '#fb7185';
  return (
    <div role="alert" className="space-y-2 rounded-lg px-5 py-4" style={{ border: `1px solid ${tone}66`, background: `${tone}10` }}>
      <p className="text-xs font-medium uppercase tracking-[0.14em]" style={{ color: tone }}>
        {couldNotCheck ? 'Could not check' : 'Refused'}
      </p>
      <p className="text-sm" style={{ color: couldNotCheck ? '#fde68a' : '#fda4af' }}>
        {result.message}
      </p>
      <p className="text-xs text-[#8b97a8]">
        {couldNotCheck
          ? 'Nobody verified or refused this — it was not checked. Nothing was recorded.'
          : `The verifier declined "${action ?? 'this job'}" (${result.error}). Nothing was recorded.`}
      </p>
    </div>
  );
}

const btn =
  'rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#ff9838] disabled:cursor-not-allowed disabled:opacity-60';
const input = 'w-full rounded-md border border-[#27272a] bg-[#0d0d0f] px-3 py-2 text-sm text-[#e4e4e7] outline-none focus:border-accent';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium uppercase tracking-[0.1em] text-[#8b97a8]">{label}</span>
      {children}
    </label>
  );
}

function StepHead({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="flex items-center gap-2.5 text-base font-semibold text-[#fafafa]">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${done ? 'bg-[#34d399] text-black' : 'bg-[#27272a] text-[#a1a1aa]'}`}>
          {done ? '✓' : n}
        </span>
        {title}
      </h3>
      <p className="max-w-[62ch] text-sm leading-relaxed text-[#a1a1aa]">{children}</p>
    </div>
  );
}

function SignedNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[#5eead4]">{children}</p>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 bg-[#131315] px-5 py-3">
      <dt className="w-28 shrink-0 text-[#a1a1aa]">{label}</dt>
      <dd className="min-w-0 break-all font-mono text-[13px] text-[#d4d4d8]">{value}</dd>
    </div>
  );
}

function Wall({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-[#27272a] bg-[#131315] px-6 py-5">
      <h3 className="text-base font-semibold text-[#fafafa]">{title}</h3>
      <div className="max-w-[62ch] space-y-2 text-sm leading-relaxed text-[#a1a1aa]">{children}</div>
    </div>
  );
}
