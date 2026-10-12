import Link from 'next/link';
import { REPID_ENGINE_URL } from '@/lib/repid-engine';
import { TrustBadge } from '@/components/trust-state';
import {
  mintTxUrlShown,
  mintVerdictOf,
  reputationRegistryShown,
  tokenIdShown,
  twoFieldsOf,
  type RegistryShown,
} from '@/lib/erc8004-display';

// Live trust data — never serve a stale passport.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Agent Trust Passport — TrustShell',
  description:
    'The one-call answer to "should I authorize this agent?" — ERC-8004 identity, RepID reputation, x402 settlement history, and ZK proofs, all honestly labeled.',
};

type Passport = {
  passport_version: string;
  as_of: string;
  agent: {
    agent_id: string;
    agent_name: string | null;
    display_name: string | null;
    created_at: string | null;
  };
  reputation: { repid_score: number; tier: string | null; activity_30d: number };
  identity_erc8004: {
    // Three states, never two — see repid-engine src/services/agent-passport.ts. `false` used to
    // mean both "nothing was minted" and "we never checked", and tokens in the second group are
    // live on chain. UNVERIFIED must never render as a denial.
    registered_onchain: 'MINTED' | 'UNVERIFIED' | 'NOT_MINTED';
    token_id: string | null;
    contract_address: string | null;
    network: string | null;
    mint_tx_hash: string | null;
    mint_basescan_url: string | null;
    minted_at: string | null;
    conservator_address: string | null;
    live_verification_endpoint: string;
  };
  payments_x402: {
    real_settlements: number;
    simulated_settlements: number;
    last_real_settlement: {
      tx_hash: string;
      basescan_url: string | null;
      amount_base_units: number;
      asset: string | null;
      at: string | null;
    } | null;
    policy: string;
  };
  reputation_onchain: {
    registry_address: string;
    network: string;
    writes: number;
    last_write: { tx_hash: string | null; at: string | null; basescan_url: string | null } | null;
  };
  zkp: {
    latest_proof: {
      scheme: string | null;
      cryptographically_verifiable: boolean;
      eas_attestation_uid: string | null;
      created_at: string | null;
    } | null;
    disclosure: string;
    proof_endpoint: string;
    verify_endpoint: string;
  };
};

async function getPassport(agentId: string): Promise<Passport | null | 'error'> {
  try {
    const res = await fetch(
      `${REPID_ENGINE_URL}/api/v1/passport/${encodeURIComponent(agentId)}`,
      { cache: 'no-store' }
    );
    if (res.status === 404) return null;
    if (!res.ok) return 'error';
    return (await res.json()) as Passport;
  } catch {
    return 'error';
  }
}

/**
 * The engine's live ownerOf read for this passport's agent (GET /api/v1/agents/:id/onchain), made ONLY when the
 * passport says MINTED, because that is the only state that would say "on-chain" (E-1: the engine's MINTED is a
 * record of a mint transaction, not a reading of the chain). `undefined` = no read was needed; `null` = it was needed
 * and could not be made or did not answer, which the verdict reads as "did not confirm", never as an absence.
 */
async function getOnChain(p: Passport): Promise<unknown> {
  if (p.identity_erc8004?.registered_onchain !== 'MINTED') return undefined;
  const named = p.agent?.agent_id;
  if (typeof named !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(named)) return null;
  try {
    const res = await fetch(`${REPID_ENGINE_URL}/api/v1/agents/${encodeURIComponent(named)}/onchain`, { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function TierBadge({ tier }: { tier: string | null }) {
  return (
    <span className="inline-block rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-sm font-semibold text-amber-500">
      {tier ?? 'UNKNOWN'}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-neutral-800 p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-1 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-48 shrink-0 text-sm text-neutral-400">{label}</span>
      <span className="break-all text-sm">{children}</span>
    </div>
  );
}

/**
 * RepID is TWO fields and this block keeps them apart: the SCORE says how the agent has behaved, the
 * ID says which agent it is. Neither proves the other. The ID is read through lib/erc8004-display.ts,
 * so a placeholder or a transaction hash in the engine's data is shown as Not checked, never as an ID.
 */
function TwoFieldBlock({ passport, onChain }: { passport: Passport; onChain: unknown }) {
  const f = twoFieldsOf(passport, onChain);
  return (
    <div data-testid="two-fields" className="grid gap-3 rounded-lg border border-neutral-800 p-4 sm:grid-cols-2">
      <div data-testid="field-score">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Field 1 · Score</p>
        <p className="mt-1 text-2xl font-bold">{f.score ?? 'Not checked'}</p>
        <p className="text-xs text-neutral-500">How this agent has behaved. {f.tier ? `Tier ${f.tier}.` : ''}</p>
      </div>
      <div data-testid="field-id">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Field 2 · ERC-8004 ID</p>
        <p className="mt-1 text-2xl font-bold">
          {f.token.state === 'ID' ? `#${f.token.id}` : f.mint === 'NOT_MINTED' ? 'None yet' : 'Not checked'}
        </p>
        <p className="text-xs text-neutral-500" data-testid="field-id-state">
          {f.mint === 'MINTED'
            ? 'Registered on-chain: the engine\'s live ownerOf read found an owner for this token.'
            : f.recordedMint
              ? `Not checked: ${f.why}. Recorded, not verified.`
              : f.mint === 'UNVERIFIED'
                ? 'Has a token id; this service has no record of the mint transaction. Not the same as not minted.'
                : f.mint === 'NOT_MINTED'
                  ? 'Off-chain only: no ERC-8004 token has been minted for this agent.'
                  : 'The engine did not say clearly. Not checked.'}
        </p>
      </div>
      <p className="text-xs text-neutral-500 sm:col-span-2">
        Two different things. The score does not prove the ID, and the ID does not prove the score.
      </p>
    </div>
  );
}

/** A registry address the guard allowed, or NOT_CHECKED with the reason. Never the engine's raw string. */
function RegistryValue({ shown }: { shown: RegistryShown }) {
  return shown.state === 'CANONICAL' ? (
    <span className="font-mono" data-testid="registry-address">
      {shown.address}
    </span>
  ) : (
    <span data-testid="registry-not-checked">
      <TrustBadge state="NOT_CHECKED" detail={shown.reason} />
    </span>
  );
}

function TokenValue({ raw }: { raw: unknown }) {
  const t = tokenIdShown(raw);
  return t.state === 'ID' ? <span data-testid="token-id">{t.id}</span> : <TrustBadge state="NOT_CHECKED" detail={t.reason} />;
}

export default async function PassportPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const passport = await getPassport(agentId);
  const onChain = passport && passport !== 'error' ? await getOnChain(passport) : undefined;

  if (passport === 'error') {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-12">
        <h1 className="text-2xl font-bold">Agent Trust Passport</h1>
        <p className="text-neutral-400">
          The passport service is unreachable right now. Nothing is shown rather than showing
          stale or guessed data — try again shortly.
        </p>
      </div>
    );
  }

  if (passport === null) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-12">
        <h1 className="text-2xl font-bold">Agent Trust Passport</h1>
        <p className="text-neutral-400">
          No agent found for <code className="text-neutral-200">{agentId}</code>. You can look up
          agents by UUID, ERC-8004 token id, or name.
        </p>
        <Link href="/agents" className="text-amber-500 underline">
          Browse minted agents →
        </Link>
      </div>
    );
  }

  const p = passport;
  const id = p.identity_erc8004;
  // MINTED here means VERIFIED (canonical registry AND the engine's live ownership read). The engine's own word is a record.
  const verdict = mintVerdictOf(id, onChain);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-500">
          Agent Trust Passport · ERC-8004 + x402 + RepID
        </p>
        <h1 className="text-3xl font-bold">{p.agent.display_name ?? p.agent.agent_id}</h1>
        <div className="flex items-center gap-3">
          <TierBadge tier={p.reputation.tier} />
          <span className="text-2xl font-bold">{p.reputation.repid_score}</span>
          <span className="text-sm text-neutral-400">RepID</span>
        </div>
        <TwoFieldBlock passport={p} onChain={onChain} />
        <p className="text-sm text-neutral-500">
          Every fact below is a recorded fact — settlement rows, mint transactions, on-chain
          writes — never an unverified claim. Snapshot as of {fmtDate(p.as_of)}.
        </p>
      </header>

      <Section title="Identity (ERC-8004)">
        {verdict.state === 'MINTED' ? (
          <>
            <Row label="Status">
              <span className="text-green-500" data-testid="mint-verified">Registered on-chain</span> ({id.network})
            </Row>
            <Row label="Verified by">
              The engine&apos;s live <code>ownerOf()</code> read found an owner for this token on the canonical IdentityRegistry
              {verdict.onChain?.ownerMatchesRecord === false ? '. That owner is NOT the conservator the engine has on record.' : '.'}
            </Row>
            <Row label="Token ID">
              <TokenValue raw={id.token_id} />
            </Row>
            <Row label="Registry">
              <RegistryValue shown={verdict.registry} />
            </Row>
            <Row label="Minted">{fmtDate(id.minted_at)}</Row>
            {mintTxUrlShown(id.mint_basescan_url) && (
              <Row label="Mint transaction">
                <a
                  href={mintTxUrlShown(id.mint_basescan_url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-500 underline"
                >
                  View on BaseScan →
                </a>
              </Row>
            )}
            <Row label="Live check">
              <a
                href={`${REPID_ENGINE_URL}${id.live_verification_endpoint}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-500 underline"
              >
                Cross-verify ownerOf() on-chain now →
              </a>
            </Row>
          </>
        ) : verdict.recorded ? (
          <>
            {/*
              E-1. The engine RECORDS a mint transaction for this agent, but the registry it recorded is not the
              canonical IdentityRegistry, or the engine's live ownerOf read did not find an owner for this token. The
              record is shown for what it is, a record, beside NOT_CHECKED: never "Registered on-chain".
            */}
            <Row label="Status">
              <span data-testid="mint-not-checked">
                <TrustBadge state="NOT_CHECKED" detail={verdict.why ?? 'recorded as minted, not confirmed on chain'} />
              </span>
            </Row>
            <Row label="Token ID (recorded)">
              <TokenValue raw={id.token_id} />
            </Row>
            <Row label="Registry (recorded)">
              <RegistryValue shown={verdict.registry} />
            </Row>
            <Row label="Minted (recorded)">{fmtDate(id.minted_at)}</Row>
            {mintTxUrlShown(id.mint_basescan_url) && (
              <Row label="Mint transaction (recorded)">
                <a
                  href={mintTxUrlShown(id.mint_basescan_url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-500 underline"
                >
                  View on BaseScan →
                </a>
              </Row>
            )}
            <Row label="Live check">
              <a
                href={`${REPID_ENGINE_URL}${id.live_verification_endpoint}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-500 underline"
              >
                Cross-verify ownerOf() on-chain now →
              </a>
            </Row>
          </>
        ) : id.registered_onchain === 'UNVERIFIED' ? (
          <>
            {/*
              NOT a denial. This agent has a token id; what is missing is OUR record of the mint
              transaction. Measured 2026-08-30: tokens in exactly this state return a real owner
              from ownerOf() on the live registry — one of them the conservator address this same
              passport prints. Rendering it as "off-chain only", which is what the old boolean did,
              told visitors an identity did not exist while the chain was holding it.
            */}
            <Row label="Status">
              <TrustBadge
                state="NOT_CHECKED"
                detail="a token id exists; this service has no record of the mint transaction"
              />
            </Row>
            <Row label="Token ID">
              <TokenValue raw={id.token_id} />
            </Row>
            <Row label="Resolve it">
              <a
                href={`${REPID_ENGINE_URL}${id.live_verification_endpoint}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-500 underline"
              >
                Cross-verify ownerOf() on-chain now →
              </a>
            </Row>
          </>
        ) : (
          <Row label="Status">
            <span className="text-neutral-400">
              Off-chain only — no ERC-8004 token has been minted for this agent.
            </span>
          </Row>
        )}
      </Section>

      <Section title="Payments (x402)">
        <Row label="Real settlements">{p.payments_x402.real_settlements}</Row>
        <Row label="Simulated settlements">{p.payments_x402.simulated_settlements}</Row>
        {p.payments_x402.last_real_settlement && (
          <Row label="Last real settlement">
            {p.payments_x402.last_real_settlement.asset ?? ''}{' '}
            {p.payments_x402.last_real_settlement.basescan_url ? (
              <a
                href={p.payments_x402.last_real_settlement.basescan_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-500 underline"
              >
                {fmtDate(p.payments_x402.last_real_settlement.at)} →
              </a>
            ) : (
              fmtDate(p.payments_x402.last_real_settlement.at)
            )}
          </Row>
        )}
        <p className="pt-2 text-xs text-neutral-500">{p.payments_x402.policy}</p>
      </Section>

      <Section title="On-chain reputation (ERC-8004 ReputationRegistry)">
        <Row label="Feedback writes">{p.reputation_onchain.writes}</Row>
        <Row label="Registry">
          <RegistryValue shown={reputationRegistryShown(p.reputation_onchain.registry_address)} />
        </Row>
        <Row label="Network">{p.reputation_onchain.network}</Row>
        {p.reputation_onchain.last_write?.basescan_url && (
          <Row label="Last write">
            <a
              href={p.reputation_onchain.last_write.basescan_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-500 underline"
            >
              {fmtDate(p.reputation_onchain.last_write.at)} →
            </a>
          </Row>
        )}
      </Section>

      <Section title="Zero-knowledge proof">
        {p.zkp.latest_proof ? (
          <>
            <Row label="Scheme">{p.zkp.latest_proof.scheme ?? '—'}</Row>
            <Row label="Cryptographically verifiable">
              {p.zkp.latest_proof.cryptographically_verifiable ? (
                <span className="text-green-500">yes</span>
              ) : (
                <span className="text-neutral-400">no (stub/fallback proof)</span>
              )}
            </Row>
            <Row label="EAS anchor">{p.zkp.latest_proof.eas_attestation_uid ?? '—'}</Row>
            <Row label="Generated">{fmtDate(p.zkp.latest_proof.created_at)}</Row>
          </>
        ) : (
          <Row label="Status">
            <span className="text-neutral-400">No proof generated for this agent yet.</span>
          </Row>
        )}
        <p className="pt-2 text-xs text-neutral-500">{p.zkp.disclosure}</p>
      </Section>

      <footer className="space-y-2 border-t border-neutral-800 pt-6 text-sm text-neutral-500">
        <p>
          Raw JSON:{' '}
          <a
            href={`${REPID_ENGINE_URL}/api/v1/passport/${encodeURIComponent(p.agent.agent_id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-500 underline"
          >
            /api/v1/passport/{p.agent.agent_id}
          </a>
        </p>
        <p>
          All activity is on Base Sepolia testnet. RepID weights are actively being tuned — that
          is what this public test period is for.{' '}
          <Link href="/repid" className="text-amber-500 underline">
            Help shape the algorithm →
          </Link>
        </p>
      </footer>
    </div>
  );
}
