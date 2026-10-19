/**
 * The static card for an action-evidence record — Markdown and HTML.
 * ------------------------------------------------------------------
 * RENDERED FROM THE RECORD AND NOTHING ELSE. Both renderers take an {@link ActionEvidenceRecord}
 * and compute its digest themselves, so the hash printed on a card is always the hash of the
 * record it was drawn from. There is no parameter through which raw claim text, or anything not in
 * the record, could reach the card. (`demo` adds one fixed banner sentence and nothing else.)
 *
 * EVERY NOT_CHECKED ITEM IS ON THE CARD, in its own section, next to the reason. A card that
 * shows the supported claims and lets the rest fall off the bottom is the product failing.
 *
 * FOREIGN TEXT IS INERT. Claim sentences, and names GitHub returns for someone else's repository
 * (workflow, job), are attacker-controlled. In Markdown they go in code spans, where nothing is a
 * link, an image, emphasis or HTML; in HTML they are entity-escaped. Both renderers share one
 * model, so they cannot disagree about what is on the card.
 */
import { type ActionEvidenceRecord } from './action-evidence';
/** The one sentence `demo` adds. Fixed text: nothing from the record or the input reaches it. */
export declare const DEMO_BANNER = "Sample output for review, generated from a real public GitHub Actions run. Not an official TrustShell result.";
/** A code span that holds ANY string inertly: the fence is longer than the longest backtick run inside. */
export declare function mdCode(s: string): string;
export declare function renderCardMarkdown(record: ActionEvidenceRecord, opts?: {
    demo?: boolean;
}): string;
export declare function renderCardHtml(record: ActionEvidenceRecord, opts?: {
    demo?: boolean;
}): string;
