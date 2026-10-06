# TrustShell: the Chrome Web Store kit

Everything the Chrome Web Store form asks for, in the order it asks. Paste each field as written.
This file does not submit anything. Submitting is done in a browser, by the account that will own
the listing.

## Before you start

- **An account.** Go to https://chrome.google.com/webstore/devconsole and sign in with the Google
  account that should own TrustShell. The first time, it asks for a one-time US$5 registration fee,
  the developer agreement, and a contact email it verifies.
- **The package.** Download https://github.com/DealAppSeo/trustshell/releases/download/extension-latest/extension.zip
  and keep it as a .zip. Do not unzip it. It is rebuilt from `main` every time the extension
  changes, so download it after the change that added the icon is merged. Its `icons/` folder must
  hold `icon128.png`, or the upload is refused.
- **The images.** In this repo: `extension/icons/icon128.png`, `store/promo-small.png`,
  `store/promo-marquee.png`, and the three files in `store/screenshots/`. On GitHub, open each one
  and press the download button.

## Step by step

1. In the developer console, press **New item** and upload `extension.zip`.
2. **Store listing** tab: paste the Description, pick the Category and Language, and upload the
   icon, screenshots and promo tiles. All of these are listed below.
3. **Privacy practices** tab: paste the single purpose and each permission line. Answer **No** to
   remote code, tick the data boxes listed below, and paste the privacy policy URL.
4. **Distribution** tab: Unlisted, all regions, free.
5. Press **Submit for review**. Reviews usually take a few days.
6. When it is approved, send the listing link. It goes into `lib/extension-links.ts`
   (`CHROME_STORE_URL`), and the homepage's Chrome step becomes an Add to Chrome button.

## Name

The store shows the `name` from the package: **TrustShell stamp**. It is not a field on the form.
Changing it means changing `extension/manifest.json` and uploading again.

## Summary

Stamps a reply Checks out, Caught, or Not checked. The reply text is sent to our checkers, Groq and Cerebras, or a listed backup.

## Description

AI lies. TrustShell stamps the last assistant reply, so you see whether it was checked before you act on it.

It runs on chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, grok.com, deepseek.com, and chat.deepseek.com.

The stamp says Checks out, Caught, or Not checked. One line under it says who answered, for example: Groq and Cerebras both said false. A missing reply is Not checked. A reply with nothing to check, like an opinion, is Not checked. Not checked is never a pass.

Caught adds a toast: Caught. This reply did not pass. Checks out does not add a toast. Not checked does not add a toast.

The reply text is sent to our checkers, Groq and Cerebras, after the reply is on screen. If one cannot answer, a backup checker takes its turn: Cloudflare Workers AI (Llama), or another listed in our privacy policy. It is not stored. Do not paste secrets. Known key and personal-data formats are removed before sending.

On any other page, select text and choose Check with TrustShell. That selection is sent to the same checkers, and only after that click. The label appears in a small toast.

On the Options page, choose which chat sites it checks, and whether it checks each reply automatically or only when you click Check this reply. It keeps a record of your last 20 stamps in this browser, the stamp, the site and the time, never the text, which you can download or clear.

In the popup, type an agent id to see its RepID and a proof checked in your browser. That id is sent to the same engine.

The extension does not click, type, or send the chat.

Privacy policy: https://www.trustshell.dev/privacy.html

## Screenshots

Upload in this order. Each is 1280 by 800.

1. store/screenshots/veto.png: a sure answer that is wrong, stamped Caught
2. store/screenshots/pass.png: a true answer, stamped Checks out
3. store/screenshots/not-checked.png: an opinion, stamped Not checked

These are the real extension, loaded in Chromium, stamping a plain chat page. Each verdict is production's live answer. `node store/render-store-images.mjs` draws them again, and it saves a shot only if the stamp reads the word that shot is meant to show.

## Icon and promo tiles

- Store icon: extension/icons/icon128.png (128 by 128, required)
- Small promo tile: store/promo-small.png (440 by 280, required)
- Marquee promo tile: store/promo-marquee.png (1400 by 560, optional; the store only features items that have one)

## Category, language, links

- Category: Tools
- Language: English
- Homepage URL: https://www.trustshell.dev
- Support URL: https://github.com/DealAppSeo/trustshell/issues
- Official URL: leave empty. It needs the domain verified in Google Search Console first.

## Privacy practices

### Single purpose

Stamps the last AI assistant reply on supported chat sites, or text the user selects, as Checks out, Caught, or Not checked, by sending it to two checker models.

### Permission justification

- **storage**: Keeps the Options page choices (which chat sites it checks, automatically or on click) and a record of the last 20 stamps (the stamp, the site and the time, never the text) in local extension storage on this device. Nothing in storage is sent anywhere.
- **contextMenus**: Adds one right-click item, Check with TrustShell, shown only when text is selected.
- **activeTab**: When the user picks Check with TrustShell, gives access to that one tab so the result can be shown there. No tab is touched without that click.
- **scripting**: After that click, adds a small toast to the same tab that says Checks out, Caught, or Not checked. Used only together with activeTab, and only after the click.
- **Host permission, repid-engine-production.up.railway.app**: The checking service. The extension sends the reply text or the selected text there, and reads an agent's public RepID and its proof from it.
- **Content scripts on chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, grok.com, deepseek.com, chat.deepseek.com**: Reads the last assistant reply on these chat sites so it can stamp it. It does not click, type, or send messages.

### Remote code

**No, I am not using remote code.** Every script and the WebAssembly proof verifier are inside the package. The extension fetches JSON only.

### Data usage

Tick:

- **Website content**: the reply text, or the text the user selected, is sent to the checking service.
- **Web history**: the Options page record keeps the last 20 stamps with the chat site and the time, never the text. It stays in local extension storage on this device, and the extension never sends it. The store asks for local-only data too.

Leave every other box empty. Then tick all three statements: the data is not sold to third parties; it is not used or transferred for purposes unrelated to the single purpose; and it is not used to determine creditworthiness or for lending.

### Privacy policy URL

https://www.trustshell.dev/privacy.html

## Distribution

- Visibility: Unlisted. Anyone with the link can install it, and it stays out of store search. The
  homepage's Add to Chrome button carries the link. Switching to Public later is one setting.
- Regions: All regions
- Payments: Free, no in-app purchases

## Package

To build the zip yourself instead of downloading it:

    npm run pack-extension -- extension store/extension.zip

The zip is not committed. A committed copy goes stale the moment the extension changes.
