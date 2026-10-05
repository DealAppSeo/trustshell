/**
 * Where a stranger gets the Chrome extension.
 *
 * CHROME_STORE_URL is null until the Chrome Web Store listing is approved (BUS S12). While it is
 * null the home page says the extension is in review and offers the test build; the day the
 * listing is live, set it here and the page shows one "Add to Chrome" button instead. Nothing else
 * changes, so the switch is one line.
 *
 * TEST_BUILD_ZIP is rebuilt from main on every extension change by .github/workflows/extension-zip.yml
 * and checked before upload (manifest.json at the root, exactly the files in extension/).
 */
export const CHROME_STORE_URL: string | null = null;

export const TEST_BUILD_ZIP =
  'https://github.com/DealAppSeo/trustshell/releases/download/extension-latest/extension.zip';

/** The chat sites the extension stamps today (extension/manifest.json content_scripts). */
export const STAMPED_SITES = ['ChatGPT', 'Claude', 'Gemini', 'Grok', 'DeepSeek'] as const;
