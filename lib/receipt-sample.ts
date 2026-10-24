/**
 * The lines of the receipt picture on the audience pages (components/receipt-card.tsx), as plain data so a
 * test can hold each one against docs/challenge.md without compiling a component.
 *
 * Every line is copied from the pinned-run challenge's expected output (docs/challenge.md, section 2): the
 * `check <run-url> --claims-file` card for GitHub Actions run 39619591025. It is ABRIDGED, and the card says
 * so: the real card counts one more claim than the three it lists. The words SUPPORTED / CONTRADICTED and the
 * exit code are the tool's own. tests/audiences.test.ts holds each string against the doc, so the picture
 * cannot drift from the thing it pictures.
 */
export const RECEIPT_LINES = {
  summary: 'Claims: 3 supported · 1 contradicted · 1 not checked',
  contradicted: { claim: 'commit 5d1c5e3f57e1', why: 'The claim cites commit 5d1c5e3f57e1; the inspected run is on 392797a69b6a.' },
  supported: ['The check workflow succeeded', 'run 39619591025'],
  exit: 'exit 1',
} as const;
