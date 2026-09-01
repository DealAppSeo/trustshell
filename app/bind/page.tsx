import Link from 'next/link';
import { BindClient } from '@/components/bind/bind-client';

export const metadata = {
  title: 'Claim your agent — TrustShell',
  description:
    'Sign once to prove an agent is yours. Ownership is a signature you made, checkable by anyone, revocable at any time. No email, no name, no transaction.',
};

/**
 * The last step of the journey, and the first that asks anything of the person.
 *
 * EVERYTHING BEFORE THIS IS ANONYMOUS. Building an agent, naming it, training
 * it and running prompts need no account at all — they live in this browser.
 * That is deliberate: someone should get to find out whether they want the
 * thing before being asked to identify themselves for it. Claiming is where the
 * relationship becomes portable, and it is the first moment a wallet is needed.
 *
 * A WALLET IS THE PRIVATE OPTION, NOT THE COSTLY ONE. It discloses an address
 * and nothing else — no email, no name, no verification. The copy says so
 * plainly, because "connect a wallet" is widely read as the opposite.
 */
export default function BindPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-14 px-4 py-14">
      <header className="space-y-5">
        <h1 className="text-4xl font-bold text-[#fafafa]">Claim your agent</h1>
        <p className="max-w-[64ch] text-lg leading-relaxed text-[#a1a1aa]">
          You have built something. This is where it becomes yours — not by us recording that
          you were here, but by you signing a statement that says so, which anyone can check
          and you can withdraw at any time.
        </p>
        <p className="max-w-[64ch] leading-relaxed text-[#a1a1aa]">
          It asks for a wallet and nothing else. No email, no name, no transaction, no fee. An
          address is a pseudonym — this is the most private way to hold anything here, and it
          is the last thing the walkthrough asks of you.
        </p>
      </header>

      <BindClient />

      <footer className="space-y-3 border-t border-[#1f1f23] pt-8 text-sm leading-relaxed text-[#a1a1aa]">
        <p className="max-w-[64ch]">
          Owning an agent is not the same as letting it spend. Ownership says who it belongs
          to; a{' '}
          <Link href="/grants" className="text-accent underline underline-offset-2">
            grant
          </Link>{' '}
          says what it may do, with what budget, until when — and can be revoked on its own.
        </p>
        <p className="max-w-[64ch]">
          Everything here runs on Base Sepolia testnet.
        </p>
      </footer>
    </div>
  );
}
