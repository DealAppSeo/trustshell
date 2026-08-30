import Link from 'next/link';
import { fetchRoleCatalog, type RoleDefinition } from '@/lib/repid-engine';
import { TrustBadge, EmptyState } from '@/components/trust-state';

// The whole claim of this page is "these are the ceilings the mint path enforces RIGHT NOW".
// A cached copy would turn it into "these were the ceilings at build time", which is the
// difference between a measurement and a memory.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Role ceilings — TrustShell',
  description:
    'CEO, CTO, CFO, CMO — what each role may hold at most. A role is a ceiling, never a grant: naming one narrows a grant or refuses it, and can never hand out authority the grantor does not already have.',
};

/** One stroke weight across the page, drawn rather than borrowed from a glyph table. */
function SpendIcon({ permitted }: { permitted: boolean }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
    className: 'shrink-0',
  };
  return permitted ? (
    <svg {...common}>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 4.6v6.8M6.2 6.4h3.1a1.3 1.3 0 0 1 0 2.6H6.7a1.3 1.3 0 0 0 0 2.6h3.1" />
    </svg>
  ) : (
    <svg {...common}>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M4.4 11.6 11.6 4.4" />
    </svg>
  );
}

function holdsSpend(ceiling: string[]): boolean {
  return ceiling.some((c) => c === '*' || c === 'pay' || c.startsWith('pay:'));
}

function RoleRow({ role }: { role: RoleDefinition }) {
  const spends = holdsSpend(role.ceiling);
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-3 border-t border-neutral-800 py-6 sm:grid-cols-[10rem_1fr]">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-neutral-100">{role.label}</h3>
        <p className="font-mono text-xs text-neutral-500">{role.name}</p>
      </div>

      <div className="space-y-3">
        <p
          className={`inline-flex items-center gap-2 text-sm font-medium ${
            spends ? 'text-[#5eead4]' : 'text-[#fda4af]'
          }`}
        >
          <SpendIcon permitted={spends} />
          {spends ? 'May carry spend authority' : 'Cannot carry spend authority, ever'}
        </p>

        <p className="text-sm text-neutral-400">
          <span className="text-neutral-500">Ceiling: </span>
          {role.ceiling.length === 0 ? (
            <span className="text-neutral-300">
              nothing — every capability requested under this role is refused
            </span>
          ) : (
            role.ceiling.map((c, i) => (
              <span key={c}>
                {i > 0 && <span className="text-neutral-600">, </span>}
                <code className="rounded bg-neutral-900 px-1.5 py-0.5 font-mono text-[13px] text-neutral-200">
                  {c}
                </code>
              </span>
            ))
          )}
        </p>

        <p className="max-w-[64ch] text-sm leading-relaxed text-neutral-400">{role.rationale}</p>
      </div>
    </div>
  );
}

export default async function RoleCeilingsPage() {
  const catalog = await fetchRoleCatalog();

  return (
    <div className="mx-auto max-w-3xl space-y-12 px-4 py-12">
      <header className="space-y-5">
        <h1 className="text-3xl font-bold">Role ceilings</h1>
        <p className="max-w-[68ch] text-neutral-400">
          A role is a <strong className="text-neutral-200">ceiling</strong>, never a grant. Naming{' '}
          <code className="font-mono text-[13px] text-neutral-300">cfo</code> on a grant does not
          hand anyone spend authority — it states the most that grant may carry. What the grantee
          ends up holding is the intersection of three things, and the role can only ever shrink
          it:
        </p>
        {/*
          NOT max-w-[68ch]. That cap is the prose measure, and `ch` resolves against THIS
          element's own 13px mono face — 68ch came to less than the line plus its padding, so
          the formula rendered clipped at "the role's ceilin". A half-shown formula is worse
          than a wrapped one: the reader cannot tell it continues.

          So: full container width, and nowrap only from `sm` up, where the line fits. Below
          that it WRAPS rather than scrolling. Measured at 375px, the nowrap version scrolled
          inside its own box — correct by the letter of the rule, and still a formula the
          reader sees two thirds of with nothing indicating more. On a phone a wrapped
          complete line beats a clipped one.
        */}
        <p className="overflow-x-auto rounded-lg sm:whitespace-nowrap border border-neutral-800 bg-neutral-900/40 px-4 py-3 font-mono text-[13px] leading-relaxed text-neutral-300">
          effective = requested ∩ what the grantor holds ∩ the role&apos;s ceiling
        </p>
        <p className="max-w-[68ch] text-neutral-400">
          That is why roles here are ceilings rather than templates. A template hands out
          capabilities, which makes the role a source of privilege — an agent could name a role and
          come away with more authority than whoever granted it. A ceiling cannot do that, by
          construction: it only ever appears on the narrowing side.
        </p>
      </header>

      <section className="space-y-4">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-200">The four recognised roles</h2>
          {catalog === 'error' ? (
            <TrustBadge
              state="NOT_CHECKED"
              detail="the live catalog could not be read — nothing below is shown from memory"
            />
          ) : (
            <TrustBadge
              state="MEASURED"
              detail="read from the service that applies these ceilings at mint time"
            />
          )}
        </div>

        {catalog === 'error' ? (
          <EmptyState
            title="The role catalog is unreachable right now."
            detail="These ceilings are deliberately not duplicated in this app. A hardcoded copy would render identically whether or not the mint path still agreed with it — a constraint on screen that no gate need honour. Nothing is shown rather than something unverified; reload shortly."
          />
        ) : (
          <div className="border-b border-neutral-800">
            {catalog.roles.map((r) => (
              <RoleRow key={r.name} role={r} />
            ))}
          </div>
        )}

        {catalog !== 'error' && (
          <p className="max-w-[68ch] pt-1 text-sm leading-relaxed text-neutral-500">
            The ceilings are narrow because the capability vocabulary this system actually
            enforces is narrow: it is essentially{' '}
            <code className="font-mono text-[13px] text-neutral-400">pay:*</code> and its
            denominations. Inventing{' '}
            <code className="font-mono text-[13px] text-neutral-400">deploy:*</code> or{' '}
            <code className="font-mono text-[13px] text-neutral-400">publish:*</code> would read
            as governance and enforce air. The useful thing these say today is the negative one —
            and it is enforceable right now: the agent writing your code cannot move your money,
            whatever it asks for and whatever its grantor holds.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-neutral-200">
          A role name on a grant means one of three things
        </h2>
        <p className="max-w-[68ch] text-sm leading-relaxed text-neutral-400">
          The role field accepts free text, because grants already carry human labels like
          &ldquo;Researcher / Data&rdquo; and refusing those would break live authority to no
          benefit. What must never happen is a reader taking an unrecognised string for a
          boundary. So a role resolves to one of three states, and they are rendered differently
          everywhere they appear:
        </p>

        <dl className="divide-y divide-neutral-800 border-y border-neutral-800 text-sm">
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 py-5 sm:grid-cols-[10rem_1fr]">
            <dt className="text-sm font-semibold text-[#5eead4]">Recognised</dt>
            <dd className="max-w-[64ch] leading-relaxed text-neutral-400">
              One of the four above. Its ceiling was applied when the grant was minted — anything
              the ceiling did not permit was refused then, not warned about now.
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 py-5 sm:grid-cols-[10rem_1fr]">
            <dt className="text-sm font-semibold text-neutral-400">Label only</dt>
            <dd className="max-w-[64ch] leading-relaxed text-neutral-400">
              Free text outside that set. Stored so humans can read it,{' '}
              <strong className="text-neutral-200">constrains nothing</strong>. A grant labelled
              &ldquo;treasurer&rdquo; carries exactly the capabilities it was minted with — the
              word did not narrow them, and it is not a synonym for CFO.
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 py-5 sm:grid-cols-[10rem_1fr]">
            <dt className="text-sm font-semibold text-neutral-500">Absent</dt>
            <dd className="max-w-[64ch] leading-relaxed text-neutral-400">
              No role given. The grant is judged on its own capabilities, budget and expiry, as
              every grant ultimately is.
            </dd>
          </div>
        </dl>

        <p className="max-w-[68ch] text-sm leading-relaxed text-neutral-500">
          When this page or a grant listing cannot reach the catalog, a role shows as{' '}
          <span className="text-neutral-300">not checked</span>{' '}
          rather than as a label — because
          &ldquo;the backend does not recognise this name&rdquo; is a measurement, and claiming it
          from a failed request would be inventing the reassuring half of an answer nobody got.
        </p>
      </section>

      <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t border-neutral-800 pt-6 text-sm">
        <Link href="/grants" className="text-amber-500 underline">
          Look up a principal&apos;s grants →
        </Link>
        <a
          href="https://github.com/DealAppSeo/repid-engine/blob/main/docs/mvp-grants-api.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-500 underline"
        >
          Grants API reference →
        </a>
      </footer>
    </div>
  );
}
