/**
 * /start: two answers, one plan. Kept out of the page so every combination can be tested (a .tsx
 * only because it imports components/home-agent; it renders nothing). The two
 * questions themselves, and the measured terminal check, stay as literals in app/start/page.tsx,
 * where the README-agreement tests read them.
 *
 * TWO QUESTIONS, NOT THREE. The walkthrough proposed asking whether you code, where, and fresh or
 * link. Once "where" is known, whether you code changes no next step: a terminal is a coder, an MCP app gets the
 * same paste either way, and the website is the same page for both. So it is not asked.
 *
 * FRESH IS THE DEFAULT. Someone with an agent they care about should not have to risk it on
 * something new, so the first choice offered is a fresh agent that touches nothing they have.
 *
 * NOT BUILT IS SAID OUT LOUD. Linking an outside agent (a custom GPT, a Claude Project) is not
 * built yet, and no MCP tool creates an agent. Those plans say so and point at what does work,
 * rather than sending anyone to /connect — which holds model API keys and links no agent, and was
 * where "Trust-wrap an agent I have" used to land.
 */
import { AGENT_TABS, INSTALL, mcpPaste } from '@/components/home-agent';
import { STAMPED_SITES, TEST_BUILD_ZIP, CHROME_STORE_URL } from '@/lib/extension-links';

export const WHERE = [
  { id: 'claude-desktop', label: 'Claude Desktop' },
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'chat-site', label: 'ChatGPT, Grok or Gemini' },
  { id: 'terminal', label: 'A terminal' },
  { id: 'web', label: 'Just this website' },
] as const;
export type Where = (typeof WHERE)[number]['id'];

export const ORIGIN = [
  { id: 'fresh', label: 'Start a fresh agent', sub: 'Nothing you already have is touched. You can link your own later.' },
  { id: 'own', label: 'Link one I already have', sub: 'Your own bot, a custom GPT, or the AI app you use.' },
] as const;
export type Origin = (typeof ORIGIN)[number]['id'];

export type Step = {
  text: string;
  /** Something to paste or run. */
  code?: string;
  href?: string;
  label?: string;
  /** Set when the step describes something not built yet. */
  notYet?: true;
};

const CREATE: Step = {
  text: 'Create your agent: give it a name and a few rules. Its key is saved in this browser.',
  href: '/agents',
  label: 'Create an agent',
};
const CLAIM: Step = {
  text: 'When you are ready, claim it with a wallet. Claiming needs the agent’s key as well as your wallet, so nobody else can claim it.',
  href: '/bind',
  label: 'Claim it',
};

function chrome(): Step {
  return CHROME_STORE_URL
    ? { text: `Add the Chrome extension: every reply on ${STAMPED_SITES.join(', ')} gets a stamp.`, href: CHROME_STORE_URL, label: 'Add to Chrome' }
    : {
        text: `Add the Chrome extension: every reply on ${STAMPED_SITES.join(', ')} gets a stamp. It is not on the Chrome Web Store yet: download the test build, unzip it, open chrome://extensions, turn on Developer mode and choose Load unpacked.`,
        href: TEST_BUILD_ZIP,
        label: 'Download the test build',
      };
}

function mcp(where: 'claude-desktop' | 'claude-code' | 'cursor'): Step {
  const tab = AGENT_TABS.find((t) => t.id === where)!;
  return { text: `Paste this into your ${tab.label} config. ${tab.where} Then restart ${tab.label}; it gets the check tools.`, code: mcpPaste() };
}

export function planFor(where: Where, origin: Origin): Step[] {
  switch (where) {
    case 'claude-desktop':
    case 'claude-code':
    case 'cursor':
      return origin === 'fresh'
        ? [mcp(where), { ...CREATE, text: 'Create the agent itself on this site (no MCP tool creates one yet). Its key is saved in this browser.' }, CLAIM]
        : [
            mcp(where),
            {
              text: 'Your app now has the check tools. Registering the app itself as an agent, with its own ID, owner and belt, is not built yet. Start a fresh agent alongside it meanwhile.',
              href: '/agents',
              label: 'Create an agent',
              notYet: true,
            },
          ];
    case 'chat-site':
      return origin === 'fresh'
        ? [chrome(), { ...CREATE, text: 'Create an agent here. It runs on our model pool, not inside your chat app, and its key is saved in this browser.' }, CLAIM]
        : [
            chrome(),
            {
              text: 'Linking a custom GPT or a chat-app project as an agent is not built yet. The stamp checks its replies meanwhile.',
              notYet: true,
            },
          ];
    case 'terminal':
      return origin === 'fresh'
        ? [
            {
              text: 'Make your agent. Three questions; it writes .trustshell/credentials.json with the agent’s ID and key. Keep that file private.',
              code: 'npx @hyperdag/trustshell@1.6.0 init --pai',
            },
            { ...CLAIM, text: 'Claim it on this site with your wallet: paste the agent ID and the key from .trustshell/credentials.json.' },
          ]
        : [
            { text: 'Install the SDK in your agent’s project.', code: INSTALL.replace('npm i -g', 'npm i') },
            {
              text: 'Register your agent and wrap its answers with verifyOutput(). The getting-started guide has the code.',
              href: '/docs/getting-started',
              label: 'Getting started',
            },
            { ...CLAIM, text: 'Claim it with your wallet: paste the agent ID and key that register() returned.' },
          ];
    case 'web':
      return origin === 'fresh'
        ? [CREATE, { text: 'Talk to it, and give it rules it follows.', href: '/agents', label: 'Your agents' }, CLAIM]
        : [
            {
              text: 'Linking an agent that lives somewhere else is not built yet. Start a fresh one here; nothing you have is touched.',
              href: '/agents',
              label: 'Create an agent',
              notYet: true,
            },
          ];
  }
}
