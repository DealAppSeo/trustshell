import Link from 'next/link';
import { REPID_ENGINE_URL } from '@/lib/repid-engine';
import { TrustBadge } from '@/components/trust-state';

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

export default async function PassportPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const passport = await getPassport(agentId);

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
        <p className="text-sm text-neutral-500">
          Every fact below is a recorded fact — settlement rows, mint transactions, on-chain
          writes — never an unverified claim. Snapshot as of {fmtDate(p.as_of)}.
        </p>
      </header>

      <Section title="Identity (ERC-8004)">
        {id.registered_onchain === 'MINTED' ? (
          <>
            <Row label="Status">
              <span className="text-green-500">Registered on-chain</span> ({id.network})
            </Row>
            <Row label="Token ID">{id.token_id}</Row>
            <Row label="Registry">{id.contract_address}</Row>
            <Row label="Minted">{fmtDate(id.minted_at)}</Row>
            {id.mint_basescan_url && (
              <Row label="Mint transaction">
                <a
                  href={id.mint_basescan_url}
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
            <Row label="Token ID">{id.token_id}</Row>
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
        <Row label="Registry">{p.reputation_onchain.registry_address}</Row>
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
