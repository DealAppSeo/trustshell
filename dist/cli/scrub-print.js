"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrubPrinted = scrubPrinted;
/** Drop GROQ_API_KEY from text the CLI is about to print. */
function scrubPrinted(text, env = process.env) {
    const secret = env.GROQ_API_KEY;
    if (!secret || secret.length < 8 || !text.includes(secret))
        return text;
    return text.split(secret).join('');
}
