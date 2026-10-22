"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classify = classify;
const CHEAP = new Set([
    'ok',
    'okay',
    'yes',
    'no',
    'thanks',
    'thank you',
    'k',
    'lol',
    'yep',
    'nope',
    'sure',
]);
function classify(text) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.endsWith('?'))
        return 'ask';
    // Trailing . and ! dropped by a backwards scan. `/[.!]+$/` was quadratic on a long run of them
    // (CodeQL js/polynomial-redos: 20,000 "!" then a letter took 2.2 s, 40,000 took 9 s).
    let end = trimmed.length;
    while (end > 0 && (trimmed[end - 1] === '.' || trimmed[end - 1] === '!'))
        end -= 1;
    const key = trimmed.slice(0, end).toLowerCase();
    if (CHEAP.has(key))
        return 'cheap';
    return 'escalate';
}
