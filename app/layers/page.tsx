import Link from 'next/link';

export const metadata = {
  title: 'Sandbox, Guardrail, Harness — TrustShell',
  description:
    'Why an agent needs all three: a sandbox limits where it can reach, a guardrail limits what it is allowed to try, and a harness is the record of who owns it, what it did, and who can stop it.',
};

/**
 * /layers — "Sandbox, Guardrail, Harness: why you need all three."
 *
 * A conceptual explainer, not a product surface and not a flow. It describes the DESIGN of the
 * hybrid, so every forward-looking piece is hedged in the same words the flow pages use for
 * themselves: the spend limit is enforced by the engine until the on-chain path is live; the
 * stake that backs a ceiling is simulated testnet USDC until a real escrow is funded; the local
 * classifier gates nothing until it beats the current scrubber. The whole thing runs on Base
 * Sepolia testnet, where the money is practice money with no value. Nothing here is claimed as
 * shipped that is not — the point of the page is the opposite of overclaiming.
 */

type Layer = {
  name: string;
  verb: string;
  one: string;
  strength: string;
  weakness: string;
  example: string;
};

const LAYERS: ReadonlyArray<Layer> = [
  {
    name: 'Sandbox',
    verb: 'limits WHERE',
    one: 'A room. It fences off the files, the network and the money an agent can reach.',
    strength: 'The model cannot argue its way past a wall. A prompt injection that succeeds still cannot read a disallowed path.',
    weakness:
      'The room does not travel. A sandbox that permits a package cache has a door; it does nothing for a claim stated in chat, and it never tells a buyer who is responsible.',
    example: "Pattern: Claude Code's bubblewrap / seatbelt; CrowdStrike runs each harness in its own VM with syscall filters.",
  },
  {
    name: 'Guardrail',
    verb: 'limits WHAT',
    one: 'A rule the agent cannot edit: a typed schema, a payee list, a two-family check, an amount.',
    strength: 'Specific, not vague — this tool, this host, this amount. The limit is named, not hoped for.',
    weakness:
      'A prompt is not a control. If the only thing stopping a spend is a sentence in the system prompt, a jailbreak walks straight through it. Authorize the session, not the binary.',
    example: 'Pattern: an egress allowlist (Arcjet), and a spend permission the account itself enforces (Coinbase spend permissions / ERC-7715).',
  },
  {
    name: 'Harness',
    verb: 'limits by RECORD',
    one: 'The owner, the grant, and the receipt — who owns the agent, what it did, and who can stop it.',
    strength: 'Portability, and a person at the root. The agent can change models; the limits stay, and they travel with it.',
    weakness:
      'A harness without a room still has a leaked key. A harness without a check still has a confident lie. A label that says "harness" and does not enforce the grant is a sandbox with worse marketing.',
    example: 'This is the part TrustShell carries between surfaces — the ERC-8004 passport and the signed receipt that outlive any one runtime.',
  },
];

type Beat = {
  n: string;
  layer: string;
  title: string;
  body: string;
  note?: string;
};

const BEATS: ReadonlyArray<Beat> = [
  {
    n: '1',
    layer: 'Sandbox',
    title: 'The specialist runs in a room',
    body:
      "Its files and network are the ones named on its belt. A tool call to any other host is refused before the model ever sees a result — the wall is upstream of the answer, not a reaction to it.",
  },
  {
    n: '2',
    layer: 'Guardrail',
    title: 'The PAI holds a session, not the wallet',
    body:
      'The grant names an amount, a payee, an expiry and a purpose. Anything outside it is rejected. Lowering the cap and pulling the grant happen now; raising the cap, adding a payee, or a transfer wait 24 hours and can be cancelled. A leaked key stops at the cap.',
    note:
      'The guardrail that is not a wish. Today the engine enforces the session; before mainnet the on-chain backstop — an ERC-7715-style session key, where the account itself enforces the caveat — makes the same limit hold without us. The stake that backs a ceiling is simulated testnet USDC until a real escrow is funded: a testnet stake shows in the figure, but it does not raise what the agent may actually spend.',
  },
  {
    n: '3',
    layer: 'Check',
    title: 'The stamp runs on the claim',
    body:
      'Two model families agree, or it is Not checked — and a miss is not a pass. A 2-of-3 is a majority, not a truth: it may set the label and move testnet RepID, but it does not unlock a spend, a post, or a higher cap. The person still breaks the tie on money and health.',
    note:
      'The router (ANFIS) routes; it does not grade. A local classifier (Laya) will take the first pass once it beats the current scrubber; until then it gates nothing. The stamp is the trust state you see on /check: Checks out, Caught, or Not checked.',
  },
  {
    n: '4',
    layer: 'Harness',
    title: 'Autonomy is earned inside a ceiling the person already signed',
    body:
      'Roughly 14 days and 20 actions with no "Caught" can restore a band the owner granted — it cannot raise the cap. A Caught, an off-list payee, or a dispute drops the band and asks the person. A rented agent gets the session, not the key, the memory, or root: the owner revokes, and everything under that session stops.',
  },
];

type Shield = { threat: string; still: string; cannot: string };

const SHIELDS: ReadonlyArray<Shield> = [
  {
    threat: 'A prompt injection',
    still: 'can still produce a bad sentence',
    cannot: 'but it cannot move the passport, add a payee, or spend past the cap.',
  },
  {
    threat: 'A hallucination',
    still: 'can still be confident',
    cannot: 'but it cannot ship as "Checks out" unless two families agreed.',
  },
  {
    threat: 'A stolen agent key',
    still: 'can still try',
    cannot: 'but the receipt says who asked, who refused, and when.',
  },
];

export default function LayersPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-12 space-y-16">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-accent font-semibold">
          TrustShell · defense in depth
        </p>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground leading-tight">
          Sandbox, Guardrail, Harness
        </h1>
        <p className="text-lg md:text-xl text-foreground/90 font-medium">Why you need all three.</p>
        <p className="text-base md:text-lg text-muted leading-relaxed max-w-2xl">
          A sandbox limits <span className="text-foreground">where</span> the agent can reach. A
          guardrail limits <span className="text-foreground">what</span> it is allowed to try. A
          harness is the <span className="text-foreground">record</span> of who owns it, what it
          did, and who can stop it. One of them is not enough — each is blind to exactly what the
          others catch. The hybrid is all three, with the harness as the part that travels.
        </p>
      </header>

      {/* The three-card summary */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">Three controls, three jobs</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {LAYERS.map((l) => (
            <LayerCard key={l.name} layer={l} />
          ))}
        </div>
      </section>

      {/* In the order a request moves */}
      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">The hybrid, in the order a request moves</h2>
          <p className="text-sm text-muted leading-relaxed max-w-2xl">
            Each layer sits where it can refuse before the next one runs, so no single control is
            asked to do a job it is bad at.
          </p>
        </div>
        <ol className="space-y-4">
          {BEATS.map((b) => (
            <Beat key={b.n} beat={b} />
          ))}
        </ol>
      </section>

      {/* Blast radius close */}
      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-foreground">What the blast radius looks like</h2>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          The point of three layers is that a failure in one is contained by the others. The agent
          acts; the person remains the one who can widen the room.
        </p>
        <div className="space-y-3">
          {SHIELDS.map((s) => (
            <div
              key={s.threat}
              className="rounded-xl border border-border bg-card px-5 py-4 text-sm leading-relaxed"
            >
              <span className="text-foreground font-semibold">{s.threat}</span>{' '}
              <span className="text-muted">{s.still}</span>{' '}
              <span className="text-[#2dd4bf]">{s.cannot}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA + honest footer */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-6">
        <h2 className="text-xl font-bold text-foreground">See a layer work</h2>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          The check is the one you can run right now with nothing installed. The rest of the
          journey — claim, fund, stake, spend — runs on the test network, so you can watch the
          guardrail refuse without risking anything.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/check"
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:brightness-110"
          >
            Check a sentence
          </Link>
          <Link
            href="/demo"
            className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-card/60"
          >
            Open the demo map
          </Link>
          <Link
            href="/start"
            className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-card/60"
          >
            Start the walkthrough
          </Link>
        </div>
        <p className="text-xs text-muted/70 leading-relaxed">
          Everything past the check runs on <span className="text-foreground">Base Sepolia testnet</span> —
          the money is practice money with no value, and the on-chain spend path and escrow are
          still being wired. The design is described here honestly, not claimed as finished.
        </p>
      </section>
    </main>
  );
}

function LayerCard({ layer }: { layer: Layer }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div>
        <p className="text-xl font-bold text-foreground">{layer.name}</p>
        <p className="text-[11px] uppercase tracking-widest text-accent font-semibold mt-0.5">
          {layer.verb}
        </p>
      </div>
      <p className="text-sm text-muted leading-relaxed">{layer.one}</p>
      <div className="pt-3 border-t border-border/40 space-y-2">
        <p className="text-xs leading-relaxed">
          <span className="text-[#2dd4bf] font-semibold uppercase tracking-wider text-[10px]">Strength</span>{' '}
          <span className="text-muted">{layer.strength}</span>
        </p>
        <p className="text-xs leading-relaxed">
          <span className="text-[#fb7185] font-semibold uppercase tracking-wider text-[10px]">Weakness</span>{' '}
          <span className="text-muted">{layer.weakness}</span>
        </p>
      </div>
      <p className="text-[11px] text-muted/60 leading-relaxed border-t border-border/40 pt-3">
        {layer.example}
      </p>
    </div>
  );
}

function Beat({ beat }: { beat: Beat }) {
  return (
    <li className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-4">
        <span className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-accent/10 border border-accent/30 text-accent text-sm font-semibold">
          {beat.n}
        </span>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground">{beat.title}</p>
            <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
              {beat.layer}
            </span>
          </div>
          <p className="text-sm text-muted leading-relaxed">{beat.body}</p>
          {beat.note && (
            <p className="text-xs text-muted/70 leading-relaxed border-l-2 border-border pl-3">
              {beat.note}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
