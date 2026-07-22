'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Code2,
  Sparkles,
  PackagePlus,
  KeyRound,
  Gift,
  Wallet,
  Clock,
  ArrowLeft,
  ArrowRight,
  Check,
} from 'lucide-react';

// Adaptive onboarding "tailor your path" — Step-0 (DESIGN_PRINCIPLES.md rules 1-10).
// Three optional questions, one at a time, each skippable via the persistent escape.
// Result: a short tailored plan that differs by persona/keys/wallet, never a gate.

type Persona = 'dev' | 'try' | 'import';

interface TsProfile {
  persona: Persona | null;
  hasKeys: boolean | null;
  hasWallet: boolean | null;
  ts: number;
}

const TOTAL_QUESTIONS = 3;

const PERSONA_LABEL: Record<Persona, string> = {
  dev: 'Build an agent',
  try: 'Try it, no code',
  import: 'Trust-wrap an agent I have',
};

export default function StartPage() {
  const router = useRouter();
  const [step, setStep] = useState(0); // 0,1,2 = questions, 3 = result
  const [persona, setPersona] = useState<Persona | null>(null);
  const [hasKeys, setHasKeys] = useState<boolean | null>(null);
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);

  // Persist as soon as the profile has any shape — no account needed, change anytime.
  useEffect(() => {
    if (persona === null && hasKeys === null && hasWallet === null) return;
    const profile: TsProfile = { persona, hasKeys, hasWallet, ts: Date.now() };
    try {
      localStorage.setItem('ts_profile', JSON.stringify(profile));
    } catch {
      // Storage unavailable (private mode, etc.) — the flow still works, it just won't persist.
    }
  }, [persona, hasKeys, hasWallet]);

  const skipToExplore = () => router.push('/agents');
  const goBack = () => setStep((s) => Math.max(0, s - 1));
  const restart = () => {
    setPersona(null);
    setHasKeys(null);
    setHasWallet(null);
    setStep(0);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      {step < TOTAL_QUESTIONS ? (
        <>
          <FlowHeader step={step} onSkip={skipToExplore} />

          {step === 0 && (
            <Question
              title="What brings you here?"
              options={[
                {
                  icon: Code2,
                  label: 'Build an agent',
                  sub: 'Wrap your own agent with the SDK and ship it.',
                  onSelect: () => {
                    setPersona('dev');
                    setStep(1);
                  },
                },
                {
                  icon: Sparkles,
                  label: 'Try it, no code',
                  sub: 'Spin up a demo agent and watch it earn trust live.',
                  onSelect: () => {
                    setPersona('try');
                    setStep(1);
                  },
                },
                {
                  icon: PackagePlus,
                  label: 'Trust-wrap an agent I have',
                  sub: 'Connect an existing agent and add verification.',
                  onSelect: () => {
                    setPersona('import');
                    setStep(1);
                  },
                },
              ]}
            />
          )}

          {step === 1 && (
            <Question
              title="Do you have LLM API keys?"
              subtitle="Your keys → your models, cheaper, higher limits."
              onBack={goBack}
              options={[
                {
                  icon: KeyRound,
                  label: 'Yes, connect',
                  sub: 'Bring your own provider key.',
                  onSelect: () => {
                    setHasKeys(true);
                    setStep(2);
                  },
                },
                {
                  icon: Gift,
                  label: 'Not yet, start free',
                  sub: 'Use the free shared pool. Add keys anytime.',
                  onSelect: () => {
                    setHasKeys(false);
                    setStep(2);
                  },
                },
              ]}
            />
          )}

          {step === 2 && (
            <Question
              title="Got a web3 wallet?"
              subtitle="Only needed to take reputation on-chain — start on testnet without one."
              onBack={goBack}
              options={[
                {
                  icon: Wallet,
                  label: 'Yes, connect',
                  sub: 'Link it to publish RepID on-chain.',
                  onSelect: () => {
                    setHasWallet(true);
                    setStep(3);
                  },
                },
                {
                  icon: Clock,
                  label: 'No / later',
                  sub: 'Start on testnet. Connect whenever you’re ready.',
                  onSelect: () => {
                    setHasWallet(false);
                    setStep(3);
                  },
                },
              ]}
            />
          )}
        </>
      ) : (
        <ResultScreen
          persona={persona ?? 'try'}
          hasKeys={hasKeys}
          hasWallet={hasWallet}
          onRestart={restart}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flow chrome: expectation-setting header + progress + persistent skip escape
// ---------------------------------------------------------------------------

function FlowHeader({ step, onSkip }: { step: number; onSkip: () => void }) {
  return (
    <div className="space-y-6 mb-8">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs uppercase tracking-widest text-[#64748b] font-semibold">
          About 20 seconds · optional · change anytime
        </p>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs font-medium text-[#94a3b8] hover:text-white transition-colors shrink-0"
        >
          Skip, I’ll explore →
        </button>
      </div>

      <div className="flex items-center gap-2" aria-label={`Step ${step + 1} of ${TOTAL_QUESTIONS}`}>
        {Array.from({ length: TOTAL_QUESTIONS }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= step ? 'bg-amber-500' : 'bg-[#1e293b]'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A single question: title + big option cards
// ---------------------------------------------------------------------------

interface OptionDef {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub: string;
  onSelect: () => void;
}

function Question({
  title,
  subtitle,
  options,
  onBack,
}: {
  title: string;
  subtitle?: string;
  options: OptionDef[];
  onBack?: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-xs text-[#64748b] hover:text-[#94a3b8] transition-colors mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
        )}
        <h1 className="text-2xl md:text-3xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-sm text-[#94a3b8] leading-relaxed">{subtitle}</p>}
      </div>

      <div className="grid gap-3">
        {options.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.label}
              type="button"
              onClick={opt.onSelect}
              className="group flex items-start gap-4 text-left bg-[#0f172a] border border-[#1e293b] hover:border-amber-600/50 hover:bg-[#0f172a]/80 rounded-xl p-5 transition-colors"
            >
              <span className="w-10 h-10 shrink-0 rounded-lg bg-[#1e293b] group-hover:bg-amber-600/15 flex items-center justify-center transition-colors">
                <Icon className="w-5 h-5 text-[#94a3b8] group-hover:text-amber-400 transition-colors" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-white">{opt.label}</span>
                <span className="block text-sm text-[#94a3b8] mt-0.5 leading-snug">{opt.sub}</span>
              </span>
              <ArrowRight className="w-4 h-4 text-[#475569] group-hover:text-amber-400 transition-colors shrink-0 mt-3" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tailored result — differs by persona/keys/wallet, never a gate
// ---------------------------------------------------------------------------

interface NextStep {
  title: string;
  detail: string;
}

interface PlanCTA {
  href: string;
  label: string;
}

function buildPlan(
  persona: Persona,
  hasKeys: boolean | null,
  hasWallet: boolean | null,
): { steps: NextStep[]; cta: PlanCTA } {
  if (persona === 'dev') {
    return {
      cta: { href: '/docs/getting-started', label: 'Read the getting started guide' },
      steps: [
        { title: 'Install the SDK', detail: 'npm install @hyperdag/trustshell in your project.' },
        {
          title: 'Connect your model',
          detail: hasKeys
            ? 'Add your provider key on the Connect page — you already said yes.'
            : 'Start on the free shared pool. Add a key anytime for lower latency and higher limits.',
        },
        { title: 'Wrap your agent', detail: 'Call shell.score() around your output to start scoring.' },
        { title: 'Explore the API', detail: 'Every method is documented in the API reference.' },
      ],
    };
  }

  if (persona === 'import') {
    return {
      cta: { href: '/connect', label: 'Connect your agent' },
      steps: [
        { title: 'Connect your existing agent', detail: 'Point TrustShell at the agent you already run.' },
        {
          title: 'Add your keys',
          detail: hasKeys
            ? 'Your provider key is ready to plug in on the Connect page.'
            : 'Or keep using the free shared pool while you test.',
        },
        { title: 'See HAL verify it', detail: 'Every response gets scored for hallucination in real time.' },
        {
          title: 'Publish on-chain',
          detail: hasWallet
            ? 'Connect your wallet on the Connect page to publish RepID.'
            : 'Publish whenever you connect a wallet — testnet works without one.',
        },
      ],
    };
  }

  // 'try'
  return {
    cta: { href: '/agents', label: 'Create your first agent' },
    steps: [
      { title: 'Create your first agent', detail: 'Name it — takes about 30 seconds, no email needed to start.' },
      { title: 'Start free', detail: 'You’re on the free shared key pool already, no setup needed.' },
      { title: 'Run a prompt', detail: 'Watch HAL score the response as it comes back.' },
      { title: 'Earn RepID', detail: 'Honest answers build a portable, on-chain reputation.' },
    ],
  };
}

function ResultScreen({
  persona,
  hasKeys,
  hasWallet,
  onRestart,
}: {
  persona: Persona;
  hasKeys: boolean | null;
  hasWallet: boolean | null;
  onRestart: () => void;
}) {
  const { steps, cta } = buildPlan(persona, hasKeys, hasWallet);

  const setUpForYou = [
    `Fastest path set to “${PERSONA_LABEL[persona]}”`,
    hasKeys
      ? 'Your API key slot is ready to connect'
      : 'Free shared key pool turned on — no setup needed',
    hasWallet ? 'Wallet linking is ready when you publish' : 'Testnet mode — works with no wallet',
  ];

  const keptOutOfWay = [
    !hasKeys && 'Your own provider keys — connect anytime on the Connect page',
    !hasWallet && 'An on-chain wallet — connect anytime to publish RepID',
    'Advanced HAL and constitution settings — tune later in Settings',
  ].filter((v): v is string => Boolean(v));

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-amber-500 font-semibold">
          Your fastest path
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-white">{PERSONA_LABEL[persona]}</h1>
        <p className="text-sm text-[#94a3b8] leading-relaxed">
          Set up in a few seconds. You can change any of this anytime in Settings.
        </p>
      </div>

      <div className="space-y-3">
        {steps.map((s, i) => (
          <div
            key={s.title}
            className="flex items-start gap-4 p-4 rounded-xl border border-[#1e293b] bg-[#0f172a]"
          >
            <span className="w-7 h-7 shrink-0 rounded-full bg-amber-600/15 text-amber-400 text-xs font-mono font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <div>
              <div className="font-semibold text-white">{s.title}</div>
              <div className="text-sm text-[#94a3b8] mt-0.5 leading-snug">{s.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-[#1e293b] bg-[#0f172a]">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-400 mb-3">
            Set up for you
          </div>
          <ul className="space-y-2">
            {setUpForYou.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-[#94a3b8]">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-4 rounded-xl border border-[#1e293b] bg-[#0f172a]">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#64748b] mb-3">
            Kept out of your way — add anytime
          </div>
          <ul className="space-y-2">
            {keptOutOfWay.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-[#94a3b8]">
                <Clock className="w-4 h-4 text-[#475569] shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Link
          href={cta.href}
          className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl transition-colors inline-flex items-center gap-2 text-sm"
        >
          {cta.label}
          <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          href="/agents"
          className="px-6 py-3 bg-[#1e293b] hover:bg-[#334155] text-[#e2e8f0] font-semibold rounded-xl transition-colors text-sm"
        >
          Explore on my own
        </Link>
        <button
          type="button"
          onClick={onRestart}
          className="px-4 py-3 text-sm text-[#64748b] hover:text-[#94a3b8] transition-colors"
        >
          Start over
        </button>
      </div>
    </div>
  );
}
