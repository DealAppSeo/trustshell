/**
 * The /build page's charts. Every number comes from lib/build-ledger.json (Lane D's chart ledger,
 * re-checked against its sources by `node claims-charts.mjs --check`) or from the sample receipt
 * it names (public/samples/inspect-39619591025/record.json); tests/build-ledger.test.ts fails if
 * the two disagree or a served file stops matching its printed sha-256. Each chart is real HTML
 * text (a list or a table), so it reads the same without its bars.
 */
import type { ReactNode } from 'react';
import ledger from '@/lib/build-ledger.json';
import sample from '@/public/samples/inspect-39619591025/record.json';
import { TrustBadge } from '@/components/trust-state';
import { Reveal } from './reveal';

type Verdict = 'SUPPORTED' | 'CONTRADICTED' | 'NOT_CHECKED';

export const SAMPLE_DIR = '/samples/inspect-39619591025';
export const RUN_URL = sample.record.observation.url;
const RECORDED = new Date(sample.record.observation.fetchedAt);
export const RECORDED_LABEL = `${RECORDED.getUTCDate()} October ${RECORDED.getUTCFullYear()}, ${RECORDED.toISOString().slice(11, 16)} UTC`;

const VERDICT: Record<Verdict, { word: string; chip: string; fill: string }> = {
  SUPPORTED: { word: 'Supported', chip: 'border-[#2dd4bf]/45 text-[#5eead4] bg-[#2dd4bf]/8', fill: 'bg-[#2dd4bf]/70' },
  CONTRADICTED: { word: 'Contradicted', chip: 'border-[#fb7185]/50 text-[#fda4af] bg-[#fb7185]/8', fill: 'bg-[#fb7185]/75' },
  NOT_CHECKED: { word: 'Not checked', chip: 'border-dashed border-[#8b97a8]/60 text-[#a8b3c2]', fill: 'border-2 border-dashed border-[#8b97a8]/70' },
};

/** The card's own three verdict words, with an icon each, never colour alone (as components/trust-state.tsx). */
export function VerdictChip({ verdict }: { verdict: Verdict }) {
  const v = VERDICT[verdict];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${v.chip}`}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        {verdict === 'NOT_CHECKED' ? (
          <circle cx="6" cy="6" r="5" strokeDasharray="2.2 1.8" />
        ) : (
          <>
            <circle cx="6" cy="6" r="5" />
            {verdict === 'SUPPORTED' ? (
              <path d="M3.6 6.2 5.3 7.9 8.5 4.3" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M4 8 8 4" strokeLinecap="round" />
            )}
          </>
        )}
      </svg>
      {v.word}
    </span>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-amber-400 underline underline-offset-4 hover:text-amber-300">
      {children}
    </a>
  );
}

const claims = sample.record.claims as { claim: string; sentence: string; status: Verdict; scope: string; reason: string }[];
const contradicted = claims.find((c) => c.status === 'CONTRADICTED')!;
const head12 = ledger.sample_check.run_head_sha.slice(0, 12);

/** Chart 1: the claim, the evidence, the verdict. In the first viewport, so it plays from CSS on load. */
export function Explainer() {
  const steps: { title: string; body: ReactNode; tone?: 'verdict' }[] = [
    {
      title: 'Agent claim',
      body: <q className="text-white">{contradicted.sentence}</q>,
    },
    {
      title: 'Actual evidence',
      body: (
        <>
          GitHub&apos;s record of run {ledger.sample_check.run_id}: conclusion {ledger.sample_check.run_conclusion}, on commit{' '}
          <code className="font-mono text-[0.95em] text-white">{head12}</code>. <Ext href={RUN_URL}>Open the run</Ext>
        </>
      ),
    },
    {
      title: 'TrustShell verdict',
      tone: 'verdict',
      body: (
        <>
          <span className="flex flex-wrap items-center gap-2">
            <VerdictChip verdict="CONTRADICTED" />
            <code className="font-mono text-[0.95em] text-white">{contradicted.claim}</code>
          </span>
          <span className="mt-2 block">{contradicted.reason}</span>
        </>
      ),
    },
  ];
  return (
    <figure className="min-w-0">
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="anim-load-in" style={{ ['--d' as string]: `${i * 220}ms` }}>
            {i > 0 && (
              <span aria-hidden="true" className="mb-3 ml-6 block h-5 w-px bg-slate-600 anim-load-grow-y" style={{ ['--d' as string]: `${i * 220 - 120}ms` }} />
            )}
            <div
              className={`rounded-lg border px-4 py-3 ${
                s.tone === 'verdict' ? 'border-[#fb7185]/45 bg-[#fb7185]/[0.06]' : 'border-slate-800 bg-[#0b1220]'
              }`}
            >
              <p className="text-sm font-semibold text-slate-400">
                <span className="mr-2 font-mono text-slate-400">{i + 1}</span>
                {s.title}
              </p>
              <div className="mt-1 text-base leading-relaxed text-slate-300">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
      <figcaption className="mt-4 space-y-1 text-sm leading-relaxed text-slate-400">
        <span className="block">
          A reproducible sample challenge: we wrote this claim so anyone can rerun it. It is not an observed agent
          failure.
        </span>
        <span className="block">
          Full receipt: <Ext href={`${SAMPLE_DIR}/card.html`}>the card</Ext> and its{' '}
          <Ext href={`${SAMPLE_DIR}/record.json`}>record.json</Ext>, recorded {RECORDED_LABEL}. record.json sha-256{' '}
          <code className="break-all font-mono text-xs text-slate-300">{ledger.sample_check.record_sha256_of_file}</code>
        </span>
      </figcaption>
    </figure>
  );
}

/** Chart 2: one check, five verdicts, each with the scope the card gives it. */
export function VerdictBreakdown() {
  const n = ledger.sample_check.verdict_counts;
  const order: Verdict[] = ['CONTRADICTED', 'SUPPORTED', 'NOT_CHECKED'];
  const rows = order.flatMap((v) => claims.filter((c) => c.status === v));
  return (
    <Reveal>
      <figure className="min-w-0">
        <p className="text-base font-semibold text-white">
          One check, five verdicts: {n.SUPPORTED} supported · {n.CONTRADICTED} contradicted · {n.NOT_CHECKED} not checked
        </p>
        <div aria-hidden="true" className="mt-3 flex h-3 gap-1">
          {rows.map((c, i) => (
            <span key={i} className={`h-full flex-1 rounded-sm anim-grow-x ${VERDICT[c.status].fill}`} style={{ ['--d' as string]: `${i * 120}ms` }} />
          ))}
        </div>
        <ul className="mt-4 space-y-3">
          {rows.map((c, i) => (
            <li key={i} className="anim-in text-sm leading-relaxed text-slate-300" style={{ ['--d' as string]: `${300 + i * 120}ms` }}>
              <span className="flex flex-wrap items-center gap-2">
                <VerdictChip verdict={c.status} />
                <code className="font-mono text-[0.95em] text-white">{c.claim}</code>
              </span>
              <span className="mt-1 block text-slate-400">{c.scope}</span>
            </li>
          ))}
        </ul>
        <figcaption className="mt-3 text-sm text-slate-400">
          Each verdict covers only the scope written under it. From the <Ext href={`${SAMPLE_DIR}/card.html`}>sample receipt</Ext>.
        </figcaption>
      </figure>
    </Reveal>
  );
}

/** Chart 3: the third-party ERC-8004 study, by chain. */
export function StudyBars() {
  const s = ledger.study;
  const series = [
    { key: 'reviewers_sybil_pct' as const, label: 'Reviewers with coordinated Sybil behaviour', fill: 'bg-slate-300' },
    { key: 'agents_no_valid_feedback_pct' as const, label: 'Rated agents left with no valid feedback', fill: 'bg-slate-500' },
  ];
  return (
    <Reveal>
      <figure className="min-w-0">
        <table className="w-full border-collapse text-sm">
          <caption className="mb-3 text-left text-base font-semibold text-white">ERC-8004 reputation, by chain</caption>
          <thead>
            <tr className="text-left text-slate-400">
              <th scope="col" className="w-20 pb-2 font-medium">Chain</th>
              {series.map((x) => (
                <th key={x.key} scope="col" className="pb-2 pl-3 font-medium">
                  {x.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.chains.map((chain, i) => (
              <tr key={chain} className="border-t border-slate-800">
                <th scope="row" className="py-2 text-left font-medium text-white">
                  {chain}
                </th>
                {series.map((x, j) => (
                  <td key={x.key} className="py-2 pl-3 align-middle">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 min-w-0 flex-1 rounded-sm bg-slate-800">
                        <span
                          aria-hidden="true"
                          className={`block h-full rounded-sm anim-grow-x ${x.fill}`}
                          style={{ width: `${s[x.key][i]}%`, ['--d' as string]: `${(i * 2 + j) * 100}ms` }}
                        />
                      </span>
                      <span className="w-12 shrink-0 text-right tabular-nums text-slate-200">{s[x.key][i]}%</span>
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <figcaption className="mt-3 text-sm leading-relaxed text-slate-400">
          A third-party study, not our measurement: <Ext href={s.url}>Xiong et al., arXiv:2606.26028 v3</Ext> (revised{' '}
          {s.revised}), data through 13 May 2026.
        </figcaption>
      </figure>
    </Reveal>
  );
}

/** Chart 4: our own 34 settled trades, by how well the two owners are proven to differ. */
export function TradesBar() {
  const o = ledger.owner_distinct;
  const parts = [
    { n: o.counts.distinct_strong, label: 'Different owners, proven', fill: 'bg-[#2dd4bf]/70' },
    { n: o.counts.distinct_administrative, label: 'Different owners in our records, unsigned', fill: 'bg-slate-300' },
    { n: o.counts.same_strong + o.counts.same_administrative, label: 'Same owner', fill: 'bg-slate-500' },
    { n: o.counts.unknown_none, label: 'Unknown', fill: 'border-2 border-dashed border-slate-500' },
  ];
  return (
    <Reveal>
      <figure className="min-w-0">
        <p className="text-base font-semibold text-white">Our agents&apos; {o.total} settled trades, 30 days to 21 October 2026</p>
        <div aria-hidden="true" className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-sm">
          {parts
            .filter((p) => p.n > 0)
            .map((p, i) => (
              <span key={p.label} className={`h-full anim-grow-x ${p.fill}`} style={{ width: `${(p.n / o.total) * 100}%`, ['--d' as string]: `${i * 150}ms` }} />
            ))}
        </div>
        <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm text-slate-300 sm:grid-cols-2">
          {parts.map((p) => (
            <li key={p.label} className="flex items-center gap-2">
              <span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-sm ${p.n === 0 ? 'border border-[#2dd4bf]/70' : p.fill}`} />
              <span>
                <span className="font-semibold tabular-nums text-white">{p.n}</span> {p.label}
              </span>
            </li>
          ))}
        </ul>
        <figcaption className="mt-3 text-sm text-slate-400">From our own database; not independently checkable yet.</figcaption>
      </figure>
    </Reveal>
  );
}

/** Chart 5: one real feedback, one missing link. The gap is dashed amber; there is no green end state. */
export function FeedbackGap() {
  const f = ledger.erc8004_feedback;
  const short = `${f.tx.slice(0, 14)}…${f.tx.slice(-14)}`;
  return (
    <Reveal>
      <figure className="min-w-0">
        <ol className="space-y-0">
          <li className="rounded-lg border border-[#2dd4bf]/40 bg-[#0b1220] px-4 py-3 anim-in">
            <p className="text-sm font-semibold text-white">Feedback written on chain</p>
            <p className="mt-1 font-mono text-[13px] leading-6 text-slate-300 [font-variant-ligatures:none]">
              <span className="block break-all">{short}</span>
              <span className="block">
                agent {f.agent_id} · value {f.value} · tag2 {f.tag2}
              </span>
              <span className="block">block {f.block} · {f.mined_utc.slice(0, 16).replace('T', ' ')} UTC</span>
            </p>
            <p className="mt-2">
              <TrustBadge state="MEASURED" />
              <span className="ml-2 text-sm text-slate-400">read back from Base Sepolia</span>
            </p>
          </li>
          <li className="relative py-1 pl-6">
            <span aria-hidden="true" className="absolute left-6 top-0 h-full border-l-2 border-dashed border-amber-500 anim-grow-y" style={{ ['--d' as string]: '350ms' }} />
            <p className="ml-6 py-3 text-sm leading-relaxed text-amber-300 anim-in" style={{ ['--d' as string]: '600ms' }}>
              Missing: signed evidence of the work this feedback rates. Nothing binds the two yet (
              <Ext href={ledger.issue_589.url}>issue #589</Ext>).
            </p>
          </li>
          <li className="rounded-lg border border-dashed border-slate-600 px-4 py-3 anim-in" style={{ ['--d' as string]: '800ms' }}>
            <p className="text-sm font-semibold text-white">The work it rates</p>
            <p className="mt-1 text-sm text-slate-400">Not linked, so not checked.</p>
          </li>
        </ol>
        <figcaption className="mt-3 text-sm leading-relaxed text-slate-400">
          Read-only, from the public Base Sepolia RPC: <Ext href={`https://sepolia.basescan.org/tx/${f.tx}`}>see the transaction</Ext>.
          Testnet only. Our own database maps token {f.agent_id} to our agent trinity-shofet; the on-chain registration does not name it.
        </figcaption>
      </figure>
    </Reveal>
  );
}
