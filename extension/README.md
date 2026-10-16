# TrustShell for Chrome

Stamps the last reply on a chat site: Checks out, Caught, or Not checked.

## What is sent where

The reply text is sent to our engine. A reply that is one whole equation is computed there, with no model asked. Any other text is sent to our checkers, Groq and Cerebras. If one cannot answer, a backup checker takes its turn: Cloudflare Workers AI (Llama), or another listed in our privacy policy. It is not stored. Not printed is not the same as not sent.

- Before the text leaves the browser, known secret and personal-data shapes are removed (`scrub.js`): API keys, private keys, seed phrases, email addresses, card numbers. A name or a health detail written in prose is not caught.
- The only host the extension may call is the engine, `repid-engine-production.up.railway.app` (`host_permissions` in `manifest.json`).
- Your settings and your record (the last 20 stamps: the stamp, the site, the time and what decided it, never the text) stay in this browser.
- Privacy policy: https://trustshell.dev/privacy.html

## Install the test build

It is not in the Chrome Web Store yet.

1. Download the test build: https://github.com/DealAppSeo/trustshell/releases/download/extension-latest/extension.zip (or use this folder from a clone of the repo).
2. Unzip it.
3. Open `chrome://extensions` in Chrome.
4. Turn on Developer mode (top right).
5. Click Load unpacked and choose the unzipped folder, the one that holds `manifest.json`.
6. Open a chat on chatgpt.com, claude.ai, gemini.google.com, grok.com, deepseek.com or chat.deepseek.com. The stamp checks the last reply.

Chrome warns about extensions loaded in Developer mode, and some managed Chrome profiles do not allow Developer mode.

## Settings

Click the toolbar icon, then Your TrustShell, to choose which sites are checked and whether a reply is checked automatically or only when you click Check this reply. A site that is off sends nothing and shows no stamp.

You can also select text, right-click and choose Check with TrustShell.
