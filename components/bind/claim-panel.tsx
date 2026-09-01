'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  bindAgent,
  explainBindError,
  fetchBindMessage,
  parseStatement,
  shortAddress,
  type BindOutcome,
} from '@/lib/human-bind';
import { useWallet } from './use-wallet';
import { CheckMark, PendingMark, Rule } from './marks';

/**
 * Claiming an agent.
 *
 * THE STATEMENT IS THE INTERFACE. What a person is really doing here is
 * reading one sentence and endorsing it. So the sentence is the largest, most
 * carefully set thing on the surface, and every control is subordinate to it.
 * It arrives from the engine — the code that will verify the signature writes
 * the text that gets shown — so what you read is what gets checked.
 *
 * BOTH PROMPTS ARE DISCLOSED BEFORE THE FIRST ONE OPENS. The flow needs two
 * signatures for two different questions, and a second wallet popup nobody was
 * warned about reads as a malfunction. They are listed up front, and each one
 * reports its own state as it resolves.
 */

type Phase = 'idle' | 'auth' | 'binding' | 'submitting' | 'done';

export function ClaimPanel({
  agentId,
  agentName,
  onBound,
}: {
  agentId: string;
  agentName?: string | null;
  onBound?: () => void;
}) {
  const wallet = useWallet();
  const [statement, setStatement] = useState<string | null>(null);
  const [statementFailed, setStatementFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [outcome, setOutcome] = useState<BindOutcome | null>(null);

  // The statement names the wallet, so it can only be fetched once one is
  // connected — and it must be refetched if the person switches accounts.
  useEffect(() => {
    if (!wallet.address || !agentId) return;
    let ignore = false;
    fetchBindMessage({ wallet: wallet.address, agentId }).then((s) => {
      if (ignore) return;
      setStatementFailed(!s);
      setStatement(s?.message ?? null);
    });
    return () => {
      ignore = true;
      // Clearing on the way out, not on the way in: a statement naming the
      // previous wallet must never survive into the next one, and cleanup is
      // not a cascading render.
      setStatement(null);
      setStatementFailed(false);
    };
  }, [wallet.address, agentId]);

  const claim = useCallback(async () => {
    if (!wallet.address) return;
    setOutcome(null);
    const result = await bindAgent({
      wallet: wallet.address,
      agentId,
      sign: wallet.sign,
      onStep: setPhase,
    });
    setPhase(result.ok ? 'done' : 'idle');
    setOutcome(result);
    if (result.ok) onBound?.();
  }, [wallet.address, wallet.sign, agentId, onBound]);

  const busy = phase === 'auth' || phase === 'binding' || phase === 'submitting';

  if (!wallet.ready) {
    return <div className="h-40 animate-pulse rounded-lg bg-[#141416]" aria-hidden />;
  }

  if (!wallet.available) {
    return (
      <Wall title="You need a wallet in this browser">
        <p>
          Claiming an agent means signing a statement, and only a wallet can do that. Any
          Ethereum wallet extension works — nothing is spent, and no transaction is sent.
        </p>
        <p className="text-[#a1a1aa]">
          Everything you have built so far is saved and will still be here.
        </p>
      </Wall>
    );
  }

  if (!wallet.address) {
    return (
      <div className="space-y-5">
        <p className="max-w-[62ch] text-[#a1a1aa]">
          Connect a wallet to claim this agent. An address is all that is asked for — no email,
          no name, no transaction.
        </p>
        <button
          type="button"
          onClick={wallet.connect}
          disabled={wallet.connecting}
          className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#ff9838] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {wallet.connecting ? 'Waiting for your wallet…' : 'Connect wallet'}
        </button>
        {wallet.error && <p className="text-sm text-[#fda4af]">{wallet.error}</p>}
      </div>
    );
  }

  if (outcome?.ok) {
    return (
      <Receipt agentName={agentName} agentId={agentId} wallet={wallet.address} />
    );
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="text-[#a1a1aa]">Claiming as</span>
        <span className="font-mono text-[#e4e4e7]">{shortAddress(wallet.address)}</span>
      </div>

      <section className="space-y-2.5">
        <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-[#8b97a8]">
          The statement you will sign
        </h3>
        {statementFailed ? (
          <div className="rounded-lg border border-dashed border-[#3f3f46] px-5 py-6 text-sm text-[#a1a1aa]">
            The engine did not return the statement, so there is nothing to show you yet —
            and nothing to sign. Reload and try again.
          </div>
        ) : statement ? (
          <Statement raw={statement} />
        ) : (
          <div className="h-32 animate-pulse rounded-lg bg-[#141416]" aria-hidden />
        )}
        <p className="max-w-[62ch] text-sm text-[#a1a1aa]">
          This text comes from the engine that will verify it, so what you read here is exactly
          what gets checked — the wording and spacing above are shown for reading; the exact
          characters are the ones your wallet signs. It records ownership. It moves no funds and grants no spending
          authority — that is what a{' '}
          <Link href="/grants" className="text-accent underline underline-offset-2">
            grant
          </Link>{' '}
          is for.
        </p>
      </section>

      <section className="space-y-2.5">
        <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-[#8b97a8]">
          Your wallet will ask twice
        </h3>
        <ol className="divide-y divide-[#1f1f23] overflow-hidden rounded-lg border border-[#27272a]">
          <PromptRow
            title="Prove you hold this key"
            detail="Signs the request itself, tied to this one action and the next five minutes."
            state={phase === 'idle' ? 'pending' : phase === 'auth' ? 'active' : 'done'}
          />
          <PromptRow
            title="Claim the agent"
            detail="Signs the statement above."
            state={
              phase === 'binding'
                ? 'active'
                : phase === 'submitting' || phase === 'done'
                  ? 'done'
                  : 'pending'
            }
          />
        </ol>
      </section>

      <div className="space-y-3">
        <button
          type="button"
          onClick={claim}
          disabled={busy || !statement}
          className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#ff9838] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {phase === 'auth'
            ? 'Approve the first prompt…'
            : phase === 'binding'
              ? 'Approve the second prompt…'
              : phase === 'submitting'
                ? 'Recording the claim…'
                : 'Sign and claim'}
        </button>

        {outcome && !outcome.ok && (
          <ClaimError reason={outcome.reason} detail={outcome.detail} />
        )}
      </div>
    </div>
  );
}

/**
 * The statement, set the way it is meant to be read.
 *
 * ONE STRING DOING TWO JOBS. The engine sends three machine parameters a person should read
 * character by character, and two sentences of English they should read as a sentence. In one
 * monospace block the reader is asked to do the wrong thing with half of it — so the
 * parameters keep the mono and the declaration takes the display face.
 *
 * THE ORDER IS THE ENGINE'S. Splitting the two registers is the whole change; moving a
 * document's parts around before somebody signs it is not part of it.
 *
 * WHEN THE SHAPE IS UNFAMILIAR, THE RAW TEXT WINS. `parseStatement` returns null on anything
 * it does not fully recognise and this falls back to rendering the string verbatim. A tidy
 * reconstruction shown where the real document belongs would be a rendering of our guess, at
 * the exact moment somebody decides to sign.
 */
function Statement({ raw }: { raw: string }) {
  const parsed = parseStatement(raw);

  if (!parsed) {
    return (
      <pre className="claim-statement claim-statement-raw overflow-x-auto rounded-lg border border-[#27272a] bg-[#0d0d0f] px-6 py-5 font-mono text-[13px] leading-[1.75] text-[#d4d4d8]">
        {raw}
      </pre>
    );
  }

  return (
    <div className="claim-statement space-y-5 rounded-lg border border-[#27272a] bg-[#0d0d0f] px-6 py-5">
      <p className="font-mono text-[12px] tracking-wide text-[#8b97a8]">{parsed.title}</p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono text-[13px]">
        {parsed.params.map((p) => (
          <Fragment key={p.key}>
            <dt className="text-[#8b97a8]">{p.key}</dt>
            <dd className="m-0 break-all text-[#d4d4d8]">{p.value}</dd>
          </Fragment>
        ))}
      </dl>

      <div className="border-t border-[#27272a] pt-4">
        <p className="max-w-[52ch] font-display text-[17px] leading-relaxed text-[#ededf0] [text-wrap:pretty]">
          {parsed.prose}
        </p>
      </div>

      <details className="group">
        <summary className="cursor-pointer list-none text-xs text-[#8b97a8] underline underline-offset-2 transition-colors hover:text-[#a1a1aa]">
          Show the exact text being signed
        </summary>
        <pre className="claim-statement-raw mt-3 overflow-x-auto border-t border-[#27272a] pt-3 font-mono text-[12px] leading-[1.75] text-[#a1a1aa]">
          {raw}
        </pre>
      </details>
    </div>
  );
}

/** A refusal the person can act on, plus the way out where one exists. */
function ClaimError({ reason, detail }: { reason: string; detail?: string }) {
  return (
    <div
      role="alert"
      className="space-y-2 rounded-lg border border-[#fb7185]/40 bg-[#fb7185]/[0.06] px-5 py-4 text-sm"
    >
      <p className="text-[#fda4af]">{explainBindError(reason, detail)}</p>
      {reason === 'no_account' && (
        <p className="text-[#a1a1aa]">
          Wallet accounts are not open on this deployment yet, so this is not something you can
          fix from here. It is the last switch between you and a claimed agent.
        </p>
      )}
      {reason === 'disabled' && (
        <p className="text-[#a1a1aa]">
          Everything else you have done is saved. Nothing was lost, and nothing was signed away.
        </p>
      )}
    </div>
  );
}

function PromptRow({
  title,
  detail,
  state,
}: {
  title: string;
  detail: string;
  state: 'pending' | 'active' | 'done';
}) {
  return (
    <li className="flex items-start gap-4 bg-[#131315] px-5 py-4">
      <span className="mt-0.5 shrink-0" aria-hidden>
        {state === 'done' ? <CheckMark /> : <PendingMark active={state === 'active'} />}
      </span>
      <span className="min-w-0 space-y-0.5">
        <span
          className={`block text-sm font-medium ${
            state === 'pending' ? 'text-[#a1a1aa]' : 'text-[#fafafa]'
          }`}
        >
          {title}
        </span>
        <span className="block text-[13px] leading-relaxed text-[#a1a1aa]">{detail}</span>
      </span>
    </li>
  );
}

function Receipt({
  agentName,
  agentId,
  wallet,
}: {
  agentName?: string | null;
  agentId: string;
  wallet: string;
}) {
  return (
    <div className="claim-settle space-y-5">
      <div className="flex items-center gap-2.5">
        <CheckMark />
        <h3 className="text-lg font-semibold text-[#fafafa]">
          {agentName ? `${agentName} is yours` : 'Claimed'}
        </h3>
      </div>
      <dl className="divide-y divide-[#1f1f23] overflow-hidden rounded-lg border border-[#27272a] text-sm">
        <Row label="Owner" value={shortAddress(wallet)} />
        <Row label="Agent" value={agentId} />
        <Row label="Proof" value="A signature you made, recorded against this agent" />
      </dl>
      <p className="max-w-[62ch] text-sm text-[#a1a1aa]">
        Anyone can now check this without trusting us, and you can revoke it at any time. It
        grants no spending authority on its own.
      </p>
      <Rule />
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <Link href="/bind" className="text-accent underline underline-offset-2">
          See everything you own
        </Link>
        <Link href={`/passport/${agentId}`} className="text-accent underline underline-offset-2">
          Open its passport
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 bg-[#131315] px-5 py-3">
      <dt className="w-20 shrink-0 text-[#a1a1aa]">{label}</dt>
      <dd className="min-w-0 break-all font-mono text-[13px] text-[#d4d4d8]">{value}</dd>
    </div>
  );
}

function Wall({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-[#27272a] bg-[#131315] px-6 py-5">
      <h3 className="text-base font-semibold text-[#fafafa]">{title}</h3>
      <div className="max-w-[62ch] space-y-2 text-sm leading-relaxed text-[#a1a1aa]">
        {children}
      </div>
    </div>
  );
}
