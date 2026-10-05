# TrustShell listing

Paste the fields below into the listing form. This file does not submit anything.

## Name

TrustShell

## Summary

Stamps a reply Checks out, Caught, or Not checked. The reply text is sent to our checkers, Groq and Cerebras.

## Description

TrustShell stamps the last assistant reply.

It runs on chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, grok.com, deepseek.com, and chat.deepseek.com.

The stamp says Checks out, Caught, or Not checked. A missing reply is Not checked. A reply that ends in the word veto is not Caught unless the checker says it is false.

Caught adds a toast: Caught. This reply did not pass. Checks out does not add a toast. Not checked does not add a toast.

The reply text is sent to our checkers, Groq and Cerebras, after the reply is on screen. It is not stored. Do not paste secrets. Known key and personal-data formats are removed before sending.

On any other page, select text and choose Check with TrustShell. That selection is sent to the same checkers, and only after that click. The label appears in a small toast.

In the popup, type an agent id to see its RepID and a proof checked in your browser. That id is sent to the same engine.

The extension does not click, type, or send the chat.

Privacy policy page: public/privacy.html

## Screenshots

store/screenshots/pass.png
store/screenshots/veto.png
store/screenshots/not-checked.png

Each one is 1280 by 800.

## Package

Build it fresh from the extension folder, then upload store/extension.zip:

    npm run pack-extension -- extension store/extension.zip

The zip is not committed: a committed copy goes stale the moment the extension changes.
